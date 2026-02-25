import { prisma } from "@/lib/prisma";
import { mapTelephonyStatus } from "@/lib/telephony/provider-router";
import { logTelephony } from "@/lib/telephony/logger";
import { scheduleRetryForFailure } from "@/lib/journey/retry-policy";
import { applyCustomerTransition } from "@/lib/journey/transition-service";
import { CustomerStatus } from "@prisma/client";
import { databaseUnavailableResponse, isDatabaseUnavailable } from "@/lib/server/database-error";

export async function POST(request) {
  let callSid = "";
  let callStatus = "";
  let duration = undefined;
  let recordingUrl = undefined;

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
      where: { providerCallId: String(callSid) },
      select: { id: true, customerId: true, mode: true },
    });

    if (callLog) {
      await prisma.callLog.update({
        where: { id: callLog.id },
        data: {
          status: mappedStatus,
          durationSecs: duration ? Number(duration) : undefined,
          recordingUrl: recordingUrl ? String(recordingUrl) : undefined,
          endedAt:
            String(callStatus).toLowerCase() === "completed" ||
            String(callStatus).toLowerCase() === "failed" ||
            String(callStatus).toLowerCase() === "busy" ||
            String(callStatus).toLowerCase() === "no-answer" ||
            String(callStatus).toLowerCase() === "no_answer"
              ? new Date()
              : undefined,
        },
      });

      const normalizedProviderStatus = String(callStatus || "").toLowerCase();
      const failureStatus = new Set(["failed", "busy", "no-answer", "no_answer", "canceled", "cancelled"]);

      if (callLog.mode === "AI" && failureStatus.has(normalizedProviderStatus)) {
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
        });

        await scheduleRetryForFailure({
          customerId: callLog.customerId,
          failureCode: normalizedProviderStatus,
          errorMessage: `Telephony callback reported ${normalizedProviderStatus}`,
        });
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