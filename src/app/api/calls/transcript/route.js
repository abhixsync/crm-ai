import { prisma } from "@/lib/prisma";
import { runAIWithFailover } from "@/lib/ai/provider-router";
import { canonicalizeIntent } from "@/lib/journey/intent-normalization";
import { notifyAdvisorForCallLog } from "@/lib/notifications/advisor-notifier";
import { databaseUnavailableResponse, isDatabaseUnavailable } from "@/lib/server/database-error";

export async function POST(request) {
  try {
    const body = await request.json();
    const { callSid, transcript } = body;

    if (!callSid || !transcript) {
      return Response.json({ error: "callSid and transcript are required" }, { status: 400 });
    }

    const aiOutput = await runAIWithFailover({
      task: "CALL_SUMMARY",
      payload: { transcript },
    });
    const analysis = aiOutput.result;
    const normalizedIntent = canonicalizeIntent(analysis.intent || "failed") || "failed";

    const callLog = await prisma.callLog.findFirst({
      where: { providerCallId: callSid },
      select: { id: true, tenantId: true },
    });

    if (!callLog) {
      return Response.json({ error: "Call log not found for callSid" }, { status: 404 });
    }

    await prisma.callLog.updateMany({
      where: { id: callLog.id, tenantId: callLog.tenantId },
      data: {
        transcript,
        summary: analysis.summary,
        intent: String(analysis.intent || "UNKNOWN").toUpperCase(),
        intentClassification: normalizedIntent,
        nextAction: analysis.nextAction,
        aiProviderUsed: aiOutput.provider.name,
      },
    });

    const notification = await notifyAdvisorForCallLog(callLog.id);
    if (!notification.ok && !notification.skipped) {
      console.warn("[api/calls/transcript] Advisor notification failed:", notification.reason);
    }

    return Response.json({ ok: true, analysis, provider: aiOutput.provider.name, notification });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      console.warn("[api/calls/transcript] Database unavailable; returning degraded response.");
      return databaseUnavailableResponse();
    }

    throw error;
  }
}