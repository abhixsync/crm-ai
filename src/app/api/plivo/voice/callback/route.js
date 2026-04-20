import { prisma } from "@/lib/prisma";
import { runAIWithFailover } from "@/lib/ai/provider-router";
import { updateSessionAfterCall, getSessionContext } from "@/lib/conversation/session-manager";
import { after } from "next/server";
import { finalizeCall } from "@/lib/calls/call-finalizer";

function xmlEscape(value) {
  return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function plivoResponse(xmlBody) {
  const xml = `<?xml version="1.0" encoding="UTF-8"?><Response>${xmlBody}</Response>`;
  return new Response(xml, { status: 200, headers: { "Content-Type": "application/xml" } });
}


function shouldEndCall(aiTurn, turn, extractedData) {
  // AI explicitly says end — always respect (LLM only sets this on explicit goodbye/DNC)
  if (aiTurn.shouldEnd) return true;
  // Absolute ceiling — prevent runaway conversations
  if (turn >= 12) return true;
  // All mandatory slots filled — close only after a minimum of 5 turns
  const allSlots = extractedData?.loanType && extractedData?.amount && extractedData?.timeline;
  if (allSlots && turn >= 5) return true;
  // Balance transfer only requires loanType — same minimum of 5 turns
  if (extractedData?.loanType === "balance_transfer" && turn >= 5) return true;
  // No progress after several turns — end gracefully
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
        after(() => finalizeCall(callLogId, customer.id, tenantId, null, {}, turn));
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
      after(() => finalizeCall(callLogId, customer.id, tenantId, sessionCtx, mergedExtracted, turn));
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
