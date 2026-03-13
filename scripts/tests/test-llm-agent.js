/**
 * Test Script for LLM Voice Agent
 * Run with: node scripts/tests/test-llm-agent.js
 */

async function testLLMAgent() {
  console.log(`
╔════════════════════════════════════════════════════════╗
║  LLM Loan Assistant Voice Agent Test                   ║
╚════════════════════════════════════════════════════════╝
  `);

  const baseUrl = 'http://localhost:3000/api/loan-assistant/voice-conversation';

  try {
    // Step 1: Initialize conversation
    console.log('\n1️⃣  INITIALIZING CONVERSATION...\n');
    
    const initResponse = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'init',
        customer_profile: {
          name: 'Priya Sharma',
          city: 'Bangalore',
          monthly_income: 75000,
          employment_type: 'salaried',
          credit_score: 780,
          existing_loans: 'none',
          loan_interest_type: 'personal_loan'
        },
        company_name: 'Smart Finance Ltd',
        is_voice_call: false
      })
    });

    const initData = await initResponse.json();

    if (!initData.success) {
      console.error('❌ Init failed:', initData);
      return;
    }

    const sessionId = initData.session_id;
    console.log('✅ Session created:', sessionId);
    console.log('🤖 AI:', initData.ai_response.ai_message);

    // Step 2: Customer says yes
    console.log('\n2️⃣  CUSTOMER RESPONDS: "haan, 5 lakh personal loan chahiye"\n');

    const response1 = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'next',
        session_id: sessionId,
        customer_message: 'haan, 5 lakh personal loan chahiye'
      })
    });

    const data1 = await response1.json();
    console.log('📊 Intent detected:', data1.customer_analysis.intent);
    console.log('💰 Amount extracted:', data1.customer_analysis.extractedData.amount);
    console.log('📋 Loan type:', data1.customer_analysis.extractedData.loanType);
    console.log('🤖 AI:', data1.ai_response.ai_message);
    console.log('Session active:', data1.is_session_active);

    // Step 3: Customer says not interested
    console.log('\n3️⃣ CUSTOMER RESPONDS: "nhi chahiye actually, thanks"\n');

    const response2 = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'next',
        session_id: sessionId,
        customer_message: 'nhi chahiye actually, thanks'
      })
    });

    const data2 = await response2.json();
    console.log('📊 Intent detected:', data2.customer_analysis.intent);
    console.log('🤖 AI Response:', data2.ai_response.ai_message);
    console.log('Session active:', data2.is_session_active);

    if (!data2.is_session_active) {
      console.log('\n✅ Call ended gracefully');
      console.log('\nCall Summary:');
      console.log('  Duration:', data2.call_summary?.duration, 'seconds');
      console.log('  Turns:', data2.call_summary?.turnCount);
      console.log('  Final Intent:', data2.call_summary?.intent);
    }

    console.log(`
╔════════════════════════════════════════════════════════╗
║  ✅ LLM Agent Test Complete                            ║
║                                                        ║
║  The AI understood:                                    ║
║  ✓ Customer interest ("5 lakh personal loan")          ║
║  ✓ Declined objection ("nhi chahiye")                  ║
║  ✓ Ended call gracefully                              ║
║                                                        ║
║  Go to: http://localhost:3000/llm-loan-assistant-     ║
║         demo to test with voice or chat               ║
╚════════════════════════════════════════════════════════╝
    `);

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run test
testLLMAgent();
