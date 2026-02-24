import OpenAI from "openai";

const hasOpenAI = Boolean(process.env.OPENAI_API_KEY);
const client = hasOpenAI ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

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

export async function generateCallScript(customer) {
  if (!client) {
    return fallbackScript(customer);
  }

  const prompt = `You are a loan CRM voice assistant. Produce a concise call script (max 120 words) for this customer profile in conversational English. Include qualification questions and next-step ask. Customer: ${JSON.stringify(
    customer
  )}`;

  const completion = await client.responses.create({
    model: "gpt-4.1-mini",
    input: prompt,
  });

  return completion.output_text || fallbackScript(customer);
}

export async function summarizeCallTranscript(transcript) {
  if (!client) {
    return {
      summary: "Call transcript captured. Manual review required.",
      intent: "UNKNOWN",
      nextAction: "Follow up by sales team.",
    };
  }

  const prompt = `Analyze this loan sales call transcript and return JSON with keys summary, intent, nextAction. Transcript: ${transcript}`;

  const completion = await client.responses.create({
    model: "gpt-4.1-mini",
    input: prompt,
  });

  const text = completion.output_text;

  try {
    return JSON.parse(text);
  } catch {
    return {
      summary: text || "Transcript processed.",
      intent: "UNKNOWN",
      nextAction: "Review manually.",
    };
  }
}

export function generateInitialCallPrompt(customer) {
  const amount = customer.loanAmount ? `for around ₹${customer.loanAmount}` : "";
  const loanType = customer.loanType ? `${customer.loanType} loan` : "loan";

  return `Hello ${customer.firstName}, this is from Loan Enterprise CRM. I am calling about your ${loanType} enquiry ${amount}. Are you available for a quick 2 minute verification?`;
}

export async function generateConversationalReply({ customer, transcript, turn }) {
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

  const completion = await client.responses.create({
    model: "gpt-4.1-mini",
    input: prompt,
  });

  const text = completion.output_text;

  try {
    const parsed = JSON.parse(text);
    return {
      reply: parsed.reply || "Thank you. Our advisor will contact you soon.",
      shouldEnd: Boolean(parsed.shouldEnd),
    };
  } catch {
    return {
      reply: text || "Thank you. Our advisor will contact you soon.",
      shouldEnd: turn >= 2,
    };
  }
}