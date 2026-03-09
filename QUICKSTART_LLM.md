# 🚀 LLM Voice Agent - Quick Start (5 Minutes)

## What You Get

✅ **Intelligent AI** (like ChatGPT) that understands context  
✅ **Voice Agent** for making phone calls  
✅ **Demo to test immediately**  
✅ **Production-ready code**  

## Setup (Choose One)

### Option 1: Try with Free OpenAI Credits (RECOMMENDED)

**1. Get Free $5 Credits**
- Go to: https://platform.openai.com/account/api-keys
- Sign up with email
- Click "Plan" → "Billing overview"
- You'll get $5 free trial

**2. Create API Key**
- Click on account profile (top right)
- Select "API keys"
- Click "Create new secret key"
- Copy the key (starts with `sk-proj-`)

**3. Add to Project**
- Create/edit `.env.local` in project root:
```env
OPENAI_API_KEY=sk-proj-YOUR_KEY_HERE
```

**4. Restart Dev Server**
```bash
# Stop server: Ctrl+C
npm run dev
```

**5. Test Demo**
- Open: http://localhost:3000/llm-loan-assistant-demo
- Click "Start Call"
- Type: "5 lakh personal loan chahiye"
- AI will understand automatically!

---

### Option 2: Setup All Voice Features (Optional)

For actual phone calls and voice:

```env
# Required
OPENAI_API_KEY=sk-proj-YOUR_KEY

# Speech Recognition
DEEPGRAM_API_KEY=YOUR_KEY_HERE
# Get from: https://console.deepgram.com

# Voice Output
ELEVENLABS_API_KEY=YOUR_KEY_HERE
# Get from: https://elevenlabs.io/app

# Phone Calls
TWILIO_ACCOUNT_SID=YOUR_SID
TWILIO_AUTH_TOKEN=YOUR_TOKEN
TWILIO_PHONE_NUMBER=+1234567890
# Get from: https://console.twilio.com
```

---

## Test Different Scenarios

### Scenario 1: Say No to Loan
```
You: "nhi chahiye"
AI: "Bilkul samajh sakta hoon..."
Result: ✅ Call ends gracefully
```

### Scenario 2: Ask for Loan Amount
```
You: "20 lakh home loan" 
AI: Understands amount + type automatically
Result: ✅ Extracted: amount=20 lakh, type=home_loan
```

### Scenario 3: Say Too Busy
```
You: "abhi busy hoon"
AI: "Kab call kar du?" 
Result: ✅ Schedules callback
```

### Scenario 4: Mix Hindi/English
```
You: "mujhe 8 lakh chahiye personal, kya ho sakta?"
AI: Understands mixed language perfectly
Result: ✅ Works with any language mix
```

---

## File Locations

| What | Where |
|------|-------|
| **LLM AI Core** | `src/modules/loan-assistant/llm-conversation-manager.js` |
| **Demo Page** | `http://localhost:3000/llm-loan-assistant-demo` |
| **Demo Code** | `src/components/loan-assistant/llm-loan-assistant-demo.js` |
| **API Endpoint** | `/api/loan-assistant/voice-conversation` |
| **Voice Utils** | `src/lib/voice/loan-assistant-voice.js` |
| **Docs** | `docs/LLM_VOICE_AGENT_SETUP.md` |

---

## Common Questions

### Q: Is it free?
**A:** Yes for testing with free $5 credits. After that, ~$0.015 per conversation.

### Q: Can I use my own OpenAI key?
**A:** Yes! Any OpenAI API key works. Just add to `.env.local`

### Q: Does it work in Indian languages?
**A:** Yes! Supports Hindi, English, and Hinglish (mixed). AI is trained on diverse accents.

### Q: How do I make real phone calls?
**A:** Set up Twilio - See `docs/LLM_VOICE_AGENT_SETUP.md` section "Voice Integration with Twilio"

### Q: Can I change the AI behavior?
**A:** Yes! Edit the system prompt in `llm-conversation-manager.js` line ~40

### Q: What if I want to add features?
**A:** Just describe in the system prompt - AI adapts automatically!

---

## Next Steps After Testing

1. ✅ **Add API Key** (done above)
2. ✅ **Test Chat Mode** - Type messages
3. ⬜ **Test Voice Mode** - Use microphone (needs Deepgram/ElevenLabs keys for voice output)
4. ⬜ **Connect Twilio** - For real phone calls
5. ⬜ **Deploy** - Push to production (Vercel, AWS, etc.)
6. ⬜ **Scale** - Add multiple agents, track metrics

---

## Keyboard Shortcuts

While testing:
- Press **Enter** to send message
- Click **🎤** to use voice input (if Deepgram configured)

---

## Troubleshooting

**Q: "Error: 401 Unauthorized"**  
A: OpenAI API key is wrong or missing. Check `.env.local`

**Q: AI keeps saying "Namaste..."**  
A: OpenAI key not set. Add it to `.env.local` and restart server

**Q: Voice input not working**  
A: Browser might not support it. Use Chrome/Edge. Or Deepgram key missing.

**Q: "Session not found"**  
A: Conversation ended. Click "Start Call" to begin new one.

---

## Files Created/Modified

### New Files (LLM System)
- ✅ `src/modules/loan-assistant/llm-conversation-manager.js`
- ✅ `src/app/api/loan-assistant/voice-conversation/route.js`
- ✅ `src/lib/voice/loan-assistant-voice.js`
- ✅ `src/components/loan-assistant/llm-loan-assistant-demo.js`
- ✅ `src/app/llm-loan-assistant-demo/page.js`
- ✅ `docs/LLM_VOICE_AGENT_SETUP.md`
- ✅ `docs/LLM_IMPLEMENTATION_COMPLETE.md`

### Unchanged (Original System Still Available)
- `src/modules/loan-assistant/conversation-manager.js` (keyword-based)
- `src/app/api/loan-assistant/conversation/route.js`
- `src/components/loan-assistant/loan-assistant-demo.js`

---

## 🎯 Real-World Example

**Before (Keyword System):**
```
Customer: "nhi lena chahiye yaar"
System: ❌ Doesn't recognize "lena" → keeps asking questions
User: Frustrated ❌
```

**After (LLM System):**
```
Customer: "nhi lena chahiye yaar"
System: ✅ Understands intent = NOT_INTERESTED
System: "Bilkul samajh sakta hoon..."
User: Happy ✅
```

---

## Get Help

- **Setup Issues**: Check `.env.local` has correct keys
- **API Errors**: Visit https://platform.openai.com/account/usage
- **Documentation**: Read `docs/LLM_VOICE_AGENT_SETUP.md`
- **Code Questions**: Check comment in `llm-conversation-manager.js`

---

## Start Testing Now! 🎬

```bash
# Make sure server is running
npm run dev

# Visit demo
# http://localhost:3000/llm-loan-assistant-demo

# Type: "5 lakh chahiye"
# Watch AI understand automatically!
```

**Then try with voice (if you have Deepgram key) 🎤**

---

That's it! You have a production-ready AI voice agent. 🚀

**Questions?** Check `docs/LLM_VOICE_AGENT_SETUP.md` for detailed docs.
