"use client";

import { useState } from "react";

const DEMO_SCRIPTS = [
  { id: "new_lead", label: "New lead introduction" },
  { id: "follow_up", label: "Follow-up call" },
  { id: "conversion", label: "Conversion pitch" },
];

const PROVIDERS = [
  { id: "TWILIO", label: "Twilio", cost: "~₹1.50/min" },
  { id: "PLIVO", label: "Plivo", cost: "~₹0.40/min" },
  { id: "EXOTEL", label: "Exotel", cost: "~₹0.50/min" },
  { id: "VONAGE", label: "Vonage", cost: "~₹0.80/min" },
];

export function ModernAiCallDemoView({ user }) {
  const [phone, setPhone] = useState("");
  const [script, setScript] = useState("new_lead");
  const [provider, setProvider] = useState("TWILIO");
  const [calling, setCalling] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [previewing, setPreviewing] = useState(false);

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
        body: JSON.stringify({ phone, scriptType: script, preferredProvider: provider }),
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

  function previewVoice() {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      setError("Browser speech synthesis not available.");
      return;
    }
    setPreviewing(true);
    window.speechSynthesis.cancel();

    const sample = "Namaste, main aapko loan ke baare mein baat karne ke liye call kar rahi hoon. Kya aapko kisi loan mein interest hai?";
    const utterance = new SpeechSynthesisUtterance(sample);
    utterance.lang = "hi-IN";
    utterance.rate = 0.95;

    const voices = window.speechSynthesis.getVoices();
    const hindiVoice = voices.find((v) => v.lang.startsWith("hi")) || voices.find((v) => v.lang.includes("IN"));
    if (hindiVoice) utterance.voice = hindiVoice;

    utterance.onend = () => setPreviewing(false);
    utterance.onerror = () => setPreviewing(false);
    window.speechSynthesis.speak(utterance);
  }

  const selectedProvider = PROVIDERS.find((p) => p.id === provider);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Demo call form */}
      <div className="ms-card" style={{ maxWidth: 560 }}>
        <div className="ms-card-hd">
          <span className="ms-card-title">AI Call Demo</span>
        </div>
        <form onSubmit={triggerDemo} style={{ padding: "0 24px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 13, color: "var(--ms-text2)" }}>Phone number</label>
            <input
              className="ms-input"
              type="tel"
              placeholder="+91 98765 43210"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
            />
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontSize: 13, color: "var(--ms-text2)" }}>Demo script</label>
              <select className="ms-input" value={script} onChange={(e) => setScript(e.target.value)}>
                {DEMO_SCRIPTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontSize: 13, color: "var(--ms-text2)" }}>Telephony provider</label>
              <select className="ms-input" value={provider} onChange={(e) => setProvider(e.target.value)}>
                {PROVIDERS.map((p) => <option key={p.id} value={p.id}>{p.label} ({p.cost})</option>)}
              </select>
            </div>
          </div>

          {selectedProvider && (
            <div style={{ padding: "8px 12px", background: "var(--ms-bg2)", borderRadius: 6, fontSize: 12, color: "var(--ms-text2)" }}>
              Provider: <strong>{selectedProvider.label}</strong> &middot; Estimated cost: <strong>{selectedProvider.cost}</strong>
            </div>
          )}

          {error && (
            <div style={{ padding: "10px 14px", background: "rgba(242,88,88,.12)", color: "#f25858", borderRadius: 7, fontSize: 13 }}>
              {error}
            </div>
          )}
          {result && (
            <div style={{ padding: "10px 14px", background: "rgba(34,201,147,.12)", color: "#22c993", borderRadius: 7, fontSize: 13 }}>
              Demo call initiated! Call ID: {result.callId || result.id || "—"}
              {result.provider && <> via <strong>{result.provider}</strong></>}
            </div>
          )}

          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit" className="ms-btn ms-btn-pri" disabled={calling || !phone.trim()} style={{ flex: 1 }}>
              {calling ? "Connecting..." : "Start Demo Call"}
            </button>
            <button type="button" className="ms-btn" onClick={previewVoice} disabled={previewing}>
              {previewing ? "Playing..." : "Preview Voice"}
            </button>
          </div>
        </form>
      </div>

      {/* Info card */}
      <div className="ms-card" style={{ maxWidth: 560, padding: "16px 20px" }}>
        <div style={{ fontSize: 13, color: "var(--ms-text2)", lineHeight: 1.6 }}>
          <strong style={{ color: "var(--ms-text1)" }}>How demo calls work</strong>
          <ul style={{ marginTop: 8, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
            <li>The AI will call the provided phone number using the selected telephony provider.</li>
            <li>Choose a script to test different conversation flows.</li>
            <li>The call will appear in your Call Logs after completion.</li>
            <li>Demo calls count against your monthly AI call quota.</li>
            <li><strong>Preview Voice</strong> plays a sample greeting using your browser's speech engine (free, no call needed).</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
