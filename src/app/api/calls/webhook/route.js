import { CallStatus, CustomerStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { generateInitialCallPrompt } from "@/lib/ai/openai";
import { runAIWithFailover } from "@/lib/ai/provider-router";
import { applyCustomerTransition } from "@/lib/journey/transition-service";
import { scheduleRetryForFailure } from "@/lib/journey/retry-policy";
import { toIntentLabel } from "@/lib/journey/constants";
import { isDatabaseUnavailable } from "@/lib/server/database-error";

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

  if (callLog.status === CallStatus.COMPLETED && callLog.endedAt) {
    return;
  }

  const transcript = callLog?.transcript || "";
  const aiOutput = await runAIWithFailover({
    task: "CALL_SUMMARY",
    payload: { transcript },
  });
  const analysis = aiOutput.result;
  const normalizedIntent = String(analysis.intent || "failed").trim().toLowerCase();
  const mappedStatus = mapIntentToCustomerStatus(normalizedIntent);

  await prisma.callLog.updateMany({
    where: { id: callLogId, tenantId: callLog.tenantId },
    data: {
      summary: analysis.summary,
      intent: toIntentLabel(normalizedIntent),
      intentClassification: normalizedIntent,
      nextAction: analysis.nextAction,
      aiProviderUsed: aiOutput.provider.name,
      status: "COMPLETED",
      endedAt: new Date(),
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
}

export async function POST(request) {
  try {
    const url = new URL(request.url);
    const customerId = url.searchParams.get("customerId");
    const callLogId = url.searchParams.get("callLogId");
    const turn = Number(url.searchParams.get("turn") || "0");

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
      return twimlResponse("<Say>Customer record not found. Please call again later.</Say><Hangup/>");
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

    const shouldEnd = aiTurn.shouldEnd || turn >= 3 || !speechResult;

    if (shouldEnd) {
      const closing = `${aiTurn.reply} Thank you for your time. Our loan advisor will contact you shortly.`;
      await finishCall(callLogId, customer.id, tenantId);
      return twimlResponse(`<Say voice="alice">${xmlEscape(closing)}</Say><Hangup/>`);
    }

    const nextTurn = turn + 1;
    const actionUrl = `${url.origin}/api/calls/webhook?customerId=${customer.id}&callLogId=${callLogId}&turn=${nextTurn}`;

    return twimlResponse(
      `<Gather input="speech" language="en-IN" speechTimeout="auto" action="${xmlEscape(actionUrl)}" method="POST"><Say voice="alice">${xmlEscape(
        aiTurn.reply
      )}</Say></Gather><Say voice="alice">I could not hear your response. Thank you, we will follow up later.</Say><Hangup/>`
    );
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      console.warn("[api/calls/webhook] Database unavailable; returning fallback TwiML.");
      return twimlResponse("<Say>System is temporarily unavailable. Please try again later.</Say><Hangup/>");
    }

    throw error;
  }
}

export async function GET(request) {
  return POST(request);
}