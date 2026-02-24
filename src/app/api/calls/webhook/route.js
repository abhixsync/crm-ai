import { CustomerStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { generateInitialCallPrompt } from "@/lib/ai/openai";
import { runAIWithFailover } from "@/lib/ai/provider-router";

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
  const normalized = String(intent || "").toUpperCase();

  if (normalized.includes("INTEREST")) return CustomerStatus.INTERESTED;
  if (normalized.includes("NOT_INTEREST") || normalized.includes("NOT INTEREST")) {
    return CustomerStatus.NOT_INTERESTED;
  }
  if (normalized.includes("DO_NOT_CALL") || normalized.includes("DNC")) {
    return CustomerStatus.DO_NOT_CALL;
  }

  return CustomerStatus.FOLLOW_UP;
}

async function appendTranscript(callLogId, speaker, message) {
  if (!callLogId || !message) return;

  const callLog = await prisma.callLog.findUnique({ where: { id: callLogId } });
  if (!callLog) return;

  const prefix = callLog.transcript ? `${callLog.transcript}\n` : "";
  const nextTranscript = `${prefix}${speaker}: ${message}`;

  await prisma.callLog.update({
    where: { id: callLogId },
    data: { transcript: nextTranscript },
  });
}

async function finishCall(callLogId, customerId) {
  if (!callLogId) {
    return;
  }

  const callLog = await prisma.callLog.findUnique({ where: { id: callLogId } });
  const transcript = callLog?.transcript || "";
  const aiOutput = await runAIWithFailover({
    task: "CALL_SUMMARY",
    payload: { transcript },
  });
  const analysis = aiOutput.result;

  await prisma.callLog.update({
    where: { id: callLogId },
    data: {
      summary: analysis.summary,
      intent: analysis.intent,
      nextAction: analysis.nextAction,
      aiProviderUsed: aiOutput.provider.name,
      status: "COMPLETED",
      endedAt: new Date(),
    },
  });

  if (customerId) {
    await prisma.customer.update({
      where: { id: customerId },
      data: {
        status: mapIntentToCustomerStatus(analysis.intent),
        lastContactedAt: new Date(),
      },
    });
  }
}

export async function POST(request) {
  const url = new URL(request.url);
  const customerId = url.searchParams.get("customerId");
  const callLogId = url.searchParams.get("callLogId");
  const turn = Number(url.searchParams.get("turn") || "0");

  const formData = await request.formData();
  const callSid = String(formData.get("CallSid") || "");
  const speechResult = String(formData.get("SpeechResult") || "").trim();

  const customer = customerId
    ? await prisma.customer.findUnique({ where: { id: customerId } })
    : null;

  if (!customer) {
    return twimlResponse("<Say>Customer record not found. Please call again later.</Say><Hangup/>");
  }

  if (callLogId && callSid) {
    await prisma.callLog.update({
      where: { id: callLogId },
      data: {
        providerCallId: callSid,
      },
    });
  }

  if (speechResult) {
    await appendTranscript(callLogId, "Customer", speechResult);
  }

  if (!speechResult && turn === 0) {
    const opening = generateInitialCallPrompt(customer);
    await appendTranscript(callLogId, "Agent", opening);

    const actionUrl = `${url.origin}/api/calls/webhook?customerId=${customer.id}&callLogId=${callLogId}&turn=1`;

    return twimlResponse(
      `<Gather input="speech" language="en-IN" speechTimeout="auto" action="${xmlEscape(actionUrl)}" method="POST"><Say voice="alice">${xmlEscape(
        opening
      )}</Say></Gather><Say voice="alice">I could not hear your response. We will follow up later.</Say><Hangup/>`
    );
  }

  const callLog = callLogId ? await prisma.callLog.findUnique({ where: { id: callLogId } }) : null;
  const transcript = callLog?.transcript || "";

  const aiOutput = await runAIWithFailover({
    task: "CALL_TURN",
    payload: {
      customer,
      transcript,
      turn,
    },
  });
  const aiTurn = aiOutput.result;

  await appendTranscript(callLogId, "Agent", aiTurn.reply);

  if (callLogId) {
    await prisma.callLog.update({
      where: { id: callLogId },
      data: {
        aiProviderUsed: aiOutput.provider.name,
      },
    });
  }

  const shouldEnd = aiTurn.shouldEnd || turn >= 3 || !speechResult;

  if (shouldEnd) {
    const closing = `${aiTurn.reply} Thank you for your time. Our loan advisor will contact you shortly.`;
    await finishCall(callLogId, customer.id);
    return twimlResponse(`<Say voice="alice">${xmlEscape(closing)}</Say><Hangup/>`);
  }

  const nextTurn = turn + 1;
  const actionUrl = `${url.origin}/api/calls/webhook?customerId=${customer.id}&callLogId=${callLogId}&turn=${nextTurn}`;

  return twimlResponse(
    `<Gather input="speech" language="en-IN" speechTimeout="auto" action="${xmlEscape(actionUrl)}" method="POST"><Say voice="alice">${xmlEscape(
      aiTurn.reply
    )}</Say></Gather><Say voice="alice">I could not hear your response. Thank you, we will follow up later.</Say><Hangup/>`
  );
}

export async function GET(request) {
  return POST(request);
}