/**
 * Loan Assistant Conversation API
 * Handles conversation flow between AI and customer
 * 
 * POST /api/loan-assistant/conversation
 * Body: {
 *   action: "init" | "next"
 *   customer_profile: { name, city, monthly_income, employment_type, credit_score, existing_loans, loan_interest_type },
 *   customer_message?: string (for "next" action)
 *   session_id?: string (for "next" action)
 *   tenant_id?: string (for "init" action - to fetch CRM name and AI agent name, auto-detected from session if not provided)
 *   company_name?: string (fallback if tenant_id not provided)
 *   ai_agent_name?: string (fallback if tenant_id not provided)
 * }
 */

import { ConversationManager } from '@/modules/loan-assistant/conversation-manager.js';
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

// Simple in-memory session storage (in production, use Redis or DB)
const activeSessions = new Map();

export async function POST(request) {
  try {
    console.log('\n\n');
    console.log('╔════════════════════════════════════════════════════════╗');
    console.log('║ [Loan Assistant API] POST Request Received              ║');
    console.log('╚════════════════════════════════════════════════════════╝');
    console.log('Time:', new Date().toISOString());
    console.log('Method:', request.method);
    console.log('URL:', request.url);
    
    let body;
    let rawBodyText = '';
    
    try {
      // Get raw body
      const cloned = request.clone();
      rawBodyText = await cloned.text();
      
      console.log('\n📥 RAW BODY TEXT:');
      console.log('Length:', rawBodyText.length);
      console.log('Content:', rawBodyText);
      
      // Parse JSON
      body = JSON.parse(rawBodyText);
      console.log('\n✅ PARSED BODY:');
      console.log('Keys:', Object.keys(body));
      console.log('Full body:', body);
      
    } catch (parseErr) {
      console.error('\n❌ PARSE ERROR:', parseErr.message);
      return Response.json(
        { 
          error: 'Invalid JSON in request body', 
          details: parseErr.message
        },
        { status: 400 }
      );
    }

    let {
      customer_profile,
      customer_message,
      session_id,
      tenant_id,
      company_name,
      ai_agent_name,
      action = 'next',
    } = body;

    console.log('\n🔍 DESTRUCTURED VALUES:');
    console.log('action:', action);
    console.log('company_name:', company_name);
    console.log('tenant_id:', tenant_id);
    console.log('customer_profile IS PRESENT:', typeof customer_profile !== 'undefined');
    console.log('customer_profile VALUE:', customer_profile);
    console.log('customer_profile KEYS:', customer_profile && Object.keys(customer_profile));

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

    // Only require customer_profile for 'init' action
    if (action === 'init' && !customer_profile) {
      console.error('\n❌ VALIDATION FAILED: customer_profile is required for init action!');
      console.error('Available keys:', Object.keys(body));
      
      return Response.json(
        { 
          error: 'customer_profile is required for init action',
          debug: {
            received_keys: Object.keys(body),
            action_value: action,
            raw_body: rawBodyText.substring(0, 500)
          }
        },
        { status: 400 }
      );
    }

    // For 'next' action, we need session_id and customer_message
    if (action === 'next' && !session_id) {
      console.error('\n❌ VALIDATION FAILED: session_id is required for next action!');
      return Response.json(
        { 
          error: 'session_id is required for continuing conversation',
          debug: {
            received_keys: Object.keys(body),
            action_value: action
          }
        },
        { status: 400 }
      );
    }

    console.log('\n✅ VALIDATION PASSED - Proceeding...');

    let manager;
    let isNewSession = false;

    // Handle init action - create new conversation
    if (action === 'init') {
      console.log('📍 Creating new conversation (init)...');
      
      // Determine company name and AI agent name
      let finalCompanyName = company_name || 'FinServe Loans';
      let finalAiAgentName = ai_agent_name || 'Priya Sharma';
      
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
            console.log('📦 Tenant Config:', {
              tenantId: tenant_id,
              loanAssistantCompanyName: tenant.loanAssistantCompanyName,
              tenantName: tenant.name,
              resolvedCompanyName: finalCompanyName,
              aiAgentName: finalAiAgentName,
            });
          } else {
            console.warn('⚠️ Tenant not found:', tenant_id);
          }
        } catch (error) {
          console.warn('⚠️ Error fetching tenant:', error.message);
        }
      }
      
      const newSessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      manager = new ConversationManager(customer_profile, finalCompanyName);
      manager.callMeta.tenantId = tenant_id || null;
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
            sourceLabel: 'Loan Assistant Demo',
          });

          const callLog = await createLoanAssistantDemoCallLog({
            tenantId: tenant_id,
            customerId: customer.id,
            sessionId: newSessionId,
            sourceKey: 'loan_assistant_demo',
            attemptNumber: Number(customer.retryCount || 0) + 1,
          });

          manager.callMeta.customerId = customer.id;
          manager.callMeta.callLogId = callLog.id;

          console.info('[api/loan-assistant/conversation] CRM call log created for demo session', {
            sessionId: newSessionId,
            customerId: customer.id,
            callLogId: callLog.id,
          });
        } catch (persistError) {
          console.warn('[api/loan-assistant/conversation] Unable to seed CRM call log for demo session:', persistError?.message || persistError);
        }
      }

      // Generate opening message
      const aiMessage = manager.generateAIResponse();

      console.log('\n✅ SUCCESS - Conversation initialized!');
      console.log('Session ID:', newSessionId);
      console.log('Company Name:', finalCompanyName);
      console.log('AI Message:', aiMessage.substring(0, 100) + '...');

      return Response.json(
        {
          success: true,
          session_id: newSessionId,
          is_new_session: true,
          call_log_id: manager.callMeta.callLogId || null,
          ai_response: manager.getStructuredOutput(aiMessage),
          message: 'Call initiated successfully',
        },
        { status: 200 }
      );
    }

    // Handle next action - continue existing conversation
    console.log('📍 Continuing conversation (next)...');
    if (!session_id) {
      console.error('❌ session_id is missing for next action');
      return Response.json(
        { error: 'session_id is required to continue conversation' },
        { status: 400 }
      );
    }

    manager = activeSessions.get(session_id);

    if (!manager) {
      console.error('❌ Session not found:', session_id);
      return Response.json(
        { error: 'Session not found. Please initiate a new conversation.' },
        { status: 404 }
      );
    }

    if (!customer_message) {
      console.error('❌ customer_message is missing');
      return Response.json(
        { error: 'customer_message is required to continue conversation' },
        { status: 400 }
      );
    }

    console.log('✅ All validations passed for next action');
    console.log('Processing customer message:', customer_message);

    // Process customer response
    const analysisResult = manager.processCustomerResponse(customer_message);

    // Generate AI response
    const aiMessage = manager.generateAIResponse();

    // Check if should end session
      const shouldEndSession =
        manager.currentStage === 'closing' ||
        analysisResult.shouldEnd ||
        ['do_not_call', 'not_interested', 'busy', 'call_back_later'].includes(analysisResult.intent);

    console.log('📊 Analysis:', analysisResult);
    console.log('Should end session:', shouldEndSession);

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
          extractedData: {
            loanType: callSummary?.extracted_loan_type,
            amount: callSummary?.extracted_amount,
            timeline: callSummary?.extracted_timeline,
            employmentType: callSummary?.customer_employment,
          },
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
            sourceKey: 'loan_assistant_demo',
            summary: summaryText,
            transcript: transcriptText,
            intent: callSummary?.intent,
            nextAction: nextActionText,
            aiProviderUsed: null,
            durationSecs: callSummary?.call_duration_seconds,
            extractedData: {
              loanType: callSummary?.extracted_loan_type || null,
              amount: callSummary?.extracted_amount || null,
              timeline: callSummary?.extracted_timeline || null,
              employmentType: callSummary?.customer_employment || null,
            },
          });
        } catch (persistError) {
          console.warn('[api/loan-assistant/conversation] Unable to finalize CRM call log for demo session:', persistError?.message || persistError);
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
          extractedData: {
            loanType: callSummary?.extracted_loan_type || null,
            amount: callSummary?.extracted_amount || null,
            timeline: callSummary?.extracted_timeline || null,
            employmentType: callSummary?.customer_employment || null,
          },
          source: 'loan_assistant_demo',
        });
      }

      if (!notification.ok && !notification.skipped) {
        console.warn('[api/loan-assistant/conversation] Advisor notification failed:', notification.reason);
      } else if (notification?.skipped) {
        console.info('[api/loan-assistant/conversation] Advisor notification skipped:', notification.reason);
      } else {
        console.info('[api/loan-assistant/conversation] Advisor notification result:', notification.channels);
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
 * GET /api/loan-assistant/conversation?session_id=xxx
 * Retrieve conversation details and status
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('session_id');

    if (!sessionId) {
      return Response.json(
        { error: 'session_id is required' },
        { status: 400 }
      );
    }

    const manager = activeSessions.get(sessionId);

    if (!manager) {
      return Response.json(
        { error: 'Session not found' },
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
    console.error('Loan Assistant GET Error:', error);

    return Response.json(
      {
        error: error.message || 'Internal server error',
        success: false,
      },
      { status: 500 }
    );
  }
}
