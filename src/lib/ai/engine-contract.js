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

  return {
    task,
    customer: payload?.customer || null,
    transcript: payload?.transcript || "",
    turn: Number(payload?.turn || 0),
    context: payload?.context || {},
    metadata: payload?.metadata || {},
    rawPayload: payload || {},
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
    return {
      reply: String(rawResult?.reply || "Please continue.").trim(),
      shouldEnd: Boolean(rawResult?.shouldEnd),
    };
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
  return {
    id,
    supports(task) {
      return supportedTasks.includes(task);
    },
    async run({ task, input, config }) {
      if (!supportedTasks.includes(task)) {
        throw new Error(`${id} does not support task: ${task}`);
      }

      const rawResult = await invoke({ task, input, config });
      return normalizeEngineOutput({ task, input, rawResult });
    },
  };
}
