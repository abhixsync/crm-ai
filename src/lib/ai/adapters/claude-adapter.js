import Anthropic from "@anthropic-ai/sdk";
import { AI_TASKS, createEngineAdapter } from "@/lib/ai/engine-contract";

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

async function invokeClaudeAI({ task, input, config }) {
  const client = getClient(config?.apiKey);
  const model = config?.model || "claude-3-5-sonnet-20241022"; // Latest Claude model (free tier available)

  if (task === AI_TASKS.CALL_SCRIPT) {
    const customer = input.customer;

    if (!client) {
      return { script: fallbackScript(customer) };
    }

    const prompt = `You are a loan CRM voice assistant. Produce a concise call script (max 120 words) for this customer profile in conversational English. Include qualification questions and next-step ask. Customer: ${JSON.stringify(
      customer
    )}`;

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

    const prompt = `Analyze this loan sales call transcript and return JSON with keys summary, intent, nextAction. Keep summary to 50 words max. Transcript: ${transcript}`;

    try {
      const message = await client.messages.create({
        model,
        max_tokens: 300,
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
      return {
        summary: "Transcript processed.",
        intent: "UNKNOWN",
        nextAction: "Review manually.",
      };
    }
  }

  if (task === AI_TASKS.CALL_TURN) {
    const { transcript = "", turn = 0, context = {} } = input;

    if (!client) {
      if (turn >= 2) {
        return {
          reply:
            "Thank you for sharing. Our loan advisor will call you shortly.",
          shouldEnd: true,
        };
      }

      if (turn === 1) {
        return {
          reply:
            "Could you confirm your monthly income and preferred EMI range?",
          shouldEnd: false,
        };
      }

      return {
        reply:
          "Are you planning to apply this week, and what loan amount are you targeting?",
        shouldEnd: false,
      };
    }

    const systemPrompt = `You are an AI loan assistant in a live phone call. 
Keep responses concise (1-2 sentences max).
Customer context: ${JSON.stringify(context)}
Current turn: ${turn}`;

    const userPrompt = `Conversation so far:\n${
      transcript || "(call just started)"
    }\n\nRespond naturally to continue the conversation. If customer declines or asks not to call, end the call. Include shouldEnd: true/false at the end.`;

    try {
      const message = await client.messages.create({
        model,
        max_tokens: 200,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      });

      const responseText =
        message.content[0]?.type === "text" ? message.content[0].text : "";

      // Parse response - look for JSON or extract natural response
      let reply = responseText;
      let shouldEnd = false;

      try {
        const parsed = JSON.parse(responseText);
        reply = parsed.reply || responseText;
        shouldEnd = parsed.shouldEnd || false;
      } catch {
        // Response is natural text, not JSON
        // Check for decline patterns
        shouldEnd =
          responseText.toLowerCase().includes("decline") ||
          responseText.toLowerCase().includes("no thanks") ||
          responseText.toLowerCase().includes("not interested");
      }

      return {
        reply: reply.trim(),
        shouldEnd,
      };
    } catch (error) {
      console.error("Claude API error:", error.message);
      return {
        reply: "Please continue.",
        shouldEnd: false,
      };
    }
  }

  throw new Error(`Unsupported task: ${task}`);
}

export function createClaudeEngine() {
  return createEngineAdapter({
    name: "Claude AI Engine",
    supportedTasks: new Set([
      AI_TASKS.CALL_SCRIPT,
      AI_TASKS.CALL_SUMMARY,
      AI_TASKS.CALL_TURN,
    ]),
    invoke: invokeClaudeAI,
  });
}
