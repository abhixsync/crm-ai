"use client";

import { useState, useRef, useEffect } from "react";

const EMPLOYMENT_TYPES = [
  { value: "", label: "Not specified" },
  { value: "salaried", label: "Salaried" },
  { value: "business", label: "Business Owner" },
  { value: "self_employed", label: "Self Employed" },
];

const STAGE_COLORS = {
  opening: "#6b7280",
  discovery: "#3b82f6",
  pitch: "#f59e0b",
  qualification: "#8b5cf6",
  closing: "#22c55e",
};

const INTENT_COLORS = {
  interested: "#22c993",
  not_interested: "#f25858",
  call_back_later: "#f5a623",
  do_not_call: "#6b7280",
  confused: "#f59e0b",
  converted: "#10b981",
  neutral: "#94a3b8",
};

function SlotIndicator({ label, value }) {
  const filled = value != null && value !== "";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div
        style={{
          width: 10,
          height: 10,
          borderRadius: "50%",
          background: filled ? "var(--ms-accent)" : "var(--ms-border)",
          flexShrink: 0,
        }}
      />
      <span style={{ fontSize: 12, color: "var(--ms-text2)" }}>{label}:</span>
      <span style={{ fontSize: 12, color: "var(--ms-text)", fontWeight: filled ? 600 : 400 }}>
        {filled ? String(value) : "—"}
      </span>
    </div>
  );
}

function ChatBubble({ role, text }) {
  const isAgent = role === "agent";
  return (
    <div
      style={{
        display: "flex",
        justifyContent: isAgent ? "flex-start" : "flex-end",
        marginBottom: 8,
      }}
    >
      <div
        style={{
          maxWidth: "75%",
          padding: "10px 14px",
          borderRadius: isAgent ? "4px 16px 16px 16px" : "16px 4px 16px 16px",
          background: isAgent ? "var(--ms-surface)" : "var(--ms-accent)",
          color: isAgent ? "var(--ms-text)" : "#000",
          fontSize: 14,
          lineHeight: 1.5,
          border: isAgent ? "1px solid var(--ms-border)" : "none",
        }}
      >
        <div style={{ fontSize: 10, fontWeight: 600, marginBottom: 2, opacity: 0.7 }}>
          {isAgent ? "AI Agent" : "Customer (You)"}
        </div>
        {text}
      </div>
    </div>
  );
}

export function ModernAiSimulatorView({ user }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionState, setSessionState] = useState(null);
  const [metadata, setMetadata] = useState(null);
  const [summary, setSummary] = useState(null);
  const [showProfile, setShowProfile] = useState(true);
  const [error, setError] = useState("");
  const [profile, setProfile] = useState({
    firstName: "Anil",
    lastName: "Sharma",
    city: "Delhi",
    monthlyIncome: 50000,
    employmentType: "salaried",
  });

  const chatEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function startConversation() {
    setLoading(true);
    setError("");
    setSummary(null);
    try {
      const res = await fetch("/api/ai-simulator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: null,
          sessionState: { turn: 0 },
          customerProfile: profile,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to start conversation");
        return;
      }
      setMessages([{ role: "agent", text: data.reply }]);
      setSessionState(data.sessionState);
      setMetadata(data.metadata);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  async function sendMessage(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "customer", text }]);
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/ai-simulator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          sessionState,
          customerProfile: profile,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "AI processing failed");
        return;
      }
      setMessages((prev) => [...prev, { role: "agent", text: data.reply }]);
      setSessionState(data.sessionState);
      setMetadata(data.metadata);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  async function generateSummary() {
    if (!sessionState?.transcript) return;
    setLoading(true);
    try {
      const res = await fetch("/api/ai-simulator/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: sessionState.transcript,
          extractedData: sessionState.extractedData,
          customerProfile: profile,
        }),
      });
      const data = await res.json();
      if (res.ok) setSummary(data);
    } catch {
      setError("Failed to generate summary");
    } finally {
      setLoading(false);
    }
  }

  function resetConversation() {
    setMessages([]);
    setSessionState(null);
    setMetadata(null);
    setSummary(null);
    setError("");
  }

  const conversationStarted = messages.length > 0;
  const extracted = sessionState?.extractedData || {};

  return (
    <div style={{ display: "flex", gap: 20, minHeight: "calc(100vh - 200px)" }}>
      {/* Main chat area */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Customer profile (collapsible) */}
        <div className="ms-card">
          <div
            className="ms-card-hd"
            style={{ cursor: "pointer" }}
            onClick={() => setShowProfile(!showProfile)}
          >
            <span className="ms-card-title">
              Customer Profile {showProfile ? "▾" : "▸"}
            </span>
          </div>
          {showProfile && (
            <div style={{ padding: "0 20px 16px", display: "flex", flexWrap: "wrap", gap: 12 }}>
              <div style={{ flex: "1 1 140px" }}>
                <label className="ms-field-label">First Name</label>
                <input
                  className="ms-input"
                  value={profile.firstName}
                  onChange={(e) => setProfile({ ...profile, firstName: e.target.value })}
                  disabled={conversationStarted}
                />
              </div>
              <div style={{ flex: "1 1 140px" }}>
                <label className="ms-field-label">Last Name</label>
                <input
                  className="ms-input"
                  value={profile.lastName}
                  onChange={(e) => setProfile({ ...profile, lastName: e.target.value })}
                  disabled={conversationStarted}
                />
              </div>
              <div style={{ flex: "1 1 120px" }}>
                <label className="ms-field-label">City</label>
                <input
                  className="ms-input"
                  value={profile.city}
                  onChange={(e) => setProfile({ ...profile, city: e.target.value })}
                  disabled={conversationStarted}
                />
              </div>
              <div style={{ flex: "1 1 140px" }}>
                <label className="ms-field-label">Monthly Income</label>
                <input
                  className="ms-input"
                  type="number"
                  value={profile.monthlyIncome}
                  onChange={(e) => setProfile({ ...profile, monthlyIncome: Number(e.target.value) })}
                  disabled={conversationStarted}
                />
              </div>
              <div style={{ flex: "1 1 160px" }}>
                <label className="ms-field-label">Employment Type</label>
                <select
                  className="ms-input"
                  value={profile.employmentType}
                  onChange={(e) => setProfile({ ...profile, employmentType: e.target.value })}
                  disabled={conversationStarted}
                >
                  {EMPLOYMENT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Chat area */}
        <div
          className="ms-card"
          style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 400 }}
        >
          <div className="ms-card-hd">
            <span className="ms-card-title">Conversation</span>
            <div style={{ display: "flex", gap: 8 }}>
              {conversationStarted && (
                <>
                  <button
                    className="ms-btn"
                    onClick={generateSummary}
                    disabled={loading || !sessionState?.transcript}
                    style={{ fontSize: 12 }}
                  >
                    Generate Summary
                  </button>
                  <button className="ms-btn" onClick={resetConversation} style={{ fontSize: 12 }}>
                    New Conversation
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Messages */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "16px 20px",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {!conversationStarted ? (
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 16,
                  color: "var(--ms-text3)",
                }}
              >
                <div style={{ fontSize: 40 }}>&#128172;</div>
                <div style={{ fontSize: 14 }}>
                  Configure the customer profile above, then start a conversation
                </div>
                <button
                  className="ms-btn-primary"
                  onClick={startConversation}
                  disabled={loading}
                  style={{ padding: "10px 24px" }}
                >
                  {loading ? "Starting..." : "Start Conversation"}
                </button>
              </div>
            ) : (
              <>
                {messages.map((msg, i) => (
                  <ChatBubble key={i} role={msg.role} text={msg.text} />
                ))}
                {loading && (
                  <div style={{ color: "var(--ms-text3)", fontSize: 13, padding: "8px 0" }}>
                    AI is thinking...
                  </div>
                )}
                <div ref={chatEndRef} />
              </>
            )}
          </div>

          {/* Input */}
          {conversationStarted && (
            <form
              onSubmit={sendMessage}
              style={{
                padding: "12px 20px",
                borderTop: "1px solid var(--ms-border)",
                display: "flex",
                gap: 8,
              }}
            >
              <input
                ref={inputRef}
                className="ms-input"
                placeholder="Type as customer... (Hindi, Hinglish, or English)"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={loading || metadata?.shouldEnd}
                style={{ flex: 1 }}
              />
              <button
                className="ms-btn-primary"
                type="submit"
                disabled={loading || !input.trim() || metadata?.shouldEnd}
              >
                Send
              </button>
            </form>
          )}
        </div>

        {error && (
          <div style={{ padding: "10px 16px", background: "#fef2f2", color: "#b91c1c", borderRadius: 8, fontSize: 13 }}>
            {error}
          </div>
        )}
      </div>

      {/* Debug sidebar */}
      <div style={{ width: 280, flexShrink: 0, display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Turn & Stage */}
        <div className="ms-card">
          <div className="ms-card-hd">
            <span className="ms-card-title">Call State</span>
          </div>
          <div style={{ padding: "0 16px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
              <span style={{ color: "var(--ms-text2)" }}>Turn</span>
              <span style={{ fontWeight: 600, color: "var(--ms-text)" }}>
                {sessionState?.turn || 0}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13 }}>
              <span style={{ color: "var(--ms-text2)" }}>Stage</span>
              <span
                style={{
                  padding: "2px 10px",
                  borderRadius: 12,
                  fontSize: 11,
                  fontWeight: 600,
                  background: STAGE_COLORS[sessionState?.stage] || "#6b7280",
                  color: "#fff",
                  textTransform: "capitalize",
                }}
              >
                {sessionState?.stage || "—"}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13 }}>
              <span style={{ color: "var(--ms-text2)" }}>Should End</span>
              <span style={{ fontWeight: 600, color: metadata?.shouldEnd ? "#f25858" : "var(--ms-text)" }}>
                {metadata?.shouldEnd ? "Yes" : "No"}
              </span>
            </div>
          </div>
        </div>

        {/* Intent */}
        <div className="ms-card">
          <div className="ms-card-hd">
            <span className="ms-card-title">Intent</span>
          </div>
          <div style={{ padding: "0 16px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
            {metadata?.intent ? (
              <>
                <span
                  style={{
                    padding: "4px 12px",
                    borderRadius: 12,
                    fontSize: 12,
                    fontWeight: 600,
                    background: INTENT_COLORS[metadata.intent] || "#94a3b8",
                    color: "#fff",
                    textAlign: "center",
                  }}
                >
                  {metadata.intent.replace(/_/g, " ").toUpperCase()}
                </span>
                {metadata.confidence != null && (
                  <div style={{ fontSize: 12, color: "var(--ms-text2)", textAlign: "center" }}>
                    Confidence: {(metadata.confidence * 100).toFixed(0)}%
                  </div>
                )}
              </>
            ) : (
              <span style={{ fontSize: 12, color: "var(--ms-text3)" }}>No intent yet</span>
            )}
          </div>
        </div>

        {/* Extracted Data Slots */}
        <div className="ms-card">
          <div className="ms-card-hd">
            <span className="ms-card-title">Extracted Data</span>
          </div>
          <div style={{ padding: "0 16px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
            <SlotIndicator label="Loan Type" value={extracted.loanType} />
            <SlotIndicator label="Amount" value={extracted.amount} />
            <SlotIndicator label="Timeline" value={extracted.timeline} />
            <SlotIndicator label="Employment" value={extracted.employmentType} />
            <SlotIndicator label="Monthly Income" value={extracted.monthlyIncome} />
          </div>
        </div>

        {/* Provider Info */}
        <div className="ms-card">
          <div className="ms-card-hd">
            <span className="ms-card-title">AI Provider</span>
          </div>
          <div style={{ padding: "0 16px 16px", fontSize: 12, color: "var(--ms-text2)" }}>
            {metadata?.provider ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div><strong>Provider:</strong> {metadata.provider}</div>
                <div><strong>Model:</strong> {metadata.model || "default"}</div>
              </div>
            ) : (
              <span>Not started</span>
            )}
          </div>
        </div>

        {/* Summary */}
        {summary && (
          <div className="ms-card">
            <div className="ms-card-hd">
              <span className="ms-card-title">Call Summary</span>
            </div>
            <div style={{ padding: "0 16px 16px", fontSize: 12, display: "flex", flexDirection: "column", gap: 8 }}>
              <div>
                <strong style={{ color: "var(--ms-text2)" }}>Summary:</strong>
                <div style={{ color: "var(--ms-text)", marginTop: 2 }}>{summary.summary}</div>
              </div>
              <div>
                <strong style={{ color: "var(--ms-text2)" }}>Intent:</strong>{" "}
                <span style={{ color: "var(--ms-text)" }}>{summary.intent}</span>
              </div>
              <div>
                <strong style={{ color: "var(--ms-text2)" }}>Next Action:</strong>
                <div style={{ color: "var(--ms-text)", marginTop: 2 }}>{summary.nextAction}</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
