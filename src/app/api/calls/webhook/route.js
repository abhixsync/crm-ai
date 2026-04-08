import { CallStatus, CustomerStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { generateInitialCallPrompt } from "@/lib/ai/openai";
import { runAIWithFailover } from "@/lib/ai/provider-router";
import { applyCustomerTransition } from "@/lib/journey/transition-service";
import { scheduleRetryForFailure } from "@/lib/journey/retry-policy";
import { toIntentLabel } from "@/lib/journey/constants";
import { canonicalizeIntent } from "@/lib/journey/intent-normalization";
import { evaluateCrmEventDecision } from "@/lib/crm/event-triggers";
import { notifyAdvisorForCallLog } from "@/lib/notifications/advisor-notifier";
import { createNotification } from "@/lib/notifications/notification-service";
import { publishEvent } from "@/lib/events/event-publisher";
import { isDatabaseUnavailable } from "@/lib/server/database-error";
import { getOrCreateSession, updateSessionAfterCall, getSessionContext } from "@/lib/conversation/session-manager";

// TTS voice config — Amazon Polly Hindi voice (works on all Twilio accounts).
// Fallback from Google.hi-IN-Wavenet-A which requires Google TTS integration.
const TTS_VOICE = "Polly.Aditi";
const TTS_LANGUAGE = "hi-IN";

/**
 * Dynamic turn limit — replaces the old `turn >= 3` hard cap.
 * Allows natural conversations while still setting boundaries.
 */
function shouldEndCall(aiTurn, turn, extractedData) {
  // AI explicitly says end — always respect
  if (aiTurn.shouldEnd) return true;

  // Absolute ceiling
  if (turn >= 12) return true;

  // All mandatory slots filled — can close after minimum turns
  const allSlots = extractedData?.loanType && extractedData?.amount && extractedData?.timeline;
  if (allSlots && turn >= 3) return true;

  // Balance transfer only requires loanType
  if (extractedData?.loanType === "balance_transfer" && turn >= 3) return true;

  // No progress after several turns — end gracefully
  if (turn >= 8 && !extractedData?.loanType && !extractedData?.amount) return true;

  return false;
}

function xmlEscape(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function twimlResponse(xmlBody) {
  const xml = `<?xml version="1.0" encoding="UTF-8"?><Response>${xmlBody}</Response>`;

  return new Response(xml, {
    status: 200,
    headers: {
      "Content-Type": "text/xml",
    },
  });
}

function mapIntentToCustomerStatus(intent) {
  const normalized = String(intent || "").trim().toLowerCase();

  if (normalized === "interested") return CustomerStatus.INTERESTED;
  if (normalized === "not_interested") {
    return CustomerStatus.NOT_INTERESTED;
  }
  if (normalized === "do_not_call") {
    return CustomerStatus.DO_NOT_CALL;
  }
  if (normalized === "converted") return CustomerStatus.CONVERTED;
  if (normalized === "follow_up" || normalized === "call_back_later") return CustomerStatus.FOLLOW_UP;
  if (normalized === "failed") return CustomerStatus.CALL_FAILED;

  return CustomerStatus.CALL_FAILED;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function appendTranscript(callLogId, speaker, message) {
  if (!callLogId || !message) return;

  const callLog = await prisma.callLog.findFirst({ where: { id: callLogId } });
  if (!callLog) return;

  const prefix = callLog.transcript ? `${callLog.transcript}\n` : "";
  const nextTranscript = `${prefix}${speaker}: ${message}`;

  await prisma.callLog.updateMany({
    where: { id: callLogId, tenantId: callLog.tenantId },
    data: { transcript: nextTranscript },
  });
}

async function finishCall(callLogId, customerId, tenantId) {
  if (!callLogId) {
    return;
  }

  const callLog = await prisma.callLog.findFirst({
    where: {
      id: callLogId,
      ...(tenantId ? { tenantId } : {}),
    },
  });
  if (!callLog) {
    return;
  }

  const alreadyFinalized =
    callLog.status === CallStatus.COMPLETED &&
    callLog.endedAt &&
    String(callLog.summary || "").trim() &&
    String(callLog.intentClassification || "").trim();

  if (alreadyFinalized) {
    return;
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
    source: "calls_webhook_finish",
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
      reason: `Webhook final outcome: ${normalizedIntent}`,
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
      });
    }
  }

  const advisorNotification = await notifyAdvisorForCallLog(callLog.id);
  if (!advisorNotification.ok && !advisorNotification.skipped) {
    console.warn("[api/calls/webhook] Advisor notification failed:", advisorNotification.reason);
  } else if (advisorNotification.skipped) {
    console.info("[api/calls/webhook] Advisor notification skipped:", advisorNotification.reason);
  } else {
    console.info("[api/calls/webhook] Advisor notification result:", advisorNotification.channels);
  }

  // In-app notification — fire-and-forget
  createNotification(callLog.tenantId, {
    type: "CALL_COMPLETED",
    title: "Call completed",
    body: analysis?.summary || "A call has ended.",
    link: "/admin/calls",
  }).catch(() => {});

  // SSE events — fire-and-forget; never block call completion
  publishEvent(callLog.tenantId, { type: "metrics:update" }).catch(() => {});
  publishEvent(callLog.tenantId, { type: "notification:new" }).catch(() => {});
  publishEvent(callLog.tenantId, { type: "call:status", payload: { status: mappedStatus } }).catch(() => {});
}

export async function POST(request) {
  try {
    const url = new URL(request.url);
    const customerId = url.searchParams.get("customerId");
    const callLogId = url.searchParams.get("callLogId");
    const turn = Number(url.searchParams.get("turn") || "0");
    const failedAttempts = Number(url.searchParams.get("failedAttempts") || "0");

    const formData = await request.formData();
    const callSid = String(formData.get("CallSid") || "");
    const speechResult = String(formData.get("SpeechResult") || "").trim();

    let tenantId = null;

    const callLog = callLogId
      ? await prisma.callLog.findFirst({
          where: { id: callLogId },
          select: { id: true, customerId: true, tenantId: true, transcript: true },
        })
      : null;

    if (callLog?.tenantId) {
      tenantId = callLog.tenantId;
    }

    const effectiveCustomerId = callLog?.customerId || customerId;
    const customer = effectiveCustomerId
      ? await prisma.customer.findFirst({
          where: {
            id: effectiveCustomerId,
            ...(tenantId ? { tenantId } : {}),
          },
        })
      : null;

    if (customer?.tenantId) {
      tenantId = customer.tenantId;
    }

    if (!customer) {
      return twimlResponse(`<Say voice="${TTS_VOICE}" language="${TTS_LANGUAGE}">Customer record not found. Please call again later.</Say><Hangup/>`);
    }

    if (callLogId && callSid) {
      await prisma.callLog.updateMany({
        where: {
          id: callLogId,
          ...(tenantId ? { tenantId } : {}),
        },
        data: {
          providerCallId: callSid,
        },
      });
    }

    // Log incoming request for debugging
    console.log(`[Webhook] Turn: ${turn}, SpeechResult: "${speechResult}", FailedAttempts: ${failedAttempts}`);

    // Handle speech timeout - retry listening instead of ending call
    if (!speechResult && turn > 0) {
      const maxRetries = 2;
      if (failedAttempts >= maxRetries) {
        // After max retries, end the call gracefully
        console.log(`[Webhook] Max retries reached, ending call`);
        await finishCall(callLogId, customer.id, tenantId);
        return twimlResponse(`<Say voice="${TTS_VOICE}" language="${TTS_LANGUAGE}">I apologize, I couldn't hear your response clearly. Thank you for your time. Our loan advisor will contact you shortly.</Say><Hangup/>`);
      }

      // Retry listening with a helpful prompt
      const retryPrompt = failedAttempts === 0 
        ? "I apologize, I didn't catch that. Could you please repeat?"
        : "I'm still having trouble hearing you. Let me try once more.";
      
      console.log(`[Webhook] No speech detected, retrying. Attempts: ${failedAttempts}`);
      await appendTranscript(callLogId, "Agent", retryPrompt);

      const nextAttempt = failedAttempts + 1;
      const actionUrl = `${url.origin}/api/calls/webhook?customerId=${customer.id}&callLogId=${callLogId}&turn=${turn}&failedAttempts=${nextAttempt}`;

      const twiml = `<Gather input="speech" language="hi-IN" speechTimeout="3" actionOnEmptyResult="true" action="${xmlEscape(actionUrl)}" method="POST"><Say voice="${TTS_VOICE}" language="${TTS_LANGUAGE}" rate="0.9">${xmlEscape(retryPrompt)}</Say></Gather><Hangup/>`;
      console.log(`[Webhook] Sending TwiML for retry: ${twiml.substring(0, 100)}...`);
      return twimlResponse(twiml);
    }

    if (speechResult) {
      console.log(`[Webhook] Speech received: ${speechResult}`);
      await appendTranscript(callLogId, "Customer", speechResult);
    }

    if (!speechResult && turn === 0) {
      const opening = generateInitialCallPrompt(customer);
      console.log(`[Webhook] Initial greeting on turn 0: ${opening.substring(0, 50)}...`);
      await appendTranscript(callLogId, "Agent", opening);

      const actionUrl = `${url.origin}/api/calls/webhook?customerId=${customer.id}&callLogId=${callLogId}&turn=1`;

      const twiml = `<Gather input="speech" language="hi-IN" speechTimeout="3" actionOnEmptyResult="true" action="${xmlEscape(actionUrl)}" method="POST"><Say voice="${TTS_VOICE}" language="${TTS_LANGUAGE}" rate="0.9">${xmlEscape(opening)}</Say></Gather><Hangup/>`;
      console.log(`[Webhook] Sending initial TwiML with Gather`);
      return twimlResponse(twiml);
    }

    // Ensure we only process AI if we have speech from customer
    if (!speechResult) {
      console.log(`[Webhook] No speech result and not initial turn, ending call`);
      await finishCall(callLogId, customer.id, tenantId);
      return twimlResponse(`<Say voice="${TTS_VOICE}" language="${TTS_LANGUAGE}">Thank you for your time. Our loan advisor will contact you shortly.</Say><Hangup/>`);
    }

    const transcript = callLog?.transcript || "";

    // Get cross-call memory session
    const sessionCtx = tenantId ? await getSessionContext(tenantId, customer.id) : {};

    console.log(`[Webhook] Processing AI turn ${turn}, transcript length: ${transcript.length}`);
    let aiOutput;
    try {
      aiOutput = await runAIWithFailover({
        task: "CALL_TURN",
        payload: {
          customer,
          transcript,
          turn,
          latestCustomerMessage: speechResult,
          context: {
            conversationStage: sessionCtx.lastStage || undefined,
            extractedData: sessionCtx.extractedData || undefined,
            previousCallSummary: sessionCtx.previousCallSummary || undefined,
          },
        },
      });
    } catch (aiError) {
      console.error("[Webhook] AI provider failed:", aiError.message);
      await finishCall(callLogId, customer.id, tenantId);
      return twimlResponse(`<Say voice="${TTS_VOICE}" language="${TTS_LANGUAGE}">I apologize for the interruption. Our loan advisor will contact you shortly. Thank you for your time.</Say><Hangup/>`);
    }
    const aiTurn = aiOutput.result;

    // Merge extracted data from LLM response with session data
    const mergedExtracted = { ...(sessionCtx.extractedData || {}) };
    if (aiTurn.extractedData && typeof aiTurn.extractedData === "object") {
      for (const [key, value] of Object.entries(aiTurn.extractedData)) {
        if (value != null) mergedExtracted[key] = value;
      }
    }

    console.log(`[Webhook] AI response: ${aiTurn.reply.substring(0, 50)}..., shouldEnd: ${aiTurn.shouldEnd}, intent: ${aiTurn.intent || "n/a"}`);
    await appendTranscript(callLogId, "Agent", aiTurn.reply);

    if (callLogId) {
      await prisma.callLog.updateMany({
        where: {
          id: callLogId,
          ...(tenantId ? { tenantId } : {}),
        },
        data: {
          aiProviderUsed: aiOutput.provider.name,
        },
      });
    }

    // Dynamic turn limit — replaces old `turn >= 3`
    const endCall = shouldEndCall(aiTurn, turn, mergedExtracted);

    if (endCall) {
      console.log(`[Webhook] Call should end. Finishing call.`);
      const closing = `${aiTurn.reply} Thank you for your time. Our loan advisor will contact you shortly.`;
      await finishCall(callLogId, customer.id, tenantId);

      // Update session with final state
      if (sessionCtx.sessionId) {
        await updateSessionAfterCall(sessionCtx.sessionId, {
          callLogId,
          turnCount: turn,
          extractedData: mergedExtracted,
        });
      }

      return twimlResponse(`<Say voice="${TTS_VOICE}" language="${TTS_LANGUAGE}">${xmlEscape(closing)}</Say><Hangup/>`);
    }

    // Continue conversation: Play AI response and listen for customer reply
    const nextTurn = turn + 1;
    const actionUrl = `${url.origin}/api/calls/webhook?customerId=${customer.id}&callLogId=${callLogId}&turn=${nextTurn}&failedAttempts=0`;

    const twiml = `<Gather input="speech" language="hi-IN" speechTimeout="3" actionOnEmptyResult="true" action="${xmlEscape(actionUrl)}" method="POST"><Say voice="${TTS_VOICE}" language="${TTS_LANGUAGE}" rate="0.9">${xmlEscape(aiTurn.reply)}</Say></Gather><Hangup/>`;
    console.log(`[Webhook] Sending AI response with Gather for next turn`);
    return twimlResponse(twiml);
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      console.warn("[api/calls/webhook] Database unavailable; returning fallback TwiML.");
      return twimlResponse(`<Say voice="${TTS_VOICE}" language="${TTS_LANGUAGE}">System is temporarily unavailable. Please try again later.</Say><Hangup/>`);
    }

    throw error;
  }
}

export async function GET() {
  return twimlResponse(
    `<Say voice="${TTS_VOICE}" language="${TTS_LANGUAGE}">This endpoint only accepts POST requests from Twilio. Goodbye.</Say><Hangup/>`
  );
}