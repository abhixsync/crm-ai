import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { runAIWithFailover } from "@/lib/ai/provider-router";
import { isDatabaseUnavailable } from "@/lib/server/database-error";
import { getOrCreateSession, getSessionContext } from "@/lib/conversation/session-manager";
import { verifyWebhookSig, signWebhookUrl } from "@/lib/telephony/webhook-auth";
import { getTenantSettings } from "@/lib/ai/system-prompt";
import { finalizeCall } from "@/lib/calls/call-finalizer";
import { publishEvent } from "@/lib/events/event-publisher";

// TTS voice config — Amazon Polly Hindi voice (works on all Twilio accounts).
// Fallback from Google.hi-IN-Wavenet-A which requires Google TTS integration.
const TTS_VOICE = "Polly.Aditi";
const TTS_LANGUAGE = "hi-IN";

/**
 * Dynamic turn limit — replaces the old `turn >= 3` hard cap.
 * Allows natural conversations while still setting boundaries.
 */
function shouldEndCall(aiTurn, turn, extractedData) {
  // AI explicitly says end — always respect (LLM only sets this on explicit goodbye/DNC)
  if (aiTurn.shouldEnd) return true;

  // Absolute ceiling — prevent runaway conversations
  if (turn >= 12) return true;

  // All mandatory slots filled — close only after a minimum of 5 turns so the
  // conversation doesn't feel abruptly cut off right after slot collection.
  const allSlots = extractedData?.loanType && extractedData?.amount && extractedData?.timeline;
  if (allSlots && turn >= 5) return true;

  // Balance transfer only requires loanType — same minimum of 5 turns
  if (extractedData?.loanType === "balance_transfer" && turn >= 5) return true;

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


async function appendTranscript(callLogId, speaker, message) {
  if (!callLogId || !message) return;

  const line = `${speaker}: ${String(message || "").replace(/\n/g, " ")}`;
  await prisma.$executeRaw`
    UPDATE "CallLog"
    SET transcript = CASE
      WHEN transcript IS NULL OR transcript = '' THEN ${line}
      ELSE transcript || E'\n' || ${line}
    END
    WHERE id = ${callLogId}
  `;
}

function fallbackGreeting(customer, language, agentName, companyName) {
  const firstName = String(customer?.firstName || customer?.name || "").split(" ")[0] || "";
  const name = firstName ? `${firstName} ji` : "ji";
  const nameEn = firstName || "there";
  const agent = String(agentName || "").trim() || "your loan advisor";
  const company = String(companyName || "").trim() || "our company";

  if (language === "hindi") {
    return `Hello ${name}, main ${agent} bol rahi hoon ${company} se. Kya aapko kisi prakar ke loan ki zarurat hai?`;
  }
  if (language === "english") {
    return `Hello ${nameEn}, I'm ${agent} calling from ${company}. Do you have any loan requirements?`;
  }
  // hinglish (default)
  return `Hello ${name}, main ${agent} bol rahi hoon ${company} se. Kya aapko kisi prakar ke loan ki zarurat hai?`;
}

function getLocalizedPhrases(language, advisorName) {
  const adv = String(advisorName || "our loan advisor").trim();

  if (language === "hindi") {
    return {
      cantHear: `Maafi chahiye, aapki awaaz clearly nahi aayi. ${adv} jald hi aapse sampark karenge. Shukriya.`,
      retry1: "Kshama karein, aapki baat sun nahi paayi. Kya aap phir se bol sakte hain?",
      retry2: "Sunne mein thodi takleef ho rahi hai. Ek baar aur koshish karti hoon.",
      thankYou: `Aapke samay ke liye shukriya. ${adv} jald hi aapse sampark karenge.`,
      aiError: `Kshama karein, koi taknik samasya aayi. ${adv} jald hi aapse sampark karenge. Shukriya.`,
      closingSuffix: `Aapke samay ke liye shukriya. ${adv} jald hi aapse sampark karenge.`,
    };
  }

  if (language === "english") {
    return {
      cantHear: `I apologize, I couldn't hear your response clearly. Thank you for your time. ${adv} will contact you shortly.`,
      retry1: "I apologize, I didn't catch that. Could you please repeat?",
      retry2: "I'm still having trouble hearing you. Let me try once more.",
      thankYou: `Thank you for your time. ${adv} will contact you shortly.`,
      aiError: `I apologize for the interruption. ${adv} will contact you shortly. Thank you for your time.`,
      closingSuffix: `Thank you for your time. ${adv} will contact you shortly.`,
    };
  }

  // hinglish (default)
  return {
    cantHear: `Sorry, aapki awaaz clearly nahi aayi. ${adv} jald hi aapse contact karenge. Shukriya.`,
    retry1: "Sorry, sun nahi paayi. Kya aap phir se bol sakte hain?",
    retry2: "Sunne mein thodi problem ho rahi hai. Ek baar aur try karti hoon.",
    thankYou: `Aapke time ke liye shukriya. ${adv} jald hi aapse contact karenge.`,
    aiError: `Sorry, koi issue aa gaya. ${adv} jald hi aapse contact karenge. Shukriya.`,
    closingSuffix: `Aapke time ke liye shukriya. ${adv} jald hi aapse contact karenge.`,
  };
}


export async function POST(request) {
  try {
    const url = new URL(request.url);
    const BASE_URL = process.env.APP_BASE_URL || process.env.NEXTAUTH_URL || url.origin;
    const customerId = url.searchParams.get("customerId");
    const callLogId = url.searchParams.get("callLogId");
    const turn = Number(url.searchParams.get("turn") || "0");
    const failedAttempts = Number(url.searchParams.get("failedAttempts") || "0");

    // Verify webhook signature and callLogId existence
    if (callLogId) {
      if (!verifyWebhookSig(url.searchParams, callLogId)) {
        return new Response("Forbidden", { status: 403 });
      }
      const exists = await prisma.callLog.findFirst({
        where: { id: callLogId },
        select: { id: true },
      });
      if (!exists) {
        return new Response("Not Found", { status: 404 });
      }
    }

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

    // Resolve tenant language, agent name, human advisor name, company name
    const { language: tenantLanguage, agentName, humanAdvisorName: advisorName, companyName } =
      await getTenantSettings(tenantId).catch(() => ({ language: "hinglish", agentName: "our loan advisor", humanAdvisorName: "our loan advisor", companyName: null }));
    const phrases = getLocalizedPhrases(tenantLanguage, advisorName);

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
        after(() => finalizeCall(callLogId, customer.id, tenantId, null, {}, turn));
        if (tenantId && callLogId) publishEvent(tenantId, { type: "call:status", payload: { callLogId } }).catch(() => {});
        return twimlResponse(`<Say voice="${TTS_VOICE}" language="${TTS_LANGUAGE}">${xmlEscape(phrases.cantHear)}</Say><Hangup/>`);
      }

      // Retry listening with a helpful prompt
      const retryPrompt = failedAttempts === 0 ? phrases.retry1 : phrases.retry2;
      
      console.log(`[Webhook] No speech detected, retrying. Attempts: ${failedAttempts}`);
      await appendTranscript(callLogId, "Agent", retryPrompt);

      const nextAttempt = failedAttempts + 1;
      const actionUrl = signWebhookUrl(`${BASE_URL}/api/calls/webhook?customerId=${customer.id}&callLogId=${callLogId}&turn=${turn}&failedAttempts=${nextAttempt}`, callLogId);

      const twiml = `<Gather input="speech" language="hi-IN" speechTimeout="1" actionOnEmptyResult="true" action="${xmlEscape(actionUrl)}" method="POST"><Say voice="${TTS_VOICE}" language="${TTS_LANGUAGE}" rate="0.9">${xmlEscape(retryPrompt)}</Say></Gather><Hangup/>`;
      console.log(`[Webhook] Sending TwiML for retry: ${twiml.substring(0, 100)}...`);
      return twimlResponse(twiml);
    }

    if (speechResult) {
      console.log(`[Webhook] Speech received: ${speechResult}`);
      await appendTranscript(callLogId, "Customer", speechResult);
    }

    // Fix 4: transcript is fetched once above; update in-memory after customer speech append
    let transcript = callLog?.transcript || "";
    if (speechResult) {
      transcript = transcript ? transcript + "\nCustomer: " + speechResult : "Customer: " + speechResult;
    }

    if (!speechResult && turn === 0) {
      const customerForAI = {
        id: customer.id,
        firstName: customer.firstName,
        lastName: customer.lastName,
        loanType: customer.loanType,
        loanAmount: customer.loanAmount,
        monthlyIncome: customer.monthlyIncome,
        employmentType: customer.employmentType,
        city: customer.city,
        notes: customer.notes,
        status: customer.status,
        retryCount: customer.retryCount,
      };
      let opening;
      try {
        const greetOutput = await runAIWithFailover({
          task: "CALL_SCRIPT",
          payload: { customer: customerForAI, language: tenantLanguage, humanAdvisorName: advisorName, companyName, agentName },
        });
        opening = greetOutput.result?.script || fallbackGreeting(customer, tenantLanguage, agentName, companyName);
      } catch {
        opening = fallbackGreeting(customer, tenantLanguage, agentName, companyName);
      }
      console.log(`[Webhook] Initial greeting on turn 0: ${opening.substring(0, 50)}...`);
      await appendTranscript(callLogId, "Agent", opening);

      const actionUrl = signWebhookUrl(`${BASE_URL}/api/calls/webhook?customerId=${customer.id}&callLogId=${callLogId}&turn=1`, callLogId);

      const twiml = `<Gather input="speech" language="hi-IN" speechTimeout="1" actionOnEmptyResult="true" action="${xmlEscape(actionUrl)}" method="POST"><Say voice="${TTS_VOICE}" language="${TTS_LANGUAGE}" rate="0.9">${xmlEscape(opening)}</Say></Gather><Hangup/>`;
      console.log(`[Webhook] Sending initial TwiML with Gather`);
      return twimlResponse(twiml);
    }

    // Ensure we only process AI if we have speech from customer
    if (!speechResult) {
      console.log(`[Webhook] No speech result and not initial turn, ending call`);
      after(() => finalizeCall(callLogId, customer.id, tenantId, null, {}, turn));
      if (tenantId && callLogId) publishEvent(tenantId, { type: "call:status", payload: { callLogId } }).catch(() => {});
      return twimlResponse(`<Say voice="${TTS_VOICE}" language="${TTS_LANGUAGE}">${xmlEscape(phrases.thankYou)}</Say><Hangup/>`);
    }

    // Get cross-call memory session
    const sessionCtx = tenantId ? await getSessionContext(tenantId, customer.id) : {};

    const customerForAI = {
      id: customer.id,
      firstName: customer.firstName,
      lastName: customer.lastName,
      loanType: customer.loanType,
      loanAmount: customer.loanAmount,
      monthlyIncome: customer.monthlyIncome,
      employmentType: customer.employmentType,
      city: customer.city,
      notes: customer.notes,
      status: customer.status,
      retryCount: customer.retryCount,
    };
    console.log(`[Webhook] Processing AI turn ${turn}, transcript length: ${transcript.length}`);
    let aiOutput;
    try {
      aiOutput = await runAIWithFailover({
        task: "CALL_TURN",
        payload: {
          customer: customerForAI,
          transcript,
          turn,
          latestCustomerMessage: speechResult,
          agentName: agentName,
          companyName,
          context: {
            conversationStage: sessionCtx.lastStage || undefined,
            extractedData: sessionCtx.extractedData || undefined,
            previousCallSummary: sessionCtx.previousCallSummary || undefined,
          },
        },
      });
    } catch (aiError) {
      console.error("[Webhook] AI provider failed:", aiError.message);
      after(() => finalizeCall(callLogId, customer.id, tenantId, sessionCtx, {}, turn));
      if (tenantId && callLogId) publishEvent(tenantId, { type: "call:status", payload: { callLogId } }).catch(() => {});
      return twimlResponse(`<Say voice="${TTS_VOICE}" language="${TTS_LANGUAGE}">${xmlEscape(phrases.aiError)}</Say><Hangup/>`);
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
    // Fix 4: keep in-memory transcript in sync after AI reply append
    transcript = transcript ? transcript + "\nAgent: " + aiTurn.reply : "Agent: " + aiTurn.reply;

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
      const closing = `${aiTurn.reply} ${phrases.closingSuffix}`;
      after(() => finalizeCall(callLogId, customer.id, tenantId, sessionCtx, mergedExtracted, turn));
      if (tenantId && callLogId) publishEvent(tenantId, { type: "call:status", payload: { callLogId } }).catch(() => {});

      return twimlResponse(`<Say voice="${TTS_VOICE}" language="${TTS_LANGUAGE}">${xmlEscape(closing)}</Say><Hangup/>`);
    }

    // Continue conversation: Play AI response and listen for customer reply
    const nextTurn = turn + 1;
    const actionUrl = signWebhookUrl(`${BASE_URL}/api/calls/webhook?customerId=${customer.id}&callLogId=${callLogId}&turn=${nextTurn}&failedAttempts=0`, callLogId);

    const twiml = `<Gather input="speech" language="hi-IN" speechTimeout="1" actionOnEmptyResult="true" action="${xmlEscape(actionUrl)}" method="POST"><Say voice="${TTS_VOICE}" language="${TTS_LANGUAGE}" rate="0.9">${xmlEscape(aiTurn.reply)}</Say></Gather><Hangup/>`;
    console.log(`[Webhook] Sending AI response with Gather for next turn`);
    return twimlResponse(twiml);
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      console.warn("[api/calls/webhook] Database unavailable; returning fallback TwiML.");
      return twimlResponse(`<Say voice="${TTS_VOICE}" language="${TTS_LANGUAGE}">System is temporarily unavailable. Please try again later.</Say><Hangup/>`);
    }

    // Fix 3: Reset inActiveCall lock on any unexpected error to prevent permanent lock
    const errUrl = new URL(request.url);
    const errCustomerId = errUrl.searchParams.get("customerId");
    const errCallLogId = errUrl.searchParams.get("callLogId");
    if (errCustomerId || errCallLogId) {
      const lockedCallLog = errCallLogId
        ? await prisma.callLog.findFirst({ where: { id: errCallLogId }, select: { customerId: true, tenantId: true } }).catch(() => null)
        : null;
      const resolvedCustomerId = lockedCallLog?.customerId || errCustomerId;
      const resolvedTenantId = lockedCallLog?.tenantId || null;
      if (resolvedCustomerId && resolvedTenantId) {
        await prisma.customer.updateMany({
          where: { id: resolvedCustomerId, tenantId: resolvedTenantId },
          data: { inActiveCall: false },
        }).catch(() => {});
      }
    }

    throw error;
  }
}

export async function GET() {
  return twimlResponse(
    `<Say voice="${TTS_VOICE}" language="${TTS_LANGUAGE}">This endpoint only accepts POST requests from Twilio. Goodbye.</Say><Hangup/>`
  );
}