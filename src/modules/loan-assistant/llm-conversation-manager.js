/**
 * LLM-Powered Loan Assistant Conversation Manager
 * Uses Groq (free) → Claude (free tier) → OpenAI's AI to understand context naturally
 * Supports voice interactions for calling customers
 */

import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import Groq from 'groq-sdk';
import {
  CONVERSATION_STAGES,
  EMPLOYMENT_TYPES,
  LOAN_TYPES,
} from './system-prompt.js';

// Get the appropriate AI client (Groq free → Claude free tier → OpenAI)
function initializeAIClient() {
  const hasGroqKey = !!process.env.GROQ_API_KEY?.trim();
  const hasClaudeKey = !!process.env.ANTHROPIC_API_KEY?.trim();
  const hasOpenAIKey = !!process.env.OPENAI_API_KEY?.trim();

  if (hasGroqKey) {
    return {
      type: 'groq',
      client: new Groq({ apiKey: process.env.GROQ_API_KEY }),
    };
  }

  if (hasClaudeKey) {
    return {
      type: 'claude',
      client: new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }),
    };
  }

  if (hasOpenAIKey) {
    return {
      type: 'openai',
      client: new OpenAI({ apiKey: process.env.OPENAI_API_KEY }),
    };
  }

  return { type: null, client: null };
}

let aiProvider = initializeAIClient();
console.log(`[LLMConversationManager] Initialized with provider:`, aiProvider.type || 'NONE', aiProvider.type === 'groq' ? '✓ Groq (FREE)' : aiProvider.type === 'claude' ? '✓ Claude (FREE)' : aiProvider.type === 'openai' ? '✓ OpenAI' : '');

// Helper function to get a fallback provider if current one fails
function getFallbackProvider() {
  // If using Groq, try Claude next
  if (aiProvider.type === 'groq') {
    const hasClaudeKey = !!process.env.ANTHROPIC_API_KEY?.trim();
    if (hasClaudeKey) {
      console.warn('[LLMConversationManager] Falling back to Claude due to Groq API error...');
      return {
        type: 'claude',
        client: new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }),
      };
    }
  }

  // If using Claude or Groq failed to fallback, try OpenAI
  if (aiProvider.type === 'claude' || aiProvider.type === 'groq') {
    const hasOpenAIKey = !!process.env.OPENAI_API_KEY?.trim();
    if (hasOpenAIKey) {
      console.warn('[LLMConversationManager] Falling back to OpenAI due to Claude/Groq API error...');
      return {
        type: 'openai',
        client: new OpenAI({ apiKey: process.env.OPENAI_API_KEY }),
      };
    }
  }

  return null;
}

export class LLMConversationManager {
  constructor(customerProfile, companyName = 'XYZ Finance', aiAgentName = 'Priya') {
    this.customerProfile = customerProfile;
    this.companyName = companyName;
    this.aiAgentName = aiAgentName;
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
    };
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
    const callbackNumber = process.env.COMPANY_CALLBACK_PHONE || '+91-XXXXXXXXXX';
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

    // If no AI API key, return opening greeting
    if (!aiProvider.client) {
      return this.getOpeningGreeting();
    }

    try {
      // Build conversation history for context
      const messages = this.conversationHistory.map(turn => ({
        role: turn.role === 'customer' ? 'user' : 'assistant',
        content: turn.message,
      }));

      // If we have a customer message, add it
      if (customerMessage) {
        messages.push({
          role: 'user',
          content: customerMessage,
        });
      } else if (this.conversationHistory.length === 0) {
        // First message - return opening greeting
        return this.getOpeningGreeting();
      }

      let aiMessage;

      if (aiProvider.type === 'groq') {
        // Call Groq API (uses chat.completions)
        try {
          const response = await aiProvider.client.chat.completions.create({
            model: 'llama-3.1-8b-instant',
            max_tokens: 150,
            messages: [
              {
                role: 'system',
                content: this.getSystemPrompt(),
              },
              ...messages,
            ],
          });
          aiMessage = response.choices[0]?.message?.content || this.getOpeningGreeting();
        } catch (providerError) {
          // If Groq fails, try fallback
          const fallback = getFallbackProvider();
          if (fallback) {
            let aiMessage_fallback;
            
            if (fallback.type === 'claude') {
              // Claude uses .messages.create()
              const response = await fallback.client.messages.create({
                model: 'claude-3-5-sonnet-20241022',
                max_tokens: 150,
                system: this.getSystemPrompt(),
                messages,
              });
              aiMessage_fallback = response.content[0]?.type === 'text' ? response.content[0].text : this.getOpeningGreeting();
            } else {
              // OpenAI uses .chat.completions.create()
              const response = await fallback.client.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [
                  {
                    role: 'system',
                    content: this.getSystemPrompt(),
                  },
                  ...messages,
                ],
                temperature: 0.7,
                max_tokens: 150,
              });
              aiMessage_fallback = response.choices[0]?.message?.content || this.getOpeningGreeting();
            }
            
            aiMessage = aiMessage_fallback;
          } else {
            throw providerError;
          }
        }
      } else if (aiProvider.type === 'claude') {
        // Call Claude API (uses messages.create)
        try {
          const response = await aiProvider.client.messages.create({
            model: 'claude-3-5-sonnet-20241022',
            max_tokens: 150,
            system: this.getSystemPrompt(),
            messages,
          });
          aiMessage = response.content[0]?.type === 'text' ? response.content[0].text : this.getOpeningGreeting();
        } catch (providerError) {
          // If Claude fails, try fallback
          const fallback = getFallbackProvider();
          if (fallback) {
            let aiMessage_fallback;
            
            if (fallback.type === 'groq') {
              // Groq uses .chat.completions.create()
              const response = await fallback.client.chat.completions.create({
                model: 'llama-3.1-8b-instant',
                max_tokens: 150,
                messages: [
                  {
                    role: 'system',
                    content: this.getSystemPrompt(),
                  },
                  ...messages,
                ],
              });
              aiMessage_fallback = response.choices[0]?.message?.content || this.getOpeningGreeting();
            } else {
              // OpenAI uses .chat.completions.create()
              const response = await fallback.client.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [
                  {
                    role: 'system',
                    content: this.getSystemPrompt(),
                  },
                  ...messages,
                ],
                temperature: 0.7,
                max_tokens: 150,
              });
              aiMessage_fallback = response.choices[0]?.message?.content || this.getOpeningGreeting();
            }
            
            aiMessage = aiMessage_fallback;
          } else {
            throw providerError;
          }
        }
      } else {
        // Call OpenAI Chat API
        const response = await aiProvider.client.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: this.getSystemPrompt(),
            },
            ...messages,
          ],
          temperature: 0.7,
          max_tokens: 150,
        });
        aiMessage = response.choices[0]?.message?.content || this.getOpeningGreeting();
      }
      
      // Add to history
      this.conversationHistory.push({
        role: 'ai',
        message: aiMessage,
        timestamp: new Date(),
      });

      return aiMessage;
    } catch (error) {
      console.error('Error calling AI API:', error.message);
      return this.getOpeningGreeting();
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

      // Use AI to analyze intent and extract data
      if (!aiProvider.client) {
        return {
          intent: 'neutral',
          confidence: 0.5,
          extractedData: { ...this.extractedData },
          nextStage: CONVERSATION_STAGES.DISCOVERY,
        };
      }

      const analysisPrompt = `Analyze this customer message and extract:
1. Intent: "interested", "not_interested", "busy", "do_not_call", "neutral", "converted"
2. Confidence: 0.0-1.0
3. Extracted data: { loanType, amount, timeline, employmentType }
4. shouldEnd: true if customer declined or asked not to be called

Customer message: "${customerMessage}"

Respond ONLY with valid JSON (no markdown, no extra text):
{
  "intent": "...",
  "confidence": 0.8,
  "extractedData": {
    "loanType": null,
    "amount": null,
    "timeline": null,
    "employmentType": null
  },
  "shouldEnd": false,
  "reasoning": "..."
}`;

      const systemPrompt = 'You are an expert loan sales analyst. Extract intent and data from customer messages. Respond ONLY with clean JSON.';
      let analysisText;

      if (aiProvider.type === 'groq') {
        // Call Groq API (uses chat.completions)
        try {
          const response = await aiProvider.client.chat.completions.create({
            model: 'llama-3.1-8b-instant',
            max_tokens: 200,
            messages: [
              {
                role: 'system',
                content: systemPrompt,
              },
              {
                role: 'user',
                content: analysisPrompt,
              },
            ],
            temperature: 0.3,
          });
          analysisText = response.choices[0]?.message?.content || '{}';
        } catch (providerError) {
          console.error('[Groq Analysis Error]', {
            message: providerError.message,
            status: providerError.status,
            error: providerError.error || providerError.toString(),
          });
          // If Groq fails, try fallback
          const fallback = getFallbackProvider();
          if (fallback) {
            if (fallback.type === 'claude') {
              // Claude uses .messages.create()
              const response = await fallback.client.messages.create({
                model: 'claude-3-5-sonnet-20241022',
                max_tokens: 200,
                system: systemPrompt,
                messages: [
                  {
                    role: 'user',
                    content: analysisPrompt,
                  },
                ],
              });
              analysisText = response.content[0]?.type === 'text' ? response.content[0].text : '{}';
            } else {
              // OpenAI uses .chat.completions.create()
              const response = await fallback.client.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [
                  {
                    role: 'system',
                    content: systemPrompt,
                  },
                  {
                    role: 'user',
                    content: analysisPrompt,
                  },
                ],
                temperature: 0.3,
                max_tokens: 200,
              });
              analysisText = response.choices[0]?.message?.content || '{}';
            }
          } else {
            throw providerError;
          }
        }
      } else {
        const response = await aiProvider.client.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: systemPrompt,
            },
            {
              role: 'user',
              content: analysisPrompt,
            },
          ],
          temperature: 0.3,
          max_tokens: 200,
        });
        analysisText = response.choices[0]?.message?.content || '{}';
      }

      // Parse JSON response
      let analysis = {};
      try {
        // Remove markdown code blocks if present
        const cleanedText = analysisText.replace(/```json\n?|\n?```/g, '').trim();
        analysis = JSON.parse(cleanedText);
      } catch (parseError) {
        console.error('Failed to parse AI analysis:', parseError.message);
        analysis = {
          intent: 'neutral',
          confidence: 0.5,
          extractedData: { ...this.extractedData },
          shouldEnd: false,
        };
      }

      // Update extracted data
      if (analysis.extractedData?.loanType) {
        this.extractedData.loanType = analysis.extractedData.loanType;
      }
      if (analysis.extractedData?.amount) {
        this.extractedData.amount = analysis.extractedData.amount;
      }
      if (analysis.extractedData?.timeline) {
        this.extractedData.timeline = analysis.extractedData.timeline;
      }
      if (analysis.extractedData?.employmentType) {
        this.extractedData.employmentType = analysis.extractedData.employmentType;
      }

      // Determine next stage
      const nextStage = this.determineNextStage(analysis.intent, analysis.shouldEnd);
      this.currentStage = nextStage;

      // Update call meta
      this.callMeta.intent = analysis.intent;
      this.callMeta.confidence = analysis.confidence || 0.5;

      return {
        intent: analysis.intent || 'neutral',
        confidence: analysis.confidence || 0.5,
        extractedData: { ...this.extractedData },
        nextStage,
        shouldEnd: analysis.shouldEnd || false,
        reasoning: analysis.reasoning || '',
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
    if (shouldEnd || intent === 'do_not_call') {
      return CONVERSATION_STAGES.CLOSING;
    }

    // If converted, move to closing
    if (intent === 'converted') {
      return CONVERSATION_STAGES.CLOSING;
    }

    // If busy, also close (callback will be scheduled)
    if (intent === 'busy') {
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
      extractedData: this.extractedData,
      turnCount: this.conversationHistory.length,
    };
  }
}
