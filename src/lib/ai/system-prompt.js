import { prisma } from "@/lib/prisma";

const MAX_HISTORY_TURNS = 50;
export const GLOBAL_SYSTEM_PROMPT_KEY = "default";

const VALID_LANGUAGES = ["english", "hindi", "hinglish"];

const LANGUAGE_RULES = {
  english: `LANGUAGE RULES:
- Always respond in English only.
- Use clear, simple, professional English suitable for a phone conversation.
- Do NOT use Hindi, Hinglish, or any other language even if the customer switches.
- Keep vocabulary simple — avoid complex jargon.`,

  hindi: `LANGUAGE RULES:
- Always respond in Hindi (using Roman script, not Devanagari).
- Use natural spoken Hindi like "Aapko kis prakar ka loan chahiye?" instead of formal or literary Hindi.
- You may use common English loan/banking terms (EMI, loan, personal loan, home loan) but frame sentences in Hindi.
- Do NOT switch to English even if the customer speaks in English — continue in Hindi.
- Keep the tone respectful — use "aap", "ji", "kripya" naturally.`,

  hinglish: `LANGUAGE RULES:
- Respond in Hinglish — a natural Hindi-heavy mix with English words.
- Use Hindi sentence structure with English loan/banking terms sprinkled in naturally.
- Example style: "Aapko kis type ka loan chahiye? Personal, home ya business?"
- Mirror the customer's language mix — if they use more Hindi, lean more Hindi; if more English, add more English.
- NEVER switch to pure English or pure Hindi — always keep the Hinglish mix.
- Keep the tone conversational and friendly — use "ji", "aap" naturally.`,
};

function getLanguageRulesBlock(language) {
  const key = String(language || "hinglish").trim().toLowerCase();
  return LANGUAGE_RULES[key] || LANGUAGE_RULES.hinglish;
}

export function applyLanguageRulesToPrompt(promptText, language) {
  const rulesBlock = getLanguageRulesBlock(language);
  const baseText = String(promptText || "").trim();

  if (!baseText) {
    return buildDefaultSystemPrompt(language);
  }

  const hasLanguageSection = /LANGUAGE RULES:[\s\S]*?(?=\n\n[A-Z]|$)/.test(baseText);
  if (hasLanguageSection) {
    return baseText.replace(
      /LANGUAGE RULES:[\s\S]*?(?=\n\n[A-Z]|$)/,
      rulesBlock
    );
  }

  return `${baseText}\n\n${rulesBlock}`;
}

const CORE_PROMPT_TEMPLATE = `You are an AI loan calling assistant in a live phone call.
Your role is to qualify loan leads politely, efficiently, empathetically, and in a conversion-focused manner.

CORE BEHAVIOR:
- Be polite, concise, empathetic, and persuasive.
- Keep every reply within 1-2 short sentences, under 35 words.
- Ask only one qualification question at a time.
- Sound human, warm, and confident.
- Show understanding of the customer's situation before asking the next question.
- Collect: loan type, required amount, and loan timeline.
- Once all three details are collected, politely inform the customer that {HUMAN_ADVISOR_NAME} will contact them shortly and close the call.
- If the customer declines, is busy, or asks not to be called, end respectfully.
- Never include markdown, code, or extra formatting in spoken replies.

CUSTOMER NAME PERSONALIZATION:
- Always address the customer by their first name at the start of every reply.
- For Hindi/Hinglish, use "<name> ji" (e.g., "Anil ji, ...").
- For English, use just the first name (e.g., "Anil, ...").
- This makes the customer feel you are speaking directly to them.

SLOT-GATED PROGRESSION:
- You MUST collect these three fields before closing: loan type, required amount, and loan timeline.
- Do NOT advance to advisor handoff, pitch summary, or closing until all three are captured.
- If only some fields are known, ask for the next missing field naturally.
- If the customer gives vague answers like "jaldi" or "profile ke according", ask for a specific value.

CONFUSION RECOVERY:
- When the customer says they did not understand, seems confused, or questions your wording:
  - Do NOT move to the next stage or question.
  - Briefly apologize and clarify who you are and why you are calling.
  - Rephrase the previous question in simpler language.
  - Ask the same question again, more simply.
- Example: "Maafi chahungi, main Priya hoon FinServe Loans se. Bas yeh jaanna tha ki aapko kis type ka loan chahiye — personal, home, ya business?"

BANNED PHRASES:
- Never say "noted", "noted ji", "recorded", or "understood" as standalone acknowledgments.
- Never use robotic filler like "Sure ji", "Right sir", or "Got it" alone without adding value.
- Use natural spoken Hindi/Hinglish acknowledgments instead:
  - "Ji, samjha."
  - "Koi baat nahi."
  - "Bas thodi jaankari chahiye."
  - "Theek hai."

EMPATHY AND TRUST:
- Respond warmly and naturally, especially if the customer sounds confused, doubtful, worried, or hesitant.
- Always acknowledge hesitation, confusion, or concern before proceeding.
- Build trust in the company without sounding pushy.
- Reassure customers that the company aims to provide the best possible loan offer based on eligibility and profile.
- Use short empathetic phrases like:
  "I understand."
  "No problem."
  "I completely understand your concern."
  "That makes sense."
- After showing empathy, gently bring the conversation back to qualification or next steps.

BETTER OFFER / NEGOTIATION HANDLING:
- If the customer asks for a better offer, lower interest rate, reduced EMI, or better deal:
  Acknowledge the request with empathy and confidence.
  Reassure them that your company always tries to provide the best possible offer based on eligibility.
  Encourage trust in the company.
  Offer to connect them with {HUMAN_ADVISOR_NAME}.
- Preferred response style:
  "I completely understand. Please have faith in our company, we will definitely try to provide the best possible offer for you."
  "Let me connect you with {HUMAN_ADVISOR_NAME} who can guide you further."
- If the customer hesitates due to rate or EMI:
  "I understand. {HUMAN_ADVISOR_NAME} will check the best available option for you and guide you properly."
- Do not argue, overpromise guaranteed approval, or make false commitments.
- You may say "best possible offer" or "best available offer based on eligibility," but never promise something unrealistic.

CALL ENDING:
- If customer says they are not interested, busy, or asks not to call, end the call politely.
- End only when: customer declines/stops OR all three mandatory fields (loan type, amount, timeline) are captured.
- Always mention that {HUMAN_ADVISOR_NAME} will follow up.
- Always close politely.

SPECIAL RESPONSE BEHAVIOR:
- If the customer is hesitant, first acknowledge their concern, then continue.
- If the customer asks whether they will get a good deal, reassure them politely and say {HUMAN_ADVISOR_NAME} will help with the best available offer.
- If the customer wants details beyond your scope, say {HUMAN_ADVISOR_NAME} will explain everything clearly.`;

function buildDefaultSystemPrompt(language) {
  return `${CORE_PROMPT_TEMPLATE}\n\n${getLanguageRulesBlock(language)}`;
}

const DEFAULT_SYSTEM_PROMPT = `${CORE_PROMPT_TEMPLATE}\n\n${LANGUAGE_RULES.hinglish}`;

export function getSystemPromptKeyForTenant(tenantId) {
  const normalizedTenantId = String(tenantId || "").trim();
  if (!normalizedTenantId) {
    return GLOBAL_SYSTEM_PROMPT_KEY;
  }

  return `tenant:${normalizedTenantId}`;
}

function getSystemPromptLookupKeys(tenantId) {
  const tenantKey = getSystemPromptKeyForTenant(tenantId);
  if (tenantKey === GLOBAL_SYSTEM_PROMPT_KEY) {
    return [GLOBAL_SYSTEM_PROMPT_KEY];
  }

  return [tenantKey, GLOBAL_SYSTEM_PROMPT_KEY];
}

const DEFAULT_HUMAN_ADVISOR_NAME = "our loan advisor";

/**
 * Fetch the preferred language and human advisor name for a tenant.
 * Falls back to defaults if not set.
 */
export async function getTenantSettings(tenantId) {
  const normalizedTenantId = String(tenantId || "").trim();

  function normalizeLanguage(value) {
    const key = String(value || "hinglish").trim().toLowerCase();
    return VALID_LANGUAGES.includes(key) ? key : "hinglish";
  }

  try {
    let tenant = null;

    if (normalizedTenantId) {
      tenant = await prisma.tenant.findUnique({
        where: { id: normalizedTenantId },
        select: { loanAssistantLanguage: true, loanAssistantHumanAdvisorName: true },
      });
    } else {
      // If tenant context is missing, prefer the configured super-admin tenant defaults.
      tenant = await prisma.tenant.findFirst({
        where: { slug: "super-admin" },
        select: { loanAssistantLanguage: true, loanAssistantHumanAdvisorName: true },
      });
    }

    const lang = normalizeLanguage(tenant?.loanAssistantLanguage);
    const advisorName = String(tenant?.loanAssistantHumanAdvisorName || "").trim() || DEFAULT_HUMAN_ADVISOR_NAME;
    const source = normalizedTenantId ? "explicit_tenant_id" : "super_admin_fallback";

    console.log(
      "[getTenantSettings]",
      JSON.stringify({
        requestedTenantId: tenantId ?? null,
        normalizedTenantId: normalizedTenantId || null,
        source,
        resolvedLanguage: lang,
      })
    );

    return {
      language: lang,
      humanAdvisorName: advisorName,
    };
  } catch {
    return { language: "hinglish", humanAdvisorName: DEFAULT_HUMAN_ADVISOR_NAME };
  }
}

function injectAdvisorName(prompt, advisorName) {
  return prompt.replace(/\{HUMAN_ADVISOR_NAME\}/g, advisorName);
}

/**
 * Fetch the active system prompt from the database.
 * Injects the correct LANGUAGE RULES block based on tenant language setting
 * and replaces {HUMAN_ADVISOR_NAME} with the tenant's configured advisor name.
 * Falls back to the hardcoded default if none exists.
 */
export async function getActiveSystemPrompt(tenantId) {
  const { language, humanAdvisorName } = await getTenantSettings(tenantId);
  console.log('[getActiveSystemPrompt] tenantId:', tenantId, 'language:', language, 'humanAdvisorName:', humanAdvisorName);
  const [tenantKey, globalKey] = getSystemPromptLookupKeys(tenantId);

  try {
    const tenantScopedRow = await prisma.aiSystemPrompt.findFirst({
      where: { key: tenantKey, isActive: true },
      orderBy: { updatedAt: "desc" },
    });
    const row = tenantScopedRow || (
      globalKey
        ? await prisma.aiSystemPrompt.findFirst({
            where: { key: globalKey, isActive: true },
            orderBy: { updatedAt: "desc" },
          })
        : null
    );

    if (row?.prompt) {
      const result = applyLanguageRulesToPrompt(row.prompt, language);
      return injectAdvisorName(result, humanAdvisorName);
    }

    return injectAdvisorName(buildDefaultSystemPrompt(language), humanAdvisorName);
  } catch {
    return injectAdvisorName(buildDefaultSystemPrompt(language), humanAdvisorName);
  }
}

/**
 * Fetch up to the last 50 chat transcript entries for a customer,
 * ordered chronologically (oldest first), and format them as a
 * readable conversation history block.
 */
export async function getCustomerChatHistory(customerId) {
  if (!customerId) return "";

  try {
    const callLogs = await prisma.callLog.findMany({
      where: {
        customerId,
        transcript: { not: null },
      },
      orderBy: { createdAt: "desc" },
      take: MAX_HISTORY_TURNS,
      select: {
        transcript: true,
        createdAt: true,
        summary: true,
        intent: true,
      },
    });

    if (!callLogs.length) return "";

    // Reverse to chronological order (oldest first)
    const chronological = callLogs.reverse();

    const lines = chronological.map((log, idx) => {
      const date = log.createdAt.toISOString().split("T")[0];
      const parts = [`--- Call ${idx + 1} (${date}) ---`];
      if (log.transcript) parts.push(log.transcript.trim());
      if (log.summary) parts.push(`[Summary: ${log.summary.trim()}]`);
      if (log.intent) parts.push(`[Intent: ${log.intent}]`);
      return parts.join("\n");
    });

    return lines.join("\n\n");
  } catch {
    return "";
  }
}

async function resolveTenantIdForPrompt({ tenantId, customer }) {
  const explicitTenantId = String(tenantId || "").trim();
  if (explicitTenantId) {
    return explicitTenantId;
  }

  const customerTenantId = String(customer?.tenantId || "").trim();
  if (customerTenantId) {
    return customerTenantId;
  }

  const customerId = String(customer?.id || "").trim();
  if (!customerId) {
    return null;
  }

  try {
    const customerRow = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { tenantId: true },
    });

    const resolvedTenantId = String(customerRow?.tenantId || "").trim();
    return resolvedTenantId || null;
  } catch (error) {
    console.warn("[system-prompt] Unable to resolve tenantId from customer id:", customerId, error?.message || error);
    return null;
  }
}

/**
 * Build the complete system prompt for a CALL_TURN task.
 * Combines: active DB prompt + customer chat history + dynamic context.
 *
 * Used by ALL AI providers (OpenAI, Claude, Groq, Dialogflow) to ensure
 * a consistent, centrally-managed prompt.
 */
export async function buildUnifiedCallTurnPrompt({
  customer,
  languageInstruction,
  turn,
  conversationStage,
  tenantId,
  extractedData,
}) {
  const resolvedTenantId = await resolveTenantIdForPrompt({ tenantId, customer });
  console.log(
    '[system-prompt] buildUnifiedCallTurnPrompt called — tenantId:',
    tenantId,
    'resolvedTenantId:',
    resolvedTenantId,
    'customerId:',
    customer?.id
  );
  const [basePrompt, chatHistory] = await Promise.all([
    getActiveSystemPrompt(resolvedTenantId),
    getCustomerChatHistory(customer?.id),
  ]);
  console.log('[system-prompt] basePrompt length:', basePrompt.length, 'chatHistory length:', chatHistory.length);

  const parts = [basePrompt];

  // Append customer profile context
  if (customer) {
    parts.push("");
    parts.push("CUSTOMER PROFILE:");
    parts.push(JSON.stringify(customer));
  }

  // Append previous chat history (up to 50 calls)
  if (chatHistory) {
    parts.push("");
    parts.push(`PREVIOUS CONVERSATION HISTORY (last ${MAX_HISTORY_TURNS} calls):`);
    parts.push("Use this history to stay consistent — do not repeat questions already answered, reference prior interactions naturally, and maintain continuity.");
    parts.push(chatHistory);
  }

  // Dynamic turn context
  parts.push("");
  parts.push(`Current turn index: ${turn ?? 0}`);
  if (conversationStage) {
    parts.push(`Conversation stage: ${conversationStage}`);
  }

  // Slot state — known and missing fields
  if (extractedData) {
    const mandatorySlots = ['loanType', 'amount', 'timeline'];
    const knownFields = [];
    const missingFields = [];
    for (const slot of mandatorySlots) {
      const value = extractedData[slot];
      if (value) {
        knownFields.push(`${slot} = ${value}`);
      } else {
        missingFields.push(slot);
      }
    }
    parts.push("");
    parts.push("QUALIFICATION SLOT STATE:");
    parts.push(`Known fields: ${knownFields.length ? knownFields.join(', ') : 'none'}`);
    parts.push(`Missing fields (MUST ask next): ${missingFields.length ? missingFields.join(', ') : 'all captured — proceed to closing'}`);
    if (missingFields.length) {
      parts.push(`Your next reply MUST ask for exactly one missing field: ${missingFields[0]}.`);
    }
  }

  // Language instruction override
  if (languageInstruction) {
    parts.push("");
    parts.push("CRITICAL LANGUAGE RULE (must follow strictly):");
    parts.push(languageInstruction);
    parts.push("You MUST respond in the same language the customer is using. If the customer speaks Hindi or Hinglish, you MUST reply in Hindi/Hinglish — never switch to English on your own. Only switch language if the customer explicitly switches.");
  }

  // Output format
  parts.push("");
  parts.push('Return ONLY valid JSON: {"reply":"<short natural spoken response under 35 words>","shouldEnd":<true|false>}');

  const finalPrompt = parts.join("\n");
  console.log('[system-prompt] Final unified prompt length:', finalPrompt.length);
  console.log('[system-prompt] Language instruction included:', Boolean(languageInstruction));
  return finalPrompt;
}

export { DEFAULT_SYSTEM_PROMPT };
