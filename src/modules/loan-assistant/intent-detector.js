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
    /\b(personal|home|business|working capital|auto|car)\b/.test(message);
  const hasTimelineSignal =
    /\b(week|month|quarter|immediate|asap|today|turant|kal)\b/.test(message);
  const hasStructuredLoanSignal = hasLoanTypeSignal || hasAmountSignal || hasTimelineSignal;
  const hasLoanDeclineContext =
    message.includes("loan") ||
    message.includes("interest") ||
    message.includes("chahiye") ||
    message.includes("lena");

  // DO NOT CALL keywords (highest priority)
  if (
    message.includes("don't call") ||
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
  if (
    hasNotInterestedPhrase ||
    message.includes("interested nahi") ||
    message.includes("chahiye nahi") ||
    message.includes("nhi chahiye") ||
    message.includes("mujhe nahi chahiye") ||
    message.includes("no thanks") ||
    message.includes("koi zaroorat nahi") ||
    message.includes("abhi nahi") ||
    message.includes("loan nahi") ||
    message.includes("nahi chahiye") ||
    message.includes("dont need") ||
    message.includes("don't need") ||
    message.includes("zaroorat nahi") ||
    message.includes("interest nahi") ||
    message.includes("nhi lena") ||
    (message.includes("nhi ") && hasLoanDeclineContext) ||
    (/\b(nahi|nahin|nhi)\b/.test(message) && hasLoanDeclineContext)
  ) {
    return {
      intent: INTENT_TYPES.NOT_INTERESTED,
      confidence: 0.95,
      details: { reason: 'Customer expressed no interest' },
    };
  }

  // BUSY / CALLBACK LATER
  if (
    message.includes("busy") ||
    message.includes("later") ||
    message.includes("later call") ||
    message.includes("call back") ||
    message.includes("abhi convenient nahi") ||
    message.includes("abhi time nahi") ||
    message.includes("baad mein")
  ) {
    return {
      intent: INTENT_TYPES.CALL_BACK_LATER,
      confidence: 0.85,
      details: { reason: 'Customer is busy and wants callback' },
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
    /\bsure\b/.test(message) ||
    hasInterestedWord ||
    message.includes("bilkul") ||
    message.includes("chalega") ||
    message.includes("ok") ||
    message.includes("think about it") ||
    message.includes("batao na") ||
    message.includes("tell me more") ||
    message.includes("details") ||
    message.includes("tell me details") ||
    message.includes("emi") ||
    message.includes("interest rate")
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
  if (lowerMsg.includes('personal')) {
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
    lowerMsg.includes('kal hi')
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
