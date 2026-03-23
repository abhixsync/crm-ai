"use client";

import { useState } from "react";

const DEMO_SCRIPTS = [
  { id: "new_lead", label: "New lead introduction" },
  { id: "follow_up", label: "Follow-up call" },
  { id: "conversion", label: "Conversion pitch" },
];

export function ModernAiCallDemoView({ user }) {
  const [phone, setPhone] = useState("");
  const [script, setScript] = useState("new_lead");
  const [calling, setCalling] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  async function triggerDemo(e) {
    e.preventDefault();
    if (!phone.trim()) return;
    setCalling(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/calls/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, scriptType: script }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Demo call failed");
      } else {
        setResult(data);
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setCalling(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Demo call form */}
      <div className="ms-card" style={{ maxWidth: 520 }}>
        <div className="ms-card-hd">
          <span className="ms-card-title">AI Call Demo</span>
        </div>
        <form onSubmit={triggerDemo} style={{ padding: "0 24px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 13, color: "var(--ms-text2)" }}>Phone number</label>
            <input
              className="ms-input"
              type="tel"
              placeholder="+1 555 000 0000"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 13, color: "var(--ms-text2)" }}>Demo script</label>
            <select
              className="ms-input"
              value={script}
              onChange={(e) => setScript(e.target.value)}
            >
              {DEMO_SCRIPTS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          {error && (
            <div
              style={{
                padding: "10px 14px",
                background: "rgba(242,88,88,.12)",
                color: "#f25858",
                borderRadius: 7,
                fontSize: 13,
              }}
            >
              {error}
            </div>
          )}
          {result && (
            <div
              style={{
                padding: "10px 14px",
                background: "rgba(34,201,147,.12)",
                color: "#22c993",
                borderRadius: 7,
                fontSize: 13,
              }}
            >
              Demo call initiated! Call ID: {result.callId || result.id || "—"}
            </div>
          )}
          <button
            type="submit"
            className="ms-btn ms-btn-primary"
            disabled={calling || !phone.trim()}
          >
            {calling ? "Connecting…" : "Start Demo Call"}
          </button>
        </form>
      </div>

      {/* Info card */}
      <div className="ms-card" style={{ maxWidth: 520, padding: "16px 20px" }}>
        <div style={{ fontSize: 13, color: "var(--ms-text2)", lineHeight: 1.6 }}>
          <strong style={{ color: "var(--ms-text1)" }}>How demo calls work</strong>
          <ul style={{ marginTop: 8, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
            <li>The AI will call the provided phone number using your configured telephony provider.</li>
            <li>Choose a script to test different conversation flows.</li>
            <li>The call will appear in your Call Logs after completion.</li>
            <li>Demo calls count against your monthly AI call quota.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
