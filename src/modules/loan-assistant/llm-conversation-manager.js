/**
 * LLM-Powered Loan Assistant Conversation Manager
 * Uses provider router so active provider from AI Providers table is honored.
 */

import { CONVERSATION_STAGES } from './system-prompt.js';
import {
  detectIntent,
  detectCallbackPreference,
  detectEmploymentType,
  extractLoanDetails,
} from './intent-detector.js';
import { runAIWithFailover } from '@/lib/ai/provider-router';
import {
  detectLanguagePreferenceCommand,
  detectLanguageStyleFromText,
  getLanguageMirroringInstruction,
  getLanguageStyleLabel,
  LANGUAGE_STYLES,
  normalizeLanguageSignal,
} from '@/lib/ai/language-style';

const END_INTENTS = new Set([
  'do_not_call',
  'not_interested',
  'busy',
  'call_back_later',
]);

function normalizeProviderIntent(rawIntent) {
  const text = String(rawIntent || '').trim().toLowerCase();
  if (!text) return 'neutral';

  if (text.includes('do_not_call') || text.includes('dont_call') || text.includes('stop_call')) {
    return 'do_not_call';
  }
  if (text.includes('not_interested') || text.includes('not interested') || text.includes('declin')) {
    return 'not_interested';
  }
  if (text.includes('call_back_later') || text.includes('call back') || text.includes('callback') || text.includes('later')) {
    return 'call_back_later';
  }
  if (text.includes('busy')) return 'busy';
  if (text.includes('converted') || text.includes('qualified') || text.includes('booked')) return 'converted';
  if (text.includes('interested') || text.includes('positive')) return 'interested';

  return 'neutral';
}

function normalizeConfidence(value, fallback = 0.5) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed < 0) return 0;
  if (parsed > 1) return 1;
  return parsed;
}

function toFiniteNumberOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatPhoneForSpeech(phoneNumber) {
  const raw = String(phoneNumber || '').trim();
  if (!raw) return '';

  const hasPlusPrefix = raw.startsWith('+');
  const digitsOnly = raw.replace(/\D/g, '');
  if (!digitsOnly) return raw;

  const digitByDigit = digitsOnly.split('').join(' ');
  return hasPlusPrefix ? `plus ${digitByDigit}` : digitByDigit;
}

function hasInquirySignal(message) {
  const text = String(message || '').toLowerCase();
  if (!text) return false;

  return (
    text.includes('details') ||
    text.includes('tell me') ||
    text.includes('tell me more') ||
    text.includes('batao') ||
    text.includes('bataye') ||
    text.includes('batayiye') ||
    text.includes('samjhao') ||
    text.includes('smjhao') ||
    text.includes('samjhaiye') ||
    text.includes('smjhaiye') ||
    text.includes('samjhane') ||
    text.includes('smjhane') ||
    text.includes('explain') ||
    text.includes('emi') ||
    text.includes('interest rate') ||
    text.includes('eligibility') ||
    text.includes('process')
  );
}

function hasExplicitNegativeSignal(message) {
  const text = String(message || '').toLowerCase();
  if (!text) return false;

  return (
    text.includes('not interested') ||
    text.includes('interested nahi') ||
    text.includes('nahi chahiye') ||
    text.includes('nhi chahiye') ||
    text.includes('dont need') ||
    text.includes("don't need") ||
    text.includes('no thanks') ||
    text.includes('do not call') ||
    text.includes("don't call") ||
    text.includes('stop calling') ||
    text.includes('mat call') ||
    text.includes('call back later') ||
    text.includes('zarurat nahi') ||
    text.includes('zaroorat nahi') ||
    text.includes('zarurat nhi') ||
    text.includes('zaroorat nhi') ||
    text.includes('jarurat nahi') ||
    text.includes('jarurat nhi') ||
    text.includes('jrurt nhi') ||
    text.includes('jrurat nhi') ||
    text.includes('nahi lu') ||
    text.includes('nhi lu') ||
    text.includes('na hi lu') ||
    text.includes('nahi lunga') ||
    text.includes('nhi lunga') ||
    text.includes('na lunga')
  );
}

function hasLateTimingSignal(message) {
  return detectCallbackPreference(message)?.reason === 'late_timing';
}

function inferCallbackTimeFromMessage(message) {
  return detectCallbackPreference(message)?.callbackTime || null;
}

function hasRepetitionComplaint(message) {
  const text = String(message || '').toLowerCase();
  if (!text) return false;

  return (
    text.includes('already asked') ||
    text.includes('you asked that') ||
    text.includes('same question') ||
    text.includes('repeat') ||
    text.includes('repeating') ||
    text.includes('again and again') ||
    text.includes('already told') ||
    text.includes('told you already') ||
    text.includes('maine aapko bataya') ||
    text.includes('maine bataya') ||
    text.includes('bataya hua') ||
    text.includes('pehle bataya') ||
    text.includes('bata diya') ||
    text.includes('bar bar') ||
    text.includes('baar baar')
  );
}

function hasMaximumEligibilityQuestion(message) {
  const text = normalizeMessageForRepeatCheck(message);
  if (!text) return false;

  return (
    text.includes('maximum') ||
    text.includes('max amount') ||
    text.includes('highest amount') ||
    text.includes('maximum amount') ||
    text.includes('maximum you can provide') ||
    text.includes('how much can you provide') ||
    text.includes('how much can you give') ||
    text.includes('how much loan can') ||
    text.includes('eligible amount') ||
    text.includes('eligibility') ||
    text.includes('kitna mil') ||
    text.includes('kitna de sakte') ||
    text.includes('jitna maximum') ||
    text.includes('jyada se jyada') ||
    text.includes('zyada se zyada') ||
    text.includes('jo maximum ho') ||
    text.includes('maximum ho jaye') ||
    text.includes('maximum kara') ||
    text.includes('maximum kar do') ||
    text.includes('profile ke according')
  );
}

function hasProceedSignal(message) {
  const text = normalizeMessageForRepeatCheck(message);
  if (!text) return false;

  return (
    text.includes('please do') ||
    text.includes('do that') ||
    text.includes('do it') ||
    text.includes('go ahead') ||
    text.includes('proceed') ||
    text.includes('carry on') ||
    text.includes('continue') ||
    text.includes('kar do') ||
    text.includes('kr do') ||
    text.includes('kardo') ||
    text.includes('kara do') ||
    text.includes('karado') ||
    text.includes('kar dena') ||
    text.includes('kara dena') ||
    text.includes('kara dijiye') ||
    text.includes('karwa do') ||
    text.includes('bata do') ||
    text.includes('batado') ||
    text.includes('sure please') ||
    text.includes('ok sure') ||
    text.includes('okay sure') ||
    text.includes('theek hai') ||
    text.includes('thik hai')
  );
}

function hasAvailabilityConfirmation(message) {
  const text = normalizeMessageForRepeatCheck(message);
  if (!text) return false;

  return (
    text.includes('available now') ||
    text.includes('available right now') ||
    text.includes('i am available') ||
    text.includes('abhi available') ||
    text.includes('abhi baat kar sakte') ||
    text.includes('abhi baat kar sakta') ||
    text.includes('abhi free hoon')
  );
}

const LOW_INFORMATION_RESPONSE_TOKENS = new Set([
  'hmm',
  'hmmm',
  'hmmmm',
  'hm',
  'mm',
  'mmm',
  'uh',
  'uhh',
  'um',
  'umm',
  'ji',
  'jee',
  'acha',
  'achha',
  'accha',
  'huh',
]);

function hasGreetingOrCourtesySignal(message) {
  const text = normalizeMessageForRepeatCheck(message);
  if (!text) return false;

  return (
    text.includes('hello') ||
    text.includes('hi') ||
    text.includes('hey') ||
    text.includes('namaste') ||
    text.includes('good morning') ||
    text.includes('good afternoon') ||
    text.includes('good evening') ||
    text.includes('thank you') ||
    text.includes('thanks') ||
    text.includes('dhanyavaad') ||
    text.includes('shukriya')
  );
}

function isLowInformationOnlyMessage(message) {
  const text = normalizeMessageForRepeatCheck(message);
  if (!text) return false;

  const tokens = text.split(' ').filter(Boolean);
  if (!tokens.length) return false;

  return tokens.every((token) => LOW_INFORMATION_RESPONSE_TOKENS.has(token));
}

function shouldAskCustomerToRepeat({
  customerMessage,
  detectedIntent,
  extracted,
  employmentType,
  languagePreferenceCommand,
}) {
  const text = normalizeMessageForRepeatCheck(customerMessage);
  if (!text || languagePreferenceCommand) {
    return false;
  }

  if (String(detectedIntent?.intent || 'neutral').toLowerCase() !== 'neutral') {
    return false;
  }

  if (
    hasInquirySignal(customerMessage) ||
    hasRepetitionComplaint(customerMessage) ||
    hasMaximumEligibilityQuestion(customerMessage) ||
    hasProceedSignal(customerMessage) ||
    hasAvailabilityConfirmation(customerMessage) ||
    hasExplicitNegativeSignal(customerMessage) ||
    detectCallbackPreference(customerMessage) ||
    hasGreetingOrCourtesySignal(customerMessage)
  ) {
    return false;
  }

  if (extracted?.loanType || extracted?.amount || extracted?.timeline || employmentType) {
    return false;
  }

  const tokens = text.split(' ').filter(Boolean);
  if (!tokens.length) {
    return false;
  }

  if (isLowInformationOnlyMessage(customerMessage)) {
    return true;
  }

  const hasQuestionWord = /\b(what|why|how|when|where|which|kya|kaise|kab|kitna|kyun|kaun)\b/.test(text);
  const substantiveTokenCount = tokens.filter(
    (token) => /[a-z\u0900-\u097f]/i.test(token) && token.length >= 4
  ).length;

  if (tokens.length <= 2 && !hasQuestionWord) {
    return true;
  }

  if (tokens.length <= 4 && substantiveTokenCount === 0 && !/\d/.test(text)) {
    return true;
  }

  return false;
}

function startsWithNaturalAck(text) {
  return /^(ji|haan|sure|ok|okay|right|samajh|bilkul|understood)[\s,.!]/i.test(String(text || '').trim());
}

function normalizeMessageForRepeatCheck(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[.,!?;:'"()[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function areMessagesNearDuplicate(previousMessage, nextMessage) {
  const previous = normalizeMessageForRepeatCheck(previousMessage);
  const next = normalizeMessageForRepeatCheck(nextMessage);

  if (!previous || !next) {
    return false;
  }

  if (previous === next) {
    return true;
  }

  if (previous.length >= 24 && next.length >= 24) {
    return previous.includes(next) || next.includes(previous);
  }

  return false;
}

function detectPromptSlot(message) {
  const normalized = normalizeMessageForRepeatCheck(message);
  if (!normalized) {
    return null;
  }

  if (/(loan type|personal loan|home loan|business loan|auto loan|which loan|kis type)/.test(normalized)) {
    return 'loanType';
  }

  if (/(loan amount|how much|kitna|amount|lakh|lac|crore|rupees|rs)/.test(normalized)) {
    return 'amount';
  }

  if (/(by when|timeline|kab tak|when do you need|this week|this month|apply)/.test(normalized)) {
    return 'timeline';
  }

  if (/(employment|salaried|self employed|self-employed|business|job)/.test(normalized)) {
    return 'employment';
  }

  if (/(eligibility check|next step|proceed)/.test(normalized)) {
    return 'nextStep';
  }

  return null;
}

function humanizeCallReply(reply, languageSignal, stage) {
  const base = String(reply || '').replace(/\s+/g, ' ').trim();
  if (!base) return base;

  const normalizedSignal = normalizeLanguageSignal(languageSignal);
  const sentenceParts = base.split(/(?<=[.!?])\s+/).filter(Boolean);
  let compact = sentenceParts.slice(0, 3).join(' ').trim();

  if (compact.length > 260) {
    compact = `${compact.slice(0, 257).trim()}...`;
  }

  if (stage === CONVERSATION_STAGES.OPENING || startsWithNaturalAck(compact)) {
    return compact;
  }

  if (normalizedSignal.style === LANGUAGE_STYLES.ENGLISH) {
    return `Sure, ${compact}`;
  }

  return `Ji, ${compact}`;
}

export class LLMConversationManager {
  constructor(
    customerProfile,
    companyName = 'FinServe Loans',
    aiAgentName = 'Priya Sharma',
    callbackPhone = null,
    humanAdvisorName = 'John Doe'
  ) {
    this.customerProfile = customerProfile;
    this.companyName = companyName;
    this.aiAgentName = aiAgentName;
    this.callbackPhone = callbackPhone;
    this.humanAdvisorName = String(humanAdvisorName || 'John Doe').trim() || 'John Doe';
    this.conversationHistory = [];
    this.currentStage = CONVERSATION_STAGES.OPENING;
    const seededLoanType = String(
      customerProfile?.loan_interest_type || customerProfile?.loanType || ''
    ).trim() || null;
    const seededTimeline = String(
      customerProfile?.loan_timeline || customerProfile?.timeline || ''
    ).trim() || null;
    const seededEmploymentType = String(
      customerProfile?.employment_type || customerProfile?.employmentType || ''
    ).trim() || null;
    const seededAmount = toFiniteNumberOrNull(
      customerProfile?.loan_amount || customerProfile?.loanAmount || null
    );

    this.extractedData = {
      loanType: seededLoanType,
      amount: seededAmount,
      timeline: seededTimeline,
      employmentType: seededEmploymentType,
    };
    this.callMeta = {
      startTime: new Date(),
      intent: null,
      confidence: 1.0,
      callbackTime: null,
      awaitingClarification: false,
      isVoiceCall: false,
      aiProviderUsed: null,
      summaryText: null,
      nextAction: null,
      providerSessionId: this.buildProviderSessionId(),
      languageSignal: normalizeLanguageSignal({
        style: LANGUAGE_STYLES.HINGLISH,
        script: 'roman',
        confidence: 0.5,
      }),
    };
  }

  buildProviderSessionId() {
    const customerId = String(this.customerProfile?.id || this.customerProfile?.phone || 'anon').replace(/[^a-zA-Z0-9_-]/g, '');
    const timestamp = Date.now();
    return `loan-${customerId}-${timestamp}`;
  }

  getProviderMetadata() {
    return {
      sessionId: this.callMeta.providerSessionId,
    };
  }

  getLanguageSignal() {
    return normalizeLanguageSignal(this.callMeta.languageSignal);
  }

  updateLanguageSignal(customerMessage) {
    const detected = detectLanguageStyleFromText(customerMessage);
    if (detected.style === LANGUAGE_STYLES.UNKNOWN) {
      return this.getLanguageSignal();
    }

    const current = this.getLanguageSignal();

    // Same language family: reinforce if confidence is at least as high
    if (detected.style === current.style) {
      if (detected.confidence >= current.confidence) {
        this.callMeta.languageSignal = detected;
      }
      return this.getLanguageSignal();
    }

    // Different language: only switch if new detection is more confident.
    // Hindi tokens score 0.8, English fallback scores 0.75, so once Hindi
    // is established a brief English-ish phrase cannot flip the signal.
    if (detected.confidence > current.confidence) {
      this.callMeta.languageSignal = detected;
    }

    return this.getLanguageSignal();
  }

  getLanguageText(variants) {
    const signal = this.getLanguageSignal();

    if (signal.style === LANGUAGE_STYLES.HINDI) {
      if (signal.script === 'roman' && variants.hindiRoman) return variants.hindiRoman;
      return variants.hindi || variants.hinglish || variants.english || variants.defaultText || '';
    }

    if (signal.style === LANGUAGE_STYLES.HINGLISH) {
      return variants.hinglish || variants.hindiRoman || variants.hindi || variants.english || variants.defaultText || '';
    }

    if (signal.style === LANGUAGE_STYLES.ENGLISH) {
      return variants.english || variants.hinglish || variants.hindiRoman || variants.hindi || variants.defaultText || '';
    }

    return variants.defaultText || variants.hinglish || variants.hindiRoman || variants.hindi || variants.english || '';
  }

  getIdentityCorrectionLine() {
    return this.getLanguageText({
      english: `No, I am ${this.aiAgentName} from ${this.companyName}. You are ${this.customerProfile?.name || 'the customer'}.`,
      hinglish: `Nahi ji, main ${this.aiAgentName} bol rahi hoon ${this.companyName} se. Aap ${this.customerProfile?.name || 'customer'} hain.`,
      hindiRoman: `Nahi ji, main ${this.aiAgentName} hoon ${this.companyName} se. Aap ${this.customerProfile?.name || 'grahak'} hain.`,
      hindi: `Nahi ji, main ${this.aiAgentName} hoon ${this.companyName} se. Aap ${this.customerProfile?.name || 'grahak'} hain.`,
      defaultText: `I am ${this.aiAgentName} from ${this.companyName}.`,
    });
  }

  getFallbackClarificationMessage() {
    return this.getLanguageText({
      english: 'Sorry, I did not understand what you said. Could you please repeat that?',
      hinglish: 'Sorry ji, main aapki baat samajh nahi paayi. Kya aap dobara bata sakte hain?',
      hindiRoman: 'Maaf kijiye, main aapki baat samajh nahi paayi. Kya aap dobara bata sakte hain?',
      hindi: 'माफ़ कीजिए, मैं आपकी बात समझ नहीं पाई। क्या आप दोबारा बता सकते हैं?',
      defaultText: 'Sorry, I did not understand what you said. Could you please repeat that?',
    });
  }

  getLanguageSwitchAcknowledgement(signal) {
    const normalized = normalizeLanguageSignal(signal || this.getLanguageSignal());

    if (normalized.style === LANGUAGE_STYLES.HINDI) {
      return 'Ji, theek hai, main ab Hindi me baat karungi.';
    }

    if (normalized.style === LANGUAGE_STYLES.HINGLISH) {
      return 'Done ji, main ab Hinglish me baat karungi.';
    }

    if (normalized.style === LANGUAGE_STYLES.ENGLISH) {
      return 'Sure, I will continue in English.';
    }

    return 'Sure, I will continue in your preferred language.';
  }

  toProviderCustomerProfile() {
    const fullName = String(this.customerProfile?.name || 'Customer').trim();
    const [firstName = 'Customer'] = fullName.split(/\s+/);

    return {
      id: this.customerProfile?.id || null,
      firstName,
      city: this.customerProfile?.city || null,
      loanType: this.customerProfile?.loan_interest_type || this.extractedData.loanType || null,
      loanAmount: this.extractedData.amount || null,
      monthlyIncome: this.customerProfile?.monthly_income || null,
      employmentType: this.customerProfile?.employment_type || this.extractedData.employmentType || null,
      creditScore: this.customerProfile?.credit_score || null,
      existingLoans: this.customerProfile?.existing_loans || null,
    };
  }

  getTranscriptText() {
    const MAX_TRANSCRIPT_TURNS = 50;
    const history = this.conversationHistory;
    const recent = history.length > MAX_TRANSCRIPT_TURNS
      ? history.slice(-MAX_TRANSCRIPT_TURNS)
      : history;
    return recent
      .map((turn) => `${turn.role === 'ai' ? 'Agent' : 'Customer'}: ${turn.message}`)
      .join('\n');
  }

  getLatestCustomerMessage() {
    const latestCustomerTurn = [...this.conversationHistory]
      .reverse()
      .find((turn) => turn.role === 'customer' && String(turn.message || '').trim());
    return latestCustomerTurn?.message || null;
  }

  buildProgressiveFollowUpMessage() {
    if (!this.extractedData.loanType) {
      return this.getLanguageText({
        english: 'To guide you correctly, is this for personal, home, business, or auto loan?',
        hinglish: 'Aapko sahi guide karne ke liye bata dijiye, personal, home, business ya auto loan chahiye?',
        hindiRoman: 'Aapko sahi guide karne ke liye bataye, personal, home, business ya auto loan chahiye?',
        hindi: 'Aapko sahi guide karne ke liye bataye, personal, home, business ya auto loan chahiye?',
        defaultText: 'To guide you correctly, is this for personal, home, business, or auto loan?',
      });
    }

    if (!this.extractedData.amount) {
      return this.getLanguageText({
        english: 'Noted. What approximate amount are you planning for, like 5 lakh, 10 lakh, or 20 lakh?',
        hinglish: 'Noted ji. Approx amount kitna plan kar rahe hain, jaise 5 lakh, 10 lakh, ya 20 lakh?',
        hindiRoman: 'Noted ji. Approx amount kitna plan kar rahe hain, jaise 5 lakh, 10 lakh, ya 20 lakh?',
        hindi: 'Noted ji. Approx amount kitna plan kar rahe hain, jaise 5 lakh, 10 lakh, ya 20 lakh?',
        defaultText: 'Noted. What approximate amount are you planning for?',
      });
    }

    if (!this.extractedData.timeline) {
      return this.getLanguageText({
        english: 'By when do you need this loan, this week, this month, or later?',
        hinglish: 'Aapko yeh loan kab tak chahiye, is week, is month, ya thoda later?',
        hindiRoman: 'Aapko yeh loan kab tak chahiye, is week, is month, ya thoda baad?',
        hindi: 'Aapko yeh loan kab tak chahiye, is week, is month, ya thoda baad?',
        defaultText: 'By when do you need this loan?',
      });
    }

    if (!this.extractedData.employmentType) {
      return this.getLanguageText({
        english: 'One quick check: are you salaried or self-employed/business?',
        hinglish: 'Ek quick check, aap salaried hain ya self-employed/business?',
        hindiRoman: 'Ek quick check, aap salaried hain ya self-employed/business?',
        hindi: 'Ek quick check, aap salaried hain ya self-employed/business?',
        defaultText: 'One quick check: are you salaried or self-employed/business?',
      });
    }

    return this.getLanguageText({
      english: 'Should I proceed with a quick eligibility check now?',
      hinglish: 'Kya main ab ek quick eligibility check proceed karun?',
      hindiRoman: 'Kya main ab ek quick eligibility check proceed karun?',
      hindi: 'Kya main ab ek quick eligibility check proceed karun?',
      defaultText: 'Should I proceed with a quick eligibility check now?',
    });
  }

  joinReplyParts(...parts) {
    return parts
      .map((part) => String(part || '').trim())
      .filter(Boolean)
      .join(' ')
      .trim();
  }

  humanizeLoanTypeForReply() {
    return String(this.extractedData.loanType || '')
      .replace(/_/g, ' ')
      .trim();
  }

  buildAdaptiveRepetitionReply() {
    return this.joinReplyParts(
      this.getLanguageText({
        english: 'Understood. I have already noted the details you shared, so I will not repeat them.',
        hinglish: 'Ji, samjha. Aapne jo details share ki hain maine note kar li hain, main unhe repeat nahi karungi.',
        hindiRoman: 'Ji, samjha. Aapne jo details batayi hain maine note kar li hain, main unhe dobara repeat nahi karungi.',
        hindi: 'Ji, samjha. Aapne jo details batayi hain maine note kar li hain, main unhe dobara repeat nahi karungi.',
        defaultText: 'Understood. I have already noted the details you shared, so I will not repeat them.',
      }),
      this.buildProgressiveFollowUpMessage()
    );
  }

  buildAdaptiveEligibilityReply() {
    // When customer says "do the maximum" / "jyada se jyada kara do", treat amount
    // as captured so progressiveFollowUp moves to the next missing field (timeline/employment).
    if (!this.extractedData.amount) {
      this.extractedData.amount = 'MAXIMUM';
    }

    return this.joinReplyParts(
      this.getLanguageText({
        english: 'Noted, we will process for the maximum amount based on your profile.',
        hinglish: 'Noted ji, aapki profile ke according maximum amount ke liye process karenge.',
        hindiRoman: 'Noted ji, aapki profile ke according maximum amount ke liye process karenge.',
        hindi: 'Noted ji, aapki profile ke according maximum amount ke liye process karenge.',
        defaultText: 'Noted, we will process for the maximum amount based on your profile.',
      }),
      this.buildProgressiveFollowUpMessage()
    );
  }

  buildAdaptiveProceedReply() {
    return this.joinReplyParts(
      this.getLanguageText({
        english: 'Sure. I can continue from here.',
        hinglish: 'Theek hai ji, main yahin se continue karti hoon.',
        hindiRoman: 'Theek hai ji, main yahin se continue karti hoon.',
        hindi: 'Theek hai ji, main yahin se continue karti hoon.',
        defaultText: 'Sure. I can continue from here.',
      }),
      this.buildProgressiveFollowUpMessage()
    );
  }

  buildAdaptiveExplanationReply() {
    const loanTypeLabel = this.humanizeLoanTypeForReply();
    const explanationPrefix = loanTypeLabel
      ? this.getLanguageText({
          english: `Sure. For ${loanTypeLabel}, the exact offer depends on profile, amount, and repayment capacity.`,
          hinglish: `Sure ji. ${loanTypeLabel} ke liye exact offer profile, amount aur repayment capacity par depend karta hai.`,
          hindiRoman: `Sure ji. ${loanTypeLabel} ke liye exact offer profile, amount aur repayment capacity par depend karta hai.`,
          hindi: `Sure ji. ${loanTypeLabel} ke liye exact offer profile, amount aur repayment capacity par depend karta hai.`,
          defaultText: `Sure. For ${loanTypeLabel}, the exact offer depends on profile, amount, and repayment capacity.`,
        })
      : this.getLanguageText({
          english: 'Sure. I can explain the key loan details in one line.',
          hinglish: 'Sure ji. Main key loan details ek line me explain kar deti hoon.',
          hindiRoman: 'Sure ji. Main key loan details ek line me explain kar deti hoon.',
          hindi: 'Sure ji. Main key loan details ek line me explain kar deti hoon.',
          defaultText: 'Sure. I can explain the key loan details in one line.',
        });

    return this.joinReplyParts(explanationPrefix, this.buildProgressiveFollowUpMessage());
  }

  buildAdaptiveReplyForCustomerMessage(customerMessage, candidateMessage = '') {
    const normalizedCustomerMessage = normalizeMessageForRepeatCheck(customerMessage);
    if (!normalizedCustomerMessage) {
      return null;
    }

    if (hasRepetitionComplaint(customerMessage)) {
      return this.buildAdaptiveRepetitionReply();
    }

    if (hasMaximumEligibilityQuestion(customerMessage)) {
      return this.buildAdaptiveEligibilityReply();
    }

    if (hasProceedSignal(customerMessage) || hasAvailabilityConfirmation(customerMessage)) {
      return this.buildAdaptiveProceedReply();
    }

    if (!hasInquirySignal(customerMessage)) {
      return null;
    }

    const latestAiMessage = this.getRecentAiMessages(1)[0] || '';
    const candidatePromptSlot = detectPromptSlot(candidateMessage);
    const repeatsPromptSlot = Boolean(
      candidatePromptSlot && this.getRecentPromptSlots(2).includes(candidatePromptSlot)
    );
    const candidateLooksRepeated = Boolean(
      candidateMessage && latestAiMessage && areMessagesNearDuplicate(latestAiMessage, candidateMessage)
    );
    const asksCapturedField = candidateMessage ? this.messageAsksForCapturedField(candidateMessage) : false;
    const wordCount = normalizedCustomerMessage.split(' ').filter(Boolean).length;

    if (repeatsPromptSlot || candidateLooksRepeated || asksCapturedField || wordCount <= 4) {
      return this.buildAdaptiveExplanationReply();
    }

    return null;
  }

  avoidRepeatedPrompt(candidateMessage) {
    const recentAiMessages = this.getRecentAiMessages(3);
    if (!recentAiMessages.length) {
      return candidateMessage;
    }

    const recentPromptSlots = this.getRecentPromptSlots(3);
    const candidatePromptSlot = detectPromptSlot(candidateMessage);

    const hasNearDuplicate = recentAiMessages.some((message) =>
      areMessagesNearDuplicate(message, candidateMessage)
    );

    const asksAlreadyCapturedField = this.messageAsksForCapturedField(candidateMessage);
    const repeatsPromptSlot = Boolean(
      candidatePromptSlot && recentPromptSlots.includes(candidatePromptSlot)
    );

    if (!hasNearDuplicate && !asksAlreadyCapturedField && !repeatsPromptSlot) {
      return candidateMessage;
    }

    const reason = hasNearDuplicate
      ? 'duplicate_ai_response'
      : asksAlreadyCapturedField
        ? 'already_captured_field_prompt'
        : 'same_prompt_slot_repeated';
    const progressiveFollowUp = this.buildProgressiveFollowUpMessage();
    const progressiveSlot = detectPromptSlot(progressiveFollowUp);
    if (
      !recentAiMessages.some((message) => areMessagesNearDuplicate(message, progressiveFollowUp)) &&
      !(progressiveSlot && recentPromptSlots.includes(progressiveSlot))
    ) {
      console.log(`[LLMConversationManager] Replaced AI response (${reason}) with progressive follow-up.`);
      return progressiveFollowUp;
    }

    const fallbackClarification = this.getFallbackClarificationMessage();
    if (!recentAiMessages.some((message) => areMessagesNearDuplicate(message, fallbackClarification))) {
      console.log(`[LLMConversationManager] Replaced AI response (${reason}) with fallback clarification.`);
      return fallbackClarification;
    }

    const transitionMessage = this.getLanguageText({
      english: 'Thanks, noted. Let me quickly suggest the best next step for you.',
      hinglish: 'Thanks ji, noted. Main ab aapke liye best next step suggest karti hoon.',
      hindiRoman: 'Dhanyavaad ji, noted. Main ab aapke liye best next step suggest karti hoon.',
      hindi: 'Dhanyavaad ji, noted. Main ab aapke liye best next step suggest karti hoon.',
      defaultText: 'Thanks, noted. Let me quickly suggest the best next step for you.',
    });
    if (!recentAiMessages.some((message) => areMessagesNearDuplicate(message, transitionMessage))) {
      console.log(`[LLMConversationManager] Replaced AI response (${reason}) with transition message.`);
      return transitionMessage;
    }

    return candidateMessage;
  }

  getRecentAiMessages(limit = 3) {
    const normalizedLimit = Number.isFinite(Number(limit)) ? Math.max(1, Math.round(Number(limit))) : 3;
    return this.conversationHistory
      .filter((turn) => turn.role === 'ai' && String(turn.message || '').trim())
      .slice(-normalizedLimit)
      .map((turn) => String(turn.message || '').trim());
  }

  getRecentPromptSlots(limit = 3) {
    return this.getRecentAiMessages(limit)
      .map((message) => detectPromptSlot(message))
      .filter(Boolean);
  }

  messageAsksForCapturedField(message) {
    const text = String(message || '').trim();
    if (!text) return false;

    const normalized = normalizeMessageForRepeatCheck(text);
    const looksQuestion = text.includes('?') || /^(noted|to guide|one quick check|by when|what|which|how much)/i.test(text);
    if (!looksQuestion) {
      return false;
    }

    const asksLoanType = /(loan type|personal loan|home loan|business loan|auto loan|which loan|kis type)/.test(normalized);
    const asksAmount = /(loan amount|how much|kitna|amount|lakh|lac|crore)/.test(normalized);
    const asksTimeline = /(by when|timeline|kab tak|when do you need|this week|this month|apply)/.test(normalized);
    const asksEmployment = /(employment|salaried|self employed|self-employed|business|job)/.test(normalized);

    return (
      (asksLoanType && Boolean(this.extractedData.loanType)) ||
      (asksAmount && Boolean(this.extractedData.amount)) ||
      (asksTimeline && Boolean(this.extractedData.timeline)) ||
      (asksEmployment && Boolean(this.extractedData.employmentType))
    );
  }

  /**
   * System prompt for the AI loan assistant
   * This controls how the AI behaves during the entire conversation
   */
  getSystemPrompt() {
    const languageSignal = this.getLanguageSignal();
    const languageInstruction = getLanguageMirroringInstruction(languageSignal);
    const languageLabel = getLanguageStyleLabel(languageSignal);

    const customerInfo = `
Customer Profile:
- Name: ${this.customerProfile?.name || 'Unknown'}
- City: ${this.customerProfile?.city || 'Not specified'}
- Monthly Income: ₹${this.customerProfile?.monthly_income || 'Unknown'}
- Employment: ${this.customerProfile?.employment_type || 'Not specified'}
- Credit Score: ${this.customerProfile?.credit_score || 'Unknown'}
- Existing Loans: ${this.customerProfile?.existing_loans || 'None'}
- Loan Type Interest: ${this.customerProfile?.loan_interest_type || 'Not specified'}
`;

    return `SYSTEM ROLE
  You are ${this.aiAgentName}, a professional female loan consultant from ${this.companyName}.
  You are speaking to customers on a real phone call.
  Sound like a real Indian telecaller: friendly, confident, conversational, and human.
  Do not sound robotic.

  PRIMARY GOALS
  1. Build trust
  2. Understand the customer's loan need
  3. Guide them toward the right loan option
  4. Encourage them to continue eligibility/application steps
  5. Never pressure aggressively; use soft selling

  VOICE AND PERSONALITY
  - Warm, friendly, professional, confident, patient
  - Speak like a helpful bank relationship manager
  - Always address customer respectfully: Sir, Ma'am, or their name
  - Never mention you are an AI or virtual assistant

  IDENTITY AND BOUNDARY
  - You are ${this.aiAgentName} from ${this.companyName}
  - If customer assigns a wrong identity, correct politely in this style: "${this.getIdentityCorrectionLine()}"
  - Never accept false identity claims

  LANGUAGE BEHAVIOR (MANDATORY)
  - Current detected customer language: ${languageLabel}
  - ${languageInstruction}
  - If customer speaks Hindi, respond in Hindi
  - If customer speaks English, respond in English
  - If customer mixes both, respond in Hinglish
  - If customer asks to switch language, acknowledge briefly and switch naturally
  - Voice persona and identity stay the same across all languages

  HUMAN-LIKE CALL STYLE
  - Use phone-friendly short responses (1-3 short sentences)
  - Ask at most one question per turn
  - Occasionally add natural fillers: "Ji sir...", "Haan bilkul...", "Ek second...", "Right sir..."
  - Use quick acknowledgements before answers
  - Simulate brief natural thinking pauses with "..." when helpful
  - Never overtalk

  INTERRUPTION HANDLING
  - If customer interrupts, stop immediately
  - Acknowledge politely: "Ji sir, boliye." or "Ji ma'am, boliye."
  - Continue naturally after customer finishes
  - Never talk over the customer

  CONVERSATION FLOW (NATURAL)
  1. Greeting and permission to talk
  2. Purpose: loan enquiry follow-up
  3. Intent discovery: whether customer needs a loan now
  4. Requirement discovery: loan type, amount, employment, income, city, timeline
  5. Qualification signal: strong profile vs docs needed
  6. Offer explanation: speed, support, and process clarity
  7. Conversion push: suggest quick eligibility check
  8. Data capture: name, city, employment type, income, loan amount/type
  9. Polite closing with callback/help channel

  OBJECTION HANDLING
  - If rate concern: acknowledge and highlight practical benefit (faster approval, smoother process)
  - If trust concern: reassure calmly (banking partners, process transparency)
  - If not interested: acknowledge respectfully; optionally ask one soft future-consent question, then close politely
  - If busy: ask preferred callback time
  - If do-not-call/harassment request: apologize, confirm no further calls, and end immediately

  INDIAN CUSTOMER PSYCHOLOGY
  - Build trust first, pitch second
  - Use social proof lightly when useful
  - Use curiosity questions instead of hard push
  - Stay respectful and calm even when customer is skeptical

  ${customerInfo}

  Current Conversation Stage: ${this.currentStage}
  Extracted Data So Far: ${JSON.stringify(this.extractedData)}

  CRITICAL OUTPUT RULES
  - Keep each reply short and natural for voice call rhythm
  - Keep language mirroring strict and consistent
  - Be persuasive but never forceful
  - If customer asks a direct question about amount, eligibility, process, or next step, answer that first in one short line before asking the next missing detail
  - If the latest customer response is unclear or you do not understand it, politely say you did not understand and ask them to repeat once instead of moving to the next scripted question
  - If customer says a short confirmation like "kar do", "please do", or "do that", continue from the current step instead of restarting the script
  - Never ask for a field that already exists in Extracted Data So Far
  - If customer says you already asked, acknowledge once and move to the next missing field
  - End only when customer clearly declines, asks not to be called, requests callback, or conversation is fully completed.`;
  }

  /**
   * Get opening greeting
   */
  getOpeningGreeting() {
    const name = this.customerProfile?.name || 'Friend';
    return this.getLanguageText({
      english: `Hello ${name}, this is ${this.aiAgentName} from ${this.companyName}. Is this a good time for a quick 30-second loan discussion?`,
      hinglish: `Namaste ${name} ji, main ${this.aiAgentName} bol rahi hoon ${this.companyName} se. Kya abhi 30 seconds baat karna convenient hai?`,
      hindiRoman: `Namaste ${name} ji, main ${this.aiAgentName} ${this.companyName} se bol rahi hoon. Kya abhi 30 second baat karna theek rahega?`,
      hindi: `Namaste ${name} ji, main ${this.aiAgentName} ${this.companyName} se bol rahi hoon. Kya abhi 30 second baat karna theek rahega?`,
      defaultText: `Hello ${name}, this is ${this.aiAgentName} from ${this.companyName}. Is this a good time for a quick 30-second loan discussion?`,
    });
  }

  /**
   * Get closing greeting with callback number
   */
  getClosingGreeting() {
    const callbackNumber = this.callbackPhone || process.env.COMPANY_CALLBACK_PHONE || '+91-XXXXXXXXXX';
    const spokenCallbackNumber = formatPhoneForSpeech(callbackNumber) || callbackNumber;
    const finalIntent = String(this.callMeta.intent || '').toLowerCase();
    const shouldUseHumanAdvisorHandoff = ['interested', 'converted'].includes(finalIntent);
    const callbackTime = String(this.callMeta.callbackTime || '').trim() || 'later';
    const localizedCallbackTime = this.getLocalizedCallbackTimeLabel(callbackTime);

    if (finalIntent === 'busy' || finalIntent === 'call_back_later') {
      return this.getLanguageText({
        english: `Sorry for calling at a bad time. We will call you again ${localizedCallbackTime.english}. If needed, you can also reach us on ${spokenCallbackNumber}.`,
        hinglish: `Sorry ji, lagta hai maine galat time par call kiya. Hum aapko ${localizedCallbackTime.hinglish} phir call karenge. Zarurat ho to aap hume ${spokenCallbackNumber} par bhi reach kar sakte hain.`,
        hindiRoman: `Maafi chahungi ji, lagta hai maine galat samay par call kiya. Hum aapko ${localizedCallbackTime.hindiRoman} phir call karenge. Zarurat ho to aap hume ${spokenCallbackNumber} par bhi sampark kar sakte hain.`,
        hindi: `माफ़ कीजिए जी, लगता है मैंने गलत समय पर कॉल किया। हम आपको ${localizedCallbackTime.hindi} फिर कॉल करेंगे। ज़रूरत हो तो आप हमें ${spokenCallbackNumber} पर भी संपर्क कर सकते हैं।`,
        defaultText: `Sorry for calling at a bad time. We will call you again ${localizedCallbackTime.english}. If needed, you can also reach us on ${spokenCallbackNumber}.`,
      });
    }

    if (shouldUseHumanAdvisorHandoff) {
      return this.getLanguageText({
        english: `Great. I will now connect you with our best human advisor ${this.humanAdvisorName}. He will give you the best loan offer and call you shortly. You can also call us on ${spokenCallbackNumber}.`,
        hinglish: `Great ji. Main ab aapko hamare best human advisor ${this.humanAdvisorName} se connect karwa rahi hoon. Wo aapko best loan offer denge aur jaldi call karenge. Aap hume ${spokenCallbackNumber} par bhi call kar sakte hain.`,
        hindiRoman: `Bahut badhiya ji. Main ab aapko hamare best human advisor ${this.humanAdvisorName} se connect karwa rahi hoon. Wo aapko best loan offer denge aur jaldi call karenge. Aap hume ${spokenCallbackNumber} par bhi call kar sakte hain.`,
        hindi: `Bahut badhiya ji. Main ab aapko hamare best human advisor ${this.humanAdvisorName} se connect karwa rahi hoon. Wo aapko best loan offer denge aur jaldi call karenge. Aap hume ${spokenCallbackNumber} par bhi call kar sakte hain.`,
        defaultText: `Great. I will now connect you with our best human advisor ${this.humanAdvisorName}. He will give you the best loan offer and call you shortly. You can also call us on ${spokenCallbackNumber}.`,
      });
    }

    return this.getLanguageText({
      english: `Thank you for your time. If you need any loan assistance in future, please call our team on ${spokenCallbackNumber}. We are always happy to help.`,
      hinglish: `Dhanyavaad ji, aapke time ke liye. Future me loan assistance ke liye aap hume ${spokenCallbackNumber} par call kar sakte hain. Humari team help ke liye available hai.`,
      hindiRoman: `Dhanyavaad ji, aapke samay ke liye. Bhavishya me loan sahayata ke liye aap hume ${spokenCallbackNumber} par call kar sakte hain. Hamari team madad ke liye tayyar hai.`,
      hindi: `Dhanyavaad ji, aapke samay ke liye. Bhavishya me loan sahayata ke liye aap hume ${spokenCallbackNumber} par call kar sakte hain. Hamari team madad ke liye tayyar hai.`,
      defaultText: `Thank you for your time. If you need any loan assistance in future, please call our team on ${spokenCallbackNumber}. We are always happy to help.`,
    });
  }

  getLocalizedCallbackTimeLabel(callbackTime) {
    const normalized = String(callbackTime || '').trim().toLowerCase() || 'later';
    const afterTimeMatch = normalized.match(/^after\s+(.+)$/i);

    if (afterTimeMatch?.[1]) {
      const timeValue = afterTimeMatch[1].trim();
      return {
        english: `after ${timeValue}`,
        hinglish: `${timeValue} ke baad`,
        hindiRoman: `${timeValue} baje ke baad`,
        hindi: `${timeValue} बजे के बाद`,
      };
    }

    if (normalized === 'tomorrow morning') {
      return {
        english: 'tomorrow morning',
        hinglish: 'kal subah',
        hindiRoman: 'kal subah',
        hindi: 'कल सुबह',
      };
    }

    if (normalized === 'tomorrow evening') {
      return {
        english: 'tomorrow evening',
        hinglish: 'kal shaam',
        hindiRoman: 'kal shaam',
        hindi: 'कल शाम',
      };
    }

    if (normalized === 'in the morning') {
      return {
        english: 'in the morning',
        hinglish: 'subah',
        hindiRoman: 'subah',
        hindi: 'सुबह',
      };
    }

    if (normalized === 'in the evening') {
      return {
        english: 'in the evening',
        hinglish: 'shaam mein',
        hindiRoman: 'shaam mein',
        hindi: 'शाम में',
      };
    }

    return {
      english: 'later',
      hinglish: 'baad mein',
      hindiRoman: 'baad mein',
      hindi: 'बाद में',
    };
  }

  /**
   * Generate AI response using Claude or OpenAI Chat API
   * This provides ChatGPT/Claude-level intelligence
   */
  async generateAIResponse(customerMessage = null) {
    // If at closing stage, return closing greeting
    if (this.currentStage === CONVERSATION_STAGES.CLOSING) {
      console.log('📞 [Closing Stage] Generating closing greeting with callback number');
      return this.getClosingGreeting();
    }

    try {
      if (!customerMessage && this.conversationHistory.length === 0) {
        // First message - return opening greeting
        return this.getOpeningGreeting();
      }

      let languagePreferenceCommand = null;
      let activeLanguageSignal = this.getLanguageSignal();
      if (customerMessage) {
        languagePreferenceCommand = detectLanguagePreferenceCommand(customerMessage);
        if (languagePreferenceCommand) {
          this.callMeta.languageSignal = normalizeLanguageSignal(languagePreferenceCommand);
          activeLanguageSignal = this.getLanguageSignal();
        } else {
          activeLanguageSignal = this.updateLanguageSignal(customerMessage);
        }
      }

      if (languagePreferenceCommand) {
        const acknowledgementMessage = this.getLanguageSwitchAcknowledgement(languagePreferenceCommand);
        this.conversationHistory.push({
          role: 'ai',
          message: acknowledgementMessage,
          timestamp: new Date(),
        });
        return acknowledgementMessage;
      }

      if (this.callMeta.awaitingClarification) {
        const clarificationMessage = this.getFallbackClarificationMessage();
        this.conversationHistory.push({
          role: 'ai',
          message: clarificationMessage,
          timestamp: new Date(),
        });
        return clarificationMessage;
      }

      const aiOutput = await runAIWithFailover({
        task: 'CALL_TURN',
        payload: {
          customer: this.toProviderCustomerProfile(),
          transcript: this.getTranscriptText(),
          latestCustomerMessage: customerMessage || this.getLatestCustomerMessage(),
          turn: this.conversationHistory.length,
          metadata: this.getProviderMetadata(),
          context: {
            conversationStage: this.currentStage,
            companyName: this.companyName,
            aiAgentName: this.aiAgentName,
            systemPrompt: this.getSystemPrompt(),
            languageSignal: activeLanguageSignal,
            languageInstruction: getLanguageMirroringInstruction(activeLanguageSignal),
            languageStyleLabel: getLanguageStyleLabel(activeLanguageSignal),
            extractedData: { ...this.extractedData },
            recentPromptSlots: this.getRecentPromptSlots(3),
            repetitionComplaint: hasRepetitionComplaint(customerMessage || ''),
          },
        },
        activeOnly: true,
      });

      this.callMeta.aiProviderUsed = aiOutput?.provider?.name || aiOutput?.provider?.type || null;
      console.log('[LLMConversationManager] CALL_TURN provider used:', this.callMeta.aiProviderUsed);

      let aiMessage = String(aiOutput?.result?.reply || '').trim() || this.getOpeningGreeting();
      aiMessage = humanizeCallReply(aiMessage, activeLanguageSignal, this.currentStage);
      const adaptiveReply = customerMessage
        ? this.buildAdaptiveReplyForCustomerMessage(customerMessage, aiMessage)
        : null;
      aiMessage = adaptiveReply || this.avoidRepeatedPrompt(aiMessage);
      
      // Add to history
      this.conversationHistory.push({
        role: 'ai',
        message: aiMessage,
        timestamp: new Date(),
      });

      return aiMessage;
    } catch (error) {
      console.error('Error calling AI API:', error.message);
      let fallbackMessage = customerMessage
        ? this.buildAdaptiveReplyForCustomerMessage(customerMessage)
        : null;

      if (!fallbackMessage) {
        fallbackMessage = this.currentStage === CONVERSATION_STAGES.OPENING
          ? this.getOpeningGreeting()
          : this.getFallbackClarificationMessage();
        fallbackMessage = humanizeCallReply(fallbackMessage, this.getLanguageSignal(), this.currentStage);
      }

      this.conversationHistory.push({
        role: 'ai',
        message: fallbackMessage,
        timestamp: new Date(),
      });

      return fallbackMessage;
    }
  }

  /**
   * Process customer response and extract intent/data
   * Uses AI to understand context naturally
   */
  async processCustomerResponse(customerMessage) {
    try {
      const languagePreferenceCommand = detectLanguagePreferenceCommand(customerMessage);
      const activeLanguageSignal = this.updateLanguageSignal(customerMessage);

      if (languagePreferenceCommand) {
        this.callMeta.languageSignal = normalizeLanguageSignal(languagePreferenceCommand);
      }

      // Add customer message to history
      this.conversationHistory.push({
        role: 'customer',
        message: customerMessage,
        timestamp: new Date(),
      });

      const detectedIntent = detectIntent(customerMessage, this.conversationHistory);
      const extracted = extractLoanDetails(customerMessage);
      const employmentType = detectEmploymentType(customerMessage);

      const previousIntent = String(this.callMeta.intent || '').toLowerCase();
      const hadPriorPositiveIntent = previousIntent === 'interested' || previousIntent === 'converted';
      const activeStage = this.currentStage;

      if (extracted.loanType) this.extractedData.loanType = extracted.loanType;
      if (extracted.amount) this.extractedData.amount = extracted.amount;
      if (extracted.timeline) this.extractedData.timeline = extracted.timeline;
      if (employmentType) this.extractedData.employmentType = employmentType;

      const hasStructuredLoanSignal = Boolean(
        extracted.loanType || extracted.amount || extracted.timeline || employmentType
      );
      const repetitionComplaint = hasRepetitionComplaint(customerMessage);
      const clarificationRequired = shouldAskCustomerToRepeat({
        customerMessage,
        detectedIntent,
        extracted,
        employmentType,
        languagePreferenceCommand,
      });

      let finalIntent = String(detectedIntent.intent || 'neutral').toLowerCase();
      let finalConfidence = normalizeConfidence(detectedIntent.confidence, 0.5);
      let reasoning = detectedIntent?.details?.reason || 'rule-based intent detection';
      const isHardStopIntent = finalIntent === 'do_not_call';
      const ruleBasedIntent = String(detectedIntent.intent || 'neutral').toLowerCase();
      let providerIntent = null;

      if (languagePreferenceCommand && !isHardStopIntent) {
        finalIntent = 'neutral';
        finalConfidence = Math.max(finalConfidence, 0.9);
        reasoning = `language-preference:${languagePreferenceCommand.style}`;
      }

      try {
        // Skip summary intent override on explicit language-switch turns and low-information clarification turns.
        if ((!languagePreferenceCommand && !clarificationRequired) || isHardStopIntent) {
          const summaryOutput = await runAIWithFailover({
            task: 'CALL_SUMMARY',
            payload: {
              customer: this.toProviderCustomerProfile(),
              transcript: this.getTranscriptText(),
              turn: this.conversationHistory.length,
              metadata: this.getProviderMetadata(),
              extractedData: {
                ...this.extractedData,
                preferredCallbackTime: this.callMeta.callbackTime || null,
              },
              context: {
                conversationStage: this.currentStage,
                languageSignal: activeLanguageSignal,
                languageInstruction: getLanguageMirroringInstruction(activeLanguageSignal),
              },
            },
            activeOnly: true,
          });

          this.callMeta.aiProviderUsed = summaryOutput?.provider?.name || summaryOutput?.provider?.type || this.callMeta.aiProviderUsed;
          this.callMeta.summaryText =
            String(summaryOutput?.result?.summary || "").trim() || this.callMeta.summaryText;
          this.callMeta.nextAction =
            String(summaryOutput?.result?.nextAction || "").trim() || this.callMeta.nextAction;
          console.log('[LLMConversationManager] CALL_SUMMARY provider used:', this.callMeta.aiProviderUsed);

          providerIntent = normalizeProviderIntent(summaryOutput?.result?.intent);
          if (providerIntent && providerIntent !== 'neutral') {
            // Never let provider escalate to do_not_call — requires explicit customer keywords in rule-based detection.
            if (providerIntent === 'do_not_call' && ruleBasedIntent !== 'do_not_call') {
              console.log('[LLMConversationManager] Blocked provider do_not_call escalation — rule-based:', ruleBasedIntent);
            // Don't let provider downgrade rule-based interested to a terminal intent.
            } else if (
              END_INTENTS.has(providerIntent) &&
              ruleBasedIntent === 'interested'
            ) {
              console.log('[LLMConversationManager] Blocked provider terminal override — rule-based: interested');
            } else {
              finalIntent = providerIntent;
              finalConfidence = Math.max(finalConfidence, 0.8);
              reasoning = `provider-intent:${summaryOutput.provider?.name || 'unknown'}`;
            }
          }
        }
      } catch (summaryError) {
        console.warn('[LLMConversationManager] Provider summary fallback to rule-based intent:', summaryError.message);
      }

      if (clarificationRequired && !END_INTENTS.has(finalIntent)) {
        finalIntent = 'neutral';
        finalConfidence = Math.max(finalConfidence, 0.72);
        reasoning = `${reasoning}:clarification_required`;
      }

      const ruleBasedTerminalIntent = ['do_not_call', 'not_interested', 'busy', 'call_back_later'].includes(ruleBasedIntent);
      const currentTerminalIntent = ['do_not_call', 'not_interested', 'busy', 'call_back_later'].includes(finalIntent);
      if (ruleBasedTerminalIntent && !currentTerminalIntent) {
        finalIntent = ruleBasedIntent;
        finalConfidence = Math.max(finalConfidence, normalizeConfidence(detectedIntent.confidence, 0.9));
        reasoning = `${reasoning}:rule_terminal_priority`;
      }

      // Require loanType+amount before treating intent as converted.
      const hasConversionSignals = Boolean(this.extractedData.loanType && this.extractedData.amount);
      if (finalIntent === 'converted' && !hasConversionSignals) {
        finalIntent = 'interested';
        finalConfidence = Math.max(finalConfidence, 0.78);
        reasoning = `${reasoning}:downgraded_pre_qualification`;
      }

      // Prevent terminal override on inquiry-style utterances like "please tell me details".
      const inquirySignal = hasInquirySignal(customerMessage);
      const explicitNegativeSignal = hasExplicitNegativeSignal(customerMessage);
      const lateTimingSignal = hasLateTimingSignal(customerMessage);
      const callbackPreference = detectCallbackPreference(customerMessage);
      const proceedSignal = hasProceedSignal(customerMessage);
      const availabilityConfirmation = hasAvailabilityConfirmation(customerMessage);
      const positiveProceedSignal =
        !explicitNegativeSignal &&
        !callbackPreference &&
        (proceedSignal || availabilityConfirmation);
      if (
        providerIntent &&
        ['not_interested', 'busy', 'call_back_later'].includes(finalIntent) &&
        inquirySignal &&
        !explicitNegativeSignal &&
        ['neutral', 'interested'].includes(ruleBasedIntent)
      ) {
        finalIntent = 'interested';
        finalConfidence = Math.max(finalConfidence, 0.76);
        reasoning = `${reasoning}:inquiry_guard`;
      }

      if (
        positiveProceedSignal &&
        finalIntent !== 'do_not_call' &&
        ['neutral', 'busy', 'call_back_later'].includes(finalIntent)
      ) {
        finalIntent = 'interested';
        finalConfidence = Math.max(finalConfidence, 0.82);
        this.callMeta.callbackTime = null;
        reasoning = `${reasoning}:proceed_confirmation_guard`;
      }

      // Do not let provider-neutral classification block progression when user gave concrete loan details.
      if (!END_INTENTS.has(finalIntent) && finalIntent === 'neutral' && hasStructuredLoanSignal) {
        finalIntent = 'interested';
        finalConfidence = Math.max(finalConfidence, 0.74);
        reasoning = `${reasoning}:structured_signal_guard`;
      }

      // If customer says the assistant is repeating, keep flow in interested path.
      if (!END_INTENTS.has(finalIntent) && repetitionComplaint) {
        finalIntent = 'interested';
        finalConfidence = Math.max(finalConfidence, 0.72);
        reasoning = `${reasoning}:repetition_complaint_guard`;
      }

      if (
        !END_INTENTS.has(finalIntent) &&
        finalIntent === 'neutral' &&
        inquirySignal &&
        !explicitNegativeSignal &&
        (
          hadPriorPositiveIntent ||
          activeStage === CONVERSATION_STAGES.DISCOVERY ||
          activeStage === CONVERSATION_STAGES.PITCH ||
          activeStage === CONVERSATION_STAGES.QUALIFICATION
        )
      ) {
        finalIntent = 'interested';
        finalConfidence = Math.max(finalConfidence, 0.74);
        reasoning = `${reasoning}:inquiry_interest_guard`;
      }

      if (lateTimingSignal && !explicitNegativeSignal) {
        finalIntent = 'call_back_later';
        finalConfidence = Math.max(finalConfidence, 0.9);
        this.callMeta.callbackTime = callbackPreference?.callbackTime || inferCallbackTimeFromMessage(customerMessage);
        reasoning = `${reasoning}:late_timing_callback_guard`;
      }

      if (
        ['busy', 'call_back_later'].includes(ruleBasedIntent) &&
        !explicitNegativeSignal &&
        finalIntent !== 'do_not_call'
      ) {
        finalIntent = ruleBasedIntent;
        finalConfidence = Math.max(finalConfidence, normalizeConfidence(detectedIntent.confidence, 0.88));
        this.callMeta.callbackTime = this.callMeta.callbackTime || callbackPreference?.callbackTime || inferCallbackTimeFromMessage(customerMessage);
        reasoning = `${reasoning}:rule_callback_priority`;
      }

      // Keep previously interested leads from dropping to neutral on short acknowledgement turns
      // once qualification signals are already captured, unless there is an explicit negative signal.
      const hasQualifiedSignals = Boolean(this.extractedData.loanType && this.extractedData.amount);
      if (
        !END_INTENTS.has(finalIntent) &&
        finalIntent === 'neutral' &&
        hadPriorPositiveIntent &&
        hasQualifiedSignals &&
        !explicitNegativeSignal
      ) {
        finalIntent = 'interested';
        finalConfidence = Math.max(finalConfidence, 0.75);
        reasoning = `${reasoning}:prior_interest_persistence_guard`;
      }

      // Determine next stage
      const terminalIntentShouldEnd = END_INTENTS.has(finalIntent);
      const nextStage = this.determineNextStage(finalIntent, terminalIntentShouldEnd);
      const shouldEnd = terminalIntentShouldEnd || nextStage === CONVERSATION_STAGES.CLOSING;
      this.currentStage = nextStage;

      // Update call meta
      this.callMeta.intent = finalIntent;
      this.callMeta.confidence = finalConfidence;
      this.callMeta.awaitingClarification = clarificationRequired && !shouldEnd;

      return {
        intent: finalIntent,
        confidence: finalConfidence,
        extractedData: {
          ...this.extractedData,
          preferredCallbackTime: this.callMeta.callbackTime || null,
        },
        nextStage,
        shouldEnd,
        reasoning,
      };
    } catch (error) {
      console.error('Error processing customer response:', error.message);
      this.callMeta.awaitingClarification = false;
      return {
        intent: 'neutral',
        confidence: 0.5,
        extractedData: { ...this.extractedData },
        nextStage: this.currentStage,
        shouldEnd: false,
      };
    }
  }

  /**
   * Determine next conversation stage
   */
  determineNextStage(intent, shouldEnd = false) {
    // If AI explicitly decides the call must end (e.g. strong do-not-call),
    // or we have a clear do_not_call intent, always close.
    if (shouldEnd || intent === 'do_not_call' || intent === 'not_interested') {
      return CONVERSATION_STAGES.CLOSING;
    }

    // Converted should close only after key details are captured.
    if (intent === 'converted') {
      if (this.extractedData.loanType && this.extractedData.amount) {
        return CONVERSATION_STAGES.CLOSING;
      }
      intent = 'interested';
    }

    // If busy, also close (callback will be scheduled)
    if (intent === 'busy' || intent === 'call_back_later') {
      return CONVERSATION_STAGES.CLOSING;
    }

    // Progress through normal stages
    switch (this.currentStage) {
      case CONVERSATION_STAGES.OPENING:
        if (intent === 'interested') {
          return CONVERSATION_STAGES.DISCOVERY;
        }
        return CONVERSATION_STAGES.OPENING;

      case CONVERSATION_STAGES.DISCOVERY:
        if (this.extractedData.loanType && this.extractedData.amount) {
          return CONVERSATION_STAGES.QUALIFICATION;
        }
        if (this.extractedData.loanType || this.extractedData.amount || this.extractedData.timeline) {
          return CONVERSATION_STAGES.PITCH;
        }
        return CONVERSATION_STAGES.DISCOVERY;

      case CONVERSATION_STAGES.PITCH:
        if (this.extractedData.loanType && this.extractedData.amount) {
          return CONVERSATION_STAGES.QUALIFICATION;
        }
        return CONVERSATION_STAGES.PITCH;

      case CONVERSATION_STAGES.QUALIFICATION:
        if (this.extractedData.loanType && this.extractedData.amount) {
          return CONVERSATION_STAGES.CLOSING;
        }
        return CONVERSATION_STAGES.QUALIFICATION;

      default:
        return CONVERSATION_STAGES.CLOSING;
    }
  }

  /**
   * Get structured output for API response
   */
  getStructuredOutput(aiMessage) {
    const languageSignal = this.getLanguageSignal();

    return {
      ai_message: aiMessage,
      intent: this.callMeta.intent,
      confidence: this.callMeta.confidence,
      ai_provider_used: this.callMeta.aiProviderUsed,
      language_style: languageSignal.style,
      language_script: languageSignal.script,
      conversation_stage: this.currentStage,
      extracted_data: {
        ...this.extractedData,
        preferredCallbackTime: this.callMeta.callbackTime || null,
      },
      conversation_length: this.conversationHistory.length,
    };
  }

  /**
   * Get full transcript
   */
  getTranscript() {
    return this.conversationHistory.map(turn => ({
      role: turn.role,
      message: turn.message,
      timestamp: turn.timestamp,
    }));
  }

  /**
   * Regenerate the summary with the full transcript and extracted data.
   * Called once at the end of a conversation so the notification contains
   * an accurate, advisor-facing summary instead of the stale mid-call one.
   */
  async generateFinalSummary() {
    const activeLanguageSignal = this.getLanguageSignal();

    try {
      const summaryOutput = await runAIWithFailover({
        task: 'CALL_SUMMARY',
        payload: {
          customer: this.toProviderCustomerProfile(),
          transcript: this.getTranscriptText(),
          turn: this.conversationHistory.length,
          metadata: this.getProviderMetadata(),
          extractedData: {
            ...this.extractedData,
            preferredCallbackTime: this.callMeta.callbackTime || null,
          },
          context: {
            conversationStage: this.currentStage,
            languageSignal: activeLanguageSignal,
            languageInstruction: getLanguageMirroringInstruction(activeLanguageSignal),
          },
        },
        activeOnly: true,
      });

      const freshSummary = String(summaryOutput?.result?.summary || '').trim();
      const freshNextAction = String(summaryOutput?.result?.nextAction || '').trim();

      if (freshSummary) this.callMeta.summaryText = freshSummary;
      if (freshNextAction) this.callMeta.nextAction = freshNextAction;

      console.log('[LLMConversationManager] Final summary regenerated');
    } catch (err) {
      console.warn('[LLMConversationManager] Final summary generation failed, using last mid-call summary:', err?.message);
    }
  }

  /**
   * Get call summary
   */
  getCallSummary() {
    const languageSignal = this.getLanguageSignal();

    return {
      startTime: this.callMeta.startTime,
      endTime: new Date(),
      duration: (new Date() - this.callMeta.startTime) / 1000,
      intent: this.callMeta.intent,
      confidence: this.callMeta.confidence,
      aiProviderUsed: this.callMeta.aiProviderUsed,
      summary: this.callMeta.summaryText,
      nextAction: this.callMeta.nextAction,
      languageStyle: languageSignal.style,
      languageScript: languageSignal.script,
      extractedData: {
        ...this.extractedData,
        preferredCallbackTime: this.callMeta.callbackTime || null,
      },
      turnCount: this.conversationHistory.length,
    };
  }
}
