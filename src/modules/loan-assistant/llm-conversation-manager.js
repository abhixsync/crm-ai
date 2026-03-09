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

const END_INTENTS = new Set([
  'do_not_call',
  'not_interested',
  'busy',
  'call_back_later',
  'converted',
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
    };
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

  /**
   * System prompt for the AI loan assistant
   * This controls how the AI behaves during the entire conversation
   */
  getSystemPrompt() {
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
- If customer says "You are [customer name]", respond with: "Nahi ji, main ${this.aiAgentName} hoon, ${this.companyName} se. Aap ${this.customerProfile?.name || 'Friend'} hain. Dono alag-alag hain." (No, I am ${this.aiAgentName} from ${this.companyName}. You are ${this.customerProfile?.name || 'Friend'}. We are different people.)
- Always maintain this boundary clearly and professionally

YOUR ROLE:
1. Have friendly, natural conversations in Hinglish (mixing proper Hindi and English)
2. Understand customer intent from context, not just keywords
3. Gracefully handle objections and respect customer decisions
4. Extract loan requirements (amount, type, timeline)
5. Transition smoothly through conversation stages

${customerInfo}

HINDI LANGUAGE GUIDELINES:
- Use proper Hindi grammar and vocabulary, not Hinglish slang
- Correct phrasing: "Main ${this.aiAgentName} hoon" (not "I'm ${this.aiAgentName}")
- Correct phrasing: "Aapka naam?" (not "Aapka kya naam?")
- Use formal respect: "ji", "Namaste", "Dhanyavaad", "Sukriya"
- Speak clearly and naturally, like a real person, not robotic
- Avoid machine-like translations - use natural Hindi expressions

IMPORTANT BEHAVIORS:
- If customer says they're not interested (any variation like "nhi chahiye", "nhi lena", "mat karo"), IMMEDIATELY acknowledge and end the call politely
- If customer is busy or wants callback, ask for a suitable time
- Always speak in natural Hinglish with proper respect
- Keep responses concise (2-3 sentences max for voice calls)
- Extract: loan type, amount, timeline from conversation naturally
- Be conversational, empathetic, and respectful
- NEVER agree with false corrections about your identity

Current Conversation Stage: ${this.currentStage}
Extracted Data So Far: ${JSON.stringify(this.extractedData)}

CRITICAL: Respond in natural, grammatically correct Hinglish. Keep voice responses SHORT (max 50 words).`;
  }

  /**
   * Get opening greeting
   */
  getOpeningGreeting() {
    const name = this.customerProfile?.name || 'Friend';
    return `Namaste ${name} ji,\n\nMain ${this.aiAgentName} hoon, ${this.companyName} se.\nKya abhi 30 seconds baat karna convenient hai?`;
  }

  /**
   * Get closing greeting with callback number
   */
  getClosingGreeting() {
    const callbackNumber = this.callbackPhone || process.env.COMPANY_CALLBACK_PHONE || '+91-XXXXXXXXXX';
    return `Dhanyavaad! Aapko call karne ke liye.\n\nAgar aap bhavishy mein kisi bhi prakar ke loan ke liye contact karna chahte hain, to aap humare agents ko is number par call kar sakte hain: ${callbackNumber}\n\nHamari team aapki madad karne ke liye hamesha tayyar hai. Shukriya!`;
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

      const aiOutput = await runAIWithFailover({
        task: 'CALL_TURN',
        payload: {
          customer: this.toProviderCustomerProfile(),
          transcript: this.getTranscriptText(),
          turn: this.conversationHistory.length,
          context: {
            conversationStage: this.currentStage,
            companyName: this.companyName,
            aiAgentName: this.aiAgentName,
            systemPrompt: this.getSystemPrompt(),
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
        : 'Ji samajh gaya. Agar aap chahen to main short mein dobara explain kar sakti hoon.';

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

      try {
        const summaryOutput = await runAIWithFailover({
          task: 'CALL_SUMMARY',
          payload: {
            customer: this.toProviderCustomerProfile(),
            transcript: this.getTranscriptText(),
            turn: this.conversationHistory.length,
            context: {
              conversationStage: this.currentStage,
            },
          },
          activeOnly: true,
        });

        this.callMeta.aiProviderUsed = summaryOutput?.provider?.name || summaryOutput?.provider?.type || this.callMeta.aiProviderUsed;
        console.log('[LLMConversationManager] CALL_SUMMARY provider used:', this.callMeta.aiProviderUsed);

        const providerIntent = normalizeProviderIntent(summaryOutput?.result?.intent);
        if (providerIntent && providerIntent !== 'neutral') {
          finalIntent = providerIntent;
          finalConfidence = Math.max(finalConfidence, 0.8);
          reasoning = `provider-intent:${summaryOutput.provider?.name || 'unknown'}`;
        }
      } catch (summaryError) {
        console.warn('[LLMConversationManager] Provider summary fallback to rule-based intent:', summaryError.message);
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

    // If converted, move to closing
    if (intent === 'converted') {
      return CONVERSATION_STAGES.CLOSING;
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
    return {
      ai_message: aiMessage,
      intent: this.callMeta.intent,
      confidence: this.callMeta.confidence,
      ai_provider_used: this.callMeta.aiProviderUsed,
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
    return {
      startTime: this.callMeta.startTime,
      endTime: new Date(),
      duration: (new Date() - this.callMeta.startTime) / 1000,
      intent: this.callMeta.intent,
      confidence: this.callMeta.confidence,
      aiProviderUsed: this.callMeta.aiProviderUsed,
      extractedData: this.extractedData,
      turnCount: this.conversationHistory.length,
    };
  }
}
