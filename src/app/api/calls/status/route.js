import { prisma } from "@/lib/prisma";
import { mapTelephonyStatus } from "@/lib/telephony/provider-router";
import { logTelephony } from "@/lib/telephony/logger";

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

  await prisma.callLog.updateMany({
    where: { providerCallId: String(callSid) },
    data: {
      status: mappedStatus,
      durationSecs: duration ? Number(duration) : undefined,
      recordingUrl: recordingUrl ? String(recordingUrl) : undefined,
      endedAt:
        String(callStatus).toLowerCase() === "completed" ||
        String(callStatus).toLowerCase() === "failed"
          ? new Date()
          : undefined,
    },
  });

  logTelephony("info", "api.calls.status.persisted", {
    providerCallId: String(callSid),
    mappedStatus,
    durationSecs: duration ? Number(duration) : null,
    hasRecordingUrl: Boolean(recordingUrl),
  });

  return Response.json({ ok: true });
}