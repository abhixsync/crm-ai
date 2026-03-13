/**
 * Conversation Manager
 * Manages loan assistant conversation flow and state
 */

import {
  CONVERSATION_STAGES,
  EMPLOYMENT_TYPES,
  LOAN_TYPES,
} from './system-prompt.js';
import {
  detectIntent,
  extractLoanDetails,
  detectEmploymentType,
  determineNextStage,
} from './intent-detector.js';

export class ConversationManager {
  constructor(customerProfile, companyName = 'XYZ Finance') {
    this.customerProfile = customerProfile;
    this.companyName = companyName;
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
      confidence: 0,
      callbackTime: null,
    };
  }

  /**
   * Get opening greeting
   */
  getOpeningGreeting() {
    const name = this.customerProfile?.name || 'Friend';
    return `Namaste ${name} ji,\n\nMain ${this.companyName} se bol rahi hoon.\nKya abhi 30 seconds baat karna convenient hai?`;
  }

  /**
   * Get pitch based on profile
   */
  getPitch() {
    const employment = this.customerProfile?.employment_type;
    const income = this.customerProfile?.monthly_income || 0;

    let pitch = '';

    if (employment === EMPLOYMENT_TYPES.SALARIED) {
      pitch = `Aapka profile salaried category mein aata hai\ntoh personal loan ya home loan ke good options available ho sakte hain.`;
    } else if (employment === EMPLOYMENT_TYPES.BUSINESS) {
      pitch = `Agar aap business run karte hain\ntoh business expansion ya working capital loan options available ho sakte hain.`;
    } else if (employment === EMPLOYMENT_TYPES.SELF_EMPLOYED) {
      pitch = `Self-employed professionals ke liye hummare paas flexible loan options hain\njo aapke business needs ko cover kar sakte hain.`;
    } else {
      pitch = `Hummare paas aapke liye flexible loan options available ho sakte hain.\nKya aap interested hain sunnne mein?`;
    }

    if (income > 100000) {
      pitch += '\n\nAapka income profile strong hai\ntoh aap higher loan amounts ke liye eligible ho sakte hain.';
    }

    return pitch;
  }

  /**
   * Get discovery question
   */
  getDiscoveryQuestion() {
    const questions = [
      'Kya aap currently kisi loan ke options explore kar rahe hain?',
      'Agar loan lena ho toh approximate amount kitna consider karenge?',
      'Aapko kab tak loan requirement ho sakti hai?',
      'Personal loan, home loan, ya business loan mein kya interest hai?',
      'Aapke paas kisi tarah ki loan already hai, ya naya lena chahte hain?',
    ];

    // Return a different question based on conversation history length
    const index = this.conversationHistory.length % questions.length;
    return questions[index];
  }

  /**
   * Get response for objection
   */
  getObjectionResponse(intent) {
    const name = this.customerProfile?.name || 'ji';

    switch (intent) {
      case 'not_interested':
        return `Bilkul samajh sakta hoon ${name}.\nAgar future mein kabhi requirement ho toh aap humse connect kar sakte hain.`;

      case 'busy':
        return `Sure, koi problem nahi.\nMain aapse kis time connect karun?`;

      case 'already_has_loan':
        return `Understood.\nKabhi kabhi customers better interest rate ke liye refinance bhi karte hain.\nAgar aap chahein toh main quick check kar sakta hoon.`;

      case 'angry':
        return `Sorry agar call inconvenient laga.\nMain turant call close kar deta hoon.`;

      default:
        return '';
    }
  }

  /**
   * Get closing message
   */
  getClosingMessage(intent) {
    const name = this.customerProfile?.name || 'ji';

    if (intent === 'converted') {
      return `Perfect!\n\nMain aapka case ek loan advisor ko forward kar deta hoon\njo aapko shortly connect karega.\n\nDhanyavaad ${name}!`;
    }

    if (intent === 'interested') {
      return `Perfect.\n\nMain aapka profile ek quick check ke liye process kar deta hoon.\n\nDhanyavaad ${name}!`;
    }

    if (intent === 'call_back_later') {
      return `Sure ${name} ji!\n\nMain aapse callback connection mein rahungi.\n\nChalo, bye for now!`;
    }

    if (intent === 'not_interested') {
      return `Bilkul samajh sakta hoon ${name} ji.\n\nAgar future mein kabhi zaroorat ho toh aap humse connect kar sakte hain.\n\nDhanyavaad!`;
    }

    if (intent === 'do_not_call') {
      return `Bilkul ${name} ji, samajh gaya.\n\nMain turant call close kar deta hoon.\n\nDhanyavaad!`;
    }

    return `Dhanyavaad ${name} ji!\n\nAgar kabhi zaroorat ho toh humse call kar diyo.`;
  }

  /**
   * Process customer response
   */
  processCustomerResponse(customerMessage) {
    // Add to history
    this.conversationHistory.push({
      role: 'customer',
      message: customerMessage,
      timestamp: new Date(),
    });

    // Detect intent
    const intentResult = detectIntent(
      customerMessage,
      this.conversationHistory
    );

    // Extract data
    const loanDetails = extractLoanDetails(customerMessage);
    const employment = detectEmploymentType(customerMessage);

    if (loanDetails.loanType)
      this.extractedData.loanType = loanDetails.loanType;
    if (loanDetails.amount) this.extractedData.amount = loanDetails.amount;
    if (loanDetails.timeline)
      this.extractedData.timeline = loanDetails.timeline;
    if (employment) this.extractedData.employmentType = employment;

    // Update meta
    this.callMeta.intent = intentResult.intent;
    this.callMeta.confidence = intentResult.confidence;

    // Determine next stage
    const nextStage = determineNextStage(
      this.currentStage,
      intentResult.intent,
      this.extractedData
    );
    this.currentStage = nextStage;

    return {
      intent: intentResult.intent,
      confidence: intentResult.confidence,
      extractedData: { ...this.extractedData },
      nextStage,
    };
  }

  /**
   * Generate AI response
   */
  generateAIResponse() {
    let aiMessage = '';

    if (this.currentStage === CONVERSATION_STAGES.OPENING) {
      aiMessage = this.getOpeningGreeting();
    } else if (this.currentStage === CONVERSATION_STAGES.DISCOVERY) {
      if (this.conversationHistory.length === 1) {
        // First response in discovery
        aiMessage = this.getPitch();
      } else {
        aiMessage = this.getDiscoveryQuestion();
      }
    } else if (this.currentStage === CONVERSATION_STAGES.PITCH) {
      aiMessage = this.getDiscoveryQuestion();
    } else if (this.currentStage === CONVERSATION_STAGES.QUALIFICATION) {
      const missingFields = [];
      if (!this.extractedData.loanType) missingFields.push('loan type');
      if (!this.extractedData.amount) missingFields.push('amount');

      if (missingFields.length > 0) {
        aiMessage = `Bilkul! ${this.extractedData.loanType ? 'Aapko ' + this.extractedData.loanType + ' chahiye.' : 'Kya aap personal loan ya home loan mein interested hain?'}\n\nApproximate amount kitna chahiye?`;
      } else {
        aiMessage = this.getClosingMessage(this.callMeta.intent);
      }
    } else if (this.currentStage === CONVERSATION_STAGES.CLOSING) {
      aiMessage = this.getClosingMessage(this.callMeta.intent);
    }

    // Add to history
    this.conversationHistory.push({
      role: 'ai',
      message: aiMessage,
      timestamp: new Date(),
    });

    return aiMessage;
  }

  /**
   * Get structured output for this conversation turn
   */
  getStructuredOutput(aiMessage) {
    return {
      ai_message: aiMessage,
      intent: this.callMeta.intent,
      confidence: this.callMeta.confidence,
      conversation_stage: this.currentStage,
      extracted_data: this.extractedData,
      conversation_length: this.conversationHistory.length,
    };
  }

  /**
   * Get full conversation transcript
   */
  getTranscript() {
    return this.conversationHistory;
  }

  /**
   * Get call summary
   */
  getCallSummary() {
    return {
      customer_name: this.customerProfile?.name,
      customer_city: this.customerProfile?.city,
      customer_income: this.customerProfile?.monthly_income,
      customer_employment: this.customerProfile?.employment_type,
      intent: this.callMeta.intent,
      confidence: this.callMeta.confidence,
      extracted_loan_type: this.extractedData.loanType,
      extracted_amount: this.extractedData.amount,
      extracted_timeline: this.extractedData.timeline,
      call_duration_seconds: Math.floor(
        (new Date() - this.callMeta.startTime) / 1000
      ),
      turn_count: this.conversationHistory.length,
      final_stage: this.currentStage,
    };
  }
}
