# Loan Assistant Module Setup

## Overview

The Loan Assistant is an AI-powered telecalling system that speaks natural Hinglish (blend of Hindi and English) to call customers and qualify them for loan products. It's designed to behave like a professional Indian telecaller.

## Architecture

### Components

1. **System Prompt** (`system-prompt.js`)
   - Defines AI behavior, language style, and conversation flow
   - Contains all pitch logic and objection handling rules
   - Specifies conversation stages and intent types

2. **Intent Detector** (`intent-detector.js`)
   - Analyzes customer responses to detect intent
   - Extracts loan details (type, amount, timeline)
   - Determines conversation stage progression
   - Classifies employment types

3. **Conversation Manager** (`conversation-manager.js`)
   - Manages conversation state and flow
   - Generates contextual AI responses based on customer profile
   - Tracks conversation history and extracted data
   - Produces structured output for logging/analysis

4. **API Endpoint** (`api/loan-assistant/conversation/route.js`)
   - HTTP interface for initiating and continuing conversations
   - Session management
   - Returns structured JSON responses

## Usage

### Initialize a Conversation

```bash
POST /api/loan-assistant/conversation
Content-Type: application/json

{
  "action": "init",
  "company_name": "XYZ Finance",
  "customer_profile": {
    "name": "Abhishek Shukla",
    "city": "Meerut",
    "monthly_income": 500000,
    "employment_type": "salaried",
    "credit_score": 720,
    "existing_loans": "none",
    "loan_interest_type": "personal_loan"
  }
}
```

**Response:**
```json
{
  "success": true,
  "session_id": "session_1234567890_abc123",
  "is_new_session": true,
  "ai_response": {
    "ai_message": "Namaste Rahul ji,\n\nMain XYZ Finance se bol raha hoon.\nKya abhi 30 seconds baat karna convenient hai?",
    "intent": null,
    "confidence": 0,
    "conversation_stage": "opening",
    "extracted_data": {...},
    "conversation_length": 1
  }
}
```

### Continue Conversation

```bash
POST /api/loan-assistant/conversation
Content-Type: application/json

{
  "action": "next",
  "session_id": "session_1234567890_abc123",
  "customer_message": "Haan ji, haan bilkul. Main interested hoon personal loan ke liye. Mujhe 5 lakh chahiye."
}
```

**Response:**
```json
{
  "success": true,
  "session_id": "session_1234567890_abc123",
  "is_session_active": true,
  "customer_analysis": {
    "intent": "interested",
    "confidence": 0.85,
    "extractedData": {
      "loanType": "personal_loan",
      "amount": 500000,
      "timeline": null,
      "employmentType": "salaried"
    },
    "nextStage": "qualification"
  },
  "ai_response": {
    "ai_message": "Bilkul! 5 lakh personal loan ke liye aap eligible ho sakte hain.\n\nAapko kitne time mein ye amount chahiye?",
    "intent": "interested",
    "confidence": 0.85,
    "conversation_stage": "qualification",
    "extracted_data": {...}
  }
}
```

### Retrieve Session Status

```bash
GET /api/loan-assistant/conversation?session_id=session_1234567890_abc123
```

**Response:**
```json
{
  "success": true,
  "session_id": "session_1234567890_abc123",
  "is_active": true,
  "current_stage": "qualification",
  "transcript": [...],
  "extracted_data": {...},
  "call_meta": {...}
}
```

## Customer Profile Fields

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| name | string | Customer's name | "Rahul" |
| city | string | Customer's city | "Delhi" |
| monthly_income | number | Monthly income in rupees | 50000 |
| employment_type | string | Type of employment | "salaried", "business", "self-employed" |
| credit_score | number | Credit score | 720 |
| existing_loans | string | Current loan status | "none", "1 personal", "home loan" |
| loan_interest_type | string | Interested loan type | "personal_loan", "home_loan", "business_loan" |

## Conversation Stages

1. **opening** - Initial greeting and permission
2. **discovery** - Understanding customer needs
3. **pitch** - Presenting loan options based on profile
4. **qualification** - Gathering details (amount, timeline, etc.)
5. **closing** - Call conclusion and next steps

## Intent Types

- **interested** - Customer shows interest
- **not_interested** - Customer declines
- **call_back_later** - Customer is busy, wants callback
- **converted** - Customer is qualified and ready for handoff
- **follow_up** - Needs follow-up action
- **do_not_call** - Customer explicitly asks not to be called
- **neutral** - Unclear or neutral response

## Language Features

### Hinglish Support

The assistant speaks natural Hinglish with:
- Mix of Hindi and English words
- Respectful terms: "ji", "aap", "dhanyavaad", "please"
- Warm, conversational tone
- No robotic or sales-pushy language

### Common Phrases

| English | Hinglish |
|---------|----------|
| Please | please / kripya |
| Thank you | dhanyavaad / shukriya |
| Yes | haan / bilkul |
| No | nahi |
| Hello | Namaste / Namaskar |
| Understood | samajh gaya |
| Now | abhi |
| Later | baad mein |
| Busy | busy |
| Call back | callback |

## Error Handling

### Do-Not-Call Detection

If customer says any of these, conversation ends immediately:
- "Don't call again"
- "Mat call karna"
- "Remove my number"
- "Ye harassment hai"

Intent is set to `do_not_call` and session is deleted.

### Objection Handling

1. **Not Interested** → Exit politely with callback option
2. **Busy** → Ask for callback time
3. **Already Has Loan** → Offer refinance option
4. **Angry** → Apologize and end call immediately

## Session Management

- Sessions are stored in-memory (suitable for testing/demo)
- **For production**: Migrate to Redis or database
- Sessions auto-expire if not accessed
- Session ID format: `session_<timestamp>_<random_id>`

## Integration Examples

### Next.js Server Component

```javascript
'use client';

import { useState } from 'react';

export default function LoanAssistantDemo() {
  const [sessionId, setSessionId] = useState(null);
  const [conversation, setConversation] = useState([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const initCall = async () => {
    setLoading(true);
    const res = await fetch('/api/loan-assistant/conversation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'init',
        company_name: 'XYZ Finance',
        customer_profile: {
          name: 'Rahul',
          city: 'Delhi',
          monthly_income: 50000,
          employment_type: 'salaried',
          credit_score: 720,
          existing_loans: 'none',
          loan_interest_type: 'personal_loan'
        }
      })
    });

    const data = await res.json();
    setSessionId(data.session_id);
    setConversation([{ role: 'ai', message: data.ai_response.ai_message }]);
    setLoading(false);
  };

  const sendMessage = async () => {
    if (!message.trim()) return;

    setConversation(prev => [...prev, { role: 'customer', message }]);
    setLoading(true);

    const res = await fetch('/api/loan-assistant/conversation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'next',
        session_id: sessionId,
        customer_message: message
      })
    });

    const data = await res.json();
    setConversation(prev => [...prev, { role: 'ai', message: data.ai_response.ai_message }]);
    setMessage('');
    setLoading(false);
  };

  return (
    <div>
      {!sessionId ? (
        <button onClick={initCall} disabled={loading}>Start Call</button>
      ) : (
        <>
          <div>{conversation.map((msg, i) => <p key={i}>{msg.role}: {msg.message}</p>)}</div>
          <input value={message} onChange={e => setMessage(e.target.value)} />
          <button onClick={sendMessage} disabled={loading}>Send</button>
        </>
      )}
    </div>
  );
}
```

## Testing

### Manual Testing via curl

```bash
# Initialize
curl -X POST http://localhost:3000/api/loan-assistant/conversation \
  -H "Content-Type: application/json" \
  -d '{
    "action": "init",
    "customer_profile": {
      "name": "Rahul",
      "city": "Delhi",
      "monthly_income": 50000,
      "employment_type": "salaried"
    }
  }'

# Continue conversation
curl -X POST http://localhost:3000/api/loan-assistant/conversation \
  -H "Content-Type: application/json" \
  -d '{
    "action": "next",
    "session_id": "SESSION_ID_HERE",
    "customer_message": "Haan, main interested hoon"
  }'
```

## Future Enhancements

1. **OpenAI Integration** - Replace template-based responses with GPT-4 while maintaining system prompt
2. **Persistent Storage** - Save all conversations to database for analysis
3. **Redis Sessions** - Improve session management for production scale
4. **Call Recording** - Integrate with Twilio for actual voice calls
5. **Analytics Dashboard** - Real-time call metrics and conversion rates
6. **A/B Testing** - Test different pitches and scripts
7. **Multi-language** - Expand to other Indian languages
8. **Callback Scheduling** - Automatic remind system for callbacks

## Troubleshooting

### Session Not Found
- Session may have expired (30 min timeout)
- Session ID might be incorrect
- New session required - call `/init` action

### Intent Not Detected Accurately
- Check customer message language (Hinglish supported)
- Review `detectIntent()` function in `intent-detector.js`
- Add new keywords/patterns as needed

### API Errors
- Ensure `customer_profile` object has all required fields
- Check `customer_message` is provided for continuing conversations
- Verify session exists before sending message

---

For questions or issues, contact the development team.
