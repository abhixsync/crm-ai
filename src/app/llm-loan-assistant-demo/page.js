"use client";

import Link from "next/link";
import { LLMLoanAssistantDemo } from "@/components/loan-assistant/llm-loan-assistant-demo";

export default function LLMLoanAssistantDemoPage() {
  return (
    <main className="mx-auto max-w-7xl space-y-8 px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <nav aria-label="Breadcrumb" className="mb-1 text-sm text-slate-500">
            <Link href="/dashboard" className="hover:text-slate-800">
              Home
            </Link>
            <span className="px-1">→</span>
            <span className="text-slate-700">LLM Loan Assistant (AI + Voice)</span>
          </nav>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            LLM Loan Assistant
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Intelligent AI voice agent powered by OpenAI (ChatGPT/Claude level)
          </p>
        </div>
      </div>

      {/* Feature Highlights */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
          <h3 className="font-semibold text-blue-900">🧠 Smart AI</h3>
          <p className="mt-2 text-sm text-blue-800">
            Uses OpenAI&apos;s intelligent API to understand context naturally, like ChatGPT/Claude
          </p>
        </div>
        <div className="rounded-lg border border-green-200 bg-green-50 p-4">
          <h3 className="font-semibold text-green-900">🎤 Voice Agent</h3>
          <p className="mt-2 text-sm text-green-800">
            Full voice call support with speech recognition and text-to-speech
          </p>
        </div>
        <div className="rounded-lg border border-purple-200 bg-purple-50 p-4">
          <h3 className="font-semibold text-purple-900">📞 Twilio Ready</h3>
          <p className="mt-2 text-sm text-purple-800">
            Integrates with Twilio for real phone calls to customers
          </p>
        </div>
      </div>

      {/* Main Demo */}
      <LLMLoanAssistantDemo />

      {/* Documentation */}
      <div className="space-y-4 rounded-lg border border-gray-200 bg-gray-50 p-6">
        <h2 className="text-xl font-bold">📖 How to Use</h2>

        <div className="space-y-3 text-sm">
          <div>
            <h3 className="font-semibold">1. Setup OpenAI API Key</h3>
            <p className="mt-1 text-gray-700">
              Add to your .env.local:
              <code className="block bg-white p-2 font-mono">
                OPENAI_API_KEY=sk-...
              </code>
            </p>
          </div>

          <div>
            <h3 className="font-semibold">2. Choose Mode</h3>
            <p className="mt-1 text-gray-700">
              <strong>Chat Mode:</strong> Type messages for testing <br />
              <strong>Voice Mode:</strong> Use microphone for voice input
            </p>
          </div>

          <div>
            <h3 className="font-semibold">3. Customer Profile</h3>
            <p className="mt-1 text-gray-700">
              Fill in customer details - AI will use these for intelligent
              contextual responses
            </p>
          </div>

          <div>
            <h3 className="font-semibold">4. Natural Conversation</h3>
            <p className="mt-1 text-gray-700">
              The AI understands context and Hinglish naturally. Try:
            </p>
            <ul className="mt-1 list-inside list-disc space-y-1 text-sm text-gray-700">
              <li>"mujhe 5 lakh chahiye" - AI extracts amount automatically</li>
              <li>"nhi lena" - AI understands and ends gracefully</li>
              <li>"abhi free nhi hoon" - AI schedules callback</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Integration Guide */}
      <div className="space-y-4 rounded-lg border border-amber-200 bg-amber-50 p-6">
        <h2 className="text-xl font-bold">🔧 Integration with Twilio</h2>

        <p className="text-gray-700">
          To use this as a real voice agent for phone calls:
        </p>

        <ol className="list-inside list-decimal space-y-2 text-sm text-gray-700">
          <li>
            Set up Twilio account and phone number
          </li>
          <li>
            Create webhook endpoint for incoming calls:
            <code className="block bg-white p-2 font-mono">
              /api/loan-assistant/twilio-voice
            </code>
          </li>
          <li>
            Configure Twilio to POST to your webhook
          </li>
          <li>
            System will handle speech-to-text and text-to-speech automatically
          </li>
          <li>
            AI responses are converted to voice and played to caller
          </li>
        </ol>

        <p className="text-xs text-amber-900 mt-3">
          Voice support requires: Deepgram API Key (speech-to-text) and ElevenLabs API
          Key (text-to-speech)
        </p>
      </div>

      {/* API Reference */}
      <div className="space-y-4 rounded-lg border border-gray-200 bg-gray-50 p-6">
        <h2 className="text-xl font-bold">🔌 API Reference</h2>

        <div className="space-y-3 text-sm">
          <div>
            <h3 className="font-semibold">Initialize Conversation</h3>
            <code className="block bg-white p-2 font-mono">
              POST /api/loan-assistant/voice-conversation
            </code>
            <p className="mt-1 text-gray-700">
              Body: action, customer_profile, company_name, is_voice_call
            </p>
          </div>

          <div>
            <h3 className="font-semibold">Continue Conversation</h3>
            <code className="block bg-white p-2 font-mono">
              POST /api/loan-assistant/voice-conversation
            </code>
            <p className="mt-1 text-gray-700">
              Body: action=&quot;next&quot;, session_id, customer_message
            </p>
          </div>

          <div>
            <h3 className="font-semibold">Get Session Details</h3>
            <code className="block bg-white p-2 font-mono">
              GET /api/loan-assistant/voice-conversation?session_id=...
            </code>
          </div>
        </div>
      </div>
    </main>
  );
}
