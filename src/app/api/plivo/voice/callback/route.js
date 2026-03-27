import { prisma } from "@/lib/prisma";
import { runAIWithFailover } from "@/lib/ai/provider-router";
import { getOrCreateSession, updateSessionAfterCall, getSessionContext } from "@/lib/conversation/session-manager";
import { canonicalizeIntent } from "@/lib/journey/intent-normalization";
import { evaluateCrmEventDecision } from "@/lib/crm/event-triggers";
import { applyCustomerTransition } from "@/lib/journey/transition-service";
import { scheduleRetryForFailure } from "@/lib/journey/retry-policy";
import { toIntentLabel } from "@/lib/journey/constants";
import { notifyAdvisorForCallLog } from "@/lib/notifications/advisor-notifier";
import { CustomerStatus, CallStatus } from "@prisma/client";

function xmlEscape(value) {
  return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function plivoResponse(xmlBody) {
  const xml = `<?xml version="1.0" encoding="UTF-8"?><Response>${xmlBody}</Response>`;
  return new Response(xml, { status: 200, headers: { "Content-Type": "application/xml" } });
}

function mapIntentToCustomerStatus(intent) {
  const n = String(intent || "").trim().toLowerCase();
  if (n === "interested") return CustomerStatus.INTERESTED;
  if (n === "not_interested") return CustomerStatus.NOT_INTERESTED;
  if (n === "do_not_call") return CustomerStatus.DO_NOT_CALL;
  if (n === "converted") return CustomerStatus.CONVERTED;
  if (n === "follow_up" || n === "call_back_later") return CustomerStatus.FOLLOW_UP;
  return CustomerStatus.CALL_FAILED;
}

function shouldEndCall(aiTurn, turn, extractedData) {
  if (aiTurn.shouldEnd) return true;
  if (turn >= 12) return true;
  const allSlots = extractedData?.loanType && extractedData?.amount && extractedData?.timeline;
  if (allSlots && turn >= 3) return true;
  if (extractedData?.loanType === "balance_transfer" && turn >= 3) return true;
  if (turn >= 8 && !extractedData?.loanType && !extractedData?.amount) return true;
  return false;
}

async function appendTranscript(callLogId, speaker, message) {
  if (!callLogId || !message) return;
  const callLog = await prisma.callLog.findFirst({ where: { id: callLogId } });
  if (!callLog) return;
  const prefix = callLog.transcript ? `${callLog.transcript}\n` : "";
  await prisma.callLog.updateMany({
    where: { id: callLogId, tenantId: callLog.tenantId },
    data: { transcript: `${prefix}${speaker}: ${message}` },
  });
}

async function finishCall(callLogId, customerId, tenantId) {
  if (!callLogId) return;
  const callLog = await prisma.callLog.findFirst({ where: { id: callLogId, ...(tenantId ? { tenantId } : {}) } });
  if (!callLog) return;
  if (callLog.status === CallStatus.COMPLETED && callLog.summary && callLog.intentClassification) return;

  const transcript = callLog.transcript || "";
  const aiOutput = await runAIWithFailover({ task: "CALL_SUMMARY", payload: { transcript } });
  const analysis = aiOutput.result;
  const aiIntent = canonicalizeIntent(analysis.intent || "failed") || "failed";
  const crmDecision = evaluateCrmEventDecision({ transcript, intent: aiIntent, summary: analysis.summary, metadata: callLog.metadata });
  const normalizedIntent = canonicalizeIntent(crmDecision.normalizedIntent || aiIntent) || "failed";
  const mappedStatus = mapIntentToCustomerStatus(normalizedIntent);

  const metadata = (callLog.metadata && typeof callLog.metadata === "object") ? { ...callLog.metadata } : {};
  metadata.crmEventDecision = { ...crmDecision, source: "plivo_callback_finish", evaluatedAt: new Date().toISOString() };

  await prisma.callLog.updateMany({
    where: { id: callLogId, tenantId: callLog.tenantId },
    data: { summary: analysis.summary, intent: toIntentLabel(normalizedIntent), intentClassification: normalizedIntent, nextAction: crmDecision.recommendedNextAction || analysis.nextAction, aiProviderUsed: aiOutput.provider.name, status: "COMPLETED", endedAt: new Date(), metadata },
  });

  if (customerId) {
    await applyCustomerTransition({
      customerId, toStatus: mappedStatus, reason: `Plivo callback outcome: ${normalizedIntent}`,
      source: "AI_AUTOMATION", metadata: { inActiveCall: false, lastContactedAt: new Date(), aiSummary: analysis.summary, aiIntent: normalizedIntent },
      idempotencyScope: { callLogId, intent: normalizedIntent, end: true }, tenantId: callLog.tenantId,
    });
    if (mappedStatus === CustomerStatus.CALL_FAILED) {
      await scheduleRetryForFailure({ customerId, tenantId: callLog.tenantId, failureCode: normalizedIntent, errorMessage: analysis.nextAction || "Call failed" });
    }
  }

  await notifyAdvisorForCallLog(callLog.id).catch(() => {});
}

export async function POST(request) {
  const url = new URL(request.url);
  const customerId = url.searchParams.get("customerId");
  const callLogId = url.searchParams.get("callLogId");
  const turn = Number(url.searchParams.get("turn") || "0");
  const failedAttempts = Number(url.searchParams.get("failedAttempts") || "0");

  try {
    const formData = await request.formData();
    const speechResult = String(formData.get("Speech") || "").trim();

    const callLog = callLogId ? await prisma.callLog.findFirst({ where: { id: callLogId }, select: { id: true, tenantId: true, customerId: true, transcript: true } }) : null;
    const tenantId = callLog?.tenantId || null;
    const effectiveCustomerId = callLog?.customerId || customerId;
    const customer = effectiveCustomerId ? await prisma.customer.findFirst({ where: { id: effectiveCustomerId, ...(tenantId ? { tenantId } : {}) } }) : null;

    if (!customer) {
      return plivoResponse("<Speak>Customer not found. Goodbye.</Speak><Hangup/>");
    }

    // No speech — retry or end
    if (!speechResult) {
      if (failedAttempts >= 2) {
        await finishCall(callLogId, customer.id, tenantId);
        return plivoResponse("<Speak>Thank you for your time. Our advisor will contact you shortly.</Speak><Hangup/>");
      }
      const retryUrl = `${url.origin}/api/plivo/voice/callback?customerId=${customer.id}&callLogId=${callLogId}&turn=${turn}&failedAttempts=${failedAttempts + 1}`;
      return plivoResponse(
        `<GetInput action="${xmlEscape(retryUrl)}" method="POST" inputType="speech" language="hi-IN" speechEndTimeout="1500">` +
        `<Speak>I didn't catch that. Could you please repeat?</Speak>` +
        `</GetInput><Hangup/>`
      );
    }

    await appendTranscript(callLogId, "Customer", speechResult);

    const transcript = callLog?.transcript || "";
    const sessionCtx = tenantId ? await getSessionContext(tenantId, customer.id) : {};

    const aiOutput = await runAIWithFailover({
      task: "CALL_TURN",
      payload: {
        customer, transcript, turn, latestCustomerMessage: speechResult,
        context: { conversationStage: sessionCtx.lastStage, extractedData: sessionCtx.extractedData, previousCallSummary: sessionCtx.previousCallSummary },
      },
    });
    const aiTurn = aiOutput.result;

    const mergedExtracted = { ...(sessionCtx.extractedData || {}) };
    if (aiTurn.extractedData && typeof aiTurn.extractedData === "object") {
      for (const [k, v] of Object.entries(aiTurn.extractedData)) { if (v != null) mergedExtracted[k] = v; }
    }

    await appendTranscript(callLogId, "Agent", aiTurn.reply);

    if (callLogId) {
      await prisma.callLog.updateMany({ where: { id: callLogId, ...(tenantId ? { tenantId } : {}) }, data: { aiProviderUsed: aiOutput.provider.name } });
    }

    if (shouldEndCall(aiTurn, turn, mergedExtracted)) {
      const closing = `${aiTurn.reply} Thank you for your time. Our advisor will contact you shortly.`;
      await finishCall(callLogId, customer.id, tenantId);
      if (sessionCtx.sessionId) {
        await updateSessionAfterCall(sessionCtx.sessionId, { callLogId, turnCount: turn, extractedData: mergedExtracted });
      }
      return plivoResponse(`<Speak>${xmlEscape(closing)}</Speak><Hangup/>`);
    }

    const nextUrl = `${url.origin}/api/plivo/voice/callback?customerId=${customer.id}&callLogId=${callLogId}&turn=${turn + 1}&failedAttempts=0`;
    return plivoResponse(
      `<GetInput action="${xmlEscape(nextUrl)}" method="POST" inputType="speech" language="hi-IN" speechEndTimeout="1500">` +
      `<Speak>${xmlEscape(aiTurn.reply)}</Speak>` +
      `</GetInput><Hangup/>`
    );
  } catch (error) {
    console.error("[plivo/callback] Error:", error);
    return plivoResponse("<Speak>System error. Goodbye.</Speak><Hangup/>");
  }
}
