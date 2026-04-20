import { CallStatus, CustomerStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { runAIWithFailover } from "@/lib/ai/provider-router";
import { settleCredits } from "@/lib/credits/credit-service";
import { applyCustomerTransition } from "@/lib/journey/transition-service";
import { scheduleRetryForFailure } from "@/lib/journey/retry-policy";
import { toIntentLabel } from "@/lib/journey/constants";
import { canonicalizeIntent } from "@/lib/journey/intent-normalization";
import { evaluateCrmEventDecision } from "@/lib/crm/event-triggers";
import { notifyAdvisorForCallLog } from "@/lib/notifications/advisor-notifier";
import { createNotification } from "@/lib/notifications/notification-service";
import { publishEvent } from "@/lib/events/event-publisher";
import { updateSessionAfterCall } from "@/lib/conversation/session-manager";

function mapIntentToCustomerStatus(intent) {
  const normalized = String(intent || "").trim().toLowerCase();
  if (normalized === "interested") return CustomerStatus.INTERESTED;
  if (normalized === "not_interested") return CustomerStatus.NOT_INTERESTED;
  if (normalized === "do_not_call") return CustomerStatus.DO_NOT_CALL;
  if (normalized === "converted") return CustomerStatus.CONVERTED;
  if (normalized === "follow_up" || normalized === "call_back_later") return CustomerStatus.FOLLOW_UP;
  // "failed" / unknown intent = customer dropped or call couldn't be analyzed — schedule retry rather than hard-fail
  return CustomerStatus.RETRY_SCHEDULED;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Finalize an AI call: run CALL_SUMMARY, update CallLog, transition customer status,
 * settle credits, send notifications, publish SSE events.
 *
 * Safe to call multiple times — idempotency guard returns early if already finalized.
 * Designed to run AFTER the TwiML response is sent (via next/server `after()`),
 * or from the status callback when the customer hangs up mid-call.
 */
export async function finalizeCall(callLogId, customerId, tenantId, sessionCtx, mergedExtracted, turn) {
  if (!callLogId) return;

  const callLog = await prisma.callLog.findFirst({
    where: {
      id: callLogId,
      ...(tenantId ? { tenantId } : {}),
    },
  });
  if (!callLog) return;

  const alreadyFinalized =
    callLog.status === CallStatus.COMPLETED &&
    callLog.endedAt &&
    String(callLog.summary || "").trim() &&
    String(callLog.intentClassification || "").trim();

  if (alreadyFinalized) return;

  // Settle credits — non-blocking, idempotent
  if (tenantId) {
    const durationSecs =
      callLog.durationSecs != null
        ? callLog.durationSecs
        : callLog.startedAt
          ? Math.floor((Date.now() - new Date(callLog.startedAt).getTime()) / 1000)
          : 0;
    settleCredits(tenantId, callLogId, durationSecs).catch(() => {});
  }

  const transcript = callLog?.transcript || "";
  const aiOutput = await runAIWithFailover({
    task: "CALL_SUMMARY",
    payload: { transcript },
  });
  const analysis = aiOutput.result;
  const aiIntent = canonicalizeIntent(analysis.intent || "failed") || "failed";
  const crmDecision = evaluateCrmEventDecision({
    transcript,
    intent: aiIntent,
    summary: analysis.summary,
    metadata: callLog.metadata,
  });
  const normalizedIntent = canonicalizeIntent(crmDecision.normalizedIntent || aiIntent) || "failed";
  const mappedStatus = mapIntentToCustomerStatus(normalizedIntent);

  const metadata = isPlainObject(callLog.metadata) ? { ...callLog.metadata } : {};
  metadata.crmEventDecision = {
    ...crmDecision,
    source: "call_finalizer",
    evaluatedAt: new Date().toISOString(),
  };

  await prisma.callLog.updateMany({
    where: { id: callLogId, tenantId: callLog.tenantId },
    data: {
      summary: analysis.summary,
      intent: toIntentLabel(normalizedIntent),
      intentClassification: normalizedIntent,
      nextAction: crmDecision.recommendedNextAction || analysis.nextAction,
      aiProviderUsed: aiOutput.provider.name,
      status: "COMPLETED",
      endedAt: new Date(),
      metadata,
    },
  });

  if (customerId) {
    await applyCustomerTransition({
      customerId,
      toStatus: mappedStatus,
      reason: `Call final outcome: ${normalizedIntent}`,
      source: "AI_AUTOMATION",
      metadata: {
        inActiveCall: false,
        lastContactedAt: new Date(),
        aiSummary: analysis.summary,
        aiIntent: normalizedIntent,
        crmEventAction: crmDecision.action,
        interestScore: crmDecision.interestScore,
      },
      idempotencyScope: {
        callLogId,
        intent: normalizedIntent,
        end: true,
      },
      tenantId: callLog.tenantId,
    });

    if (mappedStatus === CustomerStatus.CALL_FAILED) {
      await scheduleRetryForFailure({
        customerId,
        tenantId: callLog.tenantId,
        failureCode: normalizedIntent,
        errorMessage: analysis.nextAction || "Call failed",
      }).catch(() => {});
    }
  }

  const advisorNotification = await notifyAdvisorForCallLog(callLog.id);
  if (!advisorNotification.ok && !advisorNotification.skipped) {
    console.warn("[call-finalizer] Advisor notification failed:", advisorNotification.reason);
  }

  createNotification(callLog.tenantId, {
    type: "CALL_COMPLETED",
    title: "Call completed",
    body: analysis?.summary || "A call has ended.",
    link: "/admin/calls",
  }).catch(() => {});

  publishEvent(callLog.tenantId, { type: "metrics:update" }).catch(() => {});
  publishEvent(callLog.tenantId, { type: "notification:new" }).catch(() => {});
  publishEvent(callLog.tenantId, { type: "call:status", payload: { status: mappedStatus } }).catch(() => {});

  if (sessionCtx?.sessionId) {
    await updateSessionAfterCall(sessionCtx.sessionId, {
      callLogId,
      turnCount: turn ?? 0,
      extractedData: mergedExtracted ?? {},
    }).catch(() => {});
  }
}
