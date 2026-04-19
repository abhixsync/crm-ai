import crypto from "crypto";
import fs from "fs";
import path from "path";
import { AI_TASKS, createEngineAdapter } from "@/lib/ai/engine-contract";
import {
  detectLanguageStyleFromText,
  LANGUAGE_STYLES,
  normalizeLanguageSignal,
} from "@/lib/ai/language-style";

const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const DIALOGFLOW_SCOPE = "https://www.googleapis.com/auth/cloud-platform";
const GOOGLE_TRANSLATE_V2_URL = "https://translation.googleapis.com/language/translate/v2";
const DEVANAGARI_REGEX = /[\u0900-\u097F]/;
const ROMAN_HINDI_TOKEN_REGEX = /\b(ji|haan|nahi|nahin|nhi|aap|aapka|aapki|kripya|dhanyavaad|shukriya|mujhe|mujhko|baad|mein|abhi|kya|kitna|samay|dobara|batayenge|chahiye|len[ae]|karenge)\b/i;

const HTML_ENTITY_MAP = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&#39;": "'",
  "&quot;": '"',
};

const DEVANAGARI_INDEPENDENT_VOWELS = {
  "अ": "a",
  "आ": "aa",
  "इ": "i",
  "ई": "ii",
  "उ": "u",
  "ऊ": "uu",
  "ऋ": "ri",
  "ए": "e",
  "ऐ": "ai",
  "ओ": "o",
  "औ": "au",
};

const DEVANAGARI_MATRA_MAP = {
  "ा": "aa",
  "ि": "i",
  "ी": "ii",
  "ु": "u",
  "ू": "uu",
  "ृ": "ri",
  "े": "e",
  "ै": "ai",
  "ो": "o",
  "ौ": "au",
};

const DEVANAGARI_CONSONANT_MAP = {
  "क": "k",
  "ख": "kh",
  "ग": "g",
  "घ": "gh",
  "ङ": "ng",
  "च": "ch",
  "छ": "chh",
  "ज": "j",
  "झ": "jh",
  "ञ": "ny",
  "ट": "t",
  "ठ": "th",
  "ड": "d",
  "ढ": "dh",
  "ण": "n",
  "त": "t",
  "थ": "th",
  "द": "d",
  "ध": "dh",
  "न": "n",
  "प": "p",
  "फ": "ph",
  "ब": "b",
  "भ": "bh",
  "म": "m",
  "य": "y",
  "र": "r",
  "ल": "l",
  "व": "v",
  "श": "sh",
  "ष": "sh",
  "स": "s",
  "ह": "h",
  "क़": "q",
  "ख़": "kh",
  "ग़": "g",
  "ज़": "z",
  "फ़": "f",
  "ड़": "r",
  "ढ़": "rh",
};

const DEVANAGARI_SIGN_MAP = {
  "ं": "n",
  "ँ": "n",
  "ः": "h",
  "़": "",
  "्": "",
};

function parseJsonSafe(value) {
  if (!value) return null;

  if (typeof value === "object") {
    return value;
  }

  const raw = String(value).trim();
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function parseBase64Json(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  try {
    const decoded = Buffer.from(raw, "base64").toString("utf8");
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

function parseJsonFilePath(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  const looksLikePath =
    raw.endsWith(".json") || raw.startsWith("./") || raw.startsWith("../") || raw.includes("\\");

  if (!looksLikePath) return null;

  const filePath = path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
  if (!fs.existsSync(filePath)) return null;

  try {
    const json = fs.readFileSync(filePath, "utf8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function normalizePrivateKey(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return raw.replace(/\\n/g, "\n");
}

function parseServiceAccountFromDiscreteEnv() {
  const clientEmail = String(process.env.DIALOGFLOW_CLIENT_EMAIL || "").trim();
  const privateKey = normalizePrivateKey(process.env.DIALOGFLOW_PRIVATE_KEY);
  const projectId = String(process.env.DIALOGFLOW_PROJECT_ID || "").trim();

  if (!clientEmail || !privateKey) return null;

  return {
    client_email: clientEmail,
    private_key: privateKey,
    project_id: projectId || undefined,
  };
}

function getServiceAccount(config) {
  const metadata = config?.metadata || {};
  const envServiceAccount = process.env.DIALOGFLOW_SERVICE_ACCOUNT_JSON;

  return (
    parseJsonSafe(config?.apiKey) ||
    parseJsonSafe(metadata?.serviceAccountJson) ||
    parseJsonSafe(envServiceAccount) ||
    parseJsonFilePath(envServiceAccount) ||
    parseBase64Json(process.env.DIALOGFLOW_SERVICE_ACCOUNT_BASE64) ||
    parseServiceAccountFromDiscreteEnv()
  );
}

function getProjectId(config, serviceAccount) {
  const metadata = config?.metadata || {};

  return (
    String(metadata?.projectId || "").trim() ||
    String(process.env.DIALOGFLOW_PROJECT_ID || "").trim() ||
    String(serviceAccount?.project_id || "").trim() ||
    String(config?.model || "").trim()
  );
}

function createSignedJwt(serviceAccount) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + 3600;

  const header = {
    alg: "RS256",
    typ: "JWT",
  };

  const payload = {
    iss: serviceAccount.client_email,
    scope: DIALOGFLOW_SCOPE,
    aud: GOOGLE_OAUTH_TOKEN_URL,
    exp: expiresAt,
    iat: issuedAt,
  };

  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsignedToken = `${encode(header)}.${encode(payload)}`;

  const signer = crypto.createSign("RSA-SHA256");
  signer.update(unsignedToken);
  signer.end();

  const signature = signer.sign(serviceAccount.private_key, "base64url");
  return `${unsignedToken}.${signature}`;
}

async function getAccessToken(serviceAccount) {
  if (!serviceAccount?.client_email || !serviceAccount?.private_key) {
    throw new Error("Dialogflow service account is missing client_email/private_key.");
  }

  const assertion = createSignedJwt(serviceAccount);
  const payload = new URLSearchParams();
  payload.set("grant_type", "urn:ietf:params:oauth:grant-type:jwt-bearer");
  payload.set("assertion", assertion);

  const response = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: payload.toString(),
  });

  const data = await response.json();

  if (!response.ok || !data?.access_token) {
    throw new Error(data?.error_description || data?.error || "Dialogflow auth failed.");
  }

  return data.access_token;
}

function buildDialogflowInputText(task, input) {
  const truncate = (value, max = 240) => {
    const text = String(value || "").trim();
    if (text.length <= max) return text;
    return `${text.slice(0, Math.max(0, max - 3))}...`;
  };

  if (task === AI_TASKS.CALL_SCRIPT) {
    const customer = input.customer || {};
    const lang = String(input.language || "hinglish").trim().toLowerCase();
    const compactProfile = {
      firstName: customer.firstName || "",
      loanType: customer.loanType || "",
      loanAmount: customer.loanAmount || "",
      monthlyIncome: customer.monthlyIncome || "",
      city: customer.city || "",
    };

    return truncate(
      `Generate concise loan call script (max 120 words) in ${lang}. Profile: ${JSON.stringify(compactProfile)}`,
      240
    );
  }

  if (task === AI_TASKS.CALL_SUMMARY) {
    return truncate(
      `Analyze loan call transcript and return summary, intent, nextAction: ${input.transcript || ""}`,
      240
    );
  }

  if (task === AI_TASKS.CALL_TURN) {
    const latestUtterance = String(input.latestCustomerMessage || "").trim();
    if (latestUtterance) {
      return truncate(latestUtterance, 240);
    }

    const transcript = String(input.transcript || "").trim();
    if (transcript) {
      return truncate(transcript, 240);
    }

    return "hello";
  }

  return "";
}

function decodeHtmlEntities(value) {
  const text = String(value || "");
  return text.replace(/(&amp;|&lt;|&gt;|&#39;|&quot;)/g, (entity) => HTML_ENTITY_MAP[entity] || entity);
}

function devanagariToRoman(text) {
  const source = String(text || "");
  if (!source) return "";

  let output = "";

  // Lightweight transliteration to keep Roman-script mirroring when customer speaks Hindi in Roman.
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    const next = source[i + 1];

    if (DEVANAGARI_INDEPENDENT_VOWELS[char]) {
      output += DEVANAGARI_INDEPENDENT_VOWELS[char];
      continue;
    }

    if (DEVANAGARI_CONSONANT_MAP[char]) {
      const consonant = DEVANAGARI_CONSONANT_MAP[char];
      if (DEVANAGARI_MATRA_MAP[next]) {
        output += consonant + DEVANAGARI_MATRA_MAP[next];
        i += 1;
        continue;
      }

      if (next === "्") {
        output += consonant;
        i += 1;
        continue;
      }

      output += consonant + "a";
      continue;
    }

    if (DEVANAGARI_SIGN_MAP[char] !== undefined) {
      output += DEVANAGARI_SIGN_MAP[char];
      continue;
    }

    output += char;
  }

  return output
    .replace(/\s+/g, " ")
    .replace(/aa+/g, "aa")
    .replace(/ii+/g, "ii")
    .replace(/uu+/g, "uu")
    .trim();
}

function makeHinglishFromRomanHindi(text) {
  return String(text || "")
    .replace(/\bkripya\b/gi, "please")
    .replace(/\bdhanyavaad\b/gi, "thank you")
    .replace(/\bshukriya\b/gi, "thanks")
    .replace(/\baapse\b/gi, "aapse")
    .replace(/\bsampark\b/gi, "contact")
    .replace(/\bcall\s+karenge\b/gi, "call karenge")
    .replace(/\s+/g, " ")
    .trim();
}

function englishToHinglishHeuristic(text) {
  const reply = String(text || "").trim();
  if (!reply) return "Please continue, main sun rahi hoon.";

  let converted = reply
    .replace(/\bthank you\b/gi, "thank you ji")
    .replace(/\bplease\b/gi, "please")
    .replace(/\bcould you\b|\bcan you\b/gi, "kya aap")
    .replace(/\bwe will call you back\b/gi, "hum aapko dobara call karenge")
    .replace(/\bgoodbye\b/gi, "theek hai ji, dhanyavaad")
    .replace(/\bnot interested\b/gi, "interest nahi")
    .replace(/\bthis week\b/gi, "is week");

  if (!/\b(ji|aap|kya|nahi|dobara|baad)\b/i.test(converted)) {
    converted = `Ji, ${converted}`;
  }

  return converted.replace(/\s+/g, " ").trim();
}

async function translateTextWithGoogle({ accessToken, projectId, text, targetLanguage }) {
  const source = String(text || "").trim();
  if (!source || !accessToken || !targetLanguage) return null;

  try {
    const response = await fetch(GOOGLE_TRANSLATE_V2_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        ...(projectId ? { "x-goog-user-project": projectId } : {}),
      },
      body: JSON.stringify({
        q: source,
        target: targetLanguage,
        format: "text",
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      return null;
    }

    const translated = data?.data?.translations?.[0]?.translatedText;
    if (!translated) return null;
    return decodeHtmlEntities(translated).trim();
  } catch {
    return null;
  }
}

function isAlreadyTargetStyle(text, languageSignal) {
  const reply = String(text || "").trim();
  if (!reply) return false;

  const detected = detectLanguageStyleFromText(reply);
  const hasDevanagari = DEVANAGARI_REGEX.test(reply);
  const hasRomanHindi = ROMAN_HINDI_TOKEN_REGEX.test(reply);

  if (languageSignal.style === LANGUAGE_STYLES.ENGLISH) {
    return detected.style === LANGUAGE_STYLES.ENGLISH;
  }

  if (languageSignal.style === LANGUAGE_STYLES.HINDI) {
    if (languageSignal.script === "roman") {
      return hasRomanHindi || (detected.style === LANGUAGE_STYLES.HINDI && detected.script === "roman");
    }
    return hasDevanagari || detected.style === LANGUAGE_STYLES.HINDI;
  }

  if (languageSignal.style === LANGUAGE_STYLES.HINGLISH) {
    return detected.style === LANGUAGE_STYLES.HINGLISH || (hasRomanHindi && /[a-z]/i.test(reply));
  }

  return false;
}

async function rewriteReplyToLanguageStrict({
  reply,
  languageSignal,
  accessToken,
  projectId,
}) {
  const baseReply = String(reply || "").trim();
  if (!baseReply) {
    return getFallbackTurnReply(languageSignal);
  }

  if (languageSignal.style === LANGUAGE_STYLES.UNKNOWN || languageSignal.style === LANGUAGE_STYLES.ENGLISH) {
    return baseReply;
  }

  if (isAlreadyTargetStyle(baseReply, languageSignal)) {
    return baseReply;
  }

  const translatedHindi = await translateTextWithGoogle({
    accessToken,
    projectId,
    text: baseReply,
    targetLanguage: "hi",
  });

  if (languageSignal.style === LANGUAGE_STYLES.HINDI) {
    if (languageSignal.script === "roman") {
      if (translatedHindi) {
        return devanagariToRoman(translatedHindi) || englishToHinglishHeuristic(baseReply);
      }
      return englishToHinglishHeuristic(baseReply);
    }

    return translatedHindi || getClarificationTurnReply(languageSignal);
  }

  if (languageSignal.style === LANGUAGE_STYLES.HINGLISH) {
    if (translatedHindi) {
      const romanHindi = devanagariToRoman(translatedHindi);
      return makeHinglishFromRomanHindi(romanHindi) || englishToHinglishHeuristic(baseReply);
    }
    return englishToHinglishHeuristic(baseReply);
  }

  return baseReply;
}

function resolveLanguageSignal(input) {
  const contextSignal = normalizeLanguageSignal(input?.context?.languageSignal);
  if (contextSignal.style !== LANGUAGE_STYLES.UNKNOWN) {
    return contextSignal;
  }

  return detectLanguageStyleFromText(input?.latestCustomerMessage || input?.transcript || "");
}

function getLanguageVariant(languageSignal, variants) {
  if (languageSignal.style === LANGUAGE_STYLES.HINDI) {
    if (languageSignal.script === "roman" && variants.hindiRoman) return variants.hindiRoman;
    return variants.hindi || variants.hinglish || variants.english || variants.defaultText || "";
  }

  if (languageSignal.style === LANGUAGE_STYLES.HINGLISH) {
    return variants.hinglish || variants.hindiRoman || variants.hindi || variants.english || variants.defaultText || "";
  }

  if (languageSignal.style === LANGUAGE_STYLES.ENGLISH) {
    return variants.english || variants.hinglish || variants.hindiRoman || variants.hindi || variants.defaultText || "";
  }

  return variants.defaultText || variants.english || variants.hinglish || variants.hindiRoman || variants.hindi || "";
}

function getClarificationTurnReply(languageSignal) {
  return getLanguageVariant(languageSignal, {
    english: "Sorry, I did not understand what you said. Could you please repeat that?",
    hinglish: "Sorry ji, main aapki baat samajh nahi paayi. Kya aap dobara bata sakte hain?",
    hindiRoman: "Maaf kijiye, main aapki baat samajh nahi paayi. Kya aap dobara bata sakte hain?",
    hindi: "माफ़ कीजिए, मैं आपकी बात समझ नहीं पाई। क्या आप दोबारा बता सकते हैं?",
    defaultText: "Sorry, I did not understand what you said. Could you please repeat that?",
  });
}

function resolveLatestUtterance(input) {
  return String(input?.latestCustomerMessage || input?.rawPayload?.latestCustomerMessage || "").trim();
}

function inferFallbackIntentFromUtterance(utterance) {
  const text = String(utterance || "").trim().toLowerCase();
  if (!text) return "neutral";
  const mentionsAmount = hasLoanAmountHint(text);
  const mentionsLoanNeed =
    text.includes("loan") ||
    text.includes("chahiye") ||
    text.includes("emi") ||
    text.includes("apply");

  if (
    text.includes("not interested") ||
    text.includes("no thanks") ||
    text.includes("don't need") ||
    text.includes("dont need") ||
    text.includes("don't call") ||
    text.includes("dont call") ||
    text.includes("nahi chahiye") ||
    text.includes("nhi chahiye") ||
    text.includes("nhi lena") ||
    text.includes("mat call") ||
    text.includes("interest nahi") ||
    text.includes("zarurat nahi") ||
    text.includes("zaroorat nahi") ||
    text.includes("zarurat nhi") ||
    text.includes("zaroorat nhi") ||
    text.includes("jarurat nahi") ||
    text.includes("jarurat nhi") ||
    text.includes("jrurt nhi") ||
    text.includes("jrurat nhi") ||
    text.includes("nahi lu") ||
    text.includes("nhi lu") ||
    text.includes("na hi lu") ||
    text.includes("nahi lunga") ||
    text.includes("nhi lunga") ||
    text.includes("na lunga")
  ) {
    return "not_interested";
  }

  if (
    text.includes("call me later") ||
    text.includes("call later") ||
    text.includes("call back") ||
    text.includes("callback") ||
    text.includes("busy") ||
    text.includes("abhi busy") ||
    text.includes("abhi time nahi") ||
    text.includes("baad mein") ||
    text.includes("baad me")
  ) {
    return "call_back_later";
  }

  if (
    text.includes("theek hai") ||
    text.includes("thik hai") ||
    text.includes("thik h") ||
    text.includes("theek h") ||
    text.includes("kar lete hain") ||
    text.includes("kar lete h") ||
    text.includes("kar lete") ||
    text.includes("kar lenge") ||
    text.includes("kar dete hain") ||
    text.includes("kar do") ||
    text.includes("kara do") ||
    text.includes("kardo") ||
    text.includes("karado") ||
    text.includes("kar dena") ||
    text.includes("kara dena") ||
    text.includes("kara dijiye") ||
    text.includes("karwa do") ||
    text.includes("please do") ||
    text.includes("do that") ||
    text.includes("do it") ||
    text.includes("go ahead") ||
    text.includes("proceed") ||
    text.includes("continue") ||
    text.includes("available now") ||
    text.includes("i am available") ||
    text.includes("abhi baat kar sakte") ||
    text.includes("abhi baat kar sakta") ||
    text.includes("abhi free hoon")
  ) {
    return "interested";
  }

  if (
    text.includes("yes") ||
    text.includes("haan") ||
    text.includes("interested") ||
    text.includes("loan chahiye") ||
    text.includes("need loan") ||
    text.includes("want loan") ||
    text.includes("personal loan") ||
    text.includes("home loan") ||
    text.includes("business loan") ||
    text.includes("auto loan") ||
    (mentionsAmount && mentionsLoanNeed)
  ) {
    return "interested";
  }

  return "neutral";
}

function hasLoanTypeHint(utterance) {
  return /\b(personal|home|business|auto|car|education|gold)\b/i.test(String(utterance || ""));
}

function hasLoanAmountHint(utterance) {
  return /(?:₹|rs\.?|rupees?)?\s*\d[\d,]*(?:\s*(?:lakh|lac|k|thousand|crore))?/i.test(String(utterance || ""));
}

function normalizePromptSlot(slot) {
  const value = String(slot || "").trim();
  return value || null;
}

function detectPromptSlotFromText(text) {
  const normalized = String(text || "")
    .toLowerCase()
    .replace(/[.,!?;:'"()[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) return null;

  if (/(loan type|personal loan|home loan|business loan|auto loan|which loan|kis type)/.test(normalized)) {
    return "loanType";
  }

  if (/(loan amount|how much|kitna|amount|lakh|lac|crore|rupees|rs)/.test(normalized)) {
    return "amount";
  }

  if (/(by when|timeline|kab tak|when do you need|this week|this month|apply)/.test(normalized)) {
    return "timeline";
  }

  if (/(employment|salaried|self employed|self-employed|business|job)/.test(normalized)) {
    return "employmentType";
  }

  if (/(eligibility check|next step|proceed)/.test(normalized)) {
    return "nextStep";
  }

  return null;
}

function hasRepetitionComplaintUtterance(utterance) {
  const text = String(utterance || "").toLowerCase();
  if (!text) return false;

  return (
    text.includes("already asked") ||
    text.includes("you asked that") ||
    text.includes("same question") ||
    text.includes("repeat") ||
    text.includes("repeating") ||
    text.includes("again and again") ||
    text.includes("bar bar") ||
    text.includes("baar baar")
  );
}

function toFiniteNumberOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function resolveExtractedSlotState(input) {
  const contextExtracted = input?.context?.extractedData || {};
  const customer = input?.customer || {};

  return {
    loanType: String(contextExtracted.loanType || customer.loanType || "").trim() || null,
    amount: toFiniteNumberOrNull(contextExtracted.amount || customer.loanAmount || null),
    timeline: String(contextExtracted.timeline || "").trim() || null,
    employmentType: String(contextExtracted.employmentType || customer.employmentType || "").trim() || null,
  };
}

function getMissingSlots(state) {
  const order = ["loanType", "amount", "timeline", "employmentType"];
  return order.filter((slot) => {
    if (slot === "amount") {
      return !Number.isFinite(Number(state.amount)) || Number(state.amount) <= 0;
    }
    return !String(state[slot] || "").trim();
  });
}

function buildSlotQuestion(slot, languageSignal) {
  if (slot === "loanType") {
    return getLanguageVariant(languageSignal, {
      english: "To guide you correctly, is this for personal, home, business, or auto loan?",
      hinglish: "Aapko sahi guide karne ke liye batayenge, personal, home, business ya auto loan chahiye?",
      hindiRoman: "Aapko sahi guide karne ke liye batayenge, personal, home, business ya auto loan chahiye?",
      hindi: "Aapko sahi guide karne ke liye batayenge, personal, home, business ya auto loan chahiye?",
      defaultText: "To guide you correctly, is this for personal, home, business, or auto loan?",
    });
  }

  if (slot === "amount") {
    return getLanguageVariant(languageSignal, {
      english: "Noted. What approximate loan amount are you planning for?",
      hinglish: "Noted ji. Approx loan amount kitni plan kar rahe hain?",
      hindiRoman: "Noted ji. Approx loan amount kitni plan kar rahe hain?",
      hindi: "Noted ji. Approx loan amount kitni plan kar rahe hain?",
      defaultText: "Noted. What approximate loan amount are you planning for?",
    });
  }

  if (slot === "timeline") {
    return getLanguageVariant(languageSignal, {
      english: "By when do you need the loan, this week, this month, or later?",
      hinglish: "Loan aapko kab tak chahiye, is week, is month, ya later?",
      hindiRoman: "Loan aapko kab tak chahiye, is week, is month, ya baad me?",
      hindi: "Loan aapko kab tak chahiye, is week, is month, ya baad me?",
      defaultText: "By when do you need the loan, this week, this month, or later?",
    });
  }

  if (slot === "employmentType") {
    return getLanguageVariant(languageSignal, {
      english: "One quick check: are you salaried or self-employed/business?",
      hinglish: "Ek quick check, aap salaried hain ya self-employed/business?",
      hindiRoman: "Ek quick check, aap salaried hain ya self-employed/business?",
      hindi: "Ek quick check, aap salaried hain ya self-employed/business?",
      defaultText: "One quick check: are you salaried or self-employed/business?",
    });
  }

  return getLanguageVariant(languageSignal, {
    english: "Should I proceed with a quick eligibility check now?",
    hinglish: "Kya main ab ek quick eligibility check proceed karun?",
    hindiRoman: "Kya main ab ek quick eligibility check proceed karun?",
    hindi: "Kya main ab ek quick eligibility check proceed karun?",
    defaultText: "Should I proceed with a quick eligibility check now?",
  });
}

function pickNextMissingSlot(state, blockedSlots = []) {
  const blocked = new Set((blockedSlots || []).map((slot) => normalizePromptSlot(slot)).filter(Boolean));
  const missing = getMissingSlots(state);
  const firstUnblocked = missing.find((slot) => !blocked.has(slot));
  return firstUnblocked || missing[0] || null;
}

function enforceProgressiveTurnReply({ reply, input, languageSignal }) {
  const latestUtterance = resolveLatestUtterance(input);
  const repetitionComplaint =
    Boolean(input?.context?.repetitionComplaint) || hasRepetitionComplaintUtterance(latestUtterance);
  const recentPromptSlots = Array.isArray(input?.context?.recentPromptSlots)
    ? input.context.recentPromptSlots.map((slot) => normalizePromptSlot(slot)).filter(Boolean)
    : [];

  const slotState = resolveExtractedSlotState(input);
  const candidateSlot = detectPromptSlotFromText(reply);
  const repeatsRecentSlot = Boolean(candidateSlot && recentPromptSlots.includes(candidateSlot));

  const asksCapturedSlot = Boolean(
    candidateSlot &&
      ((candidateSlot === "loanType" && slotState.loanType) ||
        (candidateSlot === "amount" && Number.isFinite(Number(slotState.amount)) && Number(slotState.amount) > 0) ||
        (candidateSlot === "timeline" && slotState.timeline) ||
        (candidateSlot === "employmentType" && slotState.employmentType))
  );

  if (!repetitionComplaint && !repeatsRecentSlot && !asksCapturedSlot) {
    return reply;
  }

  const nextSlot = pickNextMissingSlot(slotState, [candidateSlot, ...recentPromptSlots.slice(-2)]);
  if (nextSlot) {
    return buildSlotQuestion(nextSlot, languageSignal);
  }

  return getLanguageVariant(languageSignal, {
    english: "Thanks for confirming. I have the required details and will proceed with the next eligibility step.",
    hinglish: "Thanks ji, details mil gayi hain. Main ab next eligibility step proceed karti hoon.",
    hindiRoman: "Dhanyavaad, details mil gayi hain. Main ab next eligibility step proceed karti hoon.",
    hindi: "Dhanyavaad, details mil gayi hain. Main ab next eligibility step proceed karti hoon.",
    defaultText: "Thanks for confirming. I have the required details and will proceed with the next eligibility step.",
  });
}

function buildRuleBasedFallbackTurn(input, languageSignal) {
  const utterance = resolveLatestUtterance(input);
  if (!utterance) return null;

  const inferredIntent = inferFallbackIntentFromUtterance(utterance);
  const slotState = resolveExtractedSlotState(input);
  const recentPromptSlots = Array.isArray(input?.context?.recentPromptSlots)
    ? input.context.recentPromptSlots.map((slot) => normalizePromptSlot(slot)).filter(Boolean)
    : [];
  const repetitionComplaint =
    Boolean(input?.context?.repetitionComplaint) || hasRepetitionComplaintUtterance(utterance);

  if (inferredIntent === "not_interested") {
    return {
      reply: getLanguageVariant(languageSignal, {
        english: "Understood. I will close this here. Thank you for your time.",
        hinglish: "Theek hai ji, main call yahin close karti hoon. Thank you for your time.",
        hindiRoman: "Theek hai ji, main is call ko yahin close karti hoon. Dhanyavaad.",
        hindi: "Theek hai ji, main is call ko yahin close karti hoon. Dhanyavaad.",
        defaultText: "Understood. I will close this here. Thank you for your time.",
      }),
      shouldEnd: true,
    };
  }

  if (inferredIntent === "call_back_later") {
    return {
      reply: getLanguageVariant(languageSignal, {
        english: "Sure, no problem. I will arrange a callback at a better time. Thank you.",
        hinglish: "Sure ji, no problem. Better time par callback arrange kar dete hain. Thank you.",
        hindiRoman: "Bilkul ji, koi baat nahi. Behtar samay par callback arrange kar dete hain. Dhanyavaad.",
        hindi: "Bilkul ji, koi baat nahi. Behtar samay par callback arrange kar dete hain. Dhanyavaad.",
        defaultText: "Sure, no problem. I will arrange a callback at a better time. Thank you.",
      }),
      shouldEnd: true,
    };
  }

  if (inferredIntent === "interested") {
    const nextSlot = pickNextMissingSlot(slotState, recentPromptSlots.slice(-2));
    if (nextSlot) {
      return {
        reply: buildSlotQuestion(nextSlot, languageSignal),
        shouldEnd: false,
      };
    }

    const hasType = hasLoanTypeHint(utterance);
    const hasAmount = hasLoanAmountHint(utterance);

    if (hasType && hasAmount) {
      return {
        reply: getLanguageVariant(languageSignal, {
          english: "Great. Could you also share your monthly income and preferred EMI range?",
          hinglish: "Great ji. Please monthly income aur preferred EMI range share kar dijiye.",
          hindiRoman: "Bahut badhiya. Kripya monthly income aur preferred EMI range batayenge?",
          hindi: "Bahut badhiya. Kripya monthly income aur preferred EMI range batayenge?",
          defaultText: "Great. Could you also share your monthly income and preferred EMI range?",
        }),
        shouldEnd: false,
      };
    }

    if (hasType) {
      return {
        reply: getLanguageVariant(languageSignal, {
          english: "Great. What loan amount are you looking for, and by when do you need it?",
          hinglish: "Great. Aapko kitni loan amount chahiye, aur kab tak chahiye?",
          hindiRoman: "Bahut achha. Aapko kitni loan amount chahiye aur kab tak chahiye?",
          hindi: "Bahut achha. Aapko kitni loan amount chahiye aur kab tak chahiye?",
          defaultText: "Great. What loan amount are you looking for, and by when do you need it?",
        }),
        shouldEnd: false,
      };
    }

    if (hasAmount) {
      return {
        reply: getLanguageVariant(languageSignal, {
          english: "Understood. Is this for personal, home, business, or auto loan?",
          hinglish: "Samjha. Ye personal, home, business ya auto loan ke liye hai?",
          hindiRoman: "Samjha. Ye personal, home, business ya auto loan me se kis ke liye hai?",
          hindi: "Samjha. Ye personal, home, business ya auto loan me se kis ke liye hai?",
          defaultText: "Understood. Is this for personal, home, business, or auto loan?",
        }),
        shouldEnd: false,
      };
    }

    return {
      reply: getLanguageVariant(languageSignal, {
        english: "Happy to help. Could you share the loan type and approximate amount you need?",
        hinglish: "Sure ji. Loan type aur approx amount share kar denge?",
        hindiRoman: "Zaroor. Kripya loan type aur lagbhag amount batayenge?",
        hindi: "Zaroor. Kripya loan type aur lagbhag amount batayenge?",
        defaultText: "Happy to help. Could you share the loan type and approximate amount you need?",
      }),
      shouldEnd: false,
    };
  }

  if (repetitionComplaint) {
    const nextSlot = pickNextMissingSlot(slotState, recentPromptSlots.slice(-2));
    if (nextSlot) {
      return {
        reply: buildSlotQuestion(nextSlot, languageSignal),
        shouldEnd: false,
      };
    }
  }

  return {
    reply: getLanguageVariant(languageSignal, {
      english: "Could you please share what kind of loan you need and the approximate amount?",
      hinglish: "Please batayenge aapko kaunsa loan chahiye aur approx kitni amount chahiye?",
      hindiRoman: "Kripya batayenge ki aapko kis prakar ka loan chahiye aur lagbhag kitni amount?",
      hindi: "Kripya batayenge ki aapko kis prakar ka loan chahiye aur lagbhag kitni amount?",
      defaultText: "Could you please share what kind of loan you need and the approximate amount?",
    }),
    shouldEnd: false,
  };
}

function isGenericDialogflowFallback(reply) {
  const lower = String(reply || "").trim().toLowerCase();
  if (!lower) return true;

  return (
    lower === "sorry, could you say that again?" ||
    lower === "i didn't get that. can you say it again?" ||
    lower === "i missed that, say that again?" ||
    lower === "sorry, what was that?" ||
    lower.includes("could you say that again") ||
    lower.includes("didn't get that") ||
    lower.includes("did not get that") ||
    lower.includes("say that again") ||
    lower.includes("i missed that") ||
    lower.includes("what was that")
  );
}

async function adaptReplyToLanguage(reply, languageSignal, context = {}) {
  const baseReply = String(reply || "").trim();
  if (!baseReply) {
    return getFallbackTurnReply(languageSignal);
  }

  if (isGenericDialogflowFallback(baseReply)) {
    return getClarificationTurnReply(languageSignal);
  }

  return rewriteReplyToLanguageStrict({
    reply: baseReply,
    languageSignal,
    accessToken: context.accessToken,
    projectId: context.projectId,
  });
}

function resolveDialogflowLanguageCode(task, input, defaultCode) {
  if (task !== AI_TASKS.CALL_TURN) return defaultCode;

  const languageSignal = resolveLanguageSignal(input);
  if (languageSignal.style === LANGUAGE_STYLES.HINDI) {
    return "hi";
  }

  if (languageSignal.style === LANGUAGE_STYLES.ENGLISH) {
    return "en";
  }

  if (languageSignal.style === LANGUAGE_STYLES.HINGLISH) {
    return languageSignal.script === "devanagari" ? "hi" : "en";
  }

  return defaultCode;
}

function getFallbackTurnReply(languageSignal) {
  return getClarificationTurnReply(languageSignal);
}

async function normalizeTurnResponse(replyText, intentName, languageSignal, context = {}, input = {}) {
  const isFallbackIntent =
    Boolean(context.intentIsFallback) ||
    String(intentName || "").toLowerCase().includes("fallback");

  if (isFallbackIntent) {
    const ruleBasedTurn = buildRuleBasedFallbackTurn(input, languageSignal);
    if (ruleBasedTurn) {
      return ruleBasedTurn;
    }
  }

  const rawReply = await adaptReplyToLanguage(
    replyText || getFallbackTurnReply(languageSignal),
    languageSignal,
    context
  );
  const reply = enforceProgressiveTurnReply({
    reply: rawReply,
    input,
    languageSignal,
  });
  const lower = reply.toLowerCase();
  const normalizedIntent = String(intentName || "").trim().toLowerCase();
  const shouldEnd =
    normalizedIntent.includes("do_not_call") ||
    normalizedIntent.includes("not_interested") ||
    normalizedIntent.includes("decline") ||
    normalizedIntent.includes("converted") ||
    normalizedIntent.includes("call_back_later") ||
    normalizedIntent.includes("busy") ||
    lower.includes("thank you for your time") ||
    lower.includes("we will call you back") ||
    lower.includes("goodbye") ||
    lower.includes("not interested") ||
    lower.includes("don't call") ||
    lower.includes("dont call") ||
    lower.includes("no thanks") ||
    lower.includes("nahi chahiye") ||
    lower.includes("nhi chahiye") ||
    lower.includes("nhi lena") ||
    lower.includes("loan nahi") ||
    lower.includes("mat call") ||
    lower.includes("baad mein") ||
    lower.includes("abhi busy") ||
    lower.includes("fir se bolenge") ||
    lower.includes("kripya ek baar fir se");

  return { reply, shouldEnd };
}

function normalizeSummaryResponse(replyText, intentName) {
  const summary = String(replyText || "Transcript processed.").trim();
  return {
    summary,
    intent: String(intentName || "UNKNOWN"),
    nextAction: "Review and schedule follow-up based on intent.",
  };
}

async function invokeDialogflow({ task, input, config }) {
  const serviceAccount = getServiceAccount(config);
  if (!serviceAccount) {
    throw new Error(
      "Dialogflow credentials are missing. Configure service account JSON in provider apiKey/metadata, DIALOGFLOW_SERVICE_ACCOUNT_JSON, DIALOGFLOW_SERVICE_ACCOUNT_BASE64, or DIALOGFLOW_CLIENT_EMAIL + DIALOGFLOW_PRIVATE_KEY."
    );
  }

  const projectId = getProjectId(config, serviceAccount);
  if (!projectId) {
    throw new Error("Dialogflow project ID is missing. Set metadata.projectId, model, or DIALOGFLOW_PROJECT_ID.");
  }

  const accessToken = await getAccessToken(serviceAccount);
  const sessionId =
    String(input.customer?.id || "").trim() ||
    String(input.metadata?.sessionId || "").trim() ||
    `crm-${Date.now()}`;

  const configuredLanguageCode =
    String(config?.metadata?.languageCode || process.env.DIALOGFLOW_LANGUAGE_CODE || "en").trim() || "en";
  const languageCode = resolveDialogflowLanguageCode(task, input, configuredLanguageCode);

  const endpoint = `https://dialogflow.googleapis.com/v2/projects/${projectId}/agent/sessions/${encodeURIComponent(
    sessionId
  )}:detectIntent`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      queryInput: {
        text: {
          text: buildDialogflowInputText(task, input),
          languageCode,
        },
      },
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || "Dialogflow detectIntent failed.");
  }

  const queryResult = data?.queryResult || {};
  const fulfillmentText = queryResult.fulfillmentText || "";
  const intent = queryResult?.intent || {};
  const intentName = intent.displayName || "UNKNOWN";
  const intentIsFallback = Boolean(intent.isFallback) || String(intentName).toLowerCase().includes("fallback");

  if (task === AI_TASKS.CALL_SCRIPT) {
    return { script: String(fulfillmentText || "").trim() };
  }

  if (task === AI_TASKS.CALL_SUMMARY) {
    return normalizeSummaryResponse(fulfillmentText, intentName);
  }

  if (task === AI_TASKS.CALL_TURN) {
    return normalizeTurnResponse(
      fulfillmentText,
      intentName,
      resolveLanguageSignal(input),
      {
        accessToken,
        projectId,
        intentIsFallback,
      },
      input
    );
  }

  throw new Error(`Dialogflow does not support task: ${task}`);
}

export function createDialogflowEngine() {
  return createEngineAdapter({
    id: "dialogflow-engine",
    supportedTasks: [AI_TASKS.CALL_SCRIPT, AI_TASKS.CALL_SUMMARY, AI_TASKS.CALL_TURN],
    invoke: invokeDialogflow,
  });
}
