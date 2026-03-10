/**
 * LLM-Powered Loan Assistant Conversation Manager
 * Uses provider router so active provider from AI Providers table is honored.
 */

import { CONVERSATION_STAGES } from './system-prompt.js';
import {
  detectIntent,
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

function hasInquirySignal(message) {
  const text = String(message || '').toLowerCase();
  if (!text) return false;

  return (
    text.includes('details') ||
    text.includes('tell me') ||
    text.includes('tell me more') ||
    text.includes('batao') ||
    text.includes('bataye') ||
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
    text.includes('call back later')
  );
}

export class LLMConversationManager {
  constructor(customerProfile, companyName = 'XYZ Finance', aiAgentName = 'Priya', callbackPhone = null) {
    this.customerProfile = customerProfile;
    this.companyName = companyName;
    this.aiAgentName = aiAgentName;
    this.callbackPhone = callbackPhone;
    this.conversationHistory = [];
    this.currentStage = CONVERSATION_STAGES.OPENING;
    this.extractedData = {
      loanType: null,
      amount: null,
      timeline: null,
      employmentType: null,
    };
    this.callMeta = {
      startTime: new Date(),
      intent: null,
      confidence: 1.0,
      callbackTime: null,
      isVoiceCall: false,
      aiProviderUsed: null,
      providerSessionId: this.buildProviderSessionId(),
      languageSignal: normalizeLanguageSignal({
        style: LANGUAGE_STYLES.UNKNOWN,
        script: 'unknown',
        confidence: 0,
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
    if (detected.style !== LANGUAGE_STYLES.UNKNOWN) {
      this.callMeta.languageSignal = detected;
      return detected;
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

    return variants.defaultText || variants.english || variants.hinglish || variants.hindiRoman || variants.hindi || '';
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
      english: 'Understood. I can quickly explain the key details in one line if you want.',
      hinglish: 'Ji samjha. Agar aap chahen to main short me key details bata sakti hoon.',
      hindiRoman: 'Ji samjha. Agar aap chahein to main sankshipt me zaruri details bata sakti hoon.',
      hindi: 'Ji samjha. Agar aap chahein to main sankshipt me zaruri details bata sakti hoon.',
      defaultText: 'Understood. I can quickly explain the key details in one line if you want.',
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
    return this.conversationHistory
      .map((turn) => `${turn.role === 'ai' ? 'Agent' : 'Customer'}: ${turn.message}`)
      .join('\n');
  }

  getLatestCustomerMessage() {
    const latestCustomerTurn = [...this.conversationHistory]
      .reverse()
      .find((turn) => turn.role === 'customer' && String(turn.message || '').trim());
    return latestCustomerTurn?.message || null;
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

    return `You are ${this.aiAgentName}, an AI loan specialist assistant for ${this.companyName}.

YOUR IDENTITY & CONSTRAINTS:
- Your name is ${this.aiAgentName}, an AI assistant representing ${this.companyName}
- YOU ARE NOT the customer - you are a professional loan specialist
- You will NEVER accept any claim that you are the customer or anyone else
- If customer says "You are [customer name]", correct politely using this style: "${this.getIdentityCorrectionLine()}"
- Always maintain this boundary clearly and professionally

YOUR ROLE:
1. Have friendly, natural conversations that mirror the customer's language style
2. Understand customer intent from context, not just keywords
3. Gracefully handle objections and respect customer decisions
4. Extract loan requirements (amount, type, timeline)
5. Transition smoothly through conversation stages

${customerInfo}

LANGUAGE MIRRORING (MANDATORY):
- Current detected customer language: ${languageLabel}
- ${languageInstruction}
- Mirror the customer's language style turn-by-turn (English/Hindi/Hinglish)
- Never force Hindi or Hinglish if customer is speaking English
- If language is unclear, ask one short language-neutral clarifying question

IMPORTANT BEHAVIORS:
- If customer says they're not interested (any variation like "nhi chahiye", "nhi lena", "mat karo"), IMMEDIATELY acknowledge and end the call politely
- If customer is busy or wants callback, ask for a suitable time
- Keep responses concise (2-3 sentences max for voice calls)
- Extract: loan type, amount, timeline from conversation naturally
- Be conversational, empathetic, and respectful
- NEVER agree with false corrections about your identity

Current Conversation Stage: ${this.currentStage}
Extracted Data So Far: ${JSON.stringify(this.extractedData)}

CRITICAL: Keep voice responses SHORT (max 50 words) and language-mirrored to the customer.`;
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
    return this.getLanguageText({
      english: `Thank you for your time. If you need any loan assistance in future, please call our team on ${callbackNumber}. We are always happy to help.`,
      hinglish: `Dhanyavaad ji, aapke time ke liye. Future me loan assistance ke liye aap hume ${callbackNumber} par call kar sakte hain. Humari team help ke liye available hai.`,
      hindiRoman: `Dhanyavaad ji, aapke samay ke liye. Bhavishya me loan sahayata ke liye aap hume ${callbackNumber} par call kar sakte hain. Hamari team madad ke liye tayyar hai.`,
      hindi: `Dhanyavaad ji, aapke samay ke liye. Bhavishya me loan sahayata ke liye aap hume ${callbackNumber} par call kar sakte hain. Hamari team madad ke liye tayyar hai.`,
      defaultText: `Thank you for your time. If you need any loan assistance in future, please call our team on ${callbackNumber}. We are always happy to help.`,
    });
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
          },
        },
        activeOnly: true,
      });

      this.callMeta.aiProviderUsed = aiOutput?.provider?.name || aiOutput?.provider?.type || null;
      console.log('[LLMConversationManager] CALL_TURN provider used:', this.callMeta.aiProviderUsed);

      const aiMessage = String(aiOutput?.result?.reply || '').trim() || this.getOpeningGreeting();
      
      // Add to history
      this.conversationHistory.push({
        role: 'ai',
        message: aiMessage,
        timestamp: new Date(),
      });

      return aiMessage;
    } catch (error) {
      console.error('Error calling AI API:', error.message);
      const fallbackMessage = this.currentStage === CONVERSATION_STAGES.OPENING
        ? this.getOpeningGreeting()
        : this.getFallbackClarificationMessage();

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

      if (extracted.loanType) this.extractedData.loanType = extracted.loanType;
      if (extracted.amount) this.extractedData.amount = extracted.amount;
      if (extracted.timeline) this.extractedData.timeline = extracted.timeline;
      if (employmentType) this.extractedData.employmentType = employmentType;

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
        // If this turn is a pure language-switch request, skip provider intent override
        // to avoid accidental close intents from short correction phrases.
        if (!languagePreferenceCommand || isHardStopIntent) {
          const summaryOutput = await runAIWithFailover({
            task: 'CALL_SUMMARY',
            payload: {
              customer: this.toProviderCustomerProfile(),
              transcript: this.getTranscriptText(),
              turn: this.conversationHistory.length,
              metadata: this.getProviderMetadata(),
              context: {
                conversationStage: this.currentStage,
                languageSignal: activeLanguageSignal,
                languageInstruction: getLanguageMirroringInstruction(activeLanguageSignal),
              },
            },
            activeOnly: true,
          });

          this.callMeta.aiProviderUsed = summaryOutput?.provider?.name || summaryOutput?.provider?.type || this.callMeta.aiProviderUsed;
          console.log('[LLMConversationManager] CALL_SUMMARY provider used:', this.callMeta.aiProviderUsed);

          providerIntent = normalizeProviderIntent(summaryOutput?.result?.intent);
          if (providerIntent && providerIntent !== 'neutral') {
            finalIntent = providerIntent;
            finalConfidence = Math.max(finalConfidence, 0.8);
            reasoning = `provider-intent:${summaryOutput.provider?.name || 'unknown'}`;
          }
        }
      } catch (summaryError) {
        console.warn('[LLMConversationManager] Provider summary fallback to rule-based intent:', summaryError.message);
      }

      const ruleBasedTerminalIntent = ['do_not_call', 'not_interested', 'busy', 'call_back_later'].includes(ruleBasedIntent);
      const currentTerminalIntent = ['do_not_call', 'not_interested', 'busy', 'call_back_later'].includes(finalIntent);
      if (ruleBasedTerminalIntent && !currentTerminalIntent) {
        finalIntent = ruleBasedIntent;
        finalConfidence = Math.max(finalConfidence, normalizeConfidence(detectedIntent.confidence, 0.9));
        reasoning = `${reasoning}:rule_terminal_priority`;
      }

      // Guard against premature conversion: require at least loan type and amount.
      const hasConversionSignals = Boolean(this.extractedData.loanType && this.extractedData.amount);
      if (finalIntent === 'converted' && !hasConversionSignals) {
        finalIntent = 'interested';
        finalConfidence = Math.max(finalConfidence, 0.78);
        reasoning = `${reasoning}:downgraded_pre_qualification`;
      }

      // Guard against accidental terminal intents on inquiry-style customer replies.
      // If the customer is asking for details and did not express a negative signal,
      // keep the conversation open.
      const inquirySignal = hasInquirySignal(customerMessage);
      const explicitNegativeSignal = hasExplicitNegativeSignal(customerMessage);
      if (
        providerIntent &&
        ['not_interested', 'busy', 'call_back_later'].includes(finalIntent) &&
        inquirySignal &&
        !explicitNegativeSignal &&
        ['neutral', 'interested'].includes(String(detectedIntent.intent || '').toLowerCase())
      ) {
        finalIntent = 'interested';
        finalConfidence = Math.max(finalConfidence, 0.76);
        reasoning = `${reasoning}:inquiry_guard`;
      }

      const shouldEnd = END_INTENTS.has(finalIntent);

      // Determine next stage
      const nextStage = this.determineNextStage(finalIntent, shouldEnd);
      this.currentStage = nextStage;

      // Update call meta
      this.callMeta.intent = finalIntent;
      this.callMeta.confidence = finalConfidence;

      return {
        intent: finalIntent,
        confidence: finalConfidence,
        extractedData: { ...this.extractedData },
        nextStage,
        shouldEnd,
        reasoning,
      };
    } catch (error) {
      console.error('Error processing customer response:', error.message);
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

    // Converted should only close once key qualification details are captured.
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
        if (intent === 'interested' && this.extractedData.loanType) {
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
      extracted_data: this.extractedData,
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
      languageStyle: languageSignal.style,
      languageScript: languageSignal.script,
      extractedData: this.extractedData,
      turnCount: this.conversationHistory.length,
    };
  }
}
