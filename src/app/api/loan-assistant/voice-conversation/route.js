/**
 * LLM-Powered Loan Assistant Voice API
 * Handles intelligent conversation with OpenAI (ChatGPT/Claude-level)
 * Supports both text and voice interactions
 * 
 * POST /api/loan-assistant/voice-conversation
 * Body: {
 *   action: "init" | "next"
 *   session_id?: string (for "next" action)
 *   customer_profile?: {...} (for "init" action)
 *   customer_message?: string (for "next" action)
 *   tenant_id?: string (for "init" action - to fetch CRM name and AI agent name, auto-detected from session if not provided)
 *   company_name?: string (fallback if tenant_id not provided)
 *   ai_agent_name?: string (fallback if tenant_id not provided)
 *   human_advisor_name?: string (fallback if tenant config not present)
 *   callback_phone?: string (fallback callback number if tenant config not present)
 *   is_voice_call?: boolean (true for voice, false for chat)
 * }
 */

import { LLMConversationManager } from '@/modules/loan-assistant/llm-conversation-manager.js';
import { notifyAdvisorForCallLog, notifyAdvisorForSummary } from '@/lib/notifications/advisor-notifier.js';
import {
  buildLoanAssistantFallbackNextAction,
  buildLoanAssistantFallbackSummary,
  createLoanAssistantDemoCallLog,
  ensureLoanAssistantDemoCustomer,
  finalizeLoanAssistantDemoCallLog,
  transcriptTurnsToText,
} from '@/lib/loan-assistant/demo-calllog.js';
import { prisma } from '@/lib/prisma.js';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth.js';

// In-memory session storage (production: use Redis)
const activeSessions = new Map();

export async function POST(request) {
  try {
    console.log('\n\n');
    console.log('╔════════════════════════════════════════════════════════╗');
    console.log('║ [LLM Loan Assistant API] POST Request Received          ║');
    console.log('╚════════════════════════════════════════════════════════╝');
    console.log('Time:', new Date().toISOString());
    
    const body = await request.json();
    
    console.log('\n📥 REQUEST BODY:');
    console.log('Action:', body.action);
    console.log('Is Voice Call:', body.is_voice_call || false);
    console.log('Session ID:', body.session_id?.substring(0, 20) + '...' || 'N/A');

    let {
      action = 'next',
      customer_profile,
      customer_message,
      session_id,
      tenant_id,
      company_name,
      ai_agent_name,
      human_advisor_name,
      callback_phone,
      is_voice_call = false,
    } = body;

    // For init action, try to auto-detect tenant_id from session if not provided
    if (action === 'init' && !tenant_id) {
      try {
        const session = await getServerSession(authOptions);
        if (session?.user?.tenantId) {
          tenant_id = session.user.tenantId;
          console.log('ℹ️ Tenant ID auto-detected from session:', tenant_id);
        } else if (session?.user) {
          // Super admin - fetch super admin tenant
          const superAdminTenant = await prisma.tenant.findFirst({
            where: { slug: 'super-admin' },
            select: { id: true },
          });
          if (superAdminTenant) {
            tenant_id = superAdminTenant.id;
            console.log('ℹ️ Super admin tenant auto-detected:', tenant_id);
          }
        }
      } catch (sessionErr) {
        console.log('ℹ️ Could not extract tenant from session:', sessionErr.message);
      }
    }

    // Validate init action
    if (action === 'init' && !customer_profile) {
      console.error('\n❌ VALIDATION FAILED: customer_profile required for init');
      return Response.json(
        { 
          error: 'customer_profile is required for init action',
          success: false
        },
        { status: 400 }
      );
    }

    // Validate next action
    if (action === 'next' && !session_id) {
      console.error('\n❌ VALIDATION FAILED: session_id required for next');
      return Response.json(
        { 
          error: 'session_id is required for continuing conversation',
          success: false
        },
        { status: 400 }
      );
    }

    let manager;
    let isNewSession = false;

    // INIT: Create new conversation session
    if (action === 'init') {
      console.log('\n📍 Creating new LLM conversation session...');
      
      // Determine company name and AI agent name
      let finalCompanyName = company_name || 'FinServe Loans';
      let finalAiAgentName = ai_agent_name || 'Priya Sharma';
      let finalHumanAdvisorName = human_advisor_name || 'John Doe';
      let finalCallbackPhone = callback_phone || process.env.COMPANY_CALLBACK_PHONE || '+91-XXXXXXXXXX';
      let finalTenantLanguage = 'hinglish';
      
      // If tenant_id provided, fetch tenant config (priority: loanAssistantCompanyName > tenant.name)
      if (tenant_id) {
        try {
          const tenant = await prisma.tenant.findUnique({
            where: { id: tenant_id },
          });
          
          if (tenant) {
            // Priority: loanAssistantCompanyName (if set in settings) > tenantName
            finalCompanyName = tenant.loanAssistantCompanyName || tenant.name || finalCompanyName;
            finalAiAgentName = tenant.aiAgentName || finalAiAgentName;
            finalHumanAdvisorName = tenant.loanAssistantHumanAdvisorName || finalHumanAdvisorName;
            finalCallbackPhone = tenant.loanAssistantCallbackPhone || finalCallbackPhone;
            finalTenantLanguage = tenant.loanAssistantLanguage || finalTenantLanguage;
            console.log('📦 Tenant Config:', {
              tenantId: tenant_id,
              loanAssistantCompanyName: tenant.loanAssistantCompanyName,
              tenantName: tenant.name,
              resolvedCompanyName: finalCompanyName,
              aiAgentName: finalAiAgentName,
              humanAdvisorName: finalHumanAdvisorName,
              callbackPhone: finalCallbackPhone,
            });
          } else {
            console.warn('⚠️ Tenant not found:', tenant_id);
          }
        } catch (error) {
          console.warn('⚠️ Error fetching tenant:', error.message);
        }
      }
      
      manager = new LLMConversationManager(
        customer_profile,
        finalCompanyName,
        finalAiAgentName,
        finalCallbackPhone,
        finalHumanAdvisorName,
        finalTenantLanguage
      );
      const newSessionId = `llm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      manager.callMeta.tenantId = tenant_id || null;
      manager.callMeta.isVoiceCall = is_voice_call;
      manager.callMeta.sessionId = newSessionId;
      manager.callMeta.callLogId = null;
      manager.callMeta.customerId = null;
      isNewSession = true;

      activeSessions.set(newSessionId, manager);

      if (tenant_id) {
        try {
          const customer = await ensureLoanAssistantDemoCustomer({
            tenantId: tenant_id,
            customerProfile: customer_profile,
            sessionSeed: newSessionId,
            sourceLabel: 'LLM Loan Assistant Demo',
          });

          const callLog = await createLoanAssistantDemoCallLog({
            tenantId: tenant_id,
            customerId: customer.id,
            sessionId: newSessionId,
            sourceKey: is_voice_call ? 'llm_loan_assistant_voice' : 'llm_loan_assistant_chat',
            attemptNumber: Number(customer.retryCount || 0) + 1,
          });

          manager.callMeta.customerId = customer.id;
          manager.callMeta.callLogId = callLog.id;

          console.info('[api/loan-assistant/voice-conversation] CRM call log created for demo session', {
            sessionId: newSessionId,
            customerId: customer.id,
            callLogId: callLog.id,
          });
        } catch (persistError) {
          console.warn('[api/loan-assistant/voice-conversation] Unable to seed CRM call log for demo session:', persistError?.message || persistError);
        }
      }

      // Generate opening message using LLM
      const aiMessage = await manager.generateAIResponse();

      console.log('✅ LLM Session initialized');
      console.log('Session ID:', newSessionId);
      console.log('Is Voice:', is_voice_call);
      console.log('Company:', finalCompanyName);
      console.log('AI Agent:', finalAiAgentName);
      console.log('Human Advisor:', finalHumanAdvisorName);
      console.log('Callback Phone:', finalCallbackPhone);
      console.log('Opening Message:', aiMessage.substring(0, 100) + '...');

      return Response.json(
        {
          success: true,
          session_id: newSessionId,
          is_new_session: true,
          is_voice_call,
          call_log_id: manager.callMeta.callLogId || null,
          ai_response: manager.getStructuredOutput(aiMessage),
          message: 'LLM conversation initiated successfully',
        },
        { status: 200 }
      );
    }

    // NEXT: Continue existing conversation
    console.log('\n📍 Continuing LLM conversation...');
    
    if (!session_id) {
      return Response.json(
        { error: 'session_id is required to continue conversation', success: false },
        { status: 400 }
      );
    }

    manager = activeSessions.get(session_id);

    if (!manager) {
      console.error('❌ Session not found:', session_id);
      return Response.json(
        { error: 'Session not found. Please start a new conversation.', success: false },
        { status: 404 }
      );
    }

    if (!customer_message) {
      return Response.json(
        { error: 'customer_message is required to continue conversation', success: false },
        { status: 400 }
      );
    }

    console.log('✅ Session found');
    console.log('Customer message:', customer_message);
    console.log('Conversation history length:', manager.conversationHistory.length);
    console.log('Current stage:', manager.currentStage);
    console.log('Current language signal:', JSON.stringify(manager.getLanguageSignal()));
    console.log('Extracted data so far:', JSON.stringify(manager.extractedData));
    
    // Ensure is_voice_call flag is maintained throughout conversation
    manager.callMeta.isVoiceCall = is_voice_call;
    console.log('Is Voice Call:', is_voice_call);

    // Process customer message using LLM
    console.log('\n--- [STEP 1] processCustomerResponse() START ---');
    const analysisResult = await manager.processCustomerResponse(customer_message);
    console.log('--- [STEP 1] processCustomerResponse() END ---');

    console.log('📊 Analysis result:');
    console.log('  Intent:', analysisResult.intent);
    console.log('  Confidence:', analysisResult.confidence);
    console.log('  Should End:', analysisResult.shouldEnd);
    console.log('  Next Stage:', analysisResult.nextStage);
    console.log('  Reasoning:', analysisResult.reasoning);
    console.log('  Extracted Data:', JSON.stringify(analysisResult.extractedData));

    // Generate next AI response using LLM (context-aware)
    console.log('\n--- [STEP 2] generateAIResponse() START ---');
    const aiMessage = await manager.generateAIResponse(customer_message);
    console.log('--- [STEP 2] generateAIResponse() END ---');
    console.log('🤖 AI Response:', aiMessage);

    // Check if conversation should end
    const shouldEndSession =
      manager.currentStage === 'closing' ||
      analysisResult.shouldEnd ||
      ['do_not_call', 'not_interested', 'busy', 'call_back_later'].includes(analysisResult.intent);

    console.log('Session ending:', shouldEndSession);

    let callSummary = null;
    const transcript = shouldEndSession ? manager.getTranscript() : null;
    let notification = null;
    let finalizedCallLogId = null;

    if (shouldEndSession) {
      // Regenerate summary with full context before retrieving it
      await manager.generateFinalSummary();
      callSummary = manager.getCallSummary();

      const summaryText =
        callSummary?.summary ||
        buildLoanAssistantFallbackSummary({
          customerProfile: manager.customerProfile,
          intent: callSummary?.intent,
          extractedData: callSummary?.extractedData,
        });
      const nextActionText =
        callSummary?.nextAction || buildLoanAssistantFallbackNextAction(callSummary?.intent);
      const transcriptText = transcriptTurnsToText(transcript);

      if (manager.callMeta.callLogId && manager.callMeta.tenantId) {
        try {
          finalizedCallLogId = await finalizeLoanAssistantDemoCallLog({
            callLogId: manager.callMeta.callLogId,
            tenantId: manager.callMeta.tenantId,
            sessionId: manager.callMeta.sessionId || session_id,
            sourceKey: is_voice_call ? 'llm_loan_assistant_voice' : 'llm_loan_assistant_chat',
            summary: summaryText,
            transcript: transcriptText,
            intent: callSummary?.intent,
            nextAction: nextActionText,
            aiProviderUsed: callSummary?.aiProviderUsed || manager.callMeta.aiProviderUsed || null,
            durationSecs: callSummary?.duration,
            extractedData: callSummary?.extractedData,
          });
        } catch (persistError) {
          console.warn('[api/loan-assistant/voice-conversation] Unable to finalize CRM call log for demo session:', persistError?.message || persistError);
        }
      }

      if (finalizedCallLogId) {
        notification = await notifyAdvisorForCallLog(finalizedCallLogId);
      } else {
        notification = await notifyAdvisorForSummary({
          tenantId: manager.callMeta.tenantId || null,
          customerProfile: manager.customerProfile,
          intent: callSummary?.intent,
          summary: summaryText,
          nextAction: nextActionText,
          transcript: transcriptText,
          extractedData: callSummary?.extractedData || null,
          aiProviderUsed: callSummary?.aiProviderUsed || null,
          source: is_voice_call ? 'llm_loan_assistant_voice' : 'llm_loan_assistant_chat',
        });
      }

      if (!notification.ok && !notification.skipped) {
        console.warn('[api/loan-assistant/voice-conversation] Advisor notification failed:', notification.reason);
      } else if (notification?.skipped) {
        console.info('[api/loan-assistant/voice-conversation] Advisor notification skipped:', notification.reason);
      } else {
        console.info('[api/loan-assistant/voice-conversation] Advisor notification result:', notification.channels);
      }

      activeSessions.delete(session_id);
    }

    return Response.json(
      {
        success: true,
        session_id,
        is_session_active: !shouldEndSession,
        customer_analysis: analysisResult,
        ai_response: manager.getStructuredOutput(aiMessage),
        call_summary: callSummary,
        transcript,
        call_log_id: finalizedCallLogId || manager.callMeta.callLogId || null,
        notification,
      },
      { status: 200 }
    );

  } catch (error) {
    console.error('\n❌ EXCEPTION IN POST HANDLER:');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);

    return Response.json(
      {
        error: error.message || 'Internal server error',
        success: false,
        debug: {
          type: error.name,
          message: error.message
        }
      },
      { status: 500 }
    );
  }
}

/**
 * GET session details and transcript
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('session_id');

    if (!sessionId) {
      return Response.json(
        { error: 'session_id is required', success: false },
        { status: 400 }
      );
    }

    const manager = activeSessions.get(sessionId);

    if (!manager) {
      return Response.json(
        { error: 'Session not found', success: false },
        { status: 404 }
      );
    }

    return Response.json(
      {
        success: true,
        session_id: sessionId,
        is_active: manager.currentStage !== 'closing',
        current_stage: manager.currentStage,
        transcript: manager.getTranscript(),
        extracted_data: manager.extractedData,
        call_meta: manager.callMeta,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error in GET handler:', error);

    return Response.json(
      {
        error: error.message || 'Internal server error',
        success: false,
      },
      { status: 500 }
    );
  }
}
