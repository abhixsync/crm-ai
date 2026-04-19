import { GoogleGenerativeAI } from "@google/generative-ai";
import { AI_TASKS, createEngineAdapter, buildCallSummaryPrompt } from "@/lib/ai/engine-contract";
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
  const key = String(apiKey || process.env.GOOGLE_AI_API_KEY || "").trim();
  if (!key) return null;
  return new GoogleGenerativeAI(key);
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

// Fallback heuristic: checks the AI's reply text (not customer input) for end-of-call signals
// when the LLM response doesn't include a structured shouldEnd field.
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

function stripMarkdownCodeFence(text) {
  return text.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
}

function parseJsonSafe(text) {
  try {
    return JSON.parse(text);
  } catch {
    const stripped = stripMarkdownCodeFence(text);
    try {
      return JSON.parse(stripped);
    } catch {
      // Try extracting a JSON object from the text
      const match = stripped.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          return JSON.parse(match[0]);
        } catch {
          return null;
        }
      }
      return null;
    }
  }
}

async function invokeGeminiAI({ task, input, config }) {
  const genAI = getClient(config?.apiKey);
  const modelName = config?.model || "gemini-2.0-flash";

  if (task === AI_TASKS.CALL_SCRIPT) {
    const customer = input.customer;

    if (!genAI) {
      throw new Error("Gemini API key not configured");
    }

    const prompt = buildCallScriptPrompt(customer, input.language, input.humanAdvisorName, input.companyName);

    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(prompt);
      const text = result.response?.text?.() || "";

      return { script: text || fallbackScript(customer) };
    } catch (error) {
      console.error("[gemini-adapter] CALL_SCRIPT error:", error.message);
      throw error;
    }
  }

  if (task === AI_TASKS.CALL_SUMMARY) {
    const transcript = input.transcript || "";

    if (!genAI) {
      throw new Error("Gemini API key not configured");
    }

    const prompt = buildCallSummaryPrompt({
      transcript,
      extractedData: input.extractedData || null,
      customer: input.customer || null,
      stage: input.context?.conversationStage || null,
    });

    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: { responseMimeType: "application/json" },
      });
      const result = await model.generateContent(prompt);
      const text = result.response?.text?.() || "{}";

      const parsed = parseJsonSafe(text);
      if (parsed && parsed.summary) {
        return parsed;
      }

      return {
        summary: text || "Transcript processed.",
        intent: "UNKNOWN",
        nextAction: "Review manually.",
      };
    } catch (error) {
      console.error("[gemini-adapter] CALL_SUMMARY error:", error.message);
      throw error;
    }
  }

  if (task === AI_TASKS.CALL_TURN) {
    const { transcript = "", turn = 0, context = {} } = input;
    const languageSignal = resolveLanguageSignal(input);
    const languageInstruction =
      context.languageInstruction || getLanguageMirroringInstruction(languageSignal);

    console.log("[gemini-adapter] CALL_TURN — languageSignal:", JSON.stringify(languageSignal));
    console.log("[gemini-adapter] CALL_TURN — latestCustomerMessage:", input.latestCustomerMessage);

    if (!genAI) {
      throw new Error("Gemini API key not configured");
    }

    const systemPrompt = await buildUnifiedCallTurnPrompt({
      customer: input.customer,
      languageInstruction,
      turn,
      conversationStage: context.conversationStage,
      tenantId: input.customer?.tenantId,
      extractedData: context.extractedData,
    });

    const userPrompt = `Conversation so far:\n${
      transcript || "(call just started)"
    }\nLatest customer utterance: ${input.latestCustomerMessage || "(not provided)"}
\nRespond naturally to continue the conversation. If customer declines or asks not to call, end the call. Return JSON with keys reply and shouldEnd.`;

    console.log("[gemini-adapter] CALL_TURN — system prompt length:", systemPrompt.length);
    console.log("[gemini-adapter] CALL_TURN — model:", modelName);

    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: {
          responseMimeType: "application/json",
          maxOutputTokens: 250,
          temperature: 0.3,
        },
      });

      const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      });

      const responseText = result.response?.text?.() || "";

      console.log("[gemini-adapter] CALL_TURN — raw LLM response:", responseText);

      const parsed = parseJsonSafe(responseText);
      if (parsed) {
        const reply = parsed.reply || parsed.response || parsed.message || parsed.text;
        const shouldEnd =
          typeof parsed.shouldEnd === "boolean"
            ? parsed.shouldEnd
            : typeof parsed.should_end === "boolean"
              ? parsed.should_end
              : inferShouldEnd(reply || "");

        console.log("[gemini-adapter] CALL_TURN — parsed: reply=%s, shouldEnd=%s", reply, shouldEnd);

        return {
          reply: String(reply || fallbackTurnByLanguage(turn, languageSignal).reply).trim(),
          shouldEnd,
          intent: parsed.intent || null,
          confidence: typeof parsed.confidence === "number" ? parsed.confidence : null,
          extractedData: parsed.extractedData || null,
        };
      }

      // Non-JSON response
      const shouldEnd = inferShouldEnd(responseText);
      console.log("[gemini-adapter] CALL_TURN — non-JSON response, inferred shouldEnd:", shouldEnd);

      return {
        reply: String(responseText || fallbackTurnByLanguage(turn, languageSignal).reply).trim(),
        shouldEnd,
      };
    } catch (error) {
      console.error("[gemini-adapter] CALL_TURN error:", error.message);
      throw error;
    }
  }

  throw new Error(`Unsupported task: ${task}`);
}

export function createGeminiEngine() {
  return createEngineAdapter({
    id: "gemini-engine",
    supportedTasks: new Set([
      AI_TASKS.CALL_SCRIPT,
      AI_TASKS.CALL_SUMMARY,
      AI_TASKS.CALL_TURN,
    ]),
    invoke: invokeGeminiAI,
  });
}
