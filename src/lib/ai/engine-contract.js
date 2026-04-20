export const AI_TASKS = {
  CALL_SCRIPT: "CALL_SCRIPT",
  CALL_SUMMARY: "CALL_SUMMARY",
  CALL_TURN: "CALL_TURN",
};

const TASK_SET = new Set(Object.values(AI_TASKS));

export function assertValidTask(task) {
  if (!TASK_SET.has(task)) {
    throw new Error(`Unsupported AI task: ${task}`);
  }
}

export function createEngineInput({ task, payload }) {
  assertValidTask(task);

  const basePayload = payload && typeof payload === "object" ? payload : {};

  return {
    task,
    ...basePayload,
    customer: basePayload.customer || null,
    transcript: basePayload.transcript || "",
    turn: Number(basePayload.turn || 0),
    context: basePayload.context || {},
    metadata: basePayload.metadata || {},
    rawPayload: basePayload,
  };
}

function normalizeByTask(task, rawResult) {
  if (task === AI_TASKS.CALL_SCRIPT) {
    return {
      script: String(rawResult?.script || "").trim(),
    };
  }

  if (task === AI_TASKS.CALL_SUMMARY) {
    return {
      summary: String(rawResult?.summary || "Transcript processed.").trim(),
      intent: String(rawResult?.intent || "UNKNOWN").trim(),
      nextAction: String(rawResult?.nextAction || "Review manually.").trim(),
    };
  }

  if (task === AI_TASKS.CALL_TURN) {
    const result = {
      reply: String(rawResult?.reply || "Please continue.").trim(),
      shouldEnd: Boolean(rawResult?.shouldEnd),
    };

    // Pass through LLM-classified intent and extracted data (optional fields)
    if (rawResult?.intent) result.intent = rawResult.intent;
    if (typeof rawResult?.confidence === "number") result.confidence = rawResult.confidence;
    if (rawResult?.extractedData && typeof rawResult.extractedData === "object") {
      result.extractedData = rawResult.extractedData;
    }

    return result;
  }

  return rawResult;
}

export function normalizeEngineOutput({ task, input, rawResult }) {
  const result = normalizeByTask(task, rawResult || {});

  const responseText =
    result.reply ||
    result.script ||
    result.summary ||
    "";

  const intent =
    result.intent ||
    input?.context?.intent ||
    "UNKNOWN";

  return {
    intent,
    responseText,
    context: {
      ...input.context,
      task,
      turn: input.turn,
      shouldEnd: result.shouldEnd,
    },
    result,
    raw: rawResult || {},
  };
}

export function createEngineAdapter({ id, supportedTasks, invoke }) {
  const hasTask = supportedTasks instanceof Set
    ? (t) => supportedTasks.has(t)
    : (t) => supportedTasks.includes(t);
  return {
    id,
    supports(task) {
      return hasTask(task);
    },
    async run({ task, input, config }) {
      if (!hasTask(task)) {
        throw new Error(`${id} does not support task: ${task}`);
      }

      const rawResult = await invoke({ task, input, config });
      return normalizeEngineOutput({ task, input, rawResult });
    },
  };
}

/**
 * Build a structured CALL_SUMMARY prompt that includes extracted data
 * for accurate advisor-facing summaries.
 */
export function buildCallSummaryPrompt({ transcript, extractedData, customer, stage }) {
  const parts = [];

  parts.push(
    "You are summarising a loan sales call between an AI loan assistant and a customer.",
    "Your audience is a human loan advisor who will follow up with this customer.",
    "Return ONLY valid JSON with keys: summary, intent, nextAction.",
    ""
  );

  // Include extracted data so the LLM knows what was discussed
  const data = extractedData || {};
  const facts = [];
  if (data.loanType) facts.push(`Loan type: ${data.loanType}`);
  if (data.amount) facts.push(`Loan amount: ${data.amount}`);
  if (data.employmentType) facts.push(`Employment: ${data.employmentType}`);
  if (data.monthlyIncome) facts.push(`Monthly income: ${data.monthlyIncome}`);
  if (data.city) facts.push(`City: ${data.city}`);
  if (data.preferredCallbackTime) facts.push(`Callback preference: ${data.preferredCallbackTime}`);
  if (customer?.firstName) facts.push(`Customer name: ${customer.firstName}`);
  if (stage) facts.push(`Conversation stage reached: ${stage}`);

  if (facts.length > 0) {
    parts.push("Extracted data from the conversation:");
    facts.forEach(f => parts.push(`  - ${f}`));
    parts.push("");
  }

  parts.push(
    "Rules for the summary field (60 words max):",
    "- State what the customer wants (loan type, amount, purpose) and their disposition.",
    "- Mention key qualifying info discussed (employment, income, city).",
    "- Do NOT include agent prompts or questions. Only describe what was discussed.",
    "- Write in third person (e.g. \"Customer is interested in…\").",
    "",
    "Rules for intent — use EXACTLY one of these values:",
    "  interested       = customer actively asked about loan details, mentioned a specific amount/requirement/EMI, OR asked about process/documents — even without a firm commitment",
    "  follow_up        = customer is open but asked to be called back at a specific later time (busy now, call tomorrow, etc.)",
    "  not_interested   = customer explicitly said they do not need a loan or are not interested",
    "  do_not_call      = customer asked to stop calling / remove them from list",
    "  converted        = customer agreed to proceed, fill an application, or submit documents",
    "  failed           = call ended with no meaningful conversation (no speech, completely unclear, technical issue)",
    "",
    "IMPORTANT: If the customer mentioned ANY loan amount, loan type, or specific financial need — use 'interested', not 'follow_up'.",
    "IMPORTANT: If unsure between 'interested' and 'follow_up', prefer 'interested' when the customer showed curiosity about the product.",
    "",
    "Rules for nextAction:",
    "- A concrete next step for the advisor (e.g. \"Call customer to verify documents\").",
    "",
    "Transcript:",
    transcript || "(no transcript available)"
  );

  return parts.join("\n");
}
