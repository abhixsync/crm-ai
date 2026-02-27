import { CallStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getTenantContext, requireSession, hasRole } from "@/lib/server/auth-guard";
import { runAIWithFailover } from "@/lib/ai/provider-router";
import { initiateTelephonyCallWithFailover } from "@/lib/telephony/provider-router";
import { logTelephony, redactedPhone } from "@/lib/telephony/logger";
import { applyCustomerTransition } from "@/lib/journey/transition-service";
import { scheduleRetryForFailure } from "@/lib/journey/retry-policy";
import { databaseUnavailableResponse, isDatabaseUnavailable } from "@/lib/server/database-error";

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

  let customer;
  let callLog;
  const tenant = getTenantContext(auth.session);

  try {
    customer = await prisma.customer.findFirst({ where: { id: customerId, tenantId: tenant.tenantId } });

    if (!customer) {
      return Response.json({ error: "Customer not found" }, { status: 404 });
    }

    callLog = await prisma.callLog.create({
      data: {
        tenantId: customer.tenantId,
        customerId: customer.id,
        status: CallStatus.INITIATED,
        mode: "AI",
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

    throw error;
  }

  try {
    logTelephony("info", "api.calls.trigger.started", {
      callLogId: callLog.id,
      customerId: customer.id,
      to: redactedPhone(customer.phone),
    });

    const aiOutput = await runAIWithFailover({
      task: "CALL_SCRIPT",
      payload: { customer },
    });
    const script = aiOutput.result.script;

    const baseUrl = process.env.APP_BASE_URL || process.env.NEXTAUTH_URL || "http://localhost:3000";
    const callbackUrl = isPublicHttpsUrl(baseUrl)
      ? `${baseUrl}/api/calls/webhook?customerId=${customer.id}&callLogId=${callLog.id}&turn=0`
      : undefined;
    const statusCallbackUrl = isPublicHttpsUrl(baseUrl) ? `${baseUrl}/api/calls/status` : undefined;
    const vonageAnswerUrl = `${baseUrl}/api/vonage/voice/answer?customerId=${customer.id}&callLogId=${callLog.id}`;
    const vonageEventUrl = isPublicHttpsUrl(baseUrl) ? `${baseUrl}/api/vonage/voice/events` : undefined;
    const vonageFallbackUrl = `${baseUrl}/api/vonage/voice/fallback`;

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
      info:
        String(telephonyOutput.provider.type || "").toUpperCase() === "TWILIO" && (!statusCallbackUrl || !callbackUrl)
          ? "Call started. Twilio webhooks are disabled in local HTTP mode. Use a public HTTPS APP_BASE_URL for conversational/status webhooks."
          : "Call started successfully.",
    });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      console.warn("[api/calls/trigger] Database unavailable during call processing.");
      return databaseUnavailableResponse();
    }

    if (callLog?.id) {
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