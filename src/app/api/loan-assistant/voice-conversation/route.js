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
 *   company_name?: string
 *   is_voice_call?: boolean (true for voice, false for chat)
 * }
 */

import { LLMConversationManager } from '@/modules/loan-assistant/llm-conversation-manager.js';

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

    const {
      action = 'next',
      customer_profile,
      customer_message,
      session_id,
      company_name = 'XYZ Finance',
      is_voice_call = false,
    } = body;

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
      manager = new LLMConversationManager(customer_profile, company_name);
      manager.callMeta.isVoiceCall = is_voice_call;
      isNewSession = true;
      
      const newSessionId = `llm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      activeSessions.set(newSessionId, manager);

      // Generate opening message using LLM
      const aiMessage = await manager.generateAIResponse();

      console.log('✅ LLM Session initialized');
      console.log('Session ID:', newSessionId);
      console.log('Is Voice:', is_voice_call);
      console.log('Opening Message:', aiMessage.substring(0, 100) + '...');

      return Response.json(
        {
          success: true,
          session_id: newSessionId,
          is_new_session: true,
          is_voice_call,
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
    console.log('Customer message:', customer_message.substring(0, 50));

    // Process customer message using LLM
    const analysisResult = await manager.processCustomerResponse(customer_message);

    console.log('📊 Analysis result:');
    console.log('  Intent:', analysisResult.intent);
    console.log('  Confidence:', analysisResult.confidence);
    console.log('  Should End:', analysisResult.shouldEnd);

    // Generate next AI response using LLM (context-aware)
    const aiMessage = await manager.generateAIResponse(customer_message);

    // Check if conversation should end
    const shouldEndSession = 
      manager.currentStage === 'closing' ||
      analysisResult.shouldEnd ||
      analysisResult.intent === 'do_not_call';

    console.log('Session ending:', shouldEndSession);

    if (shouldEndSession) {
      activeSessions.delete(session_id);
    }

    return Response.json(
      {
        success: true,
        session_id,
        is_session_active: !shouldEndSession,
        customer_analysis: analysisResult,
        ai_response: manager.getStructuredOutput(aiMessage),
        call_summary: shouldEndSession ? manager.getCallSummary() : null,
        transcript: shouldEndSession ? manager.getTranscript() : null,
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
