import { prisma } from "@/lib/prisma";
import { mapTelephonyStatus } from "@/lib/telephony/provider-router";
import { logTelephony } from "@/lib/telephony/logger";
import { scheduleRetryForFailure } from "@/lib/journey/retry-policy";
import { applyCustomerTransition } from "@/lib/journey/transition-service";
import { CustomerStatus } from "@prisma/client";
import { databaseUnavailableResponse, isDatabaseUnavailable } from "@/lib/server/database-error";
import { settleCredits } from "@/lib/credits/credit-service";
import { verifyWebhookSig } from "@/lib/telephony/webhook-auth";
import { finalizeCall } from "@/lib/calls/call-finalizer";

export async function POST(request) {
  let callSid = "";
  let callStatus = "";
  let duration = undefined;
  let recordingUrl = undefined;

  // Signature check must happen before any DB query to prevent unauthenticated
  // information disclosure via the providerCallId lookup below.
  const url = new URL(request.url);
  const qTenantId = url.searchParams.get("tenantId") || null;
  const qCallLogId = url.searchParams.get("callLogId") || null;

  if (process.env.NEXTAUTH_SECRET) {
    if (!qCallLogId || !verifyWebhookSig(url.searchParams, qCallLogId)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    const body = await request.json().catch(() => ({}));
    callSid = String(body?.CallSid || body?.callSid || body?.uuid || body?.request_uuid || "");
    callStatus = String(body?.CallStatus || body?.status || body?.call_status || "");
    duration = body?.CallDuration ?? body?.duration;
    recordingUrl = body?.RecordingUrl ?? body?.recording_url;
  } else {
    const form = await request.formData();
    callSid = String(form.get("CallSid") || form.get("callSid") || form.get("UUID") || form.get("request_uuid") || "");
    callStatus = String(form.get("CallStatus") || form.get("status") || form.get("call_status") || "");
    duration = form.get("CallDuration") || form.get("duration");
    recordingUrl = form.get("RecordingUrl") || form.get("recording_url");
  }

  if (!callSid) {
    logTelephony("warn", "api.calls.status.ignored", {
      reason: "missing-call-id",
      callStatus,
    });
    return Response.json({ ok: true });
  }

  try {
    const existingCall = await prisma.callLog.findFirst({
      where: { providerCallId: String(callSid) },
      select: { telephonyProviderType: true },
    });

    const mappedStatus = mapTelephonyStatus(existingCall?.telephonyProviderType, String(callStatus));

    logTelephony("info", "api.calls.status.received", {
      providerCallId: String(callSid),
      providerStatus: String(callStatus),
      mappedStatus,
      telephonyProviderType: existingCall?.telephonyProviderType || "UNKNOWN",
    });

    const callLog = await prisma.callLog.findFirst({
      where: {
        providerCallId: String(callSid),
        ...(qTenantId ? { tenantId: qTenantId } : {}),
      },
      select: { id: true, customerId: true, mode: true, tenantId: true },
    });

    if (callLog) {
      const shouldDeferAIFinalization = callLog.mode === "AI" && mappedStatus === "COMPLETED";
      await prisma.callLog.updateMany({
        where: { id: callLog.id, tenantId: callLog.tenantId },
        data: {
          status: shouldDeferAIFinalization ? undefined : mappedStatus,
          durationSecs: duration ? Number(duration) : undefined,
          recordingUrl: recordingUrl ? String(recordingUrl) : undefined,
          endedAt: shouldDeferAIFinalization
            ? undefined
            : String(callStatus).toLowerCase() === "completed" ||
                String(callStatus).toLowerCase() === "failed" ||
                String(callStatus).toLowerCase() === "busy" ||
                String(callStatus).toLowerCase() === "no-answer" ||
                String(callStatus).toLowerCase() === "no_answer"
              ? new Date()
              : undefined,
        },
      });

      if (shouldDeferAIFinalization) {
        // The telephony call is physically over — release the lock so the
        // customer is not stuck if finalizeCall() in the webhook never runs.
        if (callLog.customerId) {
          await prisma.customer.updateMany({
            where: { id: callLog.customerId, tenantId: callLog.tenantId },
            data: { inActiveCall: false },
          }).catch(() => {});
        }
        // Trigger AI finalization non-blocking — handles the case where the
        // customer hung up before the webhook could call finalizeCall().
        // The idempotency guard inside finalizeCall prevents double-finalization.
        finalizeCall(callLog.id, callLog.customerId, callLog.tenantId, null, {}, 0).catch((err) => {
          logTelephony("warn", "api.calls.status.finalize_error", { callLogId: callLog.id, error: err.message });
        });
        logTelephony("info", "api.calls.status.defer_ai_completion", {
          providerCallId: String(callSid),
          callLogId: callLog.id,
        });
      }

      const normalizedProviderStatus = String(callStatus || "").toLowerCase();
      const failureStatus = new Set(["failed", "busy", "no-answer", "no_answer", "canceled", "cancelled"]);

      // Only transition to CALL_FAILED if finishCall() hasn't already finalized this call
      const latestCallLog = failureStatus.has(normalizedProviderStatus) && callLog.mode === "AI"
        ? await prisma.callLog.findFirst({ where: { id: callLog.id }, select: { status: true } })
        : null;
      const alreadyFinalized = latestCallLog?.status === "COMPLETED";

      if (callLog.mode === "AI" && failureStatus.has(normalizedProviderStatus) && !alreadyFinalized) {
        await applyCustomerTransition({
          customerId: callLog.customerId,
          toStatus: CustomerStatus.CALL_FAILED,
          reason: `Telephony failure: ${normalizedProviderStatus}`,
          source: "AI_AUTOMATION",
          metadata: {
            inActiveCall: false,
            lastContactedAt: new Date(),
          },
          idempotencyScope: {
            providerCallId: String(callSid),
            failureStatus: normalizedProviderStatus,
          },
          tenantId: callLog.tenantId,
        });

        await scheduleRetryForFailure({
          customerId: callLog.customerId,
          tenantId: callLog.tenantId,
          failureCode: normalizedProviderStatus,
          errorMessage: `Telephony callback reported ${normalizedProviderStatus}`,
        });
      }

      if (callLog.tenantId && (mappedStatus === "COMPLETED" || mappedStatus === "NO_ANSWER" || mappedStatus === "FAILED")) {
        settleCredits(callLog.tenantId, callLog.id, mappedStatus === "COMPLETED" ? Number(duration) : 0).catch(() => {});
      }
    }

    logTelephony("info", "api.calls.status.persisted", {
      providerCallId: String(callSid),
      mappedStatus,
      durationSecs: duration ? Number(duration) : null,
      hasRecordingUrl: Boolean(recordingUrl),
    });

    return Response.json({ ok: true });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      console.warn("[api/calls/status] Database unavailable; returning degraded response.");
      return databaseUnavailableResponse();
    }

    throw error;
  }
}