import { AI_TASKS, createEngineAdapter } from "@/lib/ai/engine-contract";

function buildHeaders(config) {
  const headers = {
    "Content-Type": "application/json",
  };

  if (config.apiKey) {
    headers.Authorization = `Bearer ${config.apiKey}`;
    headers["x-api-key"] = config.apiKey;
  }

  return headers;
}

function normalizeHttpResult(task, body) {
  const payload = body?.result || body || {};

  if (task === AI_TASKS.CALL_SCRIPT) {
    return {
      script: payload.script || payload.reply || payload.text || "",
    };
  }

  if (task === AI_TASKS.CALL_SUMMARY) {
    return {
      summary: payload.summary || "Transcript processed.",
      intent: payload.intent || "UNKNOWN",
      nextAction: payload.nextAction || "Review manually.",
    };
  }

  if (task === AI_TASKS.CALL_TURN) {
    return {
      reply: payload.reply || payload.text || "Please continue.",
      shouldEnd: Boolean(payload.shouldEnd),
    };
  }

  throw new Error(`Unsupported task: ${task}`);
}

async function invokeHttp({ task, input, config }) {
  const providerLabel = config?.providerLabel || "HTTP adapter";
  const endpoint = String(config.endpoint || "").trim();

  if (!endpoint) {
    throw new Error(`${providerLabel} endpoint is not configured.`);
  }

  const timeoutMs = Math.max(1000, Number(config.timeoutMs || 12000));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: buildHeaders(config),
      body: JSON.stringify({
        task,
        payload: input.rawPayload,
        model: config.model || null,
        metadata: config.metadata || null,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(`${providerLabel} request failed (${response.status}): ${message}`);
    }

    const body = await response.json();
    return normalizeHttpResult(task, body);
  } finally {
    clearTimeout(timeout);
  }
}

export function createHttpEngine(engineId = "http-engine") {
  return createEngineAdapter({
    id: engineId,
    supportedTasks: [AI_TASKS.CALL_SCRIPT, AI_TASKS.CALL_SUMMARY, AI_TASKS.CALL_TURN],
    invoke: invokeHttp,
  });
}
