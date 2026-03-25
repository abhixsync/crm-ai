import { requireSession, hasRole, getTenantContext } from "@/lib/server/auth-guard";
import { runAIWithFailover } from "@/lib/ai/provider-router";
import { generateInitialCallPrompt } from "@/lib/ai/openai";
import { isDatabaseUnavailable, databaseUnavailableResponse } from "@/lib/server/database-error";

export async function POST(request) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  if (!hasRole(auth.session, ["ADMIN", "SUPER_ADMIN"])) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { tenantId } = getTenantContext(auth.session, request);

  try {
    const body = await request.json();
    const {
      message,
      sessionState = {},
      customerProfile = {},
    } = body;

    const turn = sessionState.turn || 0;
    const transcript = sessionState.transcript || "";
    const existingExtracted = sessionState.extractedData || {};
    const stage = sessionState.stage || "opening";

    // Build a customer-like object for the AI pipeline
    const customer = {
      id: "simulator",
      firstName: customerProfile.firstName || "Test",
      lastName: customerProfile.lastName || "Customer",
      phone: "0000000000",
      city: customerProfile.city || null,
      monthlyIncome: customerProfile.monthlyIncome || null,
      employmentType: customerProfile.employmentType || null,
      loanType: customerProfile.loanType || null,
      loanAmount: customerProfile.loanAmount || null,
      tenantId: tenantId || null,
    };

    // Turn 0 with no message — return opening greeting
    if (turn === 0 && !message) {
      const opening = generateInitialCallPrompt(customer);
      return Response.json({
        reply: opening,
        sessionState: {
          turn: 1,
          transcript: `Agent: ${opening}`,
          extractedData: {},
          stage: "opening",
        },
        metadata: {
          intent: null,
          confidence: null,
          shouldEnd: false,
          provider: "system",
          model: null,
        },
      });
    }

    // Append customer message to transcript
    const updatedTranscript = message
      ? `${transcript}\nCustomer: ${message}`.trim()
      : transcript;

    // Run through the same AI pipeline as the webhook
    const aiOutput = await runAIWithFailover({
      task: "CALL_TURN",
      payload: {
        customer,
        transcript: updatedTranscript,
        turn,
        latestCustomerMessage: message || "",
        context: {
          conversationStage: stage,
          extractedData: existingExtracted,
          previousCallSummary: sessionState.previousCallSummary || undefined,
        },
      },
    });

    const aiTurn = aiOutput.result;
    const finalTranscript = `${updatedTranscript}\nAgent: ${aiTurn.reply}`.trim();

    // Merge extracted data from LLM response
    const mergedExtracted = { ...existingExtracted };
    if (aiTurn.extractedData && typeof aiTurn.extractedData === "object") {
      for (const [key, value] of Object.entries(aiTurn.extractedData)) {
        if (value != null) mergedExtracted[key] = value;
      }
    }

    // Determine conversation stage based on intent and progress
    let nextStage = stage;
    const intent = aiTurn.intent || "neutral";
    if (intent === "not_interested" || intent === "do_not_call") {
      nextStage = "closing";
    } else if (mergedExtracted.loanType && mergedExtracted.amount && mergedExtracted.timeline) {
      nextStage = "closing";
    } else if (mergedExtracted.loanType || mergedExtracted.amount) {
      nextStage = "qualification";
    } else if (intent === "interested") {
      nextStage = "discovery";
    }

    return Response.json({
      reply: aiTurn.reply,
      sessionState: {
        turn: turn + 1,
        transcript: finalTranscript,
        extractedData: mergedExtracted,
        stage: nextStage,
      },
      metadata: {
        intent: aiTurn.intent || "neutral",
        confidence: aiTurn.confidence || null,
        shouldEnd: aiTurn.shouldEnd || false,
        provider: aiOutput.provider?.name || "unknown",
        model: aiOutput.provider?.model || null,
      },
    });
  } catch (error) {
    if (isDatabaseUnavailable(error)) return databaseUnavailableResponse();
    console.error("[ai-simulator] Error:", error);
    return Response.json({ error: "AI processing failed", details: error.message }, { status: 500 });
  }
}
