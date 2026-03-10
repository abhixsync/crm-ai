const DEVANAGARI_REGEX = /[\u0900-\u097F]/;

const ROMAN_HINDI_TOKENS = new Set([
  "haan",
  "han",
  "ha",
  "hmm",
  "ji",
  "jee",
  "nahi",
  "nahin",
  "nhi",
  "nah",
  "chahiye",
  "zaroorat",
  "baad",
  "mein",
  "abhi",
  "kal",
  "aaj",
  "samjha",
  "samjhi",
  "samajh",
  "batao",
  "bataye",
  "kya",
  "kaise",
  "kyun",
  "kitna",
  "mujhe",
  "mujhko",
  "aap",
  "aapka",
  "aapki",
  "mera",
  "meri",
  "hum",
  "lena",
  "leni",
  "chalega",
  "theek",
  "thik",
  "thikhai",
  "bilkul",
  "nambar",
  "dobara",
  "baat",
  "karna",
  "karo",
  "mat",
]);

const ENGLISH_HINT_TOKENS = new Set([
  "hello",
  "hi",
  "yes",
  "yeah",
  "sure",
  "okay",
  "interested",
  "not",
  "interest",
  "loan",
  "amount",
  "income",
  "monthly",
  "apply",
  "week",
  "today",
  "tomorrow",
  "callback",
  "please",
  "thanks",
  "thank",
  "busy",
  "later",
  "details",
  "emi",
  "salary",
  "company",
]);

export const LANGUAGE_STYLES = {
  ENGLISH: "english",
  HINDI: "hindi",
  HINGLISH: "hinglish",
  UNKNOWN: "unknown",
};

function tokenizeLatin(text) {
  return String(text || "")
    .toLowerCase()
    .match(/[a-z]+/g) || [];
}

function countMatches(tokens, dictionary) {
  if (!tokens.length) return 0;
  return tokens.reduce((count, token) => count + (dictionary.has(token) ? 1 : 0), 0);
}

function detectScript(text) {
  const hasDevanagari = DEVANAGARI_REGEX.test(text);
  const hasLatin = /[a-z]/i.test(text);

  if (hasDevanagari && hasLatin) return "mixed";
  if (hasDevanagari) return "devanagari";
  if (hasLatin) return "latin";
  return "unknown";
}

function buildSignal(style, script, confidence) {
  return {
    style,
    script,
    confidence,
  };
}

/**
 * Heuristic detector for customer language style in short call utterances.
 */
export function detectLanguageStyleFromText(text) {
  const raw = String(text || "").trim();
  if (!raw) {
    return buildSignal(LANGUAGE_STYLES.UNKNOWN, "unknown", 0);
  }

  const script = detectScript(raw);
  const latinTokens = tokenizeLatin(raw);
  const englishHits = countMatches(latinTokens, ENGLISH_HINT_TOKENS);
  const romanHindiHits = countMatches(latinTokens, ROMAN_HINDI_TOKENS);

  if (script === "devanagari") {
    return buildSignal(LANGUAGE_STYLES.HINDI, "devanagari", 0.95);
  }

  if (script === "mixed") {
    return buildSignal(LANGUAGE_STYLES.HINGLISH, "mixed", 0.95);
  }

  if (script === "latin") {
    if (romanHindiHits >= 2 && englishHits <= 1) {
      return buildSignal(LANGUAGE_STYLES.HINDI, "roman", 0.8);
    }

    if (romanHindiHits >= 1 && englishHits >= 1) {
      return buildSignal(LANGUAGE_STYLES.HINGLISH, "roman", 0.85);
    }

    if (englishHits >= 2 || latinTokens.length >= 4) {
      return buildSignal(LANGUAGE_STYLES.ENGLISH, "latin", 0.75);
    }

    if (romanHindiHits >= 1) {
      return buildSignal(LANGUAGE_STYLES.HINDI, "roman", 0.65);
    }
  }

  return buildSignal(LANGUAGE_STYLES.UNKNOWN, script, 0.4);
}

export function normalizeLanguageSignal(signal) {
  const style = String(signal?.style || "").trim().toLowerCase();
  const script = String(signal?.script || "").trim().toLowerCase();
  const confidence = Number(signal?.confidence);

  return {
    style: Object.values(LANGUAGE_STYLES).includes(style) ? style : LANGUAGE_STYLES.UNKNOWN,
    script: script || "unknown",
    confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0,
  };
}

export function getLanguageStyleLabel(signal) {
  const normalized = normalizeLanguageSignal(signal);
  switch (normalized.style) {
    case LANGUAGE_STYLES.ENGLISH:
      return "English";
    case LANGUAGE_STYLES.HINDI:
      return normalized.script === "roman" ? "Hindi (Roman script)" : "Hindi";
    case LANGUAGE_STYLES.HINGLISH:
      return "Hinglish";
    default:
      return "Unknown";
  }
}

export function getLanguageMirroringInstruction(signal) {
  const normalized = normalizeLanguageSignal(signal);

  if (normalized.style === LANGUAGE_STYLES.ENGLISH) {
    return "Customer language style is English. Respond only in natural spoken English. Do not switch to Hindi unless the customer switches first.";
  }

  if (normalized.style === LANGUAGE_STYLES.HINDI) {
    if (normalized.script === "roman") {
      return "Customer language style is Hindi in Roman script. Respond in natural Hindi using Roman script and keep English words minimal.";
    }
    return "Customer language style is Hindi. Respond in natural Hindi and avoid switching to English unless required for short loan terms.";
  }

  if (normalized.style === LANGUAGE_STYLES.HINGLISH) {
    return "Customer language style is Hinglish. Respond in natural Hinglish and mirror the customer's Hindi-English mix naturally.";
  }

  return "Customer language style is not clear yet. Use simple English first, then mirror the customer's language in the next turn.";
}

/**
 * Detect explicit customer requests to switch agent response language.
 */
export function detectLanguagePreferenceCommand(text) {
  const raw = String(text || "").trim().toLowerCase();
  if (!raw) return null;

  const asksToSpeak =
    /\b(speak|talk|reply|respond|switch|change|use|bolo|boliye|bolna|baat|language|lang)\b/.test(raw) ||
    /\b(me|mein)\s*(bolo|boliye|baat)\b/.test(raw);

  if (!asksToSpeak) return null;

  const asksHinglish =
    /\bhinglish\b/.test(raw) ||
    /\b(hindi\s*english|english\s*hindi)\b.*\bmix\b/.test(raw);
  if (asksHinglish) {
    return normalizeLanguageSignal({
      style: LANGUAGE_STYLES.HINGLISH,
      script: "roman",
      confidence: 0.98,
    });
  }

  const asksHindi =
    /\bhindi\b/.test(raw) ||
    /\benglish\s*mat\s*bolo\b/.test(raw);
  if (asksHindi) {
    return normalizeLanguageSignal({
      style: LANGUAGE_STYLES.HINDI,
      script: "roman",
      confidence: 0.98,
    });
  }

  const asksEnglish =
    /\benglish\b/.test(raw) ||
    /\bhindi\s*mat\s*bolo\b/.test(raw);
  if (asksEnglish) {
    return normalizeLanguageSignal({
      style: LANGUAGE_STYLES.ENGLISH,
      script: "latin",
      confidence: 0.98,
    });
  }

  return null;
}

export function mergeLanguageSignals(...signals) {
  const normalizedSignals = signals
    .map((signal) => normalizeLanguageSignal(signal))
    .filter((signal) => signal.style !== LANGUAGE_STYLES.UNKNOWN);

  if (!normalizedSignals.length) {
    return normalizeLanguageSignal({ style: LANGUAGE_STYLES.UNKNOWN, script: "unknown", confidence: 0 });
  }

  normalizedSignals.sort((a, b) => b.confidence - a.confidence);
  return normalizedSignals[0];
}
