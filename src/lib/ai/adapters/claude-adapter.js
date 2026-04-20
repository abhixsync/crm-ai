import Anthropic from "@anthropic-ai/sdk";
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
  const key = String(apiKey || process.env.ANTHROPIC_API_KEY || "").trim();
  if (!key) return null;
  return new Anthropic({ apiKey: key });
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

async function invokeClaudeAI({ task, input, config }) {
  const client = getClient(config?.apiKey);
  const model = config?.model || "claude-3-5-sonnet-20241022"; // Latest Claude model (free tier available)

  if (task === AI_TASKS.CALL_SCRIPT) {
    const customer = input.customer;

    if (!client) {
      throw new Error("Claude API key not configured");
    }

    const prompt = buildCallScriptPrompt(customer, input.language, input.humanAdvisorName, input.companyName, input.agentName);

    try {
      const message = await client.messages.create({
        model,
        max_tokens: 300,
        messages: [{ role: "user", content: prompt }],
      });

      const script =
        message.content[0]?.type === "text"
          ? message.content[0].text
          : fallbackScript(customer);

      return { script };
    } catch (error) {
      console.error("Claude API error:", error.message);
      throw error;
    }
  }

  if (task === AI_TASKS.CALL_SUMMARY) {
    const transcript = input.transcript || "";

    if (!client) {
      throw new Error("Claude API key not configured");
    }

    const prompt = buildCallSummaryPrompt({
      transcript,
      extractedData: input.extractedData || null,
      customer: input.customer || null,
      stage: input.context?.conversationStage || null,
    });

    try {
      const message = await client.messages.create({
        model,
        max_tokens: 400,
        messages: [{ role: "user", content: prompt }],
      });

      const text =
        message.content[0]?.type === "text" ? message.content[0].text : "{}";

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
      console.error("Claude API error:", error.message);
      throw error;
    }
  }

  if (task === AI_TASKS.CALL_TURN) {
    const { transcript = "", turn = 0, context = {} } = input;
    const languageSignal = resolveLanguageSignal(input);
    const languageInstruction =
      context.languageInstruction || getLanguageMirroringInstruction(languageSignal);

    console.log('[claude-adapter] CALL_TURN — languageSignal:', JSON.stringify(languageSignal));
    console.log('[claude-adapter] CALL_TURN — latestCustomerMessage:', input.latestCustomerMessage);

    if (!client) {
      throw new Error("Claude API key not configured");
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

    console.log('[claude-adapter] CALL_TURN — system prompt length:', systemPrompt.length);
    console.log('[claude-adapter] CALL_TURN — user prompt:', userPrompt.substring(0, 300));
    console.log('[claude-adapter] CALL_TURN — model:', model);

    try {
      const message = await client.messages.create({
        model,
        max_tokens: 200,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      });

      const responseText =
        message.content[0]?.type === "text" ? message.content[0].text : "";

      console.log('[claude-adapter] CALL_TURN — raw LLM response:', responseText);

      // Parse response - look for JSON or extract natural response
      let reply = responseText;
      let shouldEnd = false;

      let intent = null;
      let confidence = null;
      let extractedData = null;

      try {
        const parsed = JSON.parse(responseText);
        reply = parsed.reply || fallbackTurnByLanguage(turn, languageSignal).reply;
        shouldEnd = typeof parsed.shouldEnd === "boolean" ? parsed.shouldEnd : inferShouldEnd(parsed.reply);
        intent = parsed.intent || null;
        confidence = typeof parsed.confidence === "number" ? parsed.confidence : null;
        extractedData = parsed.extractedData || null;
        console.log('[claude-adapter] CALL_TURN — parsed JSON: reply=%s, shouldEnd=%s, intent=%s', reply, shouldEnd, intent);
      } catch {
        // Response is natural text, not JSON
        // Check for decline patterns
        shouldEnd = inferShouldEnd(responseText);
        console.log('[claude-adapter] CALL_TURN — non-JSON response, inferred shouldEnd:', shouldEnd);
      }

      return {
        reply: String(reply || fallbackTurnByLanguage(turn, languageSignal).reply).trim(),
        shouldEnd,
        intent,
        confidence,
        extractedData,
      };
    } catch (error) {
      console.error("Claude API error:", error.message);
      throw error;
    }
  }

  throw new Error(`Unsupported task: ${task}`);
}

export function createClaudeEngine() {
  return createEngineAdapter({
    id: "claude-engine",
    supportedTasks: new Set([
      AI_TASKS.CALL_SCRIPT,
      AI_TASKS.CALL_SUMMARY,
      AI_TASKS.CALL_TURN,
    ]),
    invoke: invokeClaudeAI,
  });
}
