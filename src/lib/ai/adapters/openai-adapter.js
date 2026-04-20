import OpenAI from "openai";
import { AI_TASKS, createEngineAdapter } from "@/lib/ai/engine-contract";
import {
  detectLanguageStyleFromText,
  getLanguageMirroringInstruction,
  LANGUAGE_STYLES,
  normalizeLanguageSignal,
} from "@/lib/ai/language-style";
import { buildUnifiedCallTurnPrompt, buildCallScriptPrompt } from "@/lib/ai/system-prompt";

function fallbackScript(customer) {
  const amount = customer.loanAmount ? `for around ₹${customer.loanAmount}` : "";
  const loanType = customer.loanType ? `${customer.loanType} loan` : "loan";

  return [
    `Hello ${customer.firstName}, this is the loan assistance desk.`,
    `We are reaching out regarding your interest in a ${loanType} ${amount}.`,
    "Are you currently looking to apply this week?",
    "Could you confirm your monthly income range and preferred EMI?",
    "Would you like a call from our loan officer today?",
  ].join(" ");
}

function getClient(apiKey) {
  const key = String(apiKey || process.env.OPENAI_API_KEY || "").trim();
  if (!key) return null;
  return new OpenAI({ apiKey: key });
}

function resolveLanguageSignal(input) {
  const contextSignal = normalizeLanguageSignal(input?.context?.languageSignal);
  if (contextSignal.style !== LANGUAGE_STYLES.UNKNOWN) {
    return contextSignal;
  }

  return detectLanguageStyleFromText(input?.latestCustomerMessage || input?.transcript || "");
}

function getFallbackTurnResponse(turn, languageSignal) {
  // Fallback responses keep the conversation going — never end prematurely.
  // shouldEnd=true is only set by the LLM when the customer explicitly ends.

  if (turn >= 4) {
    if (languageSignal.style === LANGUAGE_STYLES.HINDI) {
      return {
        reply: "Ek minute ji, aapki details hamare advisor ko bheji ja rahi hain. Kya aap subah ya shaam call prefer karenge?",
        shouldEnd: false,
      };
    }
    if (languageSignal.style === LANGUAGE_STYLES.HINGLISH) {
      return {
        reply: "Haan ji, almost done. Bas yeh batayein — subah call theek rahega ya shaam ko?",
        shouldEnd: false,
      };
    }
    return {
      reply: "Almost there — would a morning or evening callback from our advisor work better for you?",
      shouldEnd: false,
    };
  }

  if (turn >= 2) {
    if (languageSignal.style === LANGUAGE_STYLES.HINDI) {
      return {
        reply: "Acha ji, aur roughly kitni loan amount ki zaroorat hai aapko?",
        shouldEnd: false,
      };
    }
    if (languageSignal.style === LANGUAGE_STYLES.HINGLISH) {
      return {
        reply: "Accha ji, aur roughly kitni amount chahiye — ballpark bhi chalega?",
        shouldEnd: false,
      };
    }
    return {
      reply: "Got it — and roughly what loan amount are you looking for?",
      shouldEnd: false,
    };
  }

  if (turn === 1) {
    if (languageSignal.style === LANGUAGE_STYLES.HINDI) {
      return {
        reply: "Acha, toh kis type ka loan chahiye aapko — personal, home, ya business?",
        shouldEnd: false,
      };
    }
    if (languageSignal.style === LANGUAGE_STYLES.HINGLISH) {
      return {
        reply: "Haan ji, toh kis type ka loan dekhna hai — personal, home, ya business loan?",
        shouldEnd: false,
      };
    }
    return {
      reply: "Sure — what type of loan are you looking for? Personal, home, or business?",
      shouldEnd: false,
    };
  }

  // turn === 0 (opening)
  if (languageSignal.style === LANGUAGE_STYLES.HINDI) {
    return {
      reply: "Namaste ji, main loan ke baare mein baat karna chahta tha. Kya abhi thoda time hai?",
      shouldEnd: false,
    };
  }
  if (languageSignal.style === LANGUAGE_STYLES.HINGLISH) {
    return {
      reply: "Hello ji, loan ke regarding call kar raha tha. Kya abhi 2 minute ho sakte hain?",
      shouldEnd: false,
    };
  }
  return {
    reply: "Hi, calling regarding a loan inquiry. Do you have 2 minutes to talk?",
    shouldEnd: false,
  };
}

// Fallback heuristic: checks the AI's reply text (not customer input) for end-of-call signals
// when the LLM response doesn't include a structured shouldEnd field.
function inferShouldEndFromReply(reply) {
  const lower = String(reply || "").toLowerCase();
  return (
    lower.includes("not interested") ||
    lower.includes("no thanks") ||
    lower.includes("don't call") ||
    lower.includes("dont call") ||
    lower.includes("nahi chahiye") ||
    lower.includes("nhi chahiye") ||
    lower.includes("nhi lena") ||
    lower.includes("abhi busy") ||
    lower.includes("call you back")
  );
}

async function invokeOpenAI({ task, input, config }) {
  const client = getClient(config?.apiKey);
  const model = config?.model || "gpt-4.1-mini";

  if (task === AI_TASKS.CALL_SCRIPT) {
    const customer = input.customer;

    if (!client) {
      throw new Error("OpenAI API key not configured");
    }

    const prompt = buildCallScriptPrompt(customer, input.language, input.humanAdvisorName, input.companyName, input.agentName);

    const completion = await client.responses.create({ model, input: prompt });
    return { script: completion.output_text || fallbackScript(customer) };
  }

  if (task === AI_TASKS.CALL_SUMMARY) {
    const transcript = input.transcript || "";

    if (!client) {
      throw new Error("OpenAI API key not configured");
    }

    const prompt = `You are analyzing a loan sales call transcript. Return a JSON object with exactly these keys:
- "summary": 1-2 sentence summary of what happened
- "intent": one of: "interested", "follow_up", "not_interested", "do_not_call", "converted", "failed"
- "nextAction": what the sales team should do next

Intent definitions (be precise):
- "interested": customer actively expressed interest, asked about loan details, mentioned a specific loan amount or requirement, OR asked about the process/documents/EMI — even if they didn't commit
- "follow_up": customer said they want to be called back at a specific later time (busy now, call tomorrow, etc.)
- "not_interested": customer explicitly said they don't need a loan or are not interested
- "do_not_call": customer said don't call again or to remove them
- "converted": customer agreed to proceed, fill application, or submit documents
- "failed": call ended with no meaningful conversation (no speech, technical failure, or completely unclear)

Return ONLY valid JSON, no markdown. Transcript:
${transcript}`;
    const completion = await client.responses.create({ model, input: prompt });

    try {
      return JSON.parse(completion.output_text);
    } catch {
      return {
        summary: completion.output_text || "Transcript processed.",
        intent: "UNKNOWN",
        nextAction: "Review manually.",
      };
    }
  }

  if (task === AI_TASKS.CALL_TURN) {
    const customer = input.customer;
    const transcript = input.transcript;
    const turn = input.turn;
    const context = input.context || {};
    const languageSignal = resolveLanguageSignal(input);
    const languageInstruction =
      context.languageInstruction || getLanguageMirroringInstruction(languageSignal);

    if (!client) {
      throw new Error("OpenAI API key not configured");
    }

    const unifiedSystemPrompt = await buildUnifiedCallTurnPrompt({
      customer,
      languageInstruction,
      turn,
      conversationStage: context.conversationStage,
      tenantId: customer?.tenantId,
      extractedData: context.extractedData,
    });

    const prompt = `${unifiedSystemPrompt}

Conversation transcript so far:
${transcript || "(no transcript)"}
Latest customer utterance: ${input.latestCustomerMessage || "(not provided)"}`;  

    const completion = await client.responses.create({ model, input: prompt });

    try {
      const parsed = JSON.parse(completion.output_text);
      return {
        reply: parsed.reply || getFallbackTurnResponse(turn, languageSignal).reply,
        shouldEnd: typeof parsed.shouldEnd === "boolean" ? parsed.shouldEnd : inferShouldEndFromReply(parsed.reply),
        intent: parsed.intent || null,
        confidence: typeof parsed.confidence === "number" ? parsed.confidence : null,
        extractedData: parsed.extractedData || null,
      };
    } catch {
      return {
        reply: completion.output_text || getFallbackTurnResponse(turn, languageSignal).reply,
        shouldEnd: inferShouldEndFromReply(completion.output_text) || turn >= 2,
      };
    }
  }

  throw new Error(`OpenAI provider does not support task: ${task}`);
}

export function createOpenAIEngine() {
  return createEngineAdapter({
    id: "openai-engine",
    supportedTasks: [AI_TASKS.CALL_SCRIPT, AI_TASKS.CALL_SUMMARY, AI_TASKS.CALL_TURN],
    invoke: invokeOpenAI,
  });
}
