"use client";

import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function AiSystemPromptEditor({ initialPrompt }) {
  const [prompt, setPrompt] = useState(initialPrompt?.prompt || "");
  const [label, setLabel] = useState(initialPrompt?.label || "Default System Prompt");
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [lastSaved, setLastSaved] = useState(
    initialPrompt?.updatedAt ? new Date(initialPrompt.updatedAt) : null
  );
  const textareaRef = useRef(null);

  const charCount = prompt.length;
  const MAX_CHARS = 50000;

  const handleSave = useCallback(async () => {
    const trimmed = prompt.trim();
    if (!trimmed) {
      toast.error("Prompt cannot be empty.");
      return;
    }
    if (trimmed.length > MAX_CHARS) {
      toast.error(`Prompt must be under ${MAX_CHARS.toLocaleString()} characters.`);
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/admin/ai-system-prompt", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: trimmed, label: label.trim() || "Default System Prompt" }),
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Failed to save prompt.");
        return;
      }

      setPrompt(data.prompt.prompt);
      setLabel(data.prompt.label);
      setLastSaved(new Date(data.prompt.updatedAt));
      toast.success("System prompt saved successfully.");
    } catch {
      toast.error("Network error — could not save prompt.");
    } finally {
      setSaving(false);
    }
  }, [prompt, label]);

  const handleReset = useCallback(async () => {
    if (!window.confirm("Reset the system prompt to the built-in default? Your current prompt will be overwritten.")) {
      return;
    }

    setResetting(true);
    try {
      const res = await fetch("/api/admin/ai-system-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset" }),
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Failed to reset prompt.");
        return;
      }

      setPrompt(data.prompt.prompt);
      setLabel(data.prompt.label);
      setLastSaved(new Date(data.prompt.updatedAt));
      toast.success("System prompt reset to default.");
    } catch {
      toast.error("Network error — could not reset prompt.");
    } finally {
      setResetting(false);
    }
  }, []);

  const handleKeyDown = useCallback(
    (e) => {
      // Ctrl+S / Cmd+S to save
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    },
    [handleSave]
  );

  return (
    <div className="space-y-6">
      {/* Info banner */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
        <strong>How it works:</strong> This prompt is the base system instruction sent to all LLM
        providers (OpenAI, Claude, Groq) on every call turn. At runtime, the customer&apos;s profile
        and up to their last 50 conversation transcripts are automatically appended to give the AI
        full context. Dialogflow uses intent matching and is not affected by this prompt.
      </div>

      {/* Label input */}
      <div className="space-y-2">
        <label htmlFor="prompt-label" className="block text-sm font-medium text-slate-700">
          Prompt Label
        </label>
        <input
          id="prompt-label"
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="e.g. Default System Prompt"
          maxLength={200}
        />
      </div>

      {/* Prompt editor */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label htmlFor="system-prompt" className="block text-sm font-medium text-slate-700">
            System Prompt
          </label>
          <span
            className={`text-xs ${charCount > MAX_CHARS ? "font-semibold text-red-600" : "text-slate-400"}`}
          >
            {charCount.toLocaleString()} / {MAX_CHARS.toLocaleString()}
          </span>
        </div>
        <textarea
          ref={textareaRef}
          id="system-prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={24}
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm leading-relaxed shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="Enter the system prompt for all AI providers..."
          spellCheck={false}
        />
        <p className="text-xs text-slate-400">
          Tip: Press <kbd className="rounded border border-slate-300 px-1 py-0.5 text-[10px]">Ctrl+S</kbd> to save quickly.
          Use <code className="rounded bg-slate-100 px-1 text-[11px]">{"{HUMAN_ADVISOR_NAME}"}</code> as a placeholder — it
          will be replaced with the advisor name from Loan Assistant Settings at runtime.{" "}
          <code className="rounded bg-slate-100 px-1 text-[11px]">CUSTOMER PROFILE:</code> and{" "}
          <code className="rounded bg-slate-100 px-1 text-[11px]">PREVIOUS CONVERSATION HISTORY:</code> sections
          are appended automatically.
        </p>
      </div>

      {/* Action buttons */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-3">
          <Button
            onClick={handleSave}
            disabled={saving || !prompt.trim()}
            loading={saving}
            loadingText="Saving..."
          >
            Save Prompt
          </Button>
          <Button
            variant="secondary"
            onClick={handleReset}
            disabled={resetting}
            loading={resetting}
            loadingText="Resetting..."
          >
            Reset to Default
          </Button>
        </div>

        {lastSaved && (
          <p className="text-xs text-slate-400">
            Last saved: {lastSaved.toLocaleString()}
          </p>
        )}
      </div>

      {/* Preview section */}
      <div className="rounded-xl border border-slate-200/70 bg-white/70 p-4 shadow-sm backdrop-blur-sm sm:p-5">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">Runtime Prompt Preview</h3>
        <p className="mb-3 text-xs text-slate-500">
          This is what the AI provider will receive at runtime (your prompt + auto-appended sections):
        </p>
        <div className="max-h-96 overflow-y-auto rounded-md border border-slate-200 bg-slate-50 p-4">
          <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-slate-700">
            {prompt || "(empty prompt)"}
            {"\n\n"}
            <span className="text-blue-600">{"CUSTOMER PROFILE:\n{\"id\":\"abc\",\"firstName\":\"Rahul\",\"phone\":\"+91...\",\"loanType\":\"personal\",...}"}</span>
            {"\n\n"}
            <span className="text-green-600">{"PREVIOUS CONVERSATION HISTORY (last 50 calls):\nUse this history to stay consistent — do not repeat questions already answered, reference prior interactions naturally, and maintain continuity.\n--- Call 1 (2026-03-15) ---\nAgent: Hello Rahul, this is the loan assistance desk...\nCustomer: Haan ji, mujhe personal loan chahiye...\n[Summary: Customer interested in personal loan of 5L]\n[Intent: interested]\n\n--- Call 2 (2026-03-17) ---\nAgent: Hello Rahul, following up on your personal loan inquiry...\nCustomer: Haan, documents ready hain...\n[Summary: Customer has documents ready, needs callback]\n[Intent: interested]"}</span>
            {"\n\n"}
            <span className="text-orange-600">{"Current turn index: 0\nConversation stage: greeting\n\nCRITICAL LANGUAGE RULE (must follow strictly):\n[dynamic language mirroring instruction]\n\nReturn ONLY valid JSON: {\"reply\":\"...\",\"shouldEnd\":true|false}"}</span>
          </pre>
        </div>
      </div>
    </div>
  );
}
