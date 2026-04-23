import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { runAIWithFailover } from "@/lib/ai/provider-router";
import { signWebhookUrl, verifyWebhookSig } from "@/lib/telephony/webhook-auth";
import { getTenantSettings } from "@/lib/ai/system-prompt";
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

function fallbackGreeting(customer, language, agentName, companyName) {
  const firstName = String(customer?.firstName || customer?.name || "").split(" ")[0] || "";
  const name = firstName ? `${firstName} ji` : "ji";
  const agent = String(agentName || "").trim() || "your loan advisor";
  const company = String(companyName || "").trim() || "our company";
  if (language === "english") return `Hello ${firstName || "there"}, I'm ${agent} calling from ${company}. Do you have any loan requirements?`;
  return `Hello ${name}, main ${agent} bol rahi hoon ${company} se. Kya aapko kisi prakar ke loan ki zarurat hai?`;
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
    console.error("[exotel/answer] ElevenLabs error:", err.message);
    return null;
  }
}

export async function POST(request) {
  const url = new URL(request.url);
  const BASE_URL = process.env.APP_BASE_URL || process.env.NEXTAUTH_URL || url.origin;
  const customerId = url.searchParams.get("customerId");
  const callLogId = url.searchParams.get("callLogId");

  // Verify HMAC sig if callLogId present
  if (callLogId && !verifyWebhookSig(url.searchParams, callLogId)) {
    return new Response("Forbidden", { status: 403 });
  }

  try {
    const formData = await request.formData();
    const callSid = String(formData.get("CallSid") || formData.get("Sid") || "").trim();

    const callLog = callLogId
      ? await prisma.callLog.findFirst({ where: { id: callLogId }, select: { id: true, tenantId: true, customerId: true } })
      : null;

    const tenantId = callLog?.tenantId || null;
    const effectiveCustomerId = callLog?.customerId || customerId;

    const customer = effectiveCustomerId
      ? await prisma.customer.findFirst({ where: { id: effectiveCustomerId, ...(tenantId ? { tenantId } : {}) } })
      : null;

    if (!customer) {
      return exotelResponse("<Say>Customer record not found. Goodbye.</Say><Hangup/>");
    }

    // Update providerCallId
    if (callLogId && callSid) {
      await prisma.callLog.updateMany({ where: { id: callLogId }, data: { providerCallId: callSid } });
    }

    const { language, agentName, humanAdvisorName, companyName } = await getTenantSettings(tenantId).catch(() => ({
      language: "hinglish", agentName: "Priya", humanAdvisorName: "our advisor", companyName: null,
    }));

    // Generate greeting
    const customerForAI = {
      id: customer.id, firstName: customer.firstName, lastName: customer.lastName,
      loanType: customer.loanType, loanAmount: customer.loanAmount, monthlyIncome: customer.monthlyIncome,
      employmentType: customer.employmentType, city: customer.city, notes: customer.notes,
      status: customer.status, retryCount: customer.retryCount,
    };

    let greeting;
    try {
      const greetOutput = await runAIWithFailover({
        task: "CALL_SCRIPT",
        payload: { customer: customerForAI, language, humanAdvisorName, companyName, agentName },
      });
      greeting = greetOutput.result?.script || fallbackGreeting(customer, language, agentName, companyName);
    } catch {
      greeting = fallbackGreeting(customer, language, agentName, companyName);
    }

    // Append to transcript
    if (callLogId && greeting) {
      await prisma.$executeRaw`
        UPDATE "CallLog"
        SET transcript = CASE WHEN transcript IS NULL OR transcript = '' THEN ${`Agent: ${greeting}`}
        ELSE transcript || E'\n' || ${`Agent: ${greeting}`} END
        WHERE id = ${callLogId}
      `.catch(() => {});
    }

    // Build callback URL for turn 1
    const callbackUrl = signWebhookUrl(
      `${BASE_URL}/api/exotel/voice/callback?customerId=${customer.id}&callLogId=${callLogId}&turn=1&failedAttempts=0`,
      callLogId
    );

    // Synthesize with ElevenLabs
    const voiceId = await getTenantVoiceId(tenantId);
    const audioBuffer = await synthesizeWithElevenLabs(greeting, voiceId, DEFAULT_ELEVENLABS_MODEL);

    if (audioBuffer) {
      const audioId = await storeAudio(audioBuffer, "audio/mpeg");
      const audioUrl = `${BASE_URL}/api/audio/${audioId}`;
      return exotelResponse(
        `<Play>${xmlEscape(audioUrl)}</Play>` +
        `<Record action="${xmlEscape(callbackUrl)}" method="POST" maxLength="20" finishOnKey="#" playBeep="false" recordingStatusCallback="${xmlEscape(`${BASE_URL}/api/exotel/voice/events`)}"/>`
      );
    }

    // ElevenLabs unavailable — fallback to Exotel built-in Say
    return exotelResponse(
      `<Say>${xmlEscape(greeting)}</Say>` +
      `<Record action="${xmlEscape(callbackUrl)}" method="POST" maxLength="20" finishOnKey="#" playBeep="false"/>`
    );
  } catch (error) {
    console.error("[exotel/answer] Error:", error);
    return exotelResponse("<Say>System error. Please try again later.</Say><Hangup/>");
  }
}

export async function GET(request) {
  return POST(request);
}
