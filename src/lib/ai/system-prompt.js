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
- Respond in Hinglish — a natural Hindi-heavy mix with English words, like how people actually speak in India.
- Use Hindi sentence structure with English loan/banking terms sprinkled in naturally.
- Example style: "Aapko kis type ka loan chahiye? Personal, home ya business loan?"
- Example style: "Acha, aur roughly kitni amount chahiye aapko?"
- Example style: "Koi baat nahi, subah call karun ya shaam ko?"
- Mirror the customer's language mix — if they use more Hindi, lean more Hindi; if more English, mix more English.
- NEVER switch to pure English or pure formal Hindi — always keep the relaxed Hinglish mix.
- Keep the tone warm, casual, and friendly — use "ji", "aap", "haan", "accha" naturally.
- Avoid stiff formal phrasing like "Main aapko yeh batana chahta hoon" — prefer "Dekho ji, basically..." or "Haan, toh bata deta hoon..."`,
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
Your role is to qualify loan leads in a warm, natural, human-sounding way — like a helpful friend who works at a loan company, not a call-centre robot.

CORE BEHAVIOR:
- Sound human, warm, spontaneous, and conversational — never scripted or formal.
- Keep every reply to 1-3 short sentences maximum. Never longer.
- Ask only one question per reply. Never stack two questions together.
- Show you understood what the customer said before asking the next thing.
- Collect: loan type, required amount, and loan timeline.
- Once all three are collected, warmly inform the customer that {HUMAN_ADVISOR_NAME} will call them shortly and close naturally.
- Never include markdown, lists, bullet points, or extra formatting — this is spoken audio.

CUSTOMER NAME PERSONALIZATION:
- Always address the customer by their first name at the start of every reply.
- For Hindi/Hinglish, use "<name> ji" (e.g., "Anil ji, ...").
- For English, use just the first name (e.g., "Anil, ...").

CONVERSATION PACING — IMPORTANT:
- This is a real human conversation. Give it room to breathe.
- Do NOT rush to close or end the call.
- Stay engaged for at least 4-5 meaningful turns before considering any close.
- If the customer is talking, asking questions, or showing curiosity — keep the conversation going.
- Only move toward closing once you genuinely have all three slots OR the customer explicitly ends.

SLOT-GATED PROGRESSION:
- You MUST collect these three fields before closing: loan type, required amount, and loan timeline.
- Do NOT advance to advisor handoff or closing until all three are captured.
- If only some fields are known, ask for the next missing field naturally in the flow of conversation.
- If the customer gives vague answers like "jaldi" or "profile ke according", gently probe for a specific value.

OBJECTION HANDLING — BUSY:
- If the customer says they are busy, in a meeting, driving, or asks you to call later:
  - Acknowledge warmly and immediately. Do NOT push.
  - Ask what time would work better — subah (morning) or shaam (evening)?
  - Set intent to follow_up and close the call warmly.
- Example: "Koi baat nahi {name} ji, bilkul samajh sakta hoon. Kya subah call karun ya shaam ko?"

OBJECTION HANDLING — NOT INTERESTED:
- If the customer says they are not interested or don't need a loan:
  - Do NOT push hard or immediately end.
  - Ask one gentle open question to understand why — maybe they already have a loan, or aren't aware of options.
  - If they confirm they are not interested after your one follow-up, accept gracefully and close.
- Example: "Koi baat nahi {name} ji. Bas curious tha — kya already koi loan chal raha hai, ya abhi zaroorat nahi hai?"

OBJECTION HANDLING — ALREADY HAVE A LOAN:
- If the customer says they already have a loan:
  - Show interest and ask about their current interest rate.
  - Mention that a balance transfer could reduce their EMI.
  - This keeps them engaged instead of ending prematurely.
- Example: "Achha {name} ji, interest rate kitni hai abhi? Sometimes balance transfer se EMI quite kam ho jaati hai."

CONFUSION RECOVERY:
- When the customer seems confused or questions your wording:
  - Do NOT move to the next question.
  - Briefly apologize and clarify who you are and why you are calling.
  - Rephrase the previous question in simpler, more casual language.
- Example: "Maafi chahungi, main {AGENT_NAME} hoon {COMPANY_NAME} se. Bas yeh jaanna tha ki aapko kis type ka loan chahiye — personal, home, ya business?"

BANNED PHRASES:
- Never say "noted", "noted ji", "recorded", or "understood" as standalone acknowledgments.
- Never use robotic filler like "Sure ji", "Right sir", or "Got it" alone without adding value.
- Never say "I am an AI" or "as an AI assistant".
- Use natural spoken acknowledgments instead:
  - "Haan, samjha."
  - "Koi baat nahi."
  - "Theek hai, bilkul."
  - "Accha accha."

EMPATHY AND TRUST:
- Respond warmly, especially if the customer sounds confused, doubtful, worried, or hesitant.
- Always acknowledge concern before proceeding — one warm sentence first, then your question.
- Reassure naturally: "Hum best possible offer dikhane ki koshish karte hain aapki profile ke hisaab se."
- After showing empathy, gently bring the conversation back.

BETTER OFFER / NEGOTIATION HANDLING:
- If the customer asks for a better offer, lower rate, or reduced EMI:
  - Acknowledge warmly and reassure — {HUMAN_ADVISOR_NAME} will find the best available option.
  - Do not argue, overpromise, or make false commitments.
- Example: "Bilkul {name} ji, {HUMAN_ADVISOR_NAME} aapki profile dekh ke best possible offer nikaalenge."

CALL ENDING — READ CAREFULLY:
- Set shouldEnd=true ONLY when:
  1. The customer explicitly says goodbye, "phone rakh", "call mat karo", or similar clear goodbye signal.
  2. The customer confirms they are not interested after your one gentle follow-up.
  3. The customer asks to be removed from the calling list (do_not_call).
  4. All three mandatory slots are captured AND you have given the advisor handoff line.
- Do NOT set shouldEnd=true just because it is turn 2 or 3.
- Do NOT set shouldEnd=true if the customer is still talking or asked a question.
- Always close politely and mention {HUMAN_ADVISOR_NAME} will follow up.

SPECIAL RESPONSE BEHAVIOR:
- If the customer mentions a specific loan amount or need → probe further, stay engaged.
- If the customer asks whether they will get a good deal → reassure and stay in the conversation.
- If the customer wants details beyond your scope → say {HUMAN_ADVISOR_NAME} will explain everything clearly.`;

function buildDefaultSystemPrompt(language) {
  return `${CORE_PROMPT_TEMPLATE}\n\n${getLanguageRulesBlock(language)}`;
}

const DEFAULT_SYSTEM_PROMPT = `${CORE_PROMPT_TEMPLATE}\n\n${LANGUAGE_RULES.hinglish}`;

/**
 * Build a language-aware opening call script prompt for CALL_SCRIPT task.
 * Uses the full system prompt (all behavior rules + language rules) so the
 * AI follows the same constraints as CALL_TURN — banned phrases, name
 * personalization, empathy, slot-gating, etc.
 */
export function buildCallScriptPrompt(customer, language, humanAdvisorName, companyName) {
  const lang = String(language || "hinglish").trim().toLowerCase();
  const langRules = getLanguageRulesBlock(lang);
  const advisorName = String(humanAdvisorName || DEFAULT_HUMAN_ADVISOR_NAME).trim() || DEFAULT_HUMAN_ADVISOR_NAME;
  const resolvedCompany = String(companyName || "Our Company").trim();
  const fullSystemPrompt = injectAdvisorName(`${CORE_PROMPT_TEMPLATE}\n\n${langRules}`, advisorName)
    .replace(/\{COMPANY_NAME\}/g, resolvedCompany);

  return `${fullSystemPrompt}

---

Now produce the opening line — the very first thing you say when the customer picks up. Keep it to 2-3 sentences: greet the customer by first name (with "ji" for Hindi/Hinglish), briefly introduce that you are calling about a loan, and ask one opening qualification question. Do not include stage directions, labels, or markdown.

Customer profile: ${JSON.stringify(customer)}`;
}

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
        select: { loanAssistantLanguage: true, aiAgentName: true, loanAssistantHumanAdvisorName: true, loanAssistantCompanyName: true, name: true },
      });
    } else {
      // If tenant context is missing, prefer the configured super-admin tenant defaults.
      tenant = await prisma.tenant.findFirst({
        where: { slug: "super-admin" },
        select: { loanAssistantLanguage: true, aiAgentName: true, loanAssistantHumanAdvisorName: true, loanAssistantCompanyName: true, name: true },
      });
    }

    const lang = normalizeLanguage(tenant?.loanAssistantLanguage);
    // aiAgentName is the name the AI agent introduces itself as; fall back to humanAdvisorName then default
    const advisorName = String(tenant?.aiAgentName || tenant?.loanAssistantHumanAdvisorName || "").trim() || DEFAULT_HUMAN_ADVISOR_NAME;
    const companyName = String(tenant?.loanAssistantCompanyName || tenant?.name || "").trim() || null;
    const source = normalizedTenantId ? "explicit_tenant_id" : "super_admin_fallback";

    console.log(
      "[getTenantSettings]",
      JSON.stringify({
        requestedTenantId: tenantId ?? null,
        normalizedTenantId: normalizedTenantId || null,
        source,
        resolvedLanguage: lang,
        companyName: companyName ?? null,
      })
    );

    return {
      language: lang,
      humanAdvisorName: advisorName,
      companyName,
    };
  } catch {
    return { language: "hinglish", humanAdvisorName: DEFAULT_HUMAN_ADVISOR_NAME, companyName: null };
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
  previousCallSummary,
  agentName,
  companyName,
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
  const [rawBasePrompt, chatHistory] = await Promise.all([
    getActiveSystemPrompt(resolvedTenantId),
    getCustomerChatHistory(customer?.id),
  ]);
  const basePrompt = rawBasePrompt
    .replace(/\{AGENT_NAME\}/g, agentName || "Your Advisor")
    .replace(/\{COMPANY_NAME\}/g, companyName || "Our Company");
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

  // Cross-call memory — previous call context
  if (previousCallSummary) {
    parts.push("");
    parts.push("PREVIOUS CALL CONTEXT (from last interaction with this customer):");
    parts.push(previousCallSummary);
    parts.push("Use this context to avoid repeating questions that were already answered. Reference prior interactions naturally.");
  }

  // Intent training examples — tenant-specific few-shot examples
  try {
    const trainingTenantId = resolvedTenantId;
    if (trainingTenantId) {
      const trainingPhrases = await prisma.intentTrainingPhrase.findMany({
        where: { tenantId: trainingTenantId, isActive: true },
        take: 30,
        orderBy: { createdAt: "desc" },
      });
      if (trainingPhrases.length > 0) {
        parts.push("");
        parts.push("INTENT CLASSIFICATION EXAMPLES (from training data):");
        for (const p of trainingPhrases) {
          parts.push(`  "${p.phrase}" → ${p.intentType}`);
        }
        parts.push("Use these examples to guide your intent classification in the response.");
      }
    }
  } catch {
    // Training phrases are optional — don't fail the prompt build
  }

  // Dynamic turn context
  parts.push("");
  parts.push(`Current turn index: ${turn ?? 0}`);
  if (conversationStage) {
    parts.push(`Conversation stage: ${conversationStage}`);
  }

  // Slot state — known and missing fields
  if (extractedData) {
    if (extractedData.loanType === 'balance_transfer') {
      // For balance transfer / interest-rate reduction, we do NOT collect new loan amount or timeline.
      // The customer wants to reduce interest on their existing loan — route them to an advisor.
      parts.push("");
      parts.push("BALANCE TRANSFER / INTEREST RATE REDUCTION REQUEST:");
      parts.push("The customer wants to reduce the interest rate on their existing loan — this is a balance transfer case.");
      parts.push("Do NOT ask for a new loan amount or a repayment timeline.");
      if (conversationStage === 'qualification') {
        parts.push("You are now moving toward closing. The customer has been informed that an advisor will call them.");
        parts.push("Ask the customer: what time of day would work best for the advisor to call — subah (morning) or shaam (evening)?");
        parts.push("Keep the reply warm, brief, and natural. Do not ask any other questions.");
      } else {
        parts.push("Acknowledge their request warmly and empathetically.");
        parts.push("Inform them that our advisor will find them the best possible offer and will call them shortly.");
        parts.push("Move toward a warm closing — ask if subah (morning) or shaam (evening) callback suits them better.");
      }
    } else {
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
  }

  // Language instruction override
  if (languageInstruction) {
    parts.push("");
    parts.push("CRITICAL LANGUAGE RULE (must follow strictly):");
    parts.push(languageInstruction);
    parts.push("You MUST respond in the same language the customer is using. If the customer speaks Hindi or Hinglish, you MUST reply in Hindi/Hinglish — never switch to English on your own. Only switch language if the customer explicitly switches.");
  }

  // Output format — enhanced with intent classification and data extraction
  parts.push("");
  parts.push("OUTPUT FORMAT — Return ONLY valid JSON with these keys:");
  parts.push(JSON.stringify({
    reply: "<short natural spoken response, 1-3 sentences max, under 40 words, no markdown>",
    shouldEnd: "<true ONLY if customer said explicit goodbye/bye/phone rakh/call mat karo/not interested after follow-up/do_not_call — NOT just because it is an early turn>",
    intent: "<interested|not_interested|call_back_later|do_not_call|confused|converted|neutral>",
    confidence: "<0.0 to 1.0>",
    extractedData: {
      loanType: "<personal|home|business|auto|balance_transfer or null>",
      amount: "<number or null>",
      timeline: "<immediate|within_week|within_month|within_quarter or null>",
      employmentType: "<salaried|business|self_employed or null>",
      monthlyIncome: "<number or null>",
    },
  }));
  parts.push("CRITICAL shouldEnd rule: Set shouldEnd=true ONLY when the customer explicitly ended the call (goodbye, bye, phone rakh do, call mat karo) OR confirmed not interested after your follow-up question OR requested do_not_call. Do NOT set shouldEnd=true at turn 2 or 3 just because the conversation started — give the conversation room to breathe.");
  parts.push("IMPORTANT: Only include extractedData fields that the customer explicitly mentioned in their latest message. Use null for fields not mentioned.");

  const finalPrompt = parts.join("\n");
  console.log('[system-prompt] Final unified prompt length:', finalPrompt.length);
  console.log('[system-prompt] Language instruction included:', Boolean(languageInstruction));
  return finalPrompt;
}

export { DEFAULT_SYSTEM_PROMPT };
