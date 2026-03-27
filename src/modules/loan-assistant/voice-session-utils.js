/**
 * Accept every non-empty transcript from the browser speech recognizer.
 * The LLM is responsible for understanding or asking for clarification —
 * we should never silently drop customer speech on the client side.
 */
export function normalizeVoiceTranscript(value) {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase();
}

export function isMeaningfulVoiceTranscript(value) {
  const normalized = normalizeVoiceTranscript(value);
  return normalized.length > 0;
}

export function getRecognitionRestartDelayMs(consecutiveSilentCount) {
  const count = Math.max(1, Math.round(Number(consecutiveSilentCount) || 1));

  if (count <= 1) return 1000;
  if (count === 2) return 1600;
  if (count === 3) return 2400;
  return 3200;
}

export function getVoiceRetryNotice(consecutiveSilentCount) {
  const count = Math.max(0, Math.round(Number(consecutiveSilentCount) || 0));

  if (count <= 1) {
    return "";
  }

  if (count === 2) {
    return "I did not catch anything clearly. Please speak one short sentence when the mic restarts.";
  }

  return "Still listening. Please say one short sentence, for example 'business loan', '1 crore', or 'call later'.";
}

export function getEffectiveAiToListenDelayMs(configuredDelayMs, ttsProvider = "browser") {
  const normalizedProvider = String(ttsProvider || "browser").trim().toLowerCase();
  const minimumDelayMs = normalizedProvider === "browser" ? 1000 : 700;
  const fallbackDelayMs = normalizedProvider === "browser" ? 1200 : 900;
  const parsed = Number(configuredDelayMs);

  if (Number.isFinite(parsed) && parsed >= 0) {
    return Math.max(parsed, minimumDelayMs);
  }

  return fallbackDelayMs;
}