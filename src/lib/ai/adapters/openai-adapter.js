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
  if (turn >= 2) {
    if (languageSignal.style === LANGUAGE_STYLES.HINDI) {
      return {
        reply: "Dhanyavaad ji. Hamara loan advisor jaldi aapse sampark karega.",
        shouldEnd: true,
      };
    }

    if (languageSignal.style === LANGUAGE_STYLES.HINGLISH) {
      return {
        reply: "Thank you ji, details share karne ke liye. Hamara loan advisor jaldi call karega.",
        shouldEnd: true,
      };
    }

    return {
      reply: "Thank you for sharing. Our loan advisor will call you shortly with the next steps.",
      shouldEnd: true,
    };
  }

  if (turn === 1) {
    if (languageSignal.style === LANGUAGE_STYLES.HINDI) {
      return {
        reply: "Kripya aap monthly income aur preferred EMI range batayenge?",
        shouldEnd: false,
      };
    }

    if (languageSignal.style === LANGUAGE_STYLES.HINGLISH) {
      return {
        reply: "Please aap monthly income aur preferred EMI range confirm kar denge?",
        shouldEnd: false,
      };
    }

    return {
      reply: "Could you confirm your monthly income and preferred EMI range so we can check eligibility?",
      shouldEnd: false,
    };
  }

  if (languageSignal.style === LANGUAGE_STYLES.HINDI) {
    return {
      reply: "Kya aap is hafte loan apply karne ka plan kar rahe hain, aur kitni amount chahiye?",
      shouldEnd: false,
    };
  }

  if (languageSignal.style === LANGUAGE_STYLES.HINGLISH) {
    return {
      reply: "Kya aap is week loan apply karne ka plan kar rahe hain, aur target amount kitni hai?",
      shouldEnd: false,
    };
  }

  return {
    reply: "Are you planning to apply this week, and what loan amount are you targeting?",
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

    const prompt = buildCallScriptPrompt(customer, input.language, input.humanAdvisorName);

    const completion = await client.responses.create({ model, input: prompt });
    return { script: completion.output_text || fallbackScript(customer) };
  }

  if (task === AI_TASKS.CALL_SUMMARY) {
    const transcript = input.transcript || "";

    if (!client) {
      throw new Error("OpenAI API key not configured");
    }

    const prompt = `Analyze this loan sales call transcript and return JSON with keys summary, intent, nextAction. Transcript: ${transcript}`;
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
