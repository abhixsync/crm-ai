import { canonicalizeIntent } from "@/lib/journey/intent-normalization";

export const CRM_EVENT_ACTIONS = Object.freeze({
  TRIGGER_WHATSAPP: "TRIGGER_WHATSAPP",
  TRIGGER_EMAIL: "TRIGGER_EMAIL",
  BOOK_APPOINTMENT: "BOOK_APPOINTMENT",
  CALLBACK_REQUESTED: "CALLBACK_REQUESTED",
  NOT_INTERESTED: "NOT_INTERESTED",
  CONTINUE_DISCUSSION: "CONTINUE_DISCUSSION",
});

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function includesAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

function clampScore(score) {
  if (!Number.isFinite(Number(score))) return 0;
  return Math.max(0, Math.min(100, Math.round(Number(score))));
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getBaseScoreFromIntent(intent) {
  if (intent === "converted") return 85;
  if (intent === "interested") return 62;
  if (intent === "follow_up") return 52;
  if (intent === "call_back_later") return 48;
  if (intent === "not_interested") return 10;
  if (intent === "do_not_call") return 0;
  return 35;
}

export function extractLatestCustomerUtterance(transcript) {
  const lines = String(transcript || "")
    .split(/\r?\n/)
    .map((line) => String(line || "").trim())
    .filter(Boolean);

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    const customerPrefixed = line.match(/^customer\s*:\s*(.+)$/i);
    if (customerPrefixed?.[1]) {
      return customerPrefixed[1].trim();
    }
  }

  return "";
}

function buildSignals(text) {
  const detailsPatterns = [
    /\b(details?|tell me more|explain|information|info|process)\b/i,
    /\bpricing|price|cost|features?|benefits?\b/i,
    /\bhow to proceed|how do i proceed|how to start|what next|next step\b/i,
    /\binterested|sounds good|looks good|want to know\b/i,
  ];

  const whatsappPatterns = [
    /\bwhatsapp\b/i,
    /\bwa\b/i,
    /\bsend (it|details?|info(?:rmation)?) on whatsapp\b/i,
    /\bshare (it|details?|info(?:rmation)?) on whatsapp\b/i,
  ];

  const emailPatterns = [
    /\bemail\b/i,
    /\bmail\b/i,
    /\bbrochure\b/i,
    /\bproposal\b/i,
    /\bdocument(?:ation)?\b/i,
    /\bsend (it|details?|info(?:rmation)?) (over |by )?email\b/i,
  ];

  const appointmentPatterns = [
    /\bbook\b.*\b(meeting|demo|appointment|call)\b/i,
    /\bschedule\b.*\b(meeting|demo|appointment|call)\b/i,
    /\bmeeting\b/i,
    /\bdemo\b/i,
    /\bappointment\b/i,
  ];

  const callbackPatterns = [
    /\bcall back\b/i,
    /\bcallback\b/i,
    /\blater\b/i,
    /\bafter some time\b/i,
    /\bcall me tomorrow\b/i,
    /\bcall me later\b/i,
    /\bnot free now\b/i,
    /\bbusy\b/i,
  ];

  const declinePatterns = [
    /\bnot interested\b/i,
    /\bno interest\b/i,
    /\bno thanks\b/i,
    /\bdon'?t need\b/i,
    /\bnahi chahiye\b/i,
    /\bnhi chahiye\b/i,
    /\bdo not call\b/i,
    /\bdon'?t call\b/i,
    /\bstop calling\b/i,
    /\breject\b/i,
  ];

  const unsurePatterns = [
    /\bnot sure\b/i,
    /\bmaybe\b/i,
    /\bi will think\b/i,
    /\bneed to think\b/i,
    /\blater maybe\b/i,
    /\bunsure\b/i,
  ];

  const endingPatterns = [
    /\bbye\b/i,
    /\bgoodbye\b/i,
    /\bhang up\b/i,
    /\bend call\b/i,
    /\bthanks that'?s all\b/i,
  ];

  return {
    asksDetails: includesAny(text, detailsPatterns),
    asksWhatsApp: includesAny(text, whatsappPatterns),
    asksEmail: includesAny(text, emailPatterns),
    asksAppointment: includesAny(text, appointmentPatterns),
    asksCallback: includesAny(text, callbackPatterns),
    declines: includesAny(text, declinePatterns),
    unsure: includesAny(text, unsurePatterns),
    endingCall: includesAny(text, endingPatterns),
  };
}

function deriveInterestBand(score) {
  if (score <= 20) return "rejected";
  if (score <= 40) return "unsure";
  if (score <= 60) return "curious";
  if (score <= 80) return "interested";
  return "ready_to_proceed";
}

function intentFromAction(action, fallbackIntent) {
  if (action === CRM_EVENT_ACTIONS.NOT_INTERESTED) return "not_interested";
  if (action === CRM_EVENT_ACTIONS.CALLBACK_REQUESTED) return "call_back_later";
  if (action === CRM_EVENT_ACTIONS.BOOK_APPOINTMENT) return "follow_up";
  if (action === CRM_EVENT_ACTIONS.TRIGGER_WHATSAPP || action === CRM_EVENT_ACTIONS.TRIGGER_EMAIL) {
    return "interested";
  }
  return fallbackIntent || "neutral";
}

function nextActionFromDecision(action) {
  if (action === CRM_EVENT_ACTIONS.TRIGGER_WHATSAPP) {
    return "Send interested customer details on WhatsApp.";
  }

  if (action === CRM_EVENT_ACTIONS.TRIGGER_EMAIL) {
    return "Send requested brochure/proposal by email.";
  }

  if (action === CRM_EVENT_ACTIONS.BOOK_APPOINTMENT) {
    return "Book a demo/meeting appointment with the customer.";
  }

  if (action === CRM_EVENT_ACTIONS.CALLBACK_REQUESTED) {
    return "Schedule a callback at the requested time.";
  }

  if (action === CRM_EVENT_ACTIONS.NOT_INTERESTED) {
    return "Mark customer as not interested and close follow-up.";
  }

  return "Continue discovery and gather one missing requirement.";
}

export function evaluateCrmEventDecision({ transcript, latestCustomerMessage, intent, summary, metadata } = {}) {
  const normalizedIntent = canonicalizeIntent(intent) || "neutral";
  const latestUtterance = String(latestCustomerMessage || extractLatestCustomerUtterance(transcript) || "").trim();
  const fullText = normalizeText([
    latestUtterance,
    summary,
    transcript,
    isPlainObject(metadata) ? JSON.stringify(metadata) : "",
  ].join(" "));

  const signals = buildSignals(fullText);

  let interestScore = getBaseScoreFromIntent(normalizedIntent);

  if (signals.asksDetails) interestScore += 18;
  if (signals.asksWhatsApp) interestScore += 15;
  if (signals.asksEmail) interestScore += 15;
  if (signals.asksAppointment) interestScore += 24;
  if (signals.asksCallback) interestScore += 8;

  if (signals.unsure) interestScore -= 18;
  if (signals.endingCall) interestScore -= 22;
  if (signals.declines) interestScore -= 70;

  if (normalizedIntent === "interested") interestScore += 8;
  if (normalizedIntent === "converted") interestScore += 10;
  if (normalizedIntent === "call_back_later") interestScore -= 6;
  if (normalizedIntent === "not_interested" || normalizedIntent === "do_not_call") interestScore -= 40;

  interestScore = clampScore(interestScore);
  const interestBand = deriveInterestBand(interestScore);

  const hasHardStop =
    signals.declines ||
    normalizedIntent === "not_interested" ||
    normalizedIntent === "do_not_call";
  const isUnsureOrEnding = signals.unsure || signals.endingCall;
  const isInterested = interestScore >= 60 && !hasHardStop && !isUnsureOrEnding;

  let action = CRM_EVENT_ACTIONS.CONTINUE_DISCUSSION;

  if (hasHardStop || interestScore <= 30) {
    action = CRM_EVENT_ACTIONS.NOT_INTERESTED;
  } else if (signals.asksCallback || normalizedIntent === "call_back_later") {
    action = CRM_EVENT_ACTIONS.CALLBACK_REQUESTED;
  } else if (signals.asksAppointment && interestScore >= 75) {
    action = CRM_EVENT_ACTIONS.BOOK_APPOINTMENT;
  } else if (signals.asksEmail && isInterested) {
    action = CRM_EVENT_ACTIONS.TRIGGER_EMAIL;
  } else if (signals.asksWhatsApp && isInterested) {
    action = CRM_EVENT_ACTIONS.TRIGGER_WHATSAPP;
  } else if (interestScore >= 40 && interestScore <= 59) {
    action = CRM_EVENT_ACTIONS.CALLBACK_REQUESTED;
  }

  const resolvedIntent = intentFromAction(action, normalizedIntent);

  return {
    action,
    normalizedIntent: resolvedIntent,
    interestScore,
    interestBand,
    isInterested,
    latestCustomerUtterance: latestUtterance || null,
    triggers: {
      whatsapp: action === CRM_EVENT_ACTIONS.TRIGGER_WHATSAPP,
      email: action === CRM_EVENT_ACTIONS.TRIGGER_EMAIL,
      appointment: action === CRM_EVENT_ACTIONS.BOOK_APPOINTMENT,
      callback: action === CRM_EVENT_ACTIONS.CALLBACK_REQUESTED,
      notInterested: action === CRM_EVENT_ACTIONS.NOT_INTERESTED,
    },
    recommendedNextAction: nextActionFromDecision(action),
    signals,
  };
}
