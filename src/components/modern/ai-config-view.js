"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

const PROVIDER_TYPE_STYLE = {
  OPENAI: { bg: "rgba(79,156,249,.15)", color: "var(--ms-blue, #4f9cf9)" },
  CLAUDE: { bg: "rgba(167,139,250,.15)", color: "var(--ms-purple, #a78bfa)" },
  GROQ: { bg: "rgba(245,166,35,.15)", color: "var(--ms-amber, #f5a623)" },
  TWILIO: { bg: "var(--ms-accent-dim)", color: "var(--ms-accent-txt)" },
  PLIVO: { bg: "rgba(242,88,88,.12)", color: "var(--ms-red, #f25858)" },
  VONAGE: { bg: "rgba(79,156,249,.15)", color: "var(--ms-blue, #4f9cf9)" },
};

export function ModernAiConfigView({ initialPrompt, initialScope }) {
  const [aiProviders, setAiProviders] = useState([]);
  const [telephonyProviders, setTelephonyProviders] = useState([]);
  const [promptText, setPromptText] = useState(initialPrompt?.prompt || "");
  const [saving, setSaving] = useState(false);

  const fetchProviders = useCallback(async () => {
    try {
      const [aiRes, telRes] = await Promise.all([
        fetch("/api/admin/ai-providers"),
        fetch("/api/admin/telephony-providers"),
      ]);
      if (aiRes.ok) {
        const data = await aiRes.json();
        setAiProviders(data.providers || []);
      }
      if (telRes.ok) {
        const data = await telRes.json();
        setTelephonyProviders(data.providers || []);
      }
    } catch {
      // silently fail
    }
  }, []);

  useEffect(() => {
    fetchProviders();
  }, [fetchProviders]);

  const savePrompt = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/ai-system-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: initialScope?.key,
          prompt: promptText,
        }),
      });
      if (res.ok) {
        toast.success("System prompt saved");
      } else {
        toast.error("Failed to save prompt");
      }
    } catch {
      toast.error("Failed to save prompt");
    } finally {
      setSaving(false);
    }
  }, [promptText, initialScope?.key]);

  return (
    <div className="ms-ai-config-view" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* AI Providers */}
      <div className="ms-card">
        <div className="ms-card-hd">
          <span className="ms-card-title">AI providers</span>
        </div>
        <div className="ms-tbl-wrap">
          <table className="ms-tbl">
            <thead>
              <tr><th>Name</th><th>Type</th><th>Model</th><th>Priority</th><th>Timeout</th><th>Status</th></tr>
            </thead>
            <tbody>
              {aiProviders.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--ms-text3)" }}>No AI providers configured.</td></tr>
              )}
              {aiProviders.map((p) => {
                const typeStyle = PROVIDER_TYPE_STYLE[p.type] || { bg: "var(--ms-bg3)", color: "var(--ms-text3)" };
                return (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 500 }}>{p.name || p.type}</td>
                    <td>
                      <span className="ms-bdg" style={{ background: typeStyle.bg, color: typeStyle.color }}>{p.type}</span>
                    </td>
                    <td className="ms-mono">{p.model || "—"}</td>
                    <td>{p.priority ?? "—"}</td>
                    <td className="ms-mono" style={{ color: "var(--ms-text3)" }}>{p.timeout ? `${p.timeout.toLocaleString()} ms` : "—"}</td>
                    <td>
                      <span className="ms-bdg" style={{
                        background: p.isActive ? "var(--ms-accent-dim)" : "var(--ms-bg3)",
                        color: p.isActive ? "var(--ms-accent-txt)" : "var(--ms-text3)",
                      }}>
                        {p.isActive ? "Active" : "Standby"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Telephony Providers */}
      <div className="ms-card">
        <div className="ms-card-hd">
          <span className="ms-card-title">Telephony providers</span>
        </div>
        <div className="ms-tbl-wrap">
          <table className="ms-tbl">
            <thead>
              <tr><th>Name</th><th>Type</th><th>Active</th></tr>
            </thead>
            <tbody>
              {telephonyProviders.length === 0 && (
                <tr><td colSpan={3} style={{ textAlign: "center", color: "var(--ms-text3)" }}>No telephony providers configured.</td></tr>
              )}
              {telephonyProviders.map((p) => {
                const typeStyle = PROVIDER_TYPE_STYLE[p.type] || { bg: "var(--ms-bg3)", color: "var(--ms-text3)" };
                return (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 500 }}>{p.name || p.type}</td>
                    <td>
                      <span className="ms-bdg" style={{ background: typeStyle.bg, color: typeStyle.color }}>{p.type}</span>
                    </td>
                    <td>
                      <span className="ms-bdg" style={{
                        background: p.isActive ? "var(--ms-accent-dim)" : "var(--ms-bg3)",
                        color: p.isActive ? "var(--ms-accent-txt)" : "var(--ms-text3)",
                      }}>
                        {p.isActive ? "Yes" : "No"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* System Prompt */}
      <div className="ms-card" style={{ padding: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ms-text)", marginBottom: 10 }}>
          System prompt{initialScope?.isSuperAdmin ? " — Global" : ""}
        </div>
        <textarea
          className="ms-field-inp"
          rows={5}
          style={{ resize: "vertical", lineHeight: 1.7, fontSize: 12 }}
          value={promptText}
          onChange={(e) => setPromptText(e.target.value)}
        />
        <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
          <button className="ms-btn ms-btn-pri" onClick={savePrompt} disabled={saving}>
            {saving ? "Saving…" : "Save prompt"}
          </button>
          <button className="ms-btn" onClick={() => setPromptText(initialPrompt?.prompt || "")}>
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}
