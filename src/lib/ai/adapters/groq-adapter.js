import Groq from "groq-sdk";
import { AI_TASKS, createEngineAdapter, buildCallSummaryPrompt } from "@/lib/ai/engine-contract";
import {
  detectLanguageStyleFromText,
  getLanguageMirroringInstruction,
  LANGUAGE_STYLES,
  normalizeLanguageSignal,
} from "@/lib/ai/language-style";

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
  const key = String(apiKey || process.env.GROQ_API_KEY || "").trim();
  if (!key) return null;
  return new Groq({ apiKey: key });
}

function resolveLanguageSignal(input) {
  const contextSignal = normalizeLanguageSignal(input?.context?.languageSignal);
  if (contextSignal.style !== LANGUAGE_STYLES.UNKNOWN) {
    return contextSignal;
  }

  return detectLanguageStyleFromText(input?.latestCustomerMessage || input?.transcript || "");
}

function fallbackTurnByLanguage(turn, languageSignal) {
  if (turn >= 2) {
    if (languageSignal.style === LANGUAGE_STYLES.HINDI) {
      return {
        reply: "Dhanyavaad ji. Hamara advisor jaldi aapse sampark karega.",
        shouldEnd: true,
      };
    }

    if (languageSignal.style === LANGUAGE_STYLES.HINGLISH) {
      return {
        reply: "Thank you ji, details share karne ke liye. Hamara advisor jaldi call karega.",
        shouldEnd: true,
      };
    }

    return {
      reply: "Thank you for sharing. Our loan advisor will call you shortly.",
      shouldEnd: true,
    };
  }

  if (turn === 1) {
    if (languageSignal.style === LANGUAGE_STYLES.HINDI) {
      return {
        reply: "Kripya monthly income aur preferred EMI range confirm kar dijiye.",
        shouldEnd: false,
      };
    }

    if (languageSignal.style === LANGUAGE_STYLES.HINGLISH) {
      return {
        reply: "Please monthly income aur preferred EMI range confirm kar dijiye.",
        shouldEnd: false,
      };
    }

    return {
      reply: "Could you confirm your monthly income and preferred EMI range?",
      shouldEnd: false,
    };
  }

  if (languageSignal.style === LANGUAGE_STYLES.HINDI) {
    return {
      reply: "Kya aap is hafte apply karna chahte hain, aur kitni amount chahiye?",
      shouldEnd: false,
    };
  }

  if (languageSignal.style === LANGUAGE_STYLES.HINGLISH) {
    return {
      reply: "Kya aap is week apply karna chahte hain, aur target amount kitni hai?",
      shouldEnd: false,
    };
  }

  return {
    reply: "Are you planning to apply this week, and what loan amount are you targeting?",
    shouldEnd: false,
  };
}

function inferShouldEnd(replyText) {
  const lower = String(replyText || "").toLowerCase();
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

async function invokeGroqAI({ task, input, config }) {
  const client = getClient(config?.apiKey);
  const model = config?.model || "llama-3.1-8b-instant"; // Fast and efficient Groq model

  if (task === AI_TASKS.CALL_SCRIPT) {
    const customer = input.customer;

    if (!client) {
      return { script: fallbackScript(customer) };
    }

    const prompt = `You are a loan CRM voice assistant. Produce a concise call script (max 120 words) for this customer profile in conversational English. Include qualification questions and next-step ask. Customer: ${JSON.stringify(
      customer
    )}`;

    try {
      const message = await client.chat.completions.create({
        model,
        max_tokens: 300,
        messages: [{ role: "user", content: prompt }],
      });

      const script =
        message.choices[0]?.message?.content || fallbackScript(customer);

      return { script };
    } catch (error) {
      console.error("Groq CALL_SCRIPT error:", {
        message: error.message,
        status: error.status,
        error: error.error || error,
      });
      return { script: fallbackScript(customer) };
    }
  }

  if (task === AI_TASKS.CALL_SUMMARY) {
    const transcript = input.transcript || "";

    if (!client) {
      return {
        summary: "Call transcript captured. Manual review required.",
        intent: "UNKNOWN",
        nextAction: "Follow up by sales team.",
      };
    }

    const prompt = buildCallSummaryPrompt({
      transcript,
      extractedData: input.extractedData || null,
      customer: input.customer || null,
      stage: input.context?.conversationStage || null,
    });

    try {
      const message = await client.chat.completions.create({
        model,
        max_tokens: 400,
        messages: [{ role: "user", content: prompt }],
      });

      const text =
        message.choices[0]?.message?.content || "{}";

      try {
        return JSON.parse(text);
      } catch {
        return {
          summary: text || "Transcript processed.",
          intent: "UNKNOWN",
          nextAction: "Review manually.",
        };
      }
    } catch (error) {
      console.error("Groq CALL_SUMMARY error:", {
        message: error.message,
        status: error.status,
        error: error.error || error,
      });
      return {
        summary: "Transcript processed.",
        intent: "UNKNOWN",
        nextAction: "Review manually.",
      };
    }
  }

  if (task === AI_TASKS.CALL_TURN) {
    const { transcript = "", turn = 0, context = {} } = input;
    const languageSignal = resolveLanguageSignal(input);
    const languageInstruction =
      context.languageInstruction || getLanguageMirroringInstruction(languageSignal);

    if (!client) {
      return fallbackTurnByLanguage(turn, languageSignal);
    }

    const systemPrompt = `You are an AI loan assistant in a live phone call. 
Keep responses concise (1-2 sentences max).
Customer context: ${JSON.stringify(context)}
Current turn: ${turn}

CRITICAL LANGUAGE RULE (must follow strictly):
${languageInstruction}
You MUST respond in the same language the customer is using. If the customer speaks Hindi or Hinglish, you MUST reply in Hindi/Hinglish — never switch to English on your own. Only switch language if the customer explicitly switches.`;

    const userPrompt = `Conversation so far:\n${
      transcript || "(call just started)"
    }\nLatest customer utterance: ${input.latestCustomerMessage || "(not provided)"}
\nRespond naturally to continue the conversation. If customer declines or asks not to call, end the call. Return JSON with keys reply (string) and shouldEnd (boolean).`;

    try {
      const message = await client.chat.completions.create({
        model,
        max_tokens: 200,
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content: userPrompt,
          },
        ],
      });

      const responseText =
        message.choices[0]?.message?.content || "";

      // Parse response - look for JSON or extract natural response
      let reply = responseText;
      let shouldEnd = false;

      try {
        const parsed = JSON.parse(responseText);
        reply = parsed.reply || fallbackTurnByLanguage(turn, languageSignal).reply;
        shouldEnd = typeof parsed.shouldEnd === "boolean" ? parsed.shouldEnd : inferShouldEnd(parsed.reply);
      } catch {
        // Response is natural text, not JSON
        // Check for decline patterns
        shouldEnd = inferShouldEnd(responseText);
      }

      return {
        reply: String(reply || fallbackTurnByLanguage(turn, languageSignal).reply).trim(),
        shouldEnd,
      };
    } catch (error) {
      console.error("Groq CALL_TURN error:", {
        message: error.message,
        status: error.status,
        error: error.error || error,
      });
      return {
        ...fallbackTurnByLanguage(turn, languageSignal),
      };
    }
  }

  throw new Error(`Unsupported task: ${task}`);
}

export function createGroqEngine() {
  return createEngineAdapter({
    name: "Groq AI Engine",
    supportedTasks: new Set([
      AI_TASKS.CALL_SCRIPT,
      AI_TASKS.CALL_SUMMARY,
      AI_TASKS.CALL_TURN,
    ]),
    invoke: invokeGroqAI,
  });
}
