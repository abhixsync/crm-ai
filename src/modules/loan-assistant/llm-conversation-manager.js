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

function parseIndianAmountWithUnit(rawAmount, rawUnit = '') {
  const numericAmount = Number.parseFloat(String(rawAmount || '').replace(/,/g, '').trim());
  if (!Number.isFinite(numericAmount)) {
    return null;
  }

  const unit = String(rawUnit || '').trim().toLowerCase();
  if (unit.includes('crore') || unit === 'cr') {
    return Math.round(numericAmount * 10000000);
  }
  if (unit.includes('lakh') || unit.includes('lac')) {
    return Math.round(numericAmount * 100000);
  }
  if (unit.includes('thousand') || unit === 'k') {
    return Math.round(numericAmount * 1000);
  }

  return Math.round(numericAmount);
}

function extractMonthlyIncomeFromMessage(message) {
  const text = String(message || '').toLowerCase();
  if (!text) {
    return null;
  }

  const patterns = [
    /(?:monthly income|income|salary|tankhwa(?:h)?|vetan|mahin(?:e|a)\s*(?:ki)?\s*(?:income|salary)?)\s*(?:is|around|about|approx(?:imately)?|=|:|ka)?\s*(?:rs\.?|rupees|₹)?\s*(\d+(?:,\d{3})*(?:\.\d+)?)\s*(crore|cr|lakh|lac|lacs|lakhs|thousand|k)?/i,
    /(?:rs\.?|rupees|₹)?\s*(\d+(?:,\d{3})*(?:\.\d+)?)\s*(crore|cr|lakh|lac|lacs|lakhs|thousand|k)?\s*(?:monthly income|income|salary|tankhwa(?:h)?|vetan|mahin(?:e|a)\s*(?:ki)?\s*(?:income|salary)?)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) {
      continue;
    }

    const parsedAmount = parseIndianAmountWithUnit(match[1], match[2]);
    if (Number.isFinite(parsedAmount) && parsedAmount >= 1000) {
      return parsedAmount;
    }
  }

  return null;
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

function hasConfusionSignal(message) {
  const text = String(message || '').toLowerCase();
  if (!text) return false;

  return (
    text.includes('samajh nahi') ||
    text.includes('samajh nhi') ||
    text.includes('smjha nhi') ||
    text.includes('smjh nhi') ||
    text.includes('smjha nahi') ||
    text.includes('smjh nahi') ||
    text.includes('samjha nahi') ||
    text.includes('samjha nhi') ||
    text.includes('kya bol rahi') ||
    text.includes('kya bol raha') ||
    text.includes('kya baat kar rahi') ||
    text.includes('kya baat kr rhi') ||
    text.includes('kis trah ki baat') ||
    text.includes('kis tarah ki baat') ||
    text.includes('kya matlab') ||
    text.includes('matlab kya') ||
    text.includes('i dont understand') ||
    text.includes("i don't understand") ||
    text.includes('what do you mean') ||
    text.includes('what are you saying') ||
    text.includes('confused') ||
    text.includes('not clear') ||
    text.includes('clear nahi') ||
    text.includes('clear nhi') ||
    text.includes('kuch samajh nahi') ||
    text.includes('kuch smjh nhi') ||
    text.includes('pata nahi kya') ||
    text.includes('ye kya hai') ||
    text.includes('ye kya h')
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

function hasFrustrationSignal(message) {
  const text = String(message || '').toLowerCase();
  if (!text) return false;

  return (
    // "why aren't you answering my question?"
    text.includes('question ka answer') ||
    text.includes('answer kyu nhi') ||
    text.includes('answer kyu nahi') ||
    text.includes('answer nahi') ||
    text.includes('answer nhi') ||
    text.includes('jawab kyu nhi') ||
    text.includes('jawab nahi') ||
    text.includes('jawab nhi') ||
    text.includes('meri baat nahi sun') ||
    text.includes('meri baat nhi sun') ||
    text.includes('sun nahi rahi') ||
    text.includes('sun nhi rahi') ||
    text.includes('sunta nahi') ||
    text.includes('sunti nahi') ||
    text.includes('you are not answering') ||
    text.includes("you're not answering") ||
    text.includes('not answering my') ||
    text.includes('answer my question') ||
    text.includes('ignoring my question') ||
    text.includes('mere sawaal') ||
    text.includes('mera sawaal') ||
    text.includes('meri baat ignore')
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

// Pure acknowledgment messages — customer is confirming/agreeing, not confused.
// These should never trigger a "please repeat yourself" response.
function hasSimpleAcknowledgement(message) {
  const text = normalizeMessageForRepeatCheck(message);
  if (!text) return false;
  return /^(okay|ok|thik|thik h|thik hai|theek|theek h|theek hai|sahi|sahi h|sahi hai|bilkul|bilkul sahi|right|sure|samjh gaya|smjh gaya|samajh gaya|samajh liya|samjh li|samajh li|got it|noted|understood|haan thik|acha thik|acha theek|theek hai ji)$/.test(text.trim());
}

function shouldAskCustomerToRepeat({
  customerMessage,
  detectedIntent,
  extracted,
  employmentType,
  monthlyIncome,
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
    hasConfusionSignal(customerMessage) ||
    hasFrustrationSignal(customerMessage) ||
    detectCallbackPreference(customerMessage) ||
    hasGreetingOrCourtesySignal(customerMessage) ||
    hasSimpleAcknowledgement(customerMessage)
  ) {
    return false;
  }

  if (extracted?.loanType || extracted?.amount || extracted?.timeline || employmentType || monthlyIncome) {
    return false;
  }

  const tokens = text.split(' ').filter(Boolean);
  if (!tokens.length) {
    return false;
  }

  if (isLowInformationOnlyMessage(customerMessage)) {
    return true;
  }

  const hasQuestionWord = /\b(what|why|how|when|where|which|kya|kaise|kab|kitna|kyun|kaun|kon|kahan|kise|kisko|kaisa|kitne)\b/.test(text);
  const substantiveTokenCount = tokens.filter(
    (token) => /[a-z\u0900-\u097f]/i.test(token) && token.length >= 4
  ).length;

  if (tokens.length <= 2 && !hasQuestionWord) {
    return true;
  }

  if (tokens.length <= 4 && substantiveTokenCount === 0 && !/\d/.test(text) && !hasQuestionWord) {
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

  if (/(monthly income|income range|income|salary|tankhwa|vetan|mahin(?:e|a))/i.test(normalized)) {
    return 'monthlyIncome';
  }

  if (/(loan amount|required amount|target amount|loan kitna|kitni amount|amount|lakh|lac|crore|rupees|rs)/.test(normalized)) {
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

const TENANT_LANGUAGE_RULES = {
  english: `LANGUAGE BEHAVIOR (MANDATORY)
  - You MUST respond in English only.
  - Use clear, simple, professional English suitable for a phone conversation.
  - Do NOT use Hindi, Hinglish, or any other language even if the customer switches.
  - Keep vocabulary simple — avoid complex jargon.
  - Voice persona and identity stay the same.`,

  hindi: `LANGUAGE BEHAVIOR (MANDATORY)
  - You MUST respond in Hindi (using Roman script, not Devanagari).
  - Use natural spoken Hindi like "Aapko kis prakar ka loan chahiye?" instead of formal or literary Hindi.
  - You may use common English loan/banking terms (EMI, loan, personal loan, home loan) but frame sentences in Hindi.
  - Do NOT switch to English even if the customer speaks in English — continue in Hindi.
  - Keep the tone respectful — use "aap", "ji", "kripya" naturally.
  - Voice persona and identity stay the same.`,

  hinglish: `LANGUAGE BEHAVIOR (MANDATORY)
  - Respond in Hinglish — a natural Hindi-heavy mix with English words.
  - Use Hindi sentence structure with English loan/banking terms sprinkled in naturally.
  - Example style: "Aapko kis type ka loan chahiye? Personal, home ya business?"
  - Mirror the customer's language mix — if they use more Hindi, lean more Hindi; if more English, add more English.
  - NEVER switch to pure English or pure Hindi — always keep the Hinglish mix.
  - Keep the tone conversational and friendly — use "ji", "aap" naturally.
  - Voice persona and identity stay the same.`,
};

function getTenantLanguageRulesBlock(language) {
  const key = String(language || 'hinglish').trim().toLowerCase();
  return TENANT_LANGUAGE_RULES[key] || TENANT_LANGUAGE_RULES.hinglish;
}

export class LLMConversationManager {
  constructor(
    customerProfile,
    companyName = 'FinServe Loans',
    aiAgentName = 'Priya Sharma',
    callbackPhone = null,
    humanAdvisorName = 'John Doe',
    tenantLanguage = 'hinglish'
  ) {
    this.customerProfile = customerProfile;
    this.companyName = companyName;
    this.aiAgentName = aiAgentName;
    this.callbackPhone = callbackPhone;
    this.humanAdvisorName = String(humanAdvisorName || 'John Doe').trim() || 'John Doe';
    this.tenantLanguage = String(tenantLanguage || 'hinglish').trim().toLowerCase();
    this.conversationHistory = [];
    this.currentStage = CONVERSATION_STAGES.OPENING;
    // Never pre-seed loanType, amount, or timeline from profile — always ask the customer.
    const seededLoanType = null;
    const seededTimeline = null;
    const seededEmploymentType = String(
      customerProfile?.employment_type || customerProfile?.employmentType || ''
    ).trim() || null;
    const seededAmount = null;
    const seededMonthlyIncome = toFiniteNumberOrNull(
      customerProfile?.monthly_income || customerProfile?.monthlyIncome || null
    );

    this.extractedData = {
      loanType: seededLoanType,
      amount: seededAmount,
      timeline: seededTimeline,
      employmentType: seededEmploymentType,
      monthlyIncome: seededMonthlyIncome,
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
      customerId: customerProfile?.id || null,
      tenantId: customerProfile?.tenantId || null,
      providerSessionId: this.buildProviderSessionId(),
      languageSignal: normalizeLanguageSignal({
        style: this.tenantLanguage === 'english' ? LANGUAGE_STYLES.ENGLISH
          : this.tenantLanguage === 'hindi' ? LANGUAGE_STYLES.HINDI
          : LANGUAGE_STYLES.HINGLISH,
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

  getKnownMonthlyIncome() {
    const candidates = [
      this.extractedData?.monthlyIncome,
      this.customerProfile?.monthly_income,
      this.customerProfile?.monthlyIncome,
    ];

    for (const candidate of candidates) {
      const parsed = toFiniteNumberOrNull(candidate);
      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
      }
    }

    return null;
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
      return variants.hindi || variants.hinglish || variants.english || variants.defaultText || '';
    }

    if (signal.style === LANGUAGE_STYLES.HINGLISH) {
      return variants.hinglish || variants.hindi || variants.english || variants.defaultText || '';
    }

    if (signal.style === LANGUAGE_STYLES.ENGLISH) {
      return variants.english || variants.hinglish || variants.hindi || variants.defaultText || '';
    }

    return variants.defaultText || variants.hinglish || variants.hindi || variants.english || '';
  }

  getIdentityCorrectionLine() {
    return this.getLanguageText({
      english: `No, I am ${this.aiAgentName} from ${this.companyName}. You are ${this.customerProfile?.name || 'the customer'}.`,
      hinglish: `Nahi ji, main ${this.aiAgentName} hoon ${this.companyName} se. Aap ${this.customerProfile?.name || 'grahak'} hain.`,
      hindi: `Nahi ji, main ${this.aiAgentName} hoon ${this.companyName} se. Aap ${this.customerProfile?.name || 'grahak'} hain.`,
      defaultText: `I am ${this.aiAgentName} from ${this.companyName}.`,
    });
  }

  /**
   * Returns customer first name with "ji" suffix for Hindi/Hinglish,
   * or just the name for English — used as a prefix in every reply.
   */
  getCustomerNamePrefix() {
    const fullName = String(this.customerProfile?.name || '').trim();
    const [firstName] = fullName.split(/\s+/);
    if (!firstName) return '';
    const signal = this.getLanguageSignal();
    if (signal.style === LANGUAGE_STYLES.ENGLISH) {
      return firstName;
    }
    return `${firstName} ji`;
  }

  getFallbackClarificationMessage() {
    return this.getLanguageText({
      english: 'Sorry, I did not understand what you said. Could you please repeat that?',
      hinglish: 'Maaf kijiye, main aapki baat samajh nahi paayi. Kya aap dobara bata sakte hain?',
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
      id: this.customerProfile?.id || this.callMeta?.customerId || null,
      tenantId: this.callMeta?.tenantId || this.customerProfile?.tenantId || null,
      firstName,
      city: this.customerProfile?.city || null,
      loanType: this.customerProfile?.loan_interest_type || this.extractedData.loanType || null,
      loanAmount: this.extractedData.amount || null,
      monthlyIncome: this.getKnownMonthlyIncome(),
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
    const namePrefix = this.getCustomerNamePrefix();
    const nameComma = namePrefix ? `${namePrefix}, ` : '';

    // For balance transfer / interest-rate reduction, skip amount & timeline collection.
    // The customer wants to reduce interest on their existing loan — hand off to advisor.
    if (this.extractedData.loanType === 'balance_transfer') {
      const advisor = this.humanAdvisorName || 'hamara advisor';
      return this.getLanguageText({
        hindi: `${nameComma}hamari company aapko best se best offer degi. ${advisor} aapko kuch hi der mein call karenge aur aapko best offer dene ki zimmedari hamari hai.`,
        hinglish: `${nameComma}hamari company aapko best offer degi. ${advisor} aapko jald hi call karenge — aapka balance transfer possible hai.`,
        english: `${nameComma}our company will get you the best possible offer. ${advisor} will call you shortly to arrange the balance transfer.`,
        defaultText: `${nameComma}our advisor will call you shortly with the best offer for your balance transfer.`,
      });
    }

    if (!this.extractedData.loanType) {
      return this.getLanguageText({
        english: `${nameComma}to guide you correctly, is this for personal, home, business, auto, or balance transfer loan?`,
        hinglish: `${nameComma}aapko sahi guide karne ke liye bataye, personal, home, business, auto, ya balance transfer loan chahiye?`,
        hindi: `${nameComma}aapko sahi guide karne ke liye bataye, personal, home, business, auto, ya balance transfer loan chahiye?`,
        defaultText: `${nameComma}to guide you correctly, is this for personal, home, business, auto, or balance transfer loan?`,
      });
    }

    if (!this.extractedData.amount) {
      return this.getLanguageText({
        english: `${nameComma}what approximate amount are you planning for, like 5 lakh, 10 lakh, or 20 lakh?`,
        hinglish: `${nameComma}approx amount kitna plan kar rahe hain, jaise 5 lakh, 10 lakh, ya 20 lakh?`,
        hindi: `${nameComma}approx amount kitna plan kar rahe hain, jaise 5 lakh, 10 lakh, ya 20 lakh?`,
        defaultText: `${nameComma}what approximate amount are you planning for?`,
      });
    }

    if (!this.extractedData.timeline) {
      return this.getLanguageText({
        english: `${nameComma}by when do you need this loan, this week, this month, or later?`,
        hinglish: `${nameComma}aapko yeh loan kab tak chahiye, is week, is month, ya thoda baad?`,
        hindi: `${nameComma}aapko yeh loan kab tak chahiye, is week, is month, ya thoda baad?`,
        defaultText: `${nameComma}by when do you need this loan?`,
      });
    }

    if (!this.extractedData.employmentType) {
      return this.getLanguageText({
        english: `${nameComma}one quick check: are you salaried or self-employed/business?`,
        hinglish: `${nameComma}ek quick check, aap salaried hain ya self-employed/business?`,
        hindi: `${nameComma}ek quick check, aap salaried hain ya self-employed/business?`,
        defaultText: `${nameComma}one quick check: are you salaried or self-employed/business?`,
      });
    }

    return this.getLanguageText({
      english: `${nameComma}should I proceed with a quick eligibility check now?`,
      hinglish: `${nameComma}kya main ab ek quick eligibility check proceed karun?`,
      hindi: `${nameComma}kya main ab ek quick eligibility check proceed karun?`,
      defaultText: `${nameComma}should I proceed with a quick eligibility check now?`,
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

  /**
   * Confusion-repair reply: re-introduce, clarify, and re-ask the previous question simply.
   */
  buildConfusionRepairReply() {
    const namePrefix = this.getCustomerNamePrefix();
    const nameComma = namePrefix ? `${namePrefix}, ` : '';
    const nextQuestion = this.buildProgressiveFollowUpMessage();

    return this.joinReplyParts(
      this.getLanguageText({
        english: `${nameComma}sorry if that was unclear. I am ${this.aiAgentName} calling from ${this.companyName} about a loan enquiry. Let me ask simply.`,
        hinglish: `${nameComma}maafi chahungi agar meri baat clear nahi thi. Main ${this.aiAgentName} hoon ${this.companyName} se, loan enquiry ke liye call kar rahi hoon. Main simple tarike se puchti hoon.`,
        hindi: `${nameComma}maafi chahungi agar meri baat clear nahi thi. Main ${this.aiAgentName} hoon ${this.companyName} se, loan enquiry ke liye call kar rahi hoon. Main simple tarike se puchti hoon.`,
        defaultText: `${nameComma}sorry if that was unclear. I am ${this.aiAgentName} from ${this.companyName}. Let me ask simply.`,
      }),
      nextQuestion
    );
  }

  buildFrustrationAcknowledgementReply() {
    const namePrefix = this.getCustomerNamePrefix();
    const nameComma = namePrefix ? `${namePrefix}, ` : '';
    const advisorName = this.humanAdvisorName || 'our advisor';
    const nextQuestion = this.buildProgressiveFollowUpMessage();

    return this.joinReplyParts(
      this.getLanguageText({
        english: `${nameComma}I completely understand your concern. Specific rate and offer details will be shared by ${advisorName} who can check the best option for your profile. ${nextQuestion}`,
        hinglish: `${nameComma}main samajhti hoon aapki baat. Rate aur offer ki exact details ${advisorName} aapko personally batayenge jo aapke profile ke hisaab se best option check karenge. ${nextQuestion}`,
        hindi: `${nameComma}main samajhti hoon aapki baat. Rate aur offer ki exact jaankari ${advisorName} aapko personally batayenge jo aapke profile ke hisaab se best option dekhenge. ${nextQuestion}`,
        defaultText: `${nameComma}I understand. ${advisorName} will share the exact offer and rate details. ${nextQuestion}`,
      })
    );
  }

  buildAdaptiveRepetitionReply() {
    const namePrefix = this.getCustomerNamePrefix();
    const nameComma = namePrefix ? `${namePrefix}, ` : '';
    return this.joinReplyParts(
      this.getLanguageText({
        english: `${nameComma}I have already noted what you shared, I will not repeat it.`,
        hinglish: `${nameComma}aapne jo details batayi hain maine note kar li hain, main unhe dobara repeat nahi karungi.`,
        hindi: `${nameComma}aapne jo details batayi hain maine note kar li hain, main unhe dobara repeat nahi karungi.`,
        defaultText: `${nameComma}I have already noted what you shared, I will not repeat it.`,
      }),
      this.buildProgressiveFollowUpMessage()
    );
  }

  buildAdaptiveEligibilityReply() {
    const namePrefix = this.getCustomerNamePrefix();
    const nameComma = namePrefix ? `${namePrefix}, ` : '';
    if (!this.extractedData.amount) {
      this.extractedData.amount = 'MAXIMUM';
    }

    return this.joinReplyParts(
      this.getLanguageText({
        english: `${nameComma}sure, we will process for the maximum amount based on your profile.`,
        hinglish: `${nameComma}bilkul, aapki profile ke according maximum amount ke liye process karenge.`,
        hindi: `${nameComma}bilkul, aapki profile ke according maximum amount ke liye process karenge.`,
        defaultText: `${nameComma}sure, we will process for the maximum amount based on your profile.`,
      }),
      this.buildProgressiveFollowUpMessage()
    );
  }

  buildAdaptiveProceedReply() {
    const namePrefix = this.getCustomerNamePrefix();
    const nameComma = namePrefix ? `${namePrefix}, ` : '';
    return this.joinReplyParts(
      this.getLanguageText({
        english: `${nameComma}sure, I can continue from here.`,
        hinglish: `${nameComma}theek hai, main yahin se continue karti hoon.`,
        hindi: `${nameComma}theek hai, main yahin se continue karti hoon.`,
        defaultText: `${nameComma}sure, I can continue from here.`,
      }),
      this.buildProgressiveFollowUpMessage()
    );
  }

  buildAdaptiveExplanationReply() {
    const namePrefix = this.getCustomerNamePrefix();
    const nameComma = namePrefix ? `${namePrefix}, ` : '';
    const loanTypeLabel = this.humanizeLoanTypeForReply();
    const explanationPrefix = loanTypeLabel
      ? this.getLanguageText({
          english: `${nameComma}for ${loanTypeLabel}, the exact offer depends on profile, amount, and repayment capacity.`,
          hinglish: `${nameComma}${loanTypeLabel} ke liye exact offer profile, amount aur repayment capacity par depend karta hai.`,
          hindi: `${nameComma}${loanTypeLabel} ke liye exact offer profile, amount aur repayment capacity par depend karta hai.`,
          defaultText: `${nameComma}for ${loanTypeLabel}, the exact offer depends on profile, amount, and repayment capacity.`,
        })
      : this.getLanguageText({
          english: `${nameComma}I can explain the key loan details in one line.`,
          hinglish: `${nameComma}main key loan details ek line me explain kar deti hoon.`,
          hindi: `${nameComma}main key loan details ek line me explain kar deti hoon.`,
          defaultText: `${nameComma}I can explain the key loan details in one line.`,
        });

    return this.joinReplyParts(explanationPrefix, this.buildProgressiveFollowUpMessage());
  }

  buildAdaptiveReplyForCustomerMessage(customerMessage, candidateMessage = '') {
    const normalizedCustomerMessage = normalizeMessageForRepeatCheck(customerMessage);
    if (!normalizedCustomerMessage) {
      return null;
    }

    // Confusion / "I didn't understand" — repair before anything else
    if (hasConfusionSignal(customerMessage)) {
      return this.buildConfusionRepairReply();
    }

    // Customer frustrated that their question isn't being answered
    if (hasFrustrationSignal(customerMessage)) {
      return this.buildFrustrationAcknowledgementReply();
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
    // Only suppress a repeated slot question when that slot is already captured.
    // If the customer still hasn't answered, asking again is valid — don't override.
    const slotAlreadyCaptured = candidatePromptSlot ? Boolean(this.extractedData[candidatePromptSlot]) : false;
    const repeatsPromptSlot = Boolean(
      slotAlreadyCaptured && this.getRecentPromptSlots(2).includes(candidatePromptSlot)
    );
    const candidateLooksRepeated = Boolean(
      candidateMessage && latestAiMessage && areMessagesNearDuplicate(latestAiMessage, candidateMessage)
    );
    const asksCapturedField = candidateMessage ? this.messageAsksForCapturedField(candidateMessage) : false;
    const wordCount = normalizedCustomerMessage.split(' ').filter(Boolean).length;

    if (repeatsPromptSlot || candidateLooksRepeated || asksCapturedField || wordCount <= 2) {
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
    // Only treat it as a repeated slot if the slot is already captured — otherwise the
    // customer hasn't answered yet and persistence is correct, not a bug.
    const slotAlreadyCapturedAvoid = candidatePromptSlot ? Boolean(this.extractedData[candidatePromptSlot]) : false;
    const repeatsPromptSlot = Boolean(
      slotAlreadyCapturedAvoid && recentPromptSlots.includes(candidatePromptSlot)
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
      english: 'Let me quickly suggest the best next step for you.',
      hinglish: 'Main ab aapke liye best next step suggest karti hoon.',
      hindi: 'Main ab aapke liye best next step suggest karti hoon.',
      defaultText: 'Let me quickly suggest the best next step for you.',
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
    const looksQuestion = text.includes('?') || /(noted|to guide|one quick check|quick check|by when|what|which|how much|kitna|kab|kya|can you|could you|please|confirm|bataye|bataiye)/i.test(normalized);
    if (!looksQuestion) {
      return false;
    }

    const asksLoanType = /(loan type|personal loan|home loan|business loan|auto loan|which loan|kis type)/.test(normalized);
    const asksMonthlyIncome = /(monthly income|income range|income|salary|tankhwa|vetan|mahin(?:e|a))/i.test(normalized);
    const asksAmount = /(loan amount|required amount|target amount|loan kitna|kitni amount|amount|lakh|lac|crore)/.test(normalized);
    const asksTimeline = /(by when|timeline|kab tak|when do you need|this week|this month|apply)/.test(normalized);
    const asksEmployment = /(employment|salaried|self employed|self-employed|business|job)/.test(normalized);

    return (
      (asksLoanType && Boolean(this.extractedData.loanType)) ||
      (asksMonthlyIncome && Boolean(this.getKnownMonthlyIncome())) ||
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
    const customerName = String(this.customerProfile?.name || 'Customer').trim();
    const [firstName = 'Customer'] = customerName.split(/\s+/);
    const customerInfo = `
Customer Profile:
- Name: ${customerName}
- City: ${this.customerProfile?.city || 'Not specified'}
- Monthly Income: ₹${this.getKnownMonthlyIncome() || 'Unknown'}
- Employment: ${this.customerProfile?.employment_type || 'Not specified'}
- Credit Score: ${this.customerProfile?.credit_score || 'Unknown'}
- Existing Loans: ${this.customerProfile?.existing_loans || 'None'}
`;

    const mandatorySlots = ['loanType', 'amount', 'timeline'];
    const knownFields = [];
    const missingFields = [];
    for (const slot of mandatorySlots) {
      const value = this.extractedData[slot];
      if (value) {
        knownFields.push(`${slot} = ${value}`);
      } else {
        missingFields.push(slot);
      }
    }

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

  CUSTOMER NAME PERSONALIZATION
  - Always address the customer as "${firstName} ji" (Hindi/Hinglish) or "${firstName}" (English) at the start of every reply.
  - This makes them feel you are speaking directly to them.

  VOICE AND PERSONALITY
  - Warm, friendly, professional, confident, patient
  - Speak like a helpful bank relationship manager
  - Never mention you are an AI or virtual assistant

  IDENTITY AND BOUNDARY
  - You are ${this.aiAgentName} from ${this.companyName}
  - If customer assigns a wrong identity, correct politely in this style: "${this.getIdentityCorrectionLine()}"
  - Never accept false identity claims

  ${getTenantLanguageRulesBlock(this.tenantLanguage)}

  HUMAN-LIKE CALL STYLE
  - Use phone-friendly short responses (1-3 short sentences)
  - Ask at most one question per turn
  - Use quick acknowledgements before answers
  - Never overtalk

  BANNED PHRASES
  - Never say "noted", "noted ji", "recorded", or "understood" as standalone acknowledgments.
  - Never use robotic filler like "Sure ji", "Right sir", or "Got it" alone without adding value.
  - Use natural spoken Hindi/Hinglish acknowledgments: "Ji, samjha.", "Koi baat nahi.", "Bas thodi jaankari chahiye.", "Theek hai."

  CONFUSION RECOVERY
  - When the customer says they did not understand or seems confused, do NOT advance.
  - Briefly clarify who you are, apologize, and re-ask the same question in simpler language.

  INTERRUPTION HANDLING
  - If customer interrupts, stop immediately
  - Acknowledge politely: "Ji sir, boliye." or "Ji ma'am, boliye."
  - Continue naturally after customer finishes

  CONVERSATION FLOW (NATURAL)
  1. Greeting and permission to talk
  2. Purpose: loan enquiry follow-up
  3. Intent discovery: whether customer needs a loan now
  4. Requirement discovery: loan type, amount, timeline
  5. Once all three are collected → advisor handoff and closing
  6. If customer declines/busy → polite closing

  SLOT-GATED PROGRESSION
  - You MUST collect these three fields before closing: loan type, required amount, and loan timeline.
  - Do NOT advance to advisor handoff or closing until all three are captured.
  - Known fields: ${knownFields.length ? knownFields.join(', ') : 'none'}
  - Missing fields: ${missingFields.length ? missingFields.join(', ') : 'all captured — proceed to closing'}
  ${missingFields.length ? `- Your next reply MUST ask for: ${missingFields[0]}` : ''}

  OBJECTION HANDLING
  - If rate concern: acknowledge and highlight practical benefit
  - If trust concern: reassure calmly
  - If not interested: acknowledge respectfully, then close politely
  - If busy: ask preferred callback time
  - If do-not-call/harassment request: apologize, confirm no further calls, and end immediately

  ${customerInfo}

  Current Conversation Stage: ${this.currentStage}

  CRITICAL OUTPUT RULES
  - Keep each reply short and natural for voice call rhythm
  - Keep language mirroring strict and consistent
  - Be persuasive but never forceful
  - If customer asks a direct question, answer first before asking the next missing detail
  - If the latest customer response is unclear, politely say you did not understand and ask them to repeat
  - If customer says "kar do", "please do", or "do that", continue from the current step
  - Never ask for a field that is already known
  - End only when customer declines, asks not to be called, requests callback, or all mandatory fields are captured.`;
  }

  /**
   * Get opening greeting
   */
  getOpeningGreeting() {
    const name = this.customerProfile?.name || 'Friend';
    return this.getLanguageText({
      english: `Hello ${name}, this is ${this.aiAgentName} from ${this.companyName}. Is this a good time for a quick 30-second loan discussion?`,
      hinglish: `Namaste ${name} ji, main ${this.aiAgentName} ${this.companyName} se bol rahi hoon. Kya abhi 30 second baat karna theek rahega?`,
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
    const namePrefix = this.getCustomerNamePrefix();
    const nameComma = namePrefix ? `${namePrefix}, ` : '';

    if (finalIntent === 'busy' || finalIntent === 'call_back_later') {
      return this.getLanguageText({
        english: `${nameComma}sorry for calling at a bad time. We will call you again ${localizedCallbackTime.english}. If needed, you can also reach us on ${spokenCallbackNumber}.`,
        hinglish: `${nameComma}maafi chahungi, lagta hai maine galat samay par call kiya. Hum aapko ${localizedCallbackTime.hinglish} phir call karenge. Zarurat ho to aap hume ${spokenCallbackNumber} par bhi sampark kar sakte hain.`,
        hindi: `${nameComma}maafi chahungi, lagta hai maine galat samay par call kiya. Hum aapko ${localizedCallbackTime.hindi} phir call karenge. Zarurat ho to aap hume ${spokenCallbackNumber} par bhi sampark kar sakte hain.`,
        defaultText: `${nameComma}sorry for calling at a bad time. We will call you again ${localizedCallbackTime.english}. If needed, you can also reach us on ${spokenCallbackNumber}.`,
      });
    }

    if (shouldUseHumanAdvisorHandoff) {
      // BT-specific closing: ask for preferred callback time + give callback number + proper goodbye
      if (this.extractedData.loanType === 'balance_transfer') {
        return this.getLanguageText({
          hindi: `${nameComma}bahut achha. ${this.humanAdvisorName} aapko jald callback karenge aur best balance transfer offer ke saath aapki poori madad karenge. Aapke liye subah ya shaam mein kab call karna zyada suit karega? Agar zarurat ho to aap hume ${spokenCallbackNumber} par bhi khud call kar sakte hain. Dhanyavaad, namaste!`,
          hinglish: `${nameComma}bahut badhiya. ${this.humanAdvisorName} jald aapko callback karenge — best balance transfer offer ke saath. Aapko subah ya shaam kab suit karega call ke liye? Aap hume ${spokenCallbackNumber} par bhi sampark kar sakte hain. Dhanyavaad!`,
          english: `${nameComma}${this.humanAdvisorName} will call you back soon with the best balance transfer offer. Would morning or evening be more convenient for you? You can also reach us directly on ${spokenCallbackNumber}. Thank you!`,
          defaultText: `${nameComma}our advisor will call you back with the best offer. Morning or evening — when would be more convenient? You can also reach us on ${spokenCallbackNumber}. Thank you!`,
        });
      }
      return this.getLanguageText({
        english: `${nameComma}great. I will now connect you with our best human advisor ${this.humanAdvisorName}. He will give you the best loan offer and call you shortly. You can also call us on ${spokenCallbackNumber}.`,
        hinglish: `${nameComma}bahut badhiya. Main ab aapko hamare best human advisor ${this.humanAdvisorName} se connect karwa rahi hoon. Wo aapko best loan offer denge aur jaldi call karenge. Aap hume ${spokenCallbackNumber} par bhi call kar sakte hain.`,
        hindi: `${nameComma}bahut badhiya. Main ab aapko hamare best human advisor ${this.humanAdvisorName} se connect karwa rahi hoon. Wo aapko best loan offer denge aur jaldi call karenge. Aap hume ${spokenCallbackNumber} par bhi call kar sakte hain.`,
        defaultText: `${nameComma}great. I will now connect you with our best human advisor ${this.humanAdvisorName}. He will give you the best loan offer and call you shortly. You can also call us on ${spokenCallbackNumber}.`,
      });
    }

    return this.getLanguageText({
      english: `${nameComma}thank you for your time. If you need any loan assistance in future, please call our team on ${spokenCallbackNumber}. We are always happy to help.`,
      hinglish: `${nameComma}dhanyavaad, aapke samay ke liye. Bhavishya me loan sahayata ke liye aap hume ${spokenCallbackNumber} par call kar sakte hain. Hamari team madad ke liye tayyar hai.`,
      hindi: `${nameComma}dhanyavaad, aapke samay ke liye. Bhavishya me loan sahayata ke liye aap hume ${spokenCallbackNumber} par call kar sakte hain. Hamari team madad ke liye tayyar hai.`,
      defaultText: `${nameComma}thank you for your time. If you need any loan assistance in future, please call our team on ${spokenCallbackNumber}. We are always happy to help.`,
    });
  }

  getLocalizedCallbackTimeLabel(callbackTime) {
    const normalized = String(callbackTime || '').trim().toLowerCase() || 'later';
    const afterTimeMatch = normalized.match(/^after\s+(.+)$/i);

    if (afterTimeMatch?.[1]) {
      const timeValue = afterTimeMatch[1].trim();
      return {
        english: `after ${timeValue}`,
        hinglish: `${timeValue} baje ke baad`,
        hindi: `${timeValue} बजे के बाद`,
      };
    }

    if (normalized === 'tomorrow morning') {
      return {
        english: 'tomorrow morning',
        hinglish: 'kal subah',
        hindi: 'कल सुबह',
      };
    }

    if (normalized === 'tomorrow evening') {
      return {
        english: 'tomorrow evening',
        hinglish: 'kal shaam',
        hindi: 'कल शाम',
      };
    }

    if (normalized === 'in the morning') {
      return {
        english: 'in the morning',
        hinglish: 'subah',
        hindi: 'सुबह',
      };
    }

    if (normalized === 'in the evening') {
      return {
        english: 'in the evening',
        hinglish: 'shaam mein',
        hindi: 'शाम में',
      };
    }

    return {
      english: 'later',
      hinglish: 'baad mein',
      hindi: 'बाद में',
    };
  }

  /**
   * Generate AI response using Claude or OpenAI Chat API
   * This provides ChatGPT/Claude-level intelligence
   */
  async generateAIResponse(customerMessage = null) {
    console.log('\n[generateAIResponse] Called with customerMessage:', customerMessage ? customerMessage.substring(0, 80) + '...' : '(null)');
    console.log('[generateAIResponse] currentStage:', this.currentStage);
    console.log('[generateAIResponse] conversationHistory length:', this.conversationHistory.length);

    // If at closing stage, return closing greeting
    if (this.currentStage === CONVERSATION_STAGES.CLOSING) {
      console.log('📞 [Closing Stage] Generating closing greeting with callback number');
      return this.getClosingGreeting();
    }

    try {
      if (!customerMessage && this.conversationHistory.length === 0) {
        // First message - return opening greeting
        console.log('[generateAIResponse] No customerMessage + empty history → returning opening greeting');
        return this.getOpeningGreeting();
      }

      let languagePreferenceCommand = null;
      let activeLanguageSignal = this.getLanguageSignal();
      console.log('[generateAIResponse] Initial language signal:', JSON.stringify(activeLanguageSignal));
      if (customerMessage) {
        languagePreferenceCommand = detectLanguagePreferenceCommand(customerMessage);
        if (languagePreferenceCommand) {
          console.log('[generateAIResponse] Language preference command detected:', JSON.stringify(languagePreferenceCommand));
          this.callMeta.languageSignal = normalizeLanguageSignal(languagePreferenceCommand);
          activeLanguageSignal = this.getLanguageSignal();
        } else {
          activeLanguageSignal = this.updateLanguageSignal(customerMessage);
          console.log('[generateAIResponse] Updated language signal:', JSON.stringify(activeLanguageSignal));
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

      const callTurnPayload = {
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
      };

      console.log('[generateAIResponse] 📡 Calling runAIWithFailover(CALL_TURN)');
      console.log('[generateAIResponse] → latestCustomerMessage:', callTurnPayload.latestCustomerMessage);
      console.log('[generateAIResponse] → transcript (last 200 chars):', callTurnPayload.transcript.slice(-200));
      console.log('[generateAIResponse] → turn:', callTurnPayload.turn);
      console.log('[generateAIResponse] → conversationStage:', callTurnPayload.context.conversationStage);
      console.log('[generateAIResponse] → languageSignal:', JSON.stringify(callTurnPayload.context.languageSignal));
      console.log('[generateAIResponse] → languageInstruction:', callTurnPayload.context.languageInstruction?.substring(0, 100));
      console.log('[generateAIResponse] → extractedData:', JSON.stringify(callTurnPayload.context.extractedData));

      const aiOutput = await runAIWithFailover({
        task: 'CALL_TURN',
        payload: callTurnPayload,
        activeOnly: true,
      });

      this.callMeta.aiProviderUsed = aiOutput?.provider?.name || aiOutput?.provider?.type || null;
      console.log('[generateAIResponse] ✅ CALL_TURN response received');
      console.log('[generateAIResponse] → provider used:', this.callMeta.aiProviderUsed);
      console.log('[generateAIResponse] → raw reply:', aiOutput?.result?.reply);
      console.log('[generateAIResponse] → shouldEnd:', aiOutput?.result?.shouldEnd);

      let aiMessage = String(aiOutput?.result?.reply || '').trim() || this.getOpeningGreeting();
      aiMessage = humanizeCallReply(aiMessage, activeLanguageSignal, this.currentStage);
      console.log('[generateAIResponse] → humanized reply:', aiMessage);
      const adaptiveReply = customerMessage
        ? this.buildAdaptiveReplyForCustomerMessage(customerMessage, aiMessage)
        : null;
      if (adaptiveReply) console.log('[generateAIResponse] → adaptive reply override:', adaptiveReply);
      aiMessage = adaptiveReply || this.avoidRepeatedPrompt(aiMessage);
      console.log('[generateAIResponse] → final reply (after dedup):', aiMessage);
      
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
      const monthlyIncome = extractMonthlyIncomeFromMessage(customerMessage);

      console.log('[processCustomerResponse] Rule-based intent:', JSON.stringify(detectedIntent));
      console.log('[processCustomerResponse] Extracted loan details:', JSON.stringify(extracted));
      console.log('[processCustomerResponse] Employment type:', employmentType);
      console.log('[processCustomerResponse] Monthly income detected:', monthlyIncome);

      const previousIntent = String(this.callMeta.intent || '').toLowerCase();
      const hadPriorPositiveIntent = previousIntent === 'interested' || previousIntent === 'converted';
      const activeStage = this.currentStage;

      if (extracted.loanType) this.extractedData.loanType = extracted.loanType;
      if (extracted.amount) this.extractedData.amount = extracted.amount;
      if (extracted.timeline) this.extractedData.timeline = extracted.timeline;
      if (employmentType) this.extractedData.employmentType = employmentType;
      if (monthlyIncome) this.extractedData.monthlyIncome = monthlyIncome;

      const hasStructuredLoanSignal = Boolean(
        extracted.loanType || extracted.amount || extracted.timeline || employmentType || monthlyIncome
      );
      const repetitionComplaint = hasRepetitionComplaint(customerMessage);
      const clarificationRequired = shouldAskCustomerToRepeat({
        customerMessage,
        detectedIntent,
        extracted,
        employmentType,
        monthlyIncome,
        languagePreferenceCommand,
      });

      let finalIntent = String(detectedIntent.intent || 'neutral').toLowerCase();
      let finalConfidence = normalizeConfidence(detectedIntent.confidence, 0.5);
      let reasoning = detectedIntent?.details?.reason || 'rule-based intent detection';
      const isHardStopIntent = finalIntent === 'do_not_call';
      const ruleBasedIntent = String(detectedIntent.intent || 'neutral').toLowerCase();
      let providerIntent = null;

      // CONFUSED intent — separate path: no stage advancement, no provider override.
      if (finalIntent === 'confused') {
        console.log('[processCustomerResponse] 🤔 Confused intent detected — holding stage, skipping provider summary.');
        const nextStage = this.currentStage; // stay in current stage
        this.callMeta.intent = 'confused';
        this.callMeta.confidence = finalConfidence;
        this.callMeta.awaitingClarification = false;

        return {
          intent: 'confused',
          confidence: finalConfidence,
          extractedData: {
            ...this.extractedData,
            preferredCallbackTime: this.callMeta.callbackTime || null,
          },
          nextStage,
          shouldEnd: false,
          reasoning,
        };
      }

      if (languagePreferenceCommand && !isHardStopIntent) {
        finalIntent = 'neutral';
        finalConfidence = Math.max(finalConfidence, 0.9);
        reasoning = `language-preference:${languagePreferenceCommand.style}`;
      }

      try {
        // Skip summary intent override on explicit language-switch turns and low-information clarification turns.
        if ((!languagePreferenceCommand && !clarificationRequired) || isHardStopIntent) {
          console.log('[processCustomerResponse] 📡 Calling runAIWithFailover(CALL_SUMMARY)');
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
            // do_not_call requires explicit customer keywords — never set by LLM alone.
            if (providerIntent === 'do_not_call' && ruleBasedIntent !== 'do_not_call') {
              console.log('[LLMConversationManager] Blocked provider do_not_call escalation — rule-based:', ruleBasedIntent);
            } else {
              // LLM is the primary source of truth for all other intents.
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

      // Slot gate: require loanType + amount + timeline before treating intent as converted.
      const hasConversionSignals = Boolean(this.extractedData.loanType && this.extractedData.amount && this.extractedData.timeline);
      if (finalIntent === 'converted' && !hasConversionSignals) {
        finalIntent = 'interested';
        finalConfidence = Math.max(finalConfidence, 0.78);
        reasoning = `${reasoning}:downgraded_pre_qualification`;
      }

      // Safety net: LLM said neutral but customer gave concrete loan data — promote to interested.
      if (!END_INTENTS.has(finalIntent) && finalIntent === 'neutral' && hasStructuredLoanSignal) {
        finalIntent = 'interested';
        finalConfidence = Math.max(finalConfidence, 0.74);
        reasoning = `${reasoning}:structured_signal_guard`;
      }

      // Late-timing guard: LLM has no time-of-day context — override to callback when relevant.
      const explicitNegativeSignal = hasExplicitNegativeSignal(customerMessage);
      const callbackPreference = detectCallbackPreference(customerMessage);
      const lateTimingSignal = hasLateTimingSignal(customerMessage);
      if (lateTimingSignal && !explicitNegativeSignal) {
        finalIntent = 'call_back_later';
        finalConfidence = Math.max(finalConfidence, 0.9);
        this.callMeta.callbackTime = callbackPreference?.callbackTime || inferCallbackTimeFromMessage(customerMessage);
        reasoning = `${reasoning}:late_timing_callback_guard`;
      }

      // Persist callback time when LLM independently chose a callback intent.
      if (['busy', 'call_back_later'].includes(finalIntent) && !this.callMeta.callbackTime) {
        this.callMeta.callbackTime = callbackPreference?.callbackTime || inferCallbackTimeFromMessage(customerMessage) || null;
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
   * Determine next conversation stage.
   * Slot-gated: only advances when required fields are actually captured.
   * Required for closing: loanType + amount + timeline.
   */
  determineNextStage(intent, shouldEnd = false) {
    // If AI explicitly decides the call must end (e.g. strong do-not-call),
    // or we have a clear do_not_call intent, always close.
    if (shouldEnd || intent === 'do_not_call' || intent === 'not_interested') {
      return CONVERSATION_STAGES.CLOSING;
    }

    // If busy, also close (callback will be scheduled)
    if (intent === 'busy' || intent === 'call_back_later') {
      return CONVERSATION_STAGES.CLOSING;
    }

    // Confused should NOT advance the stage — stay where we are.
    if (intent === 'confused') {
      return this.currentStage;
    }

    const hasLoanType = Boolean(this.extractedData.loanType);
    const hasAmount = Boolean(this.extractedData.amount);
    const hasTimeline = Boolean(this.extractedData.timeline);
    // For balance transfer, amount and timeline are never collected — only loanType is mandatory.
    const isBt = this.extractedData.loanType === 'balance_transfer';
    const hasMandatorySlots = isBt ? hasLoanType : (hasLoanType && hasAmount && hasTimeline);

    // Converted should close only after all mandatory fields are captured.
    if (intent === 'converted') {
      if (hasMandatorySlots) {
        return CONVERSATION_STAGES.CLOSING;
      }
      intent = 'interested';
    }

    // Progress through normal stages
    switch (this.currentStage) {
      case CONVERSATION_STAGES.OPENING:
        if (intent === 'interested') {
          return CONVERSATION_STAGES.DISCOVERY;
        }
        return CONVERSATION_STAGES.OPENING;

      case CONVERSATION_STAGES.DISCOVERY:
        // Need at least 2 of the 3 mandatory slots to move to PITCH
        if (hasMandatorySlots) {
          return CONVERSATION_STAGES.QUALIFICATION;
        }
        if ((hasLoanType && hasAmount) || (hasLoanType && hasTimeline) || (hasAmount && hasTimeline)) {
          return CONVERSATION_STAGES.PITCH;
        }
        return CONVERSATION_STAGES.DISCOVERY;

      case CONVERSATION_STAGES.PITCH:
        if (hasMandatorySlots) {
          return CONVERSATION_STAGES.QUALIFICATION;
        }
        return CONVERSATION_STAGES.PITCH;

      case CONVERSATION_STAGES.QUALIFICATION:
        if (hasMandatorySlots) {
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
