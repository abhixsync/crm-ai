const MEANINGFUL_VOICE_PATTERNS = [
  /\b(yes|haan|han|bilkul|sure|ok|okay|theek|thik|right|done)\b/i,
  /\b(loan|business|personal|home|auto|car|amount|emi|interest|rate|eligibility|eligible|process|apply|application|document|documents|income|salary|salaried|employment|self employed|self-employed|business owner|credit|cibil|advisor|offer|profile|city)\b/i,
  /\b(call back|callback|call later|later|tomorrow|today|week|month|asap|immediately|available|abhi|subah|shaam)\b/i,
  /\b(please do|do that|do it|kar do|kardo|bata do|batado|batao|bataye|batayiye|samjhao|samjhaiye|tell me|tell me more|details|detail|explain|repeat|repeating|already told|already asked|same question|max amount|maximum|kitna mil|kitna de sakte|how much can you provide|how much loan)\b/i,
];

export function normalizeVoiceTranscript(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function isMeaningfulVoiceTranscript(value) {
  const normalized = normalizeVoiceTranscript(value);
  if (!normalized) {
    return false;
  }

  if (/\d/.test(normalized)) {
    return true;
  }

  return MEANINGFUL_VOICE_PATTERNS.some((pattern) => pattern.test(normalized));
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