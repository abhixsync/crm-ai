import Groq from "groq-sdk";
import { AI_TASKS, createEngineAdapter, buildCallSummaryPrompt } from "@/lib/ai/engine-contract";
import {
  detectLanguageStyleFromText,
  getLanguageMirroringInstruction,
  LANGUAGE_STYLES,
  normalizeLanguageSignal,
} from "@/lib/ai/language-style";
import { buildUnifiedCallTurnPrompt } from "@/lib/ai/system-prompt";



const DEFAULT_GROQ_MODEL = "llama-3.3-70b-versatile";
const GROQ_MODEL_FALLBACK_ORDER = [
  DEFAULT_GROQ_MODEL,
  "llama-3.1-8b-instant",  // fast fallback if 70b is rate-limited
];

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

function resolveGroqModel(model) {
  const normalized = String(model || "").trim().toLowerCase();
  if (!normalized) {
    return DEFAULT_GROQ_MODEL;
  }

  return normalized;
}

function buildGroqModelCandidates(model) {
  const primary = resolveGroqModel(model);
  return [primary, ...GROQ_MODEL_FALLBACK_ORDER].filter(
    (candidate, index, all) => candidate && all.indexOf(candidate) === index
  );
}

function isGroqModelDecommissionedError(error) {
  const errorCode = String(error?.error?.error?.code || error?.code || "").toLowerCase();
  const errorMessage = String(error?.message || "").toLowerCase();

  return errorCode === "model_decommissioned" ||
    (errorMessage.includes("model") && errorMessage.includes("decommissioned"));
}

async function createGroqCompletionWithFallback({ client, model, maxTokens, messages, taskLabel, temperature, responseFormat }) {
  const candidates = buildGroqModelCandidates(model);
  let lastError = null;

  for (let index = 0; index < candidates.length; index += 1) {
    const candidateModel = candidates[index];
    try {
      if (index > 0) {
        console.warn(`[groq-adapter] ${taskLabel} — retrying with fallback model: ${candidateModel}`);
      }

      const completionParams = {
        model: candidateModel,
        max_tokens: maxTokens,
        temperature: temperature ?? 1.0,
        messages,
      };

      if (responseFormat) {
        completionParams.response_format = responseFormat;
      }

      const response = await client.chat.completions.create(completionParams);

      return {
        response,
        resolvedModel: candidateModel,
      };
    } catch (error) {
      lastError = error;
      if (isGroqModelDecommissionedError(error) && index < candidates.length - 1) {
        console.warn(
          `[groq-adapter] ${taskLabel} — model ${candidateModel} is unavailable/decommissioned, trying next model.`
        );
        continue;
      }

      throw error;
    }
  }

  throw lastError || new Error(`[groq-adapter] ${taskLabel} failed without a detailed error.`);
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

function stripMarkdownCodeFence(value) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }

  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  return text;
}

function extractLikelyJsonObject(value) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }

  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return "";
  }

  return text.slice(firstBrace, lastBrace + 1).trim();
}

function parseJsonLenient(value) {
  const raw = String(value || "").trim();
  const candidates = [
    raw,
    stripMarkdownCodeFence(raw),
    extractLikelyJsonObject(raw),
    extractLikelyJsonObject(stripMarkdownCodeFence(raw)),
  ].filter((candidate, index, all) => candidate && all.indexOf(candidate) === index);

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Try the next candidate format.
    }
  }

  return null;
}

function resolveReplyFromParsedTurn(parsedTurn) {
  const replyCandidates = [
    parsedTurn?.reply,
    parsedTurn?.response,
    parsedTurn?.message,
    parsedTurn?.text,
    parsedTurn?.result?.reply,
  ];

  for (const candidate of replyCandidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return "";
}

function resolveShouldEndFromParsedTurn(parsedTurn, fallbackText = "") {
  const rawShouldEnd =
    parsedTurn?.shouldEnd ??
    parsedTurn?.should_end ??
    parsedTurn?.endCall ??
    parsedTurn?.end_call ??
    parsedTurn?.result?.shouldEnd;

  if (typeof rawShouldEnd === "boolean") {
    return rawShouldEnd;
  }

  if (typeof rawShouldEnd === "string") {
    const normalized = rawShouldEnd.trim().toLowerCase();
    if (normalized === "true" || normalized === "yes" || normalized === "1") {
      return true;
    }
    if (normalized === "false" || normalized === "no" || normalized === "0") {
      return false;
    }
  }

  return inferShouldEnd(fallbackText);
}

async function invokeGroqAI({ task, input, config }) {
  const client = getClient(config?.apiKey);
  const model = config?.model || DEFAULT_GROQ_MODEL;

  if (task === AI_TASKS.CALL_SCRIPT) {
    const customer = input.customer;

    if (!client) {
      throw new Error("Groq API key is missing for CALL_SCRIPT.");
    }

    const prompt = `You are a loan CRM voice assistant. Produce a concise call script (max 120 words) for this customer profile in conversational English. Include qualification questions and next-step ask. Customer: ${JSON.stringify(
      customer
    )}`;

    try {
      const { response, resolvedModel } = await createGroqCompletionWithFallback({
        client,
        model,
        maxTokens: 300,
        temperature: 0.5,
        messages: [{ role: "user", content: prompt }],
        taskLabel: "CALL_SCRIPT",
      });

      if (resolvedModel !== resolveGroqModel(model)) {
        console.warn(`[groq-adapter] CALL_SCRIPT — resolved model changed to ${resolvedModel}`);
      }

      const script =
        response.choices[0]?.message?.content || fallbackScript(customer);

      return { script };
    } catch (error) {
      console.error("Groq CALL_SCRIPT error:", {
        message: error.message,
        status: error.status,
        error: error.error || error,
      });
      throw error;
    }
  }

  if (task === AI_TASKS.CALL_SUMMARY) {
    const transcript = input.transcript || "";

    if (!client) {
      throw new Error("Groq API key is missing for CALL_SUMMARY.");
    }

    const prompt = buildCallSummaryPrompt({
      transcript,
      extractedData: input.extractedData || null,
      customer: input.customer || null,
      stage: input.context?.conversationStage || null,
    });

    try {
      const { response, resolvedModel } = await createGroqCompletionWithFallback({
        client,
        model,
        maxTokens: 400,
        temperature: 0.1,
        messages: [{ role: "user", content: prompt }],
        taskLabel: "CALL_SUMMARY",
      });

      if (resolvedModel !== resolveGroqModel(model)) {
        console.warn(`[groq-adapter] CALL_SUMMARY — resolved model changed to ${resolvedModel}`);
      }

      const text =
        response.choices[0]?.message?.content || "{}";

      const parsedSummary = parseJsonLenient(text);
      if (parsedSummary && typeof parsedSummary === "object") {
        return {
          ...parsedSummary,
          summary: String(
            parsedSummary.summary ||
              parsedSummary.callSummary ||
              parsedSummary.reply ||
              "Transcript processed."
          ).trim(),
          intent: String(parsedSummary.intent || parsedSummary.classification || "UNKNOWN").trim(),
          nextAction: String(parsedSummary.nextAction || parsedSummary.action || "Review manually.").trim(),
        };
      }

      return {
        summary: stripMarkdownCodeFence(text) || "Transcript processed.",
        intent: "UNKNOWN",
        nextAction: "Review manually.",
      };
    } catch (error) {
      console.error("Groq CALL_SUMMARY error:", {
        message: error.message,
        status: error.status,
        error: error.error || error,
      });
      throw error;
    }
  }

  if (task === AI_TASKS.CALL_TURN) {
    const { transcript = "", turn = 0, context = {} } = input;
    const languageSignal = resolveLanguageSignal(input);
    const languageInstruction =
      context.languageInstruction || getLanguageMirroringInstruction(languageSignal);

    console.log('[groq-adapter] CALL_TURN — languageSignal:', JSON.stringify(languageSignal));
    console.log('[groq-adapter] CALL_TURN — latestCustomerMessage:', input.latestCustomerMessage);

    if (!client) {
      throw new Error("Groq API key is missing for CALL_TURN.");
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
\nRespond naturally to continue the conversation. If customer declines or asks not to call, end the call. Return JSON with keys reply (string) and shouldEnd (boolean).`;

    console.log('[groq-adapter] CALL_TURN — system prompt length:', systemPrompt.length);
    console.log('[groq-adapter] CALL_TURN — user prompt:', userPrompt.substring(0, 300));
    console.log('[groq-adapter] CALL_TURN — model:', resolveGroqModel(model));

    try {
      const { response, resolvedModel } = await createGroqCompletionWithFallback({
        client,
        model,
        maxTokens: 350,
        temperature: 0.2,
        responseFormat: { type: "json_object" },
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
        taskLabel: "CALL_TURN",
      });

      if (resolvedModel !== resolveGroqModel(model)) {
        console.warn(`[groq-adapter] CALL_TURN — resolved model changed to ${resolvedModel}`);
      }

      const responseText =
        response.choices[0]?.message?.content || "";

      console.log('[groq-adapter] CALL_TURN — raw LLM response:', responseText);

      // Parse response - look for JSON or extract natural response
      let reply = responseText;
      let shouldEnd = false;
      let intent = null;
      let confidence = null;
      let extractedData = null;
      const parsedTurn = parseJsonLenient(responseText);

      if (parsedTurn && typeof parsedTurn === "object") {
        const parsedReply = resolveReplyFromParsedTurn(parsedTurn);
        reply = parsedReply || fallbackTurnByLanguage(turn, languageSignal).reply;
        shouldEnd = resolveShouldEndFromParsedTurn(parsedTurn, reply);
        intent = parsedTurn.intent || null;
        confidence = typeof parsedTurn.confidence === "number" ? parsedTurn.confidence : null;
        extractedData = parsedTurn.extractedData || null;
        console.log('[groq-adapter] CALL_TURN — parsed JSON: reply=%s, shouldEnd=%s, intent=%s', reply, shouldEnd, intent);
      } else {
        // Response is natural text, not JSON
        // Check for decline patterns
        reply = stripMarkdownCodeFence(responseText) || fallbackTurnByLanguage(turn, languageSignal).reply;
        shouldEnd = inferShouldEnd(reply);
        console.log('[groq-adapter] CALL_TURN — non-JSON response, inferred shouldEnd:', shouldEnd);
      }

      return {
        reply: String(reply || fallbackTurnByLanguage(turn, languageSignal).reply).trim(),
        shouldEnd,
        intent,
        confidence,
        extractedData,
      };
    } catch (error) {
      console.error("Groq CALL_TURN error:", {
        message: error.message,
        status: error.status,
        error: error.error || error,
      });
      throw error;
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
