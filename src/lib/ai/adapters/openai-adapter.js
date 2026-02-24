import OpenAI from "openai";
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
  const key = String(apiKey || process.env.OPENAI_API_KEY || "").trim();
  if (!key) return null;
  return new OpenAI({ apiKey: key });
}

async function invokeOpenAI({ task, input, config }) {
  const client = getClient(config?.apiKey);
  const model = config?.model || "gpt-4.1-mini";

  if (task === AI_TASKS.CALL_SCRIPT) {
    const customer = input.customer;

    if (!client) {
      return { script: fallbackScript(customer) };
    }

    const prompt = `You are a loan CRM voice assistant. Produce a concise call script (max 120 words) for this customer profile in conversational English. Include qualification questions and next-step ask. Customer: ${JSON.stringify(
      customer
    )}`;

    const completion = await client.responses.create({ model, input: prompt });
    return { script: completion.output_text || fallbackScript(customer) };
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

    if (!client) {
      if (turn >= 2) {
        return {
          reply:
            "Thank you for sharing. Our loan advisor will call you shortly with the best offer and next steps.",
          shouldEnd: true,
        };
      }

      if (turn === 1) {
        return {
          reply:
            "Thank you. Could you confirm your monthly income and preferred EMI range so we can check eligibility?",
          shouldEnd: false,
        };
      }

      return {
        reply: "Are you planning to apply this week, and what loan amount are you targeting?",
        shouldEnd: false,
      };
    }

    const prompt = `You are an AI loan calling assistant in a live phone call.
Customer profile: ${JSON.stringify(customer)}
Conversation transcript so far:\n${transcript || "(no transcript)"}
Current turn index: ${turn}

Return ONLY valid JSON:
{"reply":"<short natural spoken response under 35 words>","shouldEnd":<true|false>}

Rules:
- Sound polite, concise, and sales-oriented.
- Ask one focused qualification question at a time.
- If enough qualification is captured or customer is busy/not interested, set shouldEnd=true.
- Never include markdown or extra text.`;

    const completion = await client.responses.create({ model, input: prompt });

    try {
      const parsed = JSON.parse(completion.output_text);
      return {
        reply: parsed.reply || "Thank you. Our advisor will contact you soon.",
        shouldEnd: Boolean(parsed.shouldEnd),
      };
    } catch {
      return {
        reply: completion.output_text || "Thank you. Our advisor will contact you soon.",
        shouldEnd: turn >= 2,
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
