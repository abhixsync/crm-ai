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

function nccoResponse(body) {
  return Response.json(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

export async function POST(request) {
  try {
    const url = new URL(request.url);
    const payload = await parsePayload(request);

    const callLogId = String(url.searchParams.get("callLogId") || payload.callLogId || "").trim();
    const customerId = String(url.searchParams.get("customerId") || payload.customerId || "").trim();
    const uuid = String(payload.uuid || payload.call_uuid || payload.request_uuid || "").trim();

    if (callLogId && uuid) {
      const callLog = await prisma.callLog.findFirst({
        where: { id: callLogId },
        select: { id: true, tenantId: true },
      });

      if (callLog) {
      await prisma.callLog.updateMany({
        where: { id: callLog.id, tenantId: callLog.tenantId },
        data: { providerCallId: uuid },
      });
      }
    }

    logTelephony("info", "api.vonage.voice.answer", {
      callLogId: callLogId || null,
      customerId: customerId || null,
      providerCallId: uuid || null,
    });

    return nccoResponse([
      {
        action: "talk",
        text: "Hello, this is AI calling from CRM.",
      },
    ]);
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      console.warn("[api/vonage/voice/answer] Database unavailable; returning degraded response.");
      return databaseUnavailableResponse();
    }

    throw error;
  }
}

export async function GET(request) {
  return POST(request);
}
