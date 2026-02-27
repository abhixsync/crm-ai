import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { CallStatus, CustomerStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { runAIWithFailover } from "@/lib/ai/provider-router";
import { initiateTelephonyCallWithFailover } from "@/lib/telephony/provider-router";
import { buildHinglishLoanPrompt } from "@/lib/journey/prompt-builder";
import { applyCustomerTransition } from "@/lib/journey/transition-service";

const CallGraphState = Annotation.Root({
  customer: Annotation(),
  callLogId: Annotation(),
  script: Annotation(),
  callResult: Annotation(),
});

function isPublicHttpsUrl(url) {
  if (!url) return false;

  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();

    if (parsed.protocol !== "https:") return false;
    if (["localhost", "127.0.0.1", "0.0.0.0"].includes(host)) return false;

    return true;
  } catch {
    return false;
  }
}

async function stateToPending(state) {
  await applyCustomerTransition({
    customerId: state.customer.id,
    toStatus: CustomerStatus.CALL_PENDING,
    reason: "Queued for automated AI call",
    source: "AI_AUTOMATION",
    metadata: {
      inActiveCall: false,
      lastContactedAt: new Date(),
    },
    idempotencyScope: { stage: "pending", customerId: state.customer.id },
    tenantId: state.customer.tenantId,
  });
  return state;
}

async function stateToCalling(state) {
  const createdCall = await prisma.callLog.create({
    data: {
      tenantId: state.customer.tenantId,
      customerId: state.customer.id,
      status: CallStatus.INITIATED,
      mode: "AI",
      startedAt: new Date(),
      attemptNumber: state.customer.retryCount + 1,
      summary: "Automated AI call initiated from LangGraph campaign.",
    },
  });

  await applyCustomerTransition({
    customerId: state.customer.id,
    toStatus: CustomerStatus.CALLING,
    reason: "Outbound AI call starting",
    source: "AI_AUTOMATION",
    metadata: {
      inActiveCall: true,
      lastContactedAt: new Date(),
    },
    idempotencyScope: { stage: "calling", customerId: state.customer.id, callLogId: createdCall.id },
    tenantId: state.customer.tenantId,
  });

  return {
    ...state,
    callLogId: createdCall.id,
  };
}

async function runCall(state) {
  const scriptPrompt = buildHinglishLoanPrompt(state.customer);
  const aiScriptOutput = await runAIWithFailover({
    task: "CALL_SCRIPT",
    payload: {
      customer: state.customer,
      customPrompt: scriptPrompt,
    },
  });

  const script =
    aiScriptOutput?.result?.script ||
    "Namaste, kya abhi 2 minute baat karna convenient hai?";

  const baseUrl = process.env.APP_BASE_URL || process.env.NEXTAUTH_URL || "http://localhost:3000";
  const callbackUrl = isPublicHttpsUrl(baseUrl)
    ? `${baseUrl}/api/calls/webhook?customerId=${state.customer.id}&callLogId=${state.callLogId}&turn=0`
    : undefined;
  const statusCallbackUrl = isPublicHttpsUrl(baseUrl) ? `${baseUrl}/api/calls/status` : undefined;

  const telephonyOutput = await initiateTelephonyCallWithFailover({
    to: state.customer.phone,
    script,
    fromNumber: process.env.TWILIO_CALLER_ID || process.env.TWILIO_FROM_NUMBER || undefined,
    preferredProviderType: "TWILIO",
    callbackUrl,
    statusCallbackUrl,
    vonageAnswerUrl: `${baseUrl}/api/vonage/voice/answer?customerId=${state.customer.id}&callLogId=${state.callLogId}`,
    vonageEventUrl: `${baseUrl}/api/vonage/voice/events`,
    vonageFallbackUrl: `${baseUrl}/api/vonage/voice/fallback`,
  });

  await prisma.callLog.updateMany({
    where: { id: state.callLogId, tenantId: state.customer.tenantId },
    data: {
      providerCallId: telephonyOutput.result.providerCallId,
      telephonyProviderUsed: telephonyOutput.provider.name,
      telephonyProviderType: telephonyOutput.provider.type,
      status: CallStatus.INITIATED,
      metadata: {
        script,
        aiProvider: aiScriptOutput.provider.name,
      },
    },
  });

  return {
    ...state,
    script,
    callResult: {
      telephonyOutput,
      aiScriptOutput,
    },
  };
}

function createJourneyGraph() {
  return new StateGraph(CallGraphState)
    .addNode("callPending", stateToPending)
    .addNode("calling", stateToCalling)
    .addNode("runCall", runCall)
    .addEdge(START, "callPending")
    .addEdge("callPending", "calling")
    .addEdge("calling", "runCall")
    .addEdge("runCall", END)
    .compile();
}

const journeyGraph = createJourneyGraph();

export async function runAICampaignForCustomer(customer) {
  return journeyGraph.invoke({ customer });
}
