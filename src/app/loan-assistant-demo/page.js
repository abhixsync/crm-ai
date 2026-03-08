"use client";

import Link from "next/link";
import { LoanAssistantDemo } from "@/components/loan-assistant/loan-assistant-demo";

export default function LoanAssistantDemoPage() {
  return (
    <main className="mx-auto max-w-7xl space-y-8 px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <nav aria-label="Breadcrumb" className="mb-1 text-sm text-slate-500">
            <Link href="/dashboard" className="hover:text-slate-800">
              Home
            </Link>
            <span className="px-1">→</span>
            <span className="text-slate-700">Loan Assistant Demo</span>
          </nav>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            Loan Assistant Demo
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Test the AI loan calling assistant with different customer profiles.
          </p>
        </div>
      </div>

      <LoanAssistantDemo />
    </main>
  );
}
