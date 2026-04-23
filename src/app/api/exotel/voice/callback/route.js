import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { runAIWithFailover } from "@/lib/ai/provider-router";
import { signWebhookUrl, verifyWebhookSig } from "@/lib/telephony/webhook-auth";
import { getTenantSettings } from "@/lib/ai/system-prompt";
import { getSessionContext } from "@/lib/conversation/session-manager";
import { finalizeCall } from "@/lib/calls/call-finalizer";
import { publishEvent } from "@/lib/events/event-publisher";
import { transcribeAudio } from "@/lib/speech/index";
import { isMeaningfulVoiceTranscript } from "@/modules/loan-assistant/voice-session-utils";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { storeAudio } from "@/lib/speech/audio-cache";
import { getTenantVoiceId, DEFAULT_ELEVENLABS_MODEL } from "@/lib/speech/elevenlabs-voices";

function xmlEscape(value) {
  return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function exotelResponse(xmlBody) {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${xmlBody}</Response>`, {
    status: 200,
    headers: { "Content-Type": "application/xml" },
  });
}

function shouldEndCall(aiTurn, turn, extractedData) {
  if (aiTurn.shouldEnd) return true;
  if (turn >= 12) return true;
  const allSlots = extractedData?.loanType && extractedData?.amount && extractedData?.timeline;
  if (allSlots && turn >= 5) return true;
  if (extractedData?.loanType === "balance_transfer" && turn >= 5) return true;
  if (turn >= 8 && !extractedData?.loanType && !extractedData?.amount) return true;
  return false;
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
      cantHear: `I apologize, I couldn't hear you clearly. ${adv} will contact you shortly.`,
      retry1: "I apologize, I didn't catch that. Could you please repeat?",
      retry2: "I'm still having trouble hearing you. Let me try once more.",
      thankYou: `Thank you for your time. ${adv} will contact you shortly.`,
      aiError: `I apologize for the interruption. ${adv} will contact you shortly.`,
      closingSuffix: `Thank you for your time. ${adv} will contact you shortly.`,
    };
  }
  return {
    cantHear: `Sorry, aapki awaaz clearly nahi aayi. ${adv} jald hi aapse contact karenge. Shukriya.`,
    retry1: "Sorry, sun nahi paayi. Kya aap phir se bol sakte hain?",
    retry2: "Sunne mein thodi problem ho rahi hai. Ek baar aur try karti hoon.",
    thankYou: `Aapke time ke liye shukriya. ${adv} jald hi aapse contact karenge.`,
    aiError: `Sorry, koi issue aa gaya. ${adv} jald hi aapse contact karenge. Shukriya.`,
    closingSuffix: `Aapke time ke liye shukriya. ${adv} jald hi aapse contact karenge.`,
  };
}

async function appendTranscript(callLogId, speaker, message) {
  if (!callLogId || !message) return;
  const line = `${speaker}: ${String(message || "").replace(/\n/g, " ")}`;
  await prisma.$executeRaw`
    UPDATE "CallLog"
    SET transcript = CASE WHEN transcript IS NULL OR transcript = '' THEN ${line}
    ELSE transcript || E'\n' || ${line} END
    WHERE id = ${callLogId}
  `.catch(() => {});
}

function resolveExotelCreds() {
  return {
    apiKey: process.env.EXOTEL_API_KEY || "",
    apiToken: process.env.EXOTEL_API_TOKEN || "",
    sid: process.env.EXOTEL_SID || "",
  };
}

async function downloadExotelRecording(recordingUrl) {
  const creds = resolveExotelCreds();
  const headers = {};
  if (creds.apiKey && creds.apiToken) {
    headers["Authorization"] = `Basic ${Buffer.from(`${creds.apiKey}:${creds.apiToken}`).toString("base64")}`;
  }
  const res = await fetch(recordingUrl, { headers });
  if (!res.ok) throw new Error(`Failed to download recording: ${res.status}`);
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function synthesizeWithElevenLabs(text, voiceId, model) {
  if (!process.env.ELEVENLABS_API_KEY) return null;
  try {
    const client = new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY });
    const stream = await client.generate({ voice: voiceId, text, model_id: model || DEFAULT_ELEVENLABS_MODEL });
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    return Buffer.concat(chunks);
  } catch (err) {
    console.error("[exotel/callback] ElevenLabs error:", err.message);
    return null;
  }
}

async function buildPlayOrSayXml(text, voiceId, model, baseUrl) {
  const audioBuffer = await synthesizeWithElevenLabs(text, voiceId, model);
  if (audioBuffer) {
    const audioId = await storeAudio(audioBuffer, "audio/mpeg");
    return `<Play>${xmlEscape(`${baseUrl}/api/audio/${audioId}`)}</Play>`;
  }
  return `<Say>${xmlEscape(text)}</Say>`;
}

export async function POST(request) {
  const url = new URL(request.url);
  const BASE_URL = process.env.APP_BASE_URL || process.env.NEXTAUTH_URL || url.origin;
  const customerId = url.searchParams.get("customerId");
  const callLogId = url.searchParams.get("callLogId");
  const turn = Number(url.searchParams.get("turn") || "1");
  const failedAttempts = Number(url.searchParams.get("failedAttempts") || "0");

  // Verify HMAC sig
  if (callLogId && !verifyWebhookSig(url.searchParams, callLogId)) {
    return new Response("Forbidden", { status: 403 });
  }

  try {
    const formData = await request.formData();
    const recordingUrl = String(formData.get("RecordingUrl") || "").trim();
    const callSid = String(formData.get("CallSid") || "").trim();

    const callLog = callLogId
      ? await prisma.callLog.findFirst({ where: { id: callLogId }, select: { id: true, tenantId: true, customerId: true, transcript: true } })
      : null;

    const tenantId = callLog?.tenantId || null;
    const effectiveCustomerId = callLog?.customerId || customerId;

    const customer = effectiveCustomerId
      ? await prisma.customer.findFirst({ where: { id: effectiveCustomerId, ...(tenantId ? { tenantId } : {}) } })
      : null;

    if (!customer) {
      return exotelResponse("<Say>Customer record not found. Goodbye.</Say><Hangup/>");
    }

    const { language, agentName, humanAdvisorName, companyName } = await getTenantSettings(tenantId).catch(() => ({
      language: "hinglish", agentName: "Priya", humanAdvisorName: "our advisor", companyName: null,
    }));
    const phrases = getLocalizedPhrases(language, humanAdvisorName);
    const voiceId = await getTenantVoiceId(tenantId);

    // Transcribe recording
    let speechResult = "";
    if (recordingUrl) {
      try {
        const audioBuffer = await downloadExotelRecording(recordingUrl);
        const raw = await transcribeAudio(audioBuffer, "audio/mpeg");
        speechResult = isMeaningfulVoiceTranscript(raw) ? raw.trim() : "";
      } catch (err) {
        console.warn("[exotel/callback] Transcription error:", err.message);
      }
    }

    console.log(`[Exotel Callback] Turn: ${turn}, Speech: "${speechResult}", FailedAttempts: ${failedAttempts}`);

    // No speech — retry or end
    if (!speechResult) {
      if (failedAttempts >= 2) {
        after(() => finalizeCall(callLogId, customer.id, tenantId, null, {}, turn));
        if (tenantId && callLogId) publishEvent(tenantId, { type: "call:status", payload: { callLogId } }).catch(() => {});
        const playXml = await buildPlayOrSayXml(phrases.cantHear, voiceId, DEFAULT_ELEVENLABS_MODEL, BASE_URL);
        return exotelResponse(`${playXml}<Hangup/>`);
      }
      const retryPrompt = failedAttempts === 0 ? phrases.retry1 : phrases.retry2;
      await appendTranscript(callLogId, "Agent", retryPrompt);
      const retryUrl = signWebhookUrl(
        `${BASE_URL}/api/exotel/voice/callback?customerId=${customer.id}&callLogId=${callLogId}&turn=${turn}&failedAttempts=${failedAttempts + 1}`,
        callLogId
      );
      const playXml = await buildPlayOrSayXml(retryPrompt, voiceId, DEFAULT_ELEVENLABS_MODEL, BASE_URL);
      return exotelResponse(
        `${playXml}` +
        `<Record action="${xmlEscape(retryUrl)}" method="POST" maxLength="20" finishOnKey="#" playBeep="false"/>`
      );
    }

    // Got speech — process it
    await appendTranscript(callLogId, "Customer", speechResult);
    const transcript = callLog?.transcript || "";

    const sessionCtx = tenantId ? await getSessionContext(tenantId, customer.id) : {};

    const customerForAI = {
      id: customer.id, firstName: customer.firstName, lastName: customer.lastName,
      loanType: customer.loanType, loanAmount: customer.loanAmount, monthlyIncome: customer.monthlyIncome,
      employmentType: customer.employmentType, city: customer.city, notes: customer.notes,
      status: customer.status, retryCount: customer.retryCount,
    };

    let aiOutput;
    try {
      aiOutput = await runAIWithFailover({
        task: "CALL_TURN",
        payload: {
          customer: customerForAI, transcript, turn,
          latestCustomerMessage: speechResult, agentName, companyName,
          context: {
            conversationStage: sessionCtx.lastStage || undefined,
            extractedData: sessionCtx.extractedData || undefined,
            previousCallSummary: sessionCtx.previousCallSummary || undefined,
          },
        },
      });
    } catch (aiError) {
      console.error("[exotel/callback] AI error:", aiError.message);
      after(() => finalizeCall(callLogId, customer.id, tenantId, sessionCtx, {}, turn));
      if (tenantId && callLogId) publishEvent(tenantId, { type: "call:status", payload: { callLogId } }).catch(() => {});
      const playXml = await buildPlayOrSayXml(phrases.aiError, voiceId, DEFAULT_ELEVENLABS_MODEL, BASE_URL);
      return exotelResponse(`${playXml}<Hangup/>`);
    }

    const aiTurn = aiOutput.result;

    const mergedExtracted = { ...(sessionCtx.extractedData || {}) };
    if (aiTurn.extractedData && typeof aiTurn.extractedData === "object") {
      for (const [k, v] of Object.entries(aiTurn.extractedData)) {
        if (v != null) mergedExtracted[k] = v;
      }
    }

    await appendTranscript(callLogId, "Agent", aiTurn.reply);

    if (callLogId && tenantId) {
      await prisma.callLog.updateMany({
        where: { id: callLogId, tenantId },
        data: { aiProviderUsed: aiOutput.provider.name },
      }).catch(() => {});
    }

    if (shouldEndCall(aiTurn, turn, mergedExtracted)) {
      const closing = `${aiTurn.reply} ${phrases.closingSuffix}`;
      after(() => finalizeCall(callLogId, customer.id, tenantId, sessionCtx, mergedExtracted, turn));
      if (tenantId && callLogId) publishEvent(tenantId, { type: "call:status", payload: { callLogId } }).catch(() => {});
      const playXml = await buildPlayOrSayXml(closing, voiceId, DEFAULT_ELEVENLABS_MODEL, BASE_URL);
      return exotelResponse(`${playXml}<Hangup/>`);
    }

    const nextUrl = signWebhookUrl(
      `${BASE_URL}/api/exotel/voice/callback?customerId=${customer.id}&callLogId=${callLogId}&turn=${turn + 1}&failedAttempts=0`,
      callLogId
    );
    const playXml = await buildPlayOrSayXml(aiTurn.reply, voiceId, DEFAULT_ELEVENLABS_MODEL, BASE_URL);
    return exotelResponse(
      `${playXml}` +
      `<Record action="${xmlEscape(nextUrl)}" method="POST" maxLength="20" finishOnKey="#" playBeep="false"/>`
    );

  } catch (error) {
    console.error("[exotel/callback] Error:", error);
    return exotelResponse("<Say>System error. Goodbye.</Say><Hangup/>");
  }
}

export async function GET(request) {
  return POST(request);
}
