import { CallStatus, CallMode } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getTenantContext, requireSession, hasRole } from "@/lib/server/auth-guard";
import { getPlanGuard, isPlanLimitError, planLimitResponse } from "@/lib/subscription/plan-guard";
import { reserveCredits, refundReserve } from "@/lib/credits/credit-service";
import { runAIWithFailover } from "@/lib/ai/provider-router";
import { initiateTelephonyCallWithFailover } from "@/lib/telephony/provider-router";
import { logTelephony, redactedPhone } from "@/lib/telephony/logger";
import { applyCustomerTransition } from "@/lib/journey/transition-service";
import { scheduleRetryForFailure } from "@/lib/journey/retry-policy";
import { databaseUnavailableResponse, isDatabaseUnavailable } from "@/lib/server/database-error";
import { signWebhookUrl } from "@/lib/telephony/webhook-auth";

const CALLBACK_BLOCKING_MESSAGE =
  "Local APP_BASE_URL is not a public HTTPS URL, so conversational/status webhooks are disabled and advisor notifications will not trigger for AI outbound calls.";

function isPublicHttpsUrl(url) {
  if (!url) return false;

  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();

    if (parsed.protocol !== "https:") return false;
    if (["localhost", "127.0.0.1", "0.0.0.0"].includes(host)) return false;

    return true;
  } catch {
    return false;
  }
}

function buildCallFlowDebug(baseUrl) {
  const callbacksEnabled = isPublicHttpsUrl(baseUrl);

  return {
    baseUrl,
    mode: callbacksEnabled ? "public_https" : "local_or_private",
    conversationalWebhookEnabled: callbacksEnabled,
    statusCallbackEnabled: callbacksEnabled,
    notificationsEligible: callbacksEnabled,
    blockingReason: callbacksEnabled ? null : CALLBACK_BLOCKING_MESSAGE,
  };
}

export async function POST(request) {
  const auth = await requireSession();

  if (auth.error) return auth.error;

  if (!hasRole(auth.session, ["ADMIN", "SALES"])) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { customerId } = await request.json();

  if (!customerId) {
    return Response.json({ error: "customerId is required" }, { status: 400 });
  }

  const tenant = getTenantContext(auth.session, request);
  const { tenantId } = tenant;
  try {
    const guard = await getPlanGuard(tenantId);
    guard.assertHasFeature("hasAiCalling");
  } catch (err) {
    if (isPlanLimitError(err)) return planLimitResponse(err);
    throw err;
  }

  let customer;
  let callLog;

  try {
    // Verify customer exists first so we can return 404 before attempting lock
    customer = await prisma.customer.findFirst({
      where: {
        id: customerId,
        ...(tenant.isSuperAdmin ? {} : { tenantId: tenant.tenantId }),
      },
    });

    if (!customer) {
      return Response.json({ error: "Customer not found" }, { status: 404 });
    }

    // Atomic lock: only succeeds if inActiveCall is currently false
    const lockResult = await prisma.customer.updateMany({
      where: {
        id: customerId,
        tenantId: customer.tenantId,
        inActiveCall: false,
      },
      data: { inActiveCall: true },
    });

    if (lockResult.count === 0) {
      return Response.json({ error: "Customer is already in an active call" }, { status: 409 });
    }

    callLog = await prisma.callLog.create({
      data: {
        tenantId: customer.tenantId,
        customerId: customer.id,
        status: CallStatus.INITIATED,
        mode: CallMode.AI,
        attemptNumber: (customer.retryCount || 0) + 1,
        startedAt: new Date(),
        summary: "Automated outbound loan-interest call initiated.",
      },
    });

    await applyCustomerTransition({
      customerId: customer.id,
      toStatus: "CALLING",
      reason: "Direct AI call trigger started",
      source: "MANUAL",
      metadata: {
        inActiveCall: true,
        lastContactedAt: new Date(),
      },
      idempotencyScope: {
        route: "calls/trigger",
        callLogId: callLog.id,
      },
      tenantId: customer.tenantId,
    });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      console.warn("[api/calls/trigger] Database unavailable before call start.");
      return databaseUnavailableResponse();
    }

    // Release the active-call lock so the customer is not permanently stuck
    if (customer?.id) {
      await prisma.customer.updateMany({
        where: { id: customer.id, tenantId: customer.tenantId },
        data: { inActiveCall: false },
      }).catch(() => {});
    }

    throw error;
  }

  // Reserve credits — throws 402 if insufficient
  try {
    await reserveCredits(tenantId, callLog.id);
  } catch (err) {
    await prisma.callLog.update({
      where: { id: callLog.id },
      data: { status: "FAILED", errorReason: err.code ?? "INSUFFICIENT_CREDITS" },
    }).catch(() => {});
    // Release the active-call lock so the customer can be retried
    await prisma.customer.updateMany({
      where: { id: customer.id, tenantId: customer.tenantId },
      data: { inActiveCall: false },
    }).catch(() => {});
    return Response.json(
      { error: err.message, code: err.code, available: err.available, required: err.required },
      { status: 402 }
    );
  }

  try {
    logTelephony("info", "api.calls.trigger.started", {
      callLogId: callLog.id,
      customerId: customer.id,
      to: redactedPhone(customer.phone),
    });

    const customerForAI = {
      id: customer.id,
      firstName: customer.firstName,
      lastName: customer.lastName,
      loanType: customer.loanType,
      loanAmount: customer.loanAmount,
      monthlyIncome: customer.monthlyIncome,
      employmentType: customer.employmentType,
      city: customer.city,
      notes: customer.notes,
      status: customer.status,
      retryCount: customer.retryCount,
    };
    const aiOutput = await runAIWithFailover({
      task: "CALL_SCRIPT",
      payload: { customer: customerForAI },
    });
    const script = aiOutput.result.script;

    const baseUrl = process.env.APP_BASE_URL || process.env.NEXTAUTH_URL || "http://localhost:3000";
    const callFlowDebug = buildCallFlowDebug(baseUrl);
    const callbackUrl = callFlowDebug.conversationalWebhookEnabled
      ? signWebhookUrl(`${baseUrl}/api/calls/webhook?customerId=${customer.id}&callLogId=${callLog.id}&turn=0`, callLog.id)
      : undefined;
    const statusCallbackUrl = callFlowDebug.statusCallbackEnabled
      ? signWebhookUrl(`${baseUrl}/api/calls/status?tenantId=${tenantId}&callLogId=${callLog.id}`, callLog.id)
      : undefined;
    const vonageAnswerUrl = `${baseUrl}/api/vonage/voice/answer?customerId=${customer.id}&callLogId=${callLog.id}`;
    const vonageEventUrl = callFlowDebug.statusCallbackEnabled ? `${baseUrl}/api/vonage/voice/events` : undefined;
    const vonageFallbackUrl = `${baseUrl}/api/vonage/voice/fallback`;

    // Plivo webhook URLs
    const plivoAnswerUrl = `${baseUrl}/api/plivo/voice/answer?customerId=${customer.id}&callLogId=${callLog.id}`;
    const plivoCallbackUrl = callFlowDebug.statusCallbackEnabled ? `${baseUrl}/api/plivo/voice/callback?customerId=${customer.id}&callLogId=${callLog.id}&turn=1` : undefined;

    // Exotel webhook URLs
    const exotelAnswerUrl = `${baseUrl}/api/exotel/voice/answer?customerId=${customer.id}&callLogId=${callLog.id}`;
    const exotelStatusUrl = callFlowDebug.statusCallbackEnabled ? `${baseUrl}/api/exotel/voice/events` : undefined;

    if (callFlowDebug.blockingReason) {
      logTelephony("warn", "api.calls.trigger.callbacks_disabled", {
        callLogId: callLog.id,
        customerId: customer.id,
        reason: callFlowDebug.blockingReason,
        baseUrl,
      });
    }

    const telephonyOutput = await initiateTelephonyCallWithFailover({
      to: customer.phone,
      script,
      fromNumber: process.env.TWILIO_CALLER_ID || process.env.TWILIO_FROM_NUMBER || undefined,
      preferredProviderType: "TWILIO",
      callbackUrl,
      statusCallbackUrl,
      vonageAnswerUrl,
      vonageEventUrl,
      vonageFallbackUrl,
      plivoAnswerUrl,
      plivoCallbackUrl,
      exotelAnswerUrl,
      exotelStatusUrl,
    });

    const call = telephonyOutput.result;

    await prisma.callLog.updateMany({
      where: { id: callLog.id, tenantId: customer.tenantId },
      data: {
        providerCallId: call.providerCallId,
        aiProviderUsed: aiOutput.provider.name,
        telephonyProviderUsed: telephonyOutput.provider.name,
        telephonyProviderType: telephonyOutput.provider.type,
        status: CallStatus[call.status] || CallStatus.INITIATED,
        nextAction: callFlowDebug.blockingReason || null,
        metadata: {
          callFlowDebug,
          ...(telephonyOutput.result?.metadata ? { telephony: telephonyOutput.result.metadata } : {}),
        },
      },
    });

    const persistedCallLog = await prisma.callLog.findFirst({ where: { id: callLog.id, tenantId: customer.tenantId } });

    await prisma.customer.updateMany({
      where: { id: customer.id, tenantId: customer.tenantId },
      data: { lastContactedAt: new Date(), inActiveCall: true },
    });

    logTelephony("info", "api.calls.trigger.completed", {
      callLogId: persistedCallLog?.id || callLog.id,
      customerId: customer.id,
      aiProvider: aiOutput.provider?.name,
      telephonyProvider: telephonyOutput.provider?.name,
      telephonyProviderType: telephonyOutput.provider?.type,
      providerCallId: call.providerCallId,
      status: persistedCallLog?.status || callLog.status,
      to: redactedPhone(customer.phone),
    });

    return Response.json({
      callLog: persistedCallLog,
      provider: telephonyOutput.provider.name,
      info: callFlowDebug.blockingReason || "Call started successfully.",
      debug: {
        callFlow: callFlowDebug,
      },
    });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      console.warn("[api/calls/trigger] Database unavailable during call processing.");
      return databaseUnavailableResponse();
    }

    if (callLog?.id) {
      await refundReserve(tenantId, callLog.id).catch(() => {});
      await prisma.callLog.updateMany({
        where: { id: callLog.id, ...(customer?.tenantId ? { tenantId: customer.tenantId } : {}) },
        data: {
          status: CallStatus.FAILED,
          errorReason: error?.message || "Failed to initiate call",
          endedAt: new Date(),
          nextAction: "Check AI/voice provider configuration and retry.",
        },
      });
    }

    if (customer?.id && callLog?.id) {
      await applyCustomerTransition({
        customerId: customer.id,
        toStatus: "CALL_FAILED",
        reason: error?.message || "Trigger call failed",
        source: "MANUAL",
        metadata: {
          inActiveCall: false,
          lastContactedAt: new Date(),
        },
        idempotencyScope: {
          route: "calls/trigger",
          stage: "failed",
          callLogId: callLog.id,
        },
        tenantId: customer.tenantId,
      });

      await scheduleRetryForFailure({
        customerId: customer.id,
        tenantId: customer.tenantId,
        failureCode: "telephony_failure",
        errorMessage: error?.message || "Failed to initiate call",
      });
    }

    logTelephony("error", "api.calls.trigger.failed", {
      callLogId: callLog.id,
      customerId: customer.id,
      to: redactedPhone(customer.phone),
      message: error?.message || "Failed to initiate call",
      details: error?.details || null,
    });

    const message = error?.message || "Failed to initiate call";
    return Response.json({ error: message }, { status: 400 });
  }
}