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
      
    </main>
  );
}
