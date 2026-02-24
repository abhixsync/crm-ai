import { CallStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSession, hasRole } from "@/lib/server/auth-guard";
import { runAIWithFailover } from "@/lib/ai/provider-router";
import { initiateTelephonyCallWithFailover } from "@/lib/telephony/provider-router";
import { logTelephony, redactedPhone } from "@/lib/telephony/logger";

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

  const customer = await prisma.customer.findUnique({ where: { id: customerId } });

  if (!customer) {
    return Response.json({ error: "Customer not found" }, { status: 404 });
  }

  const callLog = await prisma.callLog.create({
    data: {
      customerId: customer.id,
      status: CallStatus.INITIATED,
      startedAt: new Date(),
      summary: "Automated outbound loan-interest call initiated.",
    },
  });

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
    const callbackUrl = `${baseUrl}/api/calls/webhook?customerId=${customer.id}&callLogId=${callLog.id}&turn=0`;
    const statusCallbackUrl = isPublicHttpsUrl(baseUrl) ? `${baseUrl}/api/calls/status` : undefined;
    const vonageAnswerUrl = `${baseUrl}/api/vonage/voice/answer?customerId=${customer.id}&callLogId=${callLog.id}`;
    const vonageEventUrl = isPublicHttpsUrl(baseUrl) ? `${baseUrl}/api/vonage/voice/events` : undefined;
    const vonageFallbackUrl = `${baseUrl}/api/vonage/voice/fallback`;

    const telephonyOutput = await initiateTelephonyCallWithFailover({
      to: customer.phone,
      script,
      callbackUrl,
      statusCallbackUrl,
      vonageAnswerUrl,
      vonageEventUrl,
      vonageFallbackUrl,
    });

    const call = telephonyOutput.result;

    const updatedCallLog = await prisma.callLog.update({
      where: { id: callLog.id },
      data: {
        providerCallId: call.providerCallId,
        aiProviderUsed: aiOutput.provider.name,
        telephonyProviderUsed: telephonyOutput.provider.name,
        telephonyProviderType: telephonyOutput.provider.type,
        status: CallStatus[call.status] || CallStatus.INITIATED,
      },
    });

    await prisma.customer.update({
      where: { id: customer.id },
      data: { lastContactedAt: new Date() },
    });

    logTelephony("info", "api.calls.trigger.completed", {
      callLogId: updatedCallLog.id,
      customerId: customer.id,
      aiProvider: aiOutput.provider?.name,
      telephonyProvider: telephonyOutput.provider?.name,
      telephonyProviderType: telephonyOutput.provider?.type,
      providerCallId: call.providerCallId,
      status: updatedCallLog.status,
      to: redactedPhone(customer.phone),
    });

    return Response.json({
      callLog: updatedCallLog,
      provider: telephonyOutput.provider.name,
      info:
        String(telephonyOutput.provider.type || "").toUpperCase() === "TWILIO" && !statusCallbackUrl
          ? "Call started. Status callbacks are disabled in local HTTP mode. Use a public HTTPS APP_BASE_URL for webhooks."
          : "Call started successfully.",
    });
  } catch (error) {
    await prisma.callLog.update({
      where: { id: callLog.id },
      data: {
        status: CallStatus.FAILED,
        endedAt: new Date(),
        nextAction: "Check AI/voice provider configuration and retry.",
      },
    });

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