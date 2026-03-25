/**
 * Intent Detection Utility
 * Analyzes customer responses to determine conversation intent
 */

import {
  INTENT_TYPES,
  CONVERSATION_STAGES,
  EMPLOYMENT_TYPES,
  LOAN_TYPES,
} from './system-prompt.js';

function normalizeAfterTime(hour, minute, meridiem) {
  const normalizedHour = String(Number.parseInt(hour, 10));
  const normalizedMinute = minute ? `:${String(minute).padStart(2, '0')}` : '';
  const normalizedMeridiem = meridiem ? ` ${String(meridiem).toLowerCase()}` : '';
  return `after ${normalizedHour}${normalizedMinute}${normalizedMeridiem}`;
}

function extractAfterTimePreference(message) {
  const patterns = [
    /\b(?:after|post)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i,
    /\b(\d{1,2})(?::(\d{2}))?\s*(?:baje?)?\s*(?:ke baad|k baad)\b/i,
    /(\d{1,2})(?::(\d{2}))?\s*(?:बजे)?\s*के\s*बाद/i,
  ];

  for (const pattern of patterns) {
    const match = String(message || '').match(pattern);
    if (match) {
      return normalizeAfterTime(match[1], match[2], match[3]);
    }
  }

  return null;
}

export function detectCallbackPreference(customerMessage) {
  const message = String(customerMessage || '').toLowerCase().trim();
  if (!message) {
    return null;
  }

  const afterTimePreference = extractAfterTimePreference(message);
  if (afterTimePreference) {
    return {
      callbackTime: afterTimePreference,
      reason: 'specific_time_callback',
    };
  }

  const lateTimingPatterns = [
    'quite late',
    'too late',
    "it's quite late",
    'it is quite late',
    'late for a call',
    'raat ho gayi',
    'abhi late ho gaya',
    'bahut late ho gaya',
    'काफ़ी देर हो गई',
    'काफी देर हो गई',
    'बहुत देर हो गई',
    'रात हो गई',
  ];
  if (lateTimingPatterns.some((pattern) => message.includes(pattern))) {
    return {
      callbackTime: 'tomorrow morning',
      reason: 'late_timing',
    };
  }

  const morningPatterns = [
    'tomorrow morning',
    'call in the morning',
    'morning please',
    'not now morning please',
    'call me in the morning',
    'call me tomorrow morning',
    'kal subah',
    'subah call karna',
    'subah mein call karna',
    'subah me call karna',
    'subah phone karna',
    'subah baat karna',
    'कल सुबह',
    'सुबह कॉल करना',
    'सुबह call करना',
    'सुबह बात करना',
  ];
  if (morningPatterns.some((pattern) => message.includes(pattern))) {
    return {
      callbackTime: 'tomorrow morning',
      reason: 'morning_callback',
    };
  }

  const eveningPatterns = [
    'tomorrow evening',
    'call in the evening',
    'evening please',
    'call me tomorrow evening',
    'shaam mein call karna',
    'shaam me call karna',
    'sham mein call karna',
    'sham me call karna',
    'kal shaam',
    'shaam ko call karna',
    'कल शाम',
    'शाम में कॉल करना',
    'शाम को कॉल करना',
    'शाम में बात करना',
  ];
  if (eveningPatterns.some((pattern) => message.includes(pattern))) {
    return {
      callbackTime: 'tomorrow evening',
      reason: 'evening_callback',
    };
  }

  const genericCallbackPatterns = [
    'busy',
    'later',
    'later call',
    'call back',
    'callback',
    'call later',
    'call me later',
    'abhi convenient nahi',
    'abhi time nahi',
    'abhi nahi',
    'baad mein',
    'baad me',
    'phir call karna',
    'dobara call karna',
    'फिर कॉल करना',
    'बाद में कॉल करना',
    'अभी नहीं',
  ];
  if (genericCallbackPatterns.some((pattern) => message.includes(pattern))) {
    return {
      callbackTime: 'later',
      reason: 'generic_callback',
    };
  }

  return null;
}

/**
 * Detect intent from customer message
 */
export function detectIntent(customerMessage, conversationHistory = []) {
  if (!customerMessage || typeof customerMessage !== 'string') {
    return {
      intent: INTENT_TYPES.NEUTRAL,
      confidence: 0.5,
      details: {},
    };
  }

  const message = customerMessage.toLowerCase().trim();
  const hasInterestedWord =
    message.includes("interest") ||
    /\b(interested|interetsed|intrested|interestd|intrsted)\b/.test(message);
  const hasNotInterestedPhrase =
    message.includes("not interested") ||
    /\bnot\s+(interested|interetsed|intrested|interestd|intrsted)\b/.test(message);
  const hasAmountSignal =
    /\b\d{2,}\b/.test(message) ||
    /\b(amount|lakh|lac|thousand|k|rupees|rs)\b/.test(message);
  const hasLoanTypeSignal =
    /\b(personal|home|business|working capital|auto|car|bt|balance transfer|refinance)\b/.test(message);
  const hasTimelineSignal =
    /\b(week|month|quarter|immediate|asap|today|tomorrow|by tomorrow|turant|kal)\b/.test(message);
  const hasStructuredLoanSignal = hasLoanTypeSignal || hasAmountSignal || hasTimelineSignal;
  const hasProceedConfirmation =
    message.includes('theek hai') ||
    message.includes('thik hai') ||
    message.includes('thik h') ||
    message.includes('theek h') ||
    message.includes('kar lete hain') ||
    message.includes('kar lete h') ||
    message.includes('kar lete') ||
    message.includes('kar lenge') ||
    message.includes('kar dete hain') ||
    message.includes('kar dete h') ||
    message.includes('kar do') ||
    message.includes('kara do') ||
    message.includes('kardo') ||
    message.includes('karado') ||
    message.includes('kar dena') ||
    message.includes('kara dena') ||
    message.includes('kara dijiye') ||
    message.includes('karwa do') ||
    message.includes('karwa dijiye') ||
    message.includes('go ahead') ||
    message.includes('lets do') ||
    message.includes("let's do") ||
    message.includes('please do') ||
    message.includes('do that') ||
    message.includes('do it') ||
    message.includes('proceed') ||
    message.includes('continue') ||
    message.includes('available now') ||
    message.includes('i am available') ||
    message.includes('abhi baat kar sakte') ||
    message.includes('abhi baat kar sakta') ||
    message.includes('abhi free hoon');
  const hasLoanDeclineContext =
    message.includes("loan") ||
    message.includes("interest") ||
    message.includes("chahiye") ||
    message.includes("lena");
  const callbackPreference = detectCallbackPreference(message);

  // DO NOT CALL keywords (highest priority)
  if (
    message.includes("don't call") ||
    message.includes("dont call") ||
    message.includes("mat call karna") ||
    message.includes("remove my number") ||
    message.includes("ye harassment") ||
    message.includes("harassment") ||
    message.includes("stop calling") ||
    message.includes("dont call back")
  ) {
    return {
      intent: INTENT_TYPES.DO_NOT_CALL,
      confidence: 1.0,
      details: { reason: 'Customer explicitly asked not to be called' },
    };
  }

  // NOT INTERESTED keywords (high priority, before neutral/interested)
  // Guard: if the message contains a BT/balance-transfer signal OR a "but"/"lekin"/"magar"
  // contrasting clause after a negative phrase, the customer is redirecting — not declining.
  const hasBtSignal =
    /\bbt\b/.test(message) ||
    message.includes('balance transfer') ||
    message.includes('refinance') ||
    (message.includes('transfer') && (message.includes('loan') || message.includes('existing')));
  const hasContrastClause =
    /\b(but|lekin|magar|par|parantu|however)\b/.test(message) &&
    (message.includes('haan') ||
      message.includes('han') ||
      message.includes('yes') ||
      message.includes('hai') ||
      message.includes('chahiye') ||
      message.includes('existing') ||
      message.includes('already') ||
      message.includes('ek'));

  const hasOverridingPositiveContext = hasBtSignal || hasContrastClause;

  if (
    !hasOverridingPositiveContext &&
    (hasNotInterestedPhrase ||
    message.includes("interested nahi") ||
    message.includes("chahiye nahi") ||
    message.includes("nhi chahiye") ||
    message.includes("mujhe nahi chahiye") ||
    message.includes("no thanks") ||
    message.includes("koi zaroorat nahi") ||
    (message.includes("abhi nahi") && !callbackPreference) ||
    message.includes("loan nahi") ||
    message.includes("nahi chahiye") ||
    message.includes("dont need") ||
    message.includes("don't need") ||
    message.includes("zaroorat nahi") ||
    message.includes("zarurat nahi") ||
    message.includes("zaroorat nhi") ||
    message.includes("zarurat nhi") ||
    message.includes("jarurat nahi") ||
    message.includes("jarurat nhi") ||
    message.includes("jrurt nhi") ||
    message.includes("jrurat nhi") ||
    message.includes("interest nahi") ||
    message.includes("nhi lena") ||
    message.includes("nahi lu") ||
    message.includes("nhi lu") ||
    message.includes("na hi lu") ||
    message.includes("nahi lunga") ||
    message.includes("nhi lunga") ||
    message.includes("na lunga") ||
    (message.includes("nhi ") && hasLoanDeclineContext) ||
    (/\b(nahi|nahin|nhi)\b/.test(message) && hasLoanDeclineContext))
  ) {
    return {
      intent: INTENT_TYPES.NOT_INTERESTED,
      confidence: 0.95,
      details: { reason: 'Customer expressed no interest' },
    };
  }

  // Customer declined fresh loan but has a BT/balance transfer need
  if (hasBtSignal) {
    return {
      intent: INTENT_TYPES.INTERESTED,
      confidence: 0.85,
      details: { reason: 'Customer interested in balance transfer' },
    };
  }

  if (callbackPreference) {
    return {
      intent: INTENT_TYPES.CALL_BACK_LATER,
      confidence: 0.85,
      details: {
        reason: 'Customer is busy and wants callback',
        callbackTime: callbackPreference.callbackTime,
      },
    };
  }

  // CONFUSED / SKEPTICAL (customer did not understand, questions the call, or sounds confused)
  const hasConfusionPhrase =
    message.includes('samajh nahi') ||
    message.includes('samajh nhi') ||
    message.includes('smjha nhi') ||
    message.includes('smjh nhi') ||
    message.includes('smjha nahi') ||
    message.includes('smjh nahi') ||
    message.includes('samjha nahi') ||
    message.includes('samjha nhi') ||
    message.includes('kya bol rahi') ||
    message.includes('kya bol raha') ||
    message.includes('kya baat kar rahi') ||
    message.includes('kya baat kr rhi') ||
    message.includes('kis trah ki baat') ||
    message.includes('kis tarah ki baat') ||
    message.includes('kya matlab') ||
    message.includes('matlab kya') ||
    message.includes('i dont understand') ||
    message.includes("i don't understand") ||
    message.includes('what do you mean') ||
    message.includes('what are you saying') ||
    message.includes('confused') ||
    message.includes('not clear') ||
    message.includes('clear nahi') ||
    message.includes('clear nhi') ||
    message.includes('kuch samajh nahi') ||
    message.includes('kuch smjh nhi') ||
    message.includes('pata nahi kya') ||
    message.includes('ye kya hai') ||
    message.includes('ye kya h');

  if (hasConfusionPhrase && !hasNotInterestedPhrase) {
    return {
      intent: INTENT_TYPES.CONFUSED,
      confidence: 0.85,
      details: { reason: 'Customer sounds confused or did not understand' },
    };
  }

  // CONVERTED (strong interest + key details)
  if (
    (message.includes("yes") ||
      message.includes("haan") ||
      message.includes("bilkul") ||
      message.includes("interest hai") ||
      hasInterestedWord) &&
    hasAmountSignal
  ) {
    return {
      intent: INTENT_TYPES.CONVERTED,
      confidence: 0.8,
      details: { reason: 'Customer expressed strong interest with details' },
    };
  }

  // INTERESTED (showing interest)
  if (
    message.includes("yes") ||
    message.includes("haan") ||
    /\bhan\b/.test(message) ||
    hasProceedConfirmation ||
    /\bsure\b/.test(message) ||
    hasInterestedWord ||
    message.includes("bilkul") ||
    message.includes("chalega") ||
    /\bok\b/.test(message) ||
    message.includes("batao") ||
    message.includes("bataye") ||
    message.includes("batayiye") ||
    message.includes("samjhao") ||
    message.includes("smjhao") ||
    message.includes("samjhaiye") ||
    message.includes("smjhaiye") ||
    message.includes("samjhane") ||
    message.includes("smjhane") ||
    message.includes("batao na") ||
    message.includes("tell me more") ||
    message.includes("details") ||
    message.includes("tell me details") ||
    message.includes("emi") ||
    message.includes("interest rate") ||
    /\b(maximum|max)\b/.test(message)
  ) {
    return {
      intent: INTENT_TYPES.INTERESTED,
      confidence: 0.75,
      details: { reason: 'Customer showing interest' },
    };
  }

  // In voice calls, customers often reply with short structured details only.
  if (hasStructuredLoanSignal) {
    return {
      intent: INTENT_TYPES.INTERESTED,
      confidence: 0.72,
      details: { reason: 'Customer provided structured loan details' },
    };
  }

  return {
    intent: INTENT_TYPES.NEUTRAL,
    confidence: 0.5,
    details: { reason: 'Neutral response' },
  };
}

/**
 * Extract loan details from message
 */
export function extractLoanDetails(message) {
  const details = {
    loanType: null,
    amount: null,
    timeline: null,
  };

  if (!message) return details;

  const lowerMsg = message.toLowerCase();
  const normalizedMsg = lowerMsg
    // Common speech-to-text variants for "lakh/lac"
    .replace(/\blegs?\b/g, 'lakh')
    .replace(/\blacks?\b/g, 'lakh')
    .replace(/\blacs?\b/g, 'lakh')
    .replace(/\blakhs?\b/g, 'lakh')
    .replace(/\blaks?\b/g, 'lakh');

  // Detect loan type
  // Balance transfer checked first — customer may say "personal loan...BT karana h"
  // and BT intent should take priority over the generic loan type.
  // Also catches rate-reduction phrases like "interest km karana h" / "uska interest km ho skta h".
  if (
    lowerMsg.includes('balance transfer') ||
    lowerMsg.includes('bt loan') ||
    /\bbt\b/.test(lowerMsg) ||
    lowerMsg.includes('refinanc') ||
    (lowerMsg.includes('transfer') && (lowerMsg.includes('loan') || lowerMsg.includes('existing'))) ||
    lowerMsg.includes('interest km') ||
    lowerMsg.includes('interest rate km') ||
    lowerMsg.includes('rate km') ||
    lowerMsg.includes('rate reduce') ||
    lowerMsg.includes('interest reduce') ||
    lowerMsg.includes('interest lower') ||
    (lowerMsg.includes('existing') && lowerMsg.includes('loan') && lowerMsg.includes('interest')) ||
    (lowerMsg.includes('purana') && lowerMsg.includes('loan') && lowerMsg.includes('interest')) ||
    (lowerMsg.includes('interest') && (lowerMsg.includes('kum') || lowerMsg.includes('ghata')))
  ) {
    details.loanType = LOAN_TYPES.BALANCE_TRANSFER;
  } else if (lowerMsg.includes('personal')) {
    details.loanType = LOAN_TYPES.PERSONAL;
  } else if (lowerMsg.includes('home')) {
    details.loanType = LOAN_TYPES.HOME;
  } else if (
    lowerMsg.includes('business') ||
    lowerMsg.includes('working capital')
  ) {
    details.loanType = LOAN_TYPES.BUSINESS;
  } else if (lowerMsg.includes('auto') || lowerMsg.includes('car')) {
    details.loanType = LOAN_TYPES.AUTO;
  }

  // Extract amount from common Indian spoken formats (e.g., "50 lakh", "7 cr", "25000 rs").
  const amountMatch = normalizedMsg.match(
    /(\d+(?:,\d{3})*(?:\.\d+)?)\s*(?:crore|cr|lakh|thousand|k|rupees|rs)\b/i
  );
  if (amountMatch) {
    const num = Number.parseFloat(amountMatch[1].replace(/,/g, ''));
    const unit = amountMatch[0].toLowerCase();

    if (Number.isFinite(num)) {
      if (unit.includes('crore') || unit.includes('cr')) {
        details.amount = Math.round(num * 10000000);
      } else if (unit.includes('lakh')) {
        details.amount = Math.round(num * 100000);
      } else if (unit.includes('thousand') || unit.includes('k')) {
        details.amount = Math.round(num * 1000);
      } else {
        details.amount = Math.round(num);
      }
    }
  } else {
    // Fallback: capture plain numeric amount after words like "amount is".
    const fallbackAmountMatch = normalizedMsg.match(
      /(?:amount|loan|requirement)\s*(?:is|of|around|about|approx(?:imately)?)?\s*(\d+(?:,\d{3})*(?:\.\d+)?)/i
    );

    if (fallbackAmountMatch) {
      const num = Number.parseFloat(fallbackAmountMatch[1].replace(/,/g, ''));
      if (Number.isFinite(num)) {
        details.amount = Math.round(num);
      }
    }

    // Secondary fallback: standalone rupee-like number (e.g., "50000, today").
    if (!details.amount) {
      const numericTokens = normalizedMsg.match(/\d[\d,]{4,11}/g) || [];
      for (const token of numericTokens) {
        const digits = String(token || '').replace(/,/g, '');
        if (!/^\d+$/.test(digits)) {
          continue;
        }

        // Ignore likely phone numbers (10+ digits) and too-small values.
        if (digits.length < 5 || digits.length > 9) {
          continue;
        }

        const parsedAmount = Number.parseInt(digits, 10);
        if (Number.isFinite(parsedAmount) && parsedAmount >= 10000) {
          details.amount = parsedAmount;
          break;
        }
      }
    }
  }

  // Extract timeline
  if (
    lowerMsg.includes('immediately') ||
    lowerMsg.includes('turant') ||
    lowerMsg.includes('asap') ||
    lowerMsg.includes('today') ||
    lowerMsg.includes('kal hi') ||
    lowerMsg.includes('tomorrow') ||
    lowerMsg.includes('by tomorrow') ||
    lowerMsg.includes('kal tak')
  ) {
    details.timeline = 'immediate';
  } else if (
    /\b(?:one|1|this|next)?\s*week\b/.test(lowerMsg) ||
    lowerMsg.includes('within week') ||
    lowerMsg.includes('7 day')
  ) {
    details.timeline = 'within_week';
  } else if (lowerMsg.includes('month')) {
    details.timeline = 'within_month';
  } else if (lowerMsg.includes('quarter') || lowerMsg.includes('3 month')) {
    details.timeline = 'within_quarter';
  }

  return details;
}

/**
 * Detect employment type from message
 */
export function detectEmploymentType(message) {
  if (!message) return null;

  const lowerMsg = message.toLowerCase();

  if (
    lowerMsg.includes('salaried') ||
    lowerMsg.includes('salary') ||
    lowerMsg.includes('company') ||
    lowerMsg.includes('job')
  ) {
    return EMPLOYMENT_TYPES.SALARIED;
  }

  if (
    lowerMsg.includes('business') ||
    lowerMsg.includes('running business') ||
    lowerMsg.includes('shopkeeper')
  ) {
    return EMPLOYMENT_TYPES.BUSINESS;
  }

  if (
    lowerMsg.includes('self-employed') ||
    lowerMsg.includes('self employed') ||
    lowerMsg.includes('apna kaam')
  ) {
    return EMPLOYMENT_TYPES.SELF_EMPLOYED;
  }

  if (
    lowerMsg.includes('freelancer') ||
    lowerMsg.includes('consultant') ||
    lowerMsg.includes('contractor')
  ) {
    return EMPLOYMENT_TYPES.FREELANCER;
  }

  return null;
}

/**
 * Determine next conversation stage
 */
export function determineNextStage(currentStage, intent, extractedData) {
  // If customer doesn't want to talk, end
  if (
    intent === INTENT_TYPES.DO_NOT_CALL ||
    intent === INTENT_TYPES.NOT_INTERESTED
  ) {
    return CONVERSATION_STAGES.CLOSING;
  }

  // If callback needed, also close
  if (intent === INTENT_TYPES.CALL_BACK_LATER) {
    return CONVERSATION_STAGES.CLOSING;
  }

  // If converted, end with closing
  if (intent === INTENT_TYPES.CONVERTED) {
    if (extractedData?.loanType && extractedData?.amount) {
      return CONVERSATION_STAGES.CLOSING;
    }
    intent = INTENT_TYPES.INTERESTED;
  }

  // Progress through stages
  switch (currentStage) {
    case CONVERSATION_STAGES.OPENING:
      return CONVERSATION_STAGES.DISCOVERY;

    case CONVERSATION_STAGES.DISCOVERY:
      if (intent === INTENT_TYPES.INTERESTED) {
        return CONVERSATION_STAGES.PITCH;
      }
      return CONVERSATION_STAGES.DISCOVERY;

    case CONVERSATION_STAGES.PITCH:
      if (extractedData?.loanType || extractedData?.amount) {
        return CONVERSATION_STAGES.QUALIFICATION;
      }
      return CONVERSATION_STAGES.PITCH;

    case CONVERSATION_STAGES.QUALIFICATION:
      if (extractedData?.loanType && extractedData?.amount) {
        return CONVERSATION_STAGES.CLOSING;
      }
      return CONVERSATION_STAGES.QUALIFICATION;

    case CONVERSATION_STAGES.CLOSING:
      return CONVERSATION_STAGES.CLOSING;

    default:
      return CONVERSATION_STAGES.OPENING;
  }
}

/**
 * Merge LLM-based and regex-based intent classification.
 * LLM intent is primary; regex overrides only for safety-critical cases.
 */
export function mergeIntentSources(llmIntent, regexResult) {
  const llm = String(llmIntent || "").trim().toLowerCase();
  const regex = regexResult || {};
  const regexIntent = String(regex.intent || "").trim().toLowerCase();

  // Safety override: regex DO_NOT_CALL always wins (explicit keywords are reliable)
  if (regexIntent === "do_not_call" && regex.confidence >= 0.9) {
    return { intent: "do_not_call", confidence: 1.0, source: "regex_safety_override" };
  }

  // If LLM provided a valid intent, use it
  if (llm && llm !== "unknown" && llm !== "neutral") {
    return { intent: llm, confidence: 0.85, source: "llm" };
  }

  // If LLM said neutral but regex found something specific, prefer regex
  if (regexIntent && regexIntent !== "neutral" && regexIntent !== "unknown") {
    return { intent: regexIntent, confidence: regex.confidence || 0.7, source: "regex_fallback" };
  }

  // Both agree on neutral
  return { intent: llm || regexIntent || "neutral", confidence: 0.5, source: "default" };
}
