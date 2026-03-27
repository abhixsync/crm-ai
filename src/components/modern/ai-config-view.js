"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

const AI_TYPE_STYLE = {
  OPENAI:       { bg: "var(--ms-blue-dim, rgba(79,156,249,.15))",    color: "var(--ms-blue, #4f9cf9)" },
  CLAUDE:       { bg: "var(--ms-purple-dim, rgba(167,139,250,.15))", color: "var(--ms-purple, #a78bfa)" },
  GROQ:         { bg: "var(--ms-amber-dim, rgba(245,166,35,.15))",   color: "var(--ms-amber, #f5a623)" },
  GEMINI:       { bg: "var(--ms-green-dim, rgba(34,201,147,.15))",   color: "var(--ms-green, #22c993)" },
  DIALOGFLOW:   { bg: "var(--ms-blue-dim, rgba(79,156,249,.12))",    color: "var(--ms-blue, #60a5fa)" },
  RASA:         { bg: "var(--ms-muted-dim, rgba(138,138,136,.14))",  color: "var(--ms-muted, #9ca3af)" },
  GENERIC_HTTP: { bg: "var(--ms-muted-dim, rgba(138,138,136,.14))",  color: "var(--ms-muted, #9ca3af)" },
};

const TEL_TYPE_STYLE = {
  TWILIO:  { bg: "var(--ms-green-dim, rgba(34,201,147,.15))",  color: "var(--ms-green, #22c993)" },
  PLIVO:   { bg: "var(--ms-red-dim, rgba(242,88,88,.12))",     color: "var(--ms-red, #f25858)" },
  VONAGE:  { bg: "var(--ms-blue-dim, rgba(79,156,249,.15))",   color: "var(--ms-blue, #4f9cf9)" },
  EXOTEL:  { bg: "var(--ms-amber-dim, rgba(245,166,35,.15))",  color: "var(--ms-amber, #f5a623)" },
};

// Simulated TTS/STT config — shown for reference (stored in settings or env for now)
const TTS_PROVIDERS = [
  { id: "google-tts", name: "Google Cloud TTS", type: "TTS", status: "Configured", note: "Via GOOGLE_AI_API_KEY" },
  { id: "browser-tts", name: "Browser Speech API", type: "TTS", status: "Available", note: "Fallback in simulator" },
];
const STT_PROVIDERS = [
  { id: "browser-stt", name: "Browser Speech Recognition", type: "STT", status: "Available", note: "Used in AI Simulator" },
  { id: "google-stt", name: "Google Cloud STT", type: "STT", status: "Configured", note: "Via GOOGLE_AI_API_KEY" },
];

// ─── Edit Modal ──────────────────────────────────────────
function ProviderEditModal({ provider, onClose, onSave }) {
  const [form, setForm] = useState({
    name: provider?.name || "",
    model: provider?.model || "",
    priority: provider?.priority ?? 100,
    timeoutMs: provider?.timeoutMs ?? 12000,
    status: provider?.status ?? "STANDBY",
    apiKey: "",
  });
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const body = {
        name: form.name,
        model: form.model || undefined,
        priority: Number(form.priority),
        timeoutMs: Number(form.timeoutMs),
        status: form.status,
      };
      if (form.apiKey.trim()) body.apiKey = form.apiKey.trim();

      const url = provider?.id
        ? `/api/admin/ai-providers/${provider.id}`
        : "/api/admin/ai-providers";
      const method = provider?.id ? "PATCH" : "POST";
      if (!provider?.id) {
        body.type = provider?.type;
      }

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      toast.success("Provider updated");
      onSave();
      onClose();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="ms-modal-overlay"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ms-modal-box" style={{ maxWidth: 440 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ms-text)" }}>Edit provider — {provider?.name}</div>
          <button className="ms-btn" style={{ padding: "2px 8px" }} onClick={onClose}>✕</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[
            ["name", "Display Name", "text"],
            ["model", "Model ID", "text"],
            ["priority", "Priority (lower = higher priority)", "number"],
            ["timeoutMs", "Timeout (ms)", "number"],
            ["apiKey", "API Key (leave blank to keep existing)", "password"],
          ].map(([key, label, type]) => (
            <div key={key} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 12, color: "var(--ms-text2)" }}>{label}</label>
              <input
                className="ms-input"
                type={type}
                value={form[key]}
                onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                placeholder={key === "apiKey" ? "sk-..." : ""}
              />
            </div>
          ))}
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
            <label style={{ fontSize: 12, color: "var(--ms-text2)" }}>Status</label>
            <select className="ms-input" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
              <option value="ACTIVE">ACTIVE — primary provider (used first)</option>
              <option value="STANDBY">STANDBY — fallback only</option>
              <option value="DISABLED">DISABLED — excluded from all calls</option>
            </select>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 18, justifyContent: "flex-end" }}>
          <button className="ms-btn" onClick={onClose}>Cancel</button>
          <button className="ms-btn ms-btn-pri" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function TelephonyEditModal({ provider, onClose, onSave }) {
  const [form, setForm] = useState({
    name: provider?.name || "",
    isActive: provider?.isActive ?? false,
    enabled: provider?.enabled ?? true,
    accountSid: "",
    authToken: "",
    fromNumber: provider?.fromNumber || "",
  });
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const body = {
        name: form.name,
        isActive: form.isActive,
        enabled: form.enabled,
        fromNumber: form.fromNumber || undefined,
      };
      if (form.accountSid.trim()) body.accountSid = form.accountSid.trim(); // eslint-disable-line
      if (form.authToken.trim()) body.authToken = form.authToken.trim();

      const url = provider?.id
        ? `/api/admin/telephony-providers/${provider.id}`
        : "/api/admin/telephony-providers";
      const method = provider?.id ? "PATCH" : "POST";
      if (!provider?.id) body.type = provider?.type;

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      toast.success("Provider updated");
      onSave();
      onClose();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="ms-modal-overlay"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ms-modal-box" style={{ maxWidth: 440 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ms-text)" }}>Edit telephony — {provider?.name}</div>
          <button className="ms-btn" style={{ padding: "2px 8px" }} onClick={onClose}>✕</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[
            ["name", "Display Name", "text"],
            ["fromNumber", "From Number (e.g. +91XXXXXXXXXX)", "text"],
            ["accountSid", "Account SID / Key ID (leave blank to keep)", "password"],
            ["authToken", "Auth Token / Secret (leave blank to keep)", "password"],
          ].map(([key, label, type]) => (
            <div key={key} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 12, color: "var(--ms-text2)" }}>{label}</label>
              <input className="ms-input" type={type} value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} />
            </div>
          ))}
          <div style={{ display: "flex", gap: 16, marginTop: 4 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--ms-text2)", cursor: "pointer" }}>
              <input type="checkbox" checked={form.enabled} onChange={e => setForm(f => ({ ...f, enabled: e.target.checked }))} />
              Enabled
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--ms-text2)", cursor: "pointer" }}>
              <input type="checkbox" checked={form.isActive} onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))} />
              Set as active provider
            </label>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 18, justifyContent: "flex-end" }}>
          <button className="ms-btn" onClick={onClose}>Cancel</button>
          <button className="ms-btn ms-btn-pri" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main View ────────────────────────────────────────────
export function ModernAiConfigView({ initialPrompt, initialScope }) {
  const [aiProviders, setAiProviders] = useState([]);
  const [telephonyProviders, setTelephonyProviders] = useState([]);
  const [promptText, setPromptText] = useState(initialPrompt?.prompt || "");
  const [saving, setSaving] = useState(false);
  const [editingAi, setEditingAi] = useState(null);
  const [editingTel, setEditingTel] = useState(null);

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
        body: JSON.stringify({ key: initialScope?.key, prompt: promptText }),
      });
      if (res.ok) toast.success("System prompt saved");
      else toast.error("Failed to save prompt");
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
          <span style={{ fontSize: 12, color: "var(--ms-text3)" }}>
            Active provider is used for all AI calls. Fallback: DB → env var (Gemini → Groq → Claude → OpenAI)
          </span>
        </div>
        <div className="ms-tbl-wrap">
          <table className="ms-tbl">
            <thead>
              <tr><th>Name</th><th>Type</th><th>Model</th><th>Priority</th><th>Timeout</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {aiProviders.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: "center", color: "var(--ms-text3)", padding: 20 }}>
                  No AI providers in database. Using env var fallback (check server logs for active provider).
                </td></tr>
              )}
              {aiProviders.map((p) => {
                const typeStyle = AI_TYPE_STYLE[p.type] || { bg: "var(--ms-bg3)", color: "var(--ms-text3)" };
                return (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 500 }}>{p.name || p.type}</td>
                    <td><span className="ms-bdg" style={{ background: typeStyle.bg, color: typeStyle.color }}>{p.type}</span></td>
                    <td className="ms-mono">{p.model || "—"}</td>
                    <td>{p.priority ?? "—"}</td>
                    <td className="ms-mono" style={{ color: "var(--ms-text3)" }}>{p.timeoutMs ? `${p.timeoutMs.toLocaleString()} ms` : "—"}</td>
                    <td>
                      <span className="ms-bdg" style={{
                        background: p.status === "ACTIVE" ? "var(--ms-accent-dim)" : p.status === "DISABLED" ? "rgba(242,88,88,.12)" : "var(--ms-bg3)",
                        color: p.status === "ACTIVE" ? "var(--ms-accent-txt)" : p.status === "DISABLED" ? "#fca5a5" : "var(--ms-text3)",
                      }}>
                        {p.status ?? "STANDBY"}
                      </span>
                    </td>
                    <td>
                      <button className="ms-btn" style={{ fontSize: 11, padding: "3px 8px" }} onClick={() => setEditingAi(p)}>
                        Edit
                      </button>
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
              <tr><th>Name</th><th>Type</th><th>Enabled</th><th>Active</th><th></th></tr>
            </thead>
            <tbody>
              {telephonyProviders.length === 0 && (
                <tr><td colSpan={5} style={{ textAlign: "center", color: "var(--ms-text3)", padding: 20 }}>
                  No telephony providers configured. Add providers via API or check seed data.
                </td></tr>
              )}
              {telephonyProviders.map((p) => {
                const typeStyle = TEL_TYPE_STYLE[p.type] || { bg: "var(--ms-bg3)", color: "var(--ms-text3)" };
                return (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 500 }}>{p.name || p.type}</td>
                    <td><span className="ms-bdg" style={{ background: typeStyle.bg, color: typeStyle.color }}>{p.type}</span></td>
                    <td>
                      <span className="ms-bdg" style={{
                        background: p.enabled !== false ? "rgba(34,201,147,.12)" : "var(--ms-bg3)",
                        color: p.enabled !== false ? "#22c993" : "var(--ms-text3)",
                      }}>
                        {p.enabled !== false ? "Yes" : "No"}
                      </span>
                    </td>
                    <td>
                      <span className="ms-bdg" style={{
                        background: p.isActive ? "var(--ms-accent-dim)" : "var(--ms-bg3)",
                        color: p.isActive ? "var(--ms-accent-txt)" : "var(--ms-text3)",
                      }}>
                        {p.isActive ? "Active" : "Standby"}
                      </span>
                    </td>
                    <td>
                      <button className="ms-btn" style={{ fontSize: 11, padding: "3px 8px" }} onClick={() => setEditingTel(p)}>
                        Edit
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* TTS / STT Providers */}
      <div className="ms-card">
        <div className="ms-card-hd">
          <span className="ms-card-title">TTS / STT providers</span>
          <span style={{ fontSize: 12, color: "var(--ms-text3)" }}>Text-to-Speech and Speech-to-Text engines used by the AI voice simulator</span>
        </div>
        <div className="ms-tbl-wrap">
          <table className="ms-tbl">
            <thead>
              <tr><th>Name</th><th>Type</th><th>Status</th><th>Notes</th></tr>
            </thead>
            <tbody>
              {[...TTS_PROVIDERS, ...STT_PROVIDERS].map((p) => (
                <tr key={p.id}>
                  <td style={{ fontWeight: 500 }}>{p.name}</td>
                  <td>
                    <span className="ms-bdg" style={{
                      background: p.type === "TTS" ? "rgba(167,139,250,.15)" : "rgba(79,156,249,.15)",
                      color: p.type === "TTS" ? "#a78bfa" : "#4f9cf9",
                    }}>{p.type}</span>
                  </td>
                  <td>
                    <span className="ms-bdg" style={{
                      background: p.status === "Configured" ? "var(--ms-accent-dim)" : "var(--ms-bg3)",
                      color: p.status === "Configured" ? "var(--ms-accent-txt)" : "var(--ms-text3)",
                    }}>{p.status}</span>
                  </td>
                  <td style={{ fontSize: 12, color: "var(--ms-text3)" }}>{p.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ padding: "10px 20px 16px", fontSize: 12, color: "var(--ms-text3)" }}>
          TTS/STT configuration is managed via environment variables (GOOGLE_AI_API_KEY). Full provider management coming soon.
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

      {/* Edit Modals */}
      {editingAi && (
        <ProviderEditModal
          provider={editingAi}
          onClose={() => setEditingAi(null)}
          onSave={fetchProviders}
        />
      )}
      {editingTel && (
        <TelephonyEditModal
          provider={editingTel}
          onClose={() => setEditingTel(null)}
          onSave={fetchProviders}
        />
      )}
    </div>
  );
}
