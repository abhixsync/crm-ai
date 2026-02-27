import { mapTelephonyStatus } from "@/lib/telephony/provider-router";
import { prisma } from "@/lib/prisma";
import { logTelephony } from "@/lib/telephony/logger";
import { databaseUnavailableResponse, isDatabaseUnavailable } from "@/lib/server/database-error";

async function parsePayload(request) {
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    return request.json().catch(() => ({}));
  }

  if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
    const form = await request.formData().catch(() => null);
    if (!form) return {};

    const data = {};
    for (const [key, value] of form.entries()) {
      data[key] = String(value || "");
    }
    return data;
  }

  return {};
}

function shouldSetEndedAt(mappedStatus) {
  return ["COMPLETED", "FAILED", "NO_ANSWER"].includes(String(mappedStatus || ""));
}

export async function POST(request) {
  try {
    const body = await parsePayload(request);

    const providerCallId = String(body.uuid || body.call_uuid || body.request_uuid || "").trim();
    const providerStatus = String(body.status || body.call_status || "").trim();
    const duration = body.duration || body.duration_secs;

    if (!providerCallId) {
      logTelephony("warn", "api.vonage.voice.events.ignored", {
        reason: "missing-provider-call-id",
        providerStatus,
      });
      return Response.json({ ok: true });
    }

    const mappedStatus = mapTelephonyStatus("VONAGE", providerStatus);

    const matchedCall = await prisma.callLog.findFirst({
      where: { providerCallId },
      select: { id: true, tenantId: true },
    });

    if (!matchedCall) {
      return Response.json({ ok: true });
    }

    await prisma.callLog.updateMany({
      where: { id: matchedCall.id, tenantId: matchedCall.tenantId },
      data: {
        status: mappedStatus,
        durationSecs: duration ? Number(duration) : undefined,
        endedAt: shouldSetEndedAt(mappedStatus) ? new Date() : undefined,
      },
    });

    logTelephony("info", "api.vonage.voice.events.persisted", {
      providerCallId,
      providerStatus,
      mappedStatus,
    });

    return Response.json({ ok: true });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      console.warn("[api/vonage/voice/events] Database unavailable; returning degraded response.");
      return databaseUnavailableResponse();
    }

    throw error;
  }
}

export async function GET(request) {
  return POST(request);
}
