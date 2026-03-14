import { prisma } from "@/lib/prisma";
import { runAIWithFailover } from "@/lib/ai/provider-router";
import { toIntentLabel } from "@/lib/journey/constants";
import { canonicalizeIntent } from "@/lib/journey/intent-normalization";
import { evaluateCrmEventDecision } from "@/lib/crm/event-triggers";
import { notifyAdvisorForCallLog } from "@/lib/notifications/advisor-notifier";
import { databaseUnavailableResponse, isDatabaseUnavailable } from "@/lib/server/database-error";

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

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
    const aiIntent = canonicalizeIntent(analysis.intent || "failed") || "failed";

    const callLog = await prisma.callLog.findFirst({
      where: { providerCallId: callSid },
      select: { id: true, tenantId: true, metadata: true },
    });

    if (!callLog) {
      return Response.json({ error: "Call log not found for callSid" }, { status: 404 });
    }

    const crmDecision = evaluateCrmEventDecision({
      transcript,
      intent: aiIntent,
      summary: analysis.summary,
      metadata: callLog.metadata,
    });
    const normalizedIntent = canonicalizeIntent(crmDecision.normalizedIntent || aiIntent) || "failed";

    const metadata = isPlainObject(callLog.metadata) ? { ...callLog.metadata } : {};
    metadata.crmEventDecision = {
      ...crmDecision,
      source: "calls_transcript",
      evaluatedAt: new Date().toISOString(),
    };

    await prisma.callLog.updateMany({
      where: { id: callLog.id, tenantId: callLog.tenantId },
      data: {
        transcript,
        summary: analysis.summary,
        intent: toIntentLabel(normalizedIntent),
        intentClassification: normalizedIntent,
        nextAction: crmDecision.recommendedNextAction || analysis.nextAction,
        aiProviderUsed: aiOutput.provider.name,
        metadata,
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