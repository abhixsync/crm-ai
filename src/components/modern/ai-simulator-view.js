"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  getRecognitionRestartDelayMs,
  getVoiceRetryNotice,
  isMeaningfulVoiceTranscript,
} from "@/modules/loan-assistant/voice-session-utils";

const EMPLOYMENT_TYPES = [
  { value: "", label: "Not specified" },
  { value: "salaried", label: "Salaried" },
  { value: "business", label: "Business Owner" },
  { value: "self_employed", label: "Self Employed" },
];

const LANGUAGES = [
  { value: "hi-IN", label: "Hindi" },
  { value: "en-IN", label: "Hinglish / English" },
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

const FEMALE_HINT = /female|woman|girl|zira|heera|aditi|priya|neerja|swara|lekha|ananya/i;
const INDIAN_HINT = /india|hindi|\\bin\\b/i;

// ─── Voice Helpers ──────────────────────────────────────

function pickBestVoice(speechLang) {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;

  const normalizedLang = (speechLang || "en-IN").toLowerCase();
  const baseLang = normalizedLang.split("-")[0];
  let best = null;
  let bestScore = -1;

  for (const v of voices) {
    const vLang = (v.lang || "").toLowerCase();
    const vBase = vLang.split("-")[0];
    const label = `${v.name || ""} ${v.voiceURI || ""}`.toLowerCase();
    let score = 0;
    if (vLang === normalizedLang) score += 90;
    else if (vBase === baseLang) score += 65;
    if (vLang.endsWith("-in") || INDIAN_HINT.test(`${vLang} ${label}`)) score += 55;
    if (FEMALE_HINT.test(label)) score += 35;
    if (v.localService) score += 3;
    if (v.default) score += 2;
    if (score > bestScore) { bestScore = score; best = v; }
  }
  return best;
}

// ─── Sub-components ─────────────────────────────────────

function SlotIndicator({ label, value }) {
  const filled = value != null && value !== "";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ width: 10, height: 10, borderRadius: "50%", background: filled ? "var(--ms-accent)" : "var(--ms-border)", flexShrink: 0 }} />
      <span style={{ fontSize: 12, color: "var(--ms-text2)" }}>{label}:</span>
      <span style={{ fontSize: 12, color: "var(--ms-text)", fontWeight: filled ? 600 : 400 }}>{filled ? String(value) : "—"}</span>
    </div>
  );
}

function ChatBubble({ role, text }) {
  const isAgent = role === "agent";
  return (
    <div style={{ display: "flex", justifyContent: isAgent ? "flex-start" : "flex-end", marginBottom: 8 }}>
      <div style={{
        maxWidth: "75%", padding: "10px 14px",
        borderRadius: isAgent ? "4px 16px 16px 16px" : "16px 4px 16px 16px",
        background: isAgent ? "var(--ms-surface)" : "var(--ms-accent)",
        color: isAgent ? "var(--ms-text)" : "#000",
        fontSize: 14, lineHeight: 1.5,
        border: isAgent ? "1px solid var(--ms-border)" : "none",
      }}>
        <div style={{ fontSize: 10, fontWeight: 600, marginBottom: 2, opacity: 0.7 }}>
          {isAgent ? "AI Agent" : "Customer (You)"}
        </div>
        {text}
      </div>
    </div>
  );
}

function MicIndicator({ isListening, isSpeaking }) {
  const color = isSpeaking ? "#8b5cf6" : isListening ? "#f25858" : "var(--ms-text3)";
  const label = isSpeaking ? "AI Speaking..." : isListening ? "Listening..." : "Idle";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color }}>
      <div style={{
        width: 8, height: 8, borderRadius: "50%", background: color,
        animation: (isListening || isSpeaking) ? "pulse 1.2s infinite" : "none",
      }} />
      {label}
      <style>{`@keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────

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
    firstName: "Anil", lastName: "Sharma", city: "Delhi",
    monthlyIncome: 50000, employmentType: "salaried",
  });

  // Voice state
  const [voiceMode, setVoiceMode] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceLang, setVoiceLang] = useState("hi-IN");

  const chatEndRef = useRef(null);
  const inputRef = useRef(null);
  const recognitionRef = useRef(null);
  const restartTimerRef = useRef(null);
  const silentCountRef = useRef(0);
  const isSpeakingRef = useRef(false);
  const sessionStateRef = useRef(null);
  const voiceModeRef = useRef(false);

  // Keep refs in sync
  useEffect(() => { sessionStateRef.current = sessionState; }, [sessionState]);
  useEffect(() => { voiceModeRef.current = voiceMode; }, [voiceMode]);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // Load voices
  useEffect(() => {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopListening();
      if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel();
    };
  }, []);

  // ─── Voice Functions ──────────────────────────────────

  function stopListening() {
    if (restartTimerRef.current) { clearTimeout(restartTimerRef.current); restartTimerRef.current = null; }
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch {}
      recognitionRef.current = null;
    }
    setIsListening(false);
  }

  function speakText(text) {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = voiceLang;
    utterance.rate = 0.95;
    utterance.pitch = 1.0;

    const voice = pickBestVoice(voiceLang);
    if (voice) { utterance.voice = voice; utterance.lang = voice.lang || voiceLang; }

    isSpeakingRef.current = true;
    setIsSpeaking(true);
    stopListening();

    utterance.onend = () => {
      isSpeakingRef.current = false;
      setIsSpeaking(false);
      // Auto-start listening after AI finishes speaking
      if (voiceModeRef.current && sessionStateRef.current && !metadata?.shouldEnd) {
        setTimeout(() => startListening(), 800);
      }
    };
    utterance.onerror = () => {
      isSpeakingRef.current = false;
      setIsSpeaking(false);
    };

    window.speechSynthesis.speak(utterance);
  }

  const startListening = useCallback(() => {
    if (typeof window === "undefined") return;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError("Speech recognition not supported. Use Chrome or Edge.");
      return;
    }
    if (recognitionRef.current || isSpeakingRef.current) return;

    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = voiceLang;

    let gotTranscript = false;

    recognition.onstart = () => setIsListening(true);

    recognition.onresult = (event) => {
      const transcript = Array.from(event.results).map((r) => r[0].transcript).join("");
      if (isMeaningfulVoiceTranscript(transcript)) {
        gotTranscript = true;
        silentCountRef.current = 0;
        sendVoiceMessage(transcript);
      }
    };

    recognition.onerror = (event) => {
      if (event.error !== "aborted" && event.error !== "no-speech") {
        console.warn("[voice] Recognition error:", event.error);
      }
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
      if (recognitionRef.current === recognition) recognitionRef.current = null;
      if (isSpeakingRef.current || gotTranscript) return;

      // Auto-restart on silence
      if (voiceModeRef.current && sessionStateRef.current) {
        silentCountRef.current += 1;
        const delay = getRecognitionRestartDelayMs(silentCountRef.current);
        const notice = getVoiceRetryNotice(silentCountRef.current);
        if (notice) setError(notice);
        restartTimerRef.current = setTimeout(() => startListening(), delay);
      }
    };

    try { recognition.start(); } catch { setIsListening(false); }
  }, [voiceLang]);

  // ─── Message Sending ──────────────────────────────────

  async function sendVoiceMessage(text) {
    if (!text || loading) return;
    setMessages((prev) => [...prev, { role: "customer", text }]);
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/ai-simulator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, sessionState: sessionStateRef.current, customerProfile: profile }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "AI processing failed"); return; }
      setMessages((prev) => [...prev, { role: "agent", text: data.reply }]);
      setSessionState(data.sessionState);
      setMetadata(data.metadata);
      // Speak the reply in voice mode
      if (voiceModeRef.current) speakText(data.reply);
    } catch { setError("Network error"); }
    finally { setLoading(false); }
  }

  async function startConversation() {
    setLoading(true);
    setError("");
    setSummary(null);
    try {
      const res = await fetch("/api/ai-simulator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: null, sessionState: { turn: 0 }, customerProfile: profile }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Failed to start conversation"); return; }
      setMessages([{ role: "agent", text: data.reply }]);
      setSessionState(data.sessionState);
      setMetadata(data.metadata);
      // In voice mode, speak the opening greeting
      if (voiceMode) speakText(data.reply);
    } catch { setError("Network error"); }
    finally { setLoading(false); inputRef.current?.focus(); }
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
        body: JSON.stringify({ message: text, sessionState, customerProfile: profile }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "AI processing failed"); return; }
      setMessages((prev) => [...prev, { role: "agent", text: data.reply }]);
      setSessionState(data.sessionState);
      setMetadata(data.metadata);
      if (voiceMode) speakText(data.reply);
    } catch { setError("Network error"); }
    finally { setLoading(false); inputRef.current?.focus(); }
  }

  async function generateSummary() {
    if (!sessionState?.transcript) return;
    setLoading(true);
    try {
      const res = await fetch("/api/ai-simulator/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: sessionState.transcript, extractedData: sessionState.extractedData, customerProfile: profile }),
      });
      const data = await res.json();
      if (res.ok) setSummary(data);
    } catch { setError("Failed to generate summary"); }
    finally { setLoading(false); }
  }

  function resetConversation() {
    stopListening();
    if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel();
    setMessages([]); setSessionState(null); setMetadata(null);
    setSummary(null); setError(""); setIsSpeaking(false);
    silentCountRef.current = 0;
  }

  function toggleVoiceMode() {
    if (voiceMode) {
      stopListening();
      if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
    setVoiceMode(!voiceMode);
  }

  const conversationStarted = messages.length > 0;
  const extracted = sessionState?.extractedData || {};

  return (
    <div style={{ display: "flex", gap: 20, minHeight: "calc(100vh - 200px)" }}>
      {/* Main chat area */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Customer profile (collapsible) */}
        <div className="ms-card">
          <div className="ms-card-hd" style={{ cursor: "pointer" }} onClick={() => setShowProfile(!showProfile)}>
            <span className="ms-card-title">Customer Profile {showProfile ? "▾" : "▸"}</span>
          </div>
          {showProfile && (
            <div style={{ padding: "0 20px 16px", display: "flex", flexWrap: "wrap", gap: 12 }}>
              <div style={{ flex: "1 1 140px" }}>
                <label className="ms-field-label">First Name</label>
                <input className="ms-input" value={profile.firstName} onChange={(e) => setProfile({ ...profile, firstName: e.target.value })} disabled={conversationStarted} />
              </div>
              <div style={{ flex: "1 1 140px" }}>
                <label className="ms-field-label">Last Name</label>
                <input className="ms-input" value={profile.lastName} onChange={(e) => setProfile({ ...profile, lastName: e.target.value })} disabled={conversationStarted} />
              </div>
              <div style={{ flex: "1 1 120px" }}>
                <label className="ms-field-label">City</label>
                <input className="ms-input" value={profile.city} onChange={(e) => setProfile({ ...profile, city: e.target.value })} disabled={conversationStarted} />
              </div>
              <div style={{ flex: "1 1 140px" }}>
                <label className="ms-field-label">Monthly Income</label>
                <input className="ms-input" type="number" value={profile.monthlyIncome} onChange={(e) => setProfile({ ...profile, monthlyIncome: Number(e.target.value) })} disabled={conversationStarted} />
              </div>
              <div style={{ flex: "1 1 160px" }}>
                <label className="ms-field-label">Employment Type</label>
                <select className="ms-input" value={profile.employmentType} onChange={(e) => setProfile({ ...profile, employmentType: e.target.value })} disabled={conversationStarted}>
                  {EMPLOYMENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Chat area */}
        <div className="ms-card" style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 400 }}>
          <div className="ms-card-hd">
            <span className="ms-card-title">Conversation</span>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {voiceMode && <MicIndicator isListening={isListening} isSpeaking={isSpeaking} />}
              {conversationStarted && (
                <>
                  <button className="ms-btn" onClick={generateSummary} disabled={loading || !sessionState?.transcript} style={{ fontSize: 12 }}>Summary</button>
                  <button className="ms-btn" onClick={resetConversation} style={{ fontSize: 12 }}>Reset</button>
                </>
              )}
            </div>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column" }}>
            {!conversationStarted ? (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, color: "var(--ms-text3)" }}>
                <div style={{ fontSize: 40 }}>&#128172;</div>
                <div style={{ fontSize: 14 }}>Configure customer profile, then start a conversation</div>
                <button className="ms-btn-primary" onClick={startConversation} disabled={loading} style={{ padding: "10px 24px" }}>
                  {loading ? "Starting..." : "Start Conversation"}
                </button>
              </div>
            ) : (
              <>
                {messages.map((msg, i) => <ChatBubble key={i} role={msg.role} text={msg.text} />)}
                {loading && <div style={{ color: "var(--ms-text3)", fontSize: 13, padding: "8px 0" }}>AI is thinking...</div>}
                <div ref={chatEndRef} />
              </>
            )}
          </div>

          {/* Input bar with voice toggle */}
          {conversationStarted && (
            <div style={{ padding: "12px 20px", borderTop: "1px solid var(--ms-border)", display: "flex", flexDirection: "column", gap: 8 }}>
              {/* Voice controls row */}
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button
                  className={voiceMode ? "ms-btn-primary" : "ms-btn"}
                  onClick={toggleVoiceMode}
                  style={{ fontSize: 12, padding: "4px 10px" }}
                  title={voiceMode ? "Disable voice mode" : "Enable voice mode"}
                >
                  {voiceMode ? "Voice ON" : "Voice OFF"}
                </button>
                {voiceMode && (
                  <>
                    <select
                      className="ms-input"
                      value={voiceLang}
                      onChange={(e) => setVoiceLang(e.target.value)}
                      style={{ width: 140, fontSize: 12, padding: "4px 8px" }}
                    >
                      {LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                    </select>
                    {!isListening && !isSpeaking && !loading && (
                      <button className="ms-btn" onClick={startListening} style={{ fontSize: 12, padding: "4px 10px" }}>
                        Start Mic
                      </button>
                    )}
                    {isListening && (
                      <button className="ms-btn" onClick={stopListening} style={{ fontSize: 12, padding: "4px 10px", color: "#f25858" }}>
                        Stop Mic
                      </button>
                    )}
                  </>
                )}
              </div>
              {/* Text input */}
              <form onSubmit={sendMessage} style={{ display: "flex", gap: 8 }}>
                <input
                  ref={inputRef}
                  className="ms-input"
                  placeholder={voiceMode ? "Or type here..." : "Type as customer... (Hindi, Hinglish, or English)"}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  disabled={loading || metadata?.shouldEnd}
                  style={{ flex: 1 }}
                />
                <button className="ms-btn-primary" type="submit" disabled={loading || !input.trim() || metadata?.shouldEnd}>
                  Send
                </button>
              </form>
            </div>
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
        <div className="ms-card">
          <div className="ms-card-hd"><span className="ms-card-title">Call State</span></div>
          <div style={{ padding: "0 16px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
              <span style={{ color: "var(--ms-text2)" }}>Turn</span>
              <span style={{ fontWeight: 600, color: "var(--ms-text)" }}>{sessionState?.turn || 0}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13 }}>
              <span style={{ color: "var(--ms-text2)" }}>Stage</span>
              <span style={{ padding: "2px 10px", borderRadius: 12, fontSize: 11, fontWeight: 600, background: STAGE_COLORS[sessionState?.stage] || "#6b7280", color: "#fff", textTransform: "capitalize" }}>
                {sessionState?.stage || "—"}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13 }}>
              <span style={{ color: "var(--ms-text2)" }}>Should End</span>
              <span style={{ fontWeight: 600, color: metadata?.shouldEnd ? "#f25858" : "var(--ms-text)" }}>{metadata?.shouldEnd ? "Yes" : "No"}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13 }}>
              <span style={{ color: "var(--ms-text2)" }}>Voice</span>
              <span style={{ fontWeight: 600, color: voiceMode ? "var(--ms-accent)" : "var(--ms-text3)" }}>{voiceMode ? "Enabled" : "Off"}</span>
            </div>
          </div>
        </div>

        <div className="ms-card">
          <div className="ms-card-hd"><span className="ms-card-title">Intent</span></div>
          <div style={{ padding: "0 16px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
            {metadata?.intent ? (
              <>
                <span style={{ padding: "4px 12px", borderRadius: 12, fontSize: 12, fontWeight: 600, background: INTENT_COLORS[metadata.intent] || "#94a3b8", color: "#fff", textAlign: "center" }}>
                  {metadata.intent.replace(/_/g, " ").toUpperCase()}
                </span>
                {metadata.confidence != null && (
                  <div style={{ fontSize: 12, color: "var(--ms-text2)", textAlign: "center" }}>Confidence: {(metadata.confidence * 100).toFixed(0)}%</div>
                )}
              </>
            ) : <span style={{ fontSize: 12, color: "var(--ms-text3)" }}>No intent yet</span>}
          </div>
        </div>

        <div className="ms-card">
          <div className="ms-card-hd"><span className="ms-card-title">Extracted Data</span></div>
          <div style={{ padding: "0 16px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
            <SlotIndicator label="Loan Type" value={extracted.loanType} />
            <SlotIndicator label="Amount" value={extracted.amount} />
            <SlotIndicator label="Timeline" value={extracted.timeline} />
            <SlotIndicator label="Employment" value={extracted.employmentType} />
            <SlotIndicator label="Monthly Income" value={extracted.monthlyIncome} />
          </div>
        </div>

        <div className="ms-card">
          <div className="ms-card-hd"><span className="ms-card-title">AI Provider</span></div>
          <div style={{ padding: "0 16px 16px", fontSize: 12, color: "var(--ms-text2)" }}>
            {metadata?.provider ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div><strong>Provider:</strong> {metadata.provider}</div>
                <div><strong>Model:</strong> {metadata.model || "default"}</div>
              </div>
            ) : <span>Not started</span>}
          </div>
        </div>

        {summary && (
          <div className="ms-card">
            <div className="ms-card-hd"><span className="ms-card-title">Call Summary</span></div>
            <div style={{ padding: "0 16px 16px", fontSize: 12, display: "flex", flexDirection: "column", gap: 8 }}>
              <div><strong style={{ color: "var(--ms-text2)" }}>Summary:</strong><div style={{ color: "var(--ms-text)", marginTop: 2 }}>{summary.summary}</div></div>
              <div><strong style={{ color: "var(--ms-text2)" }}>Intent:</strong> <span style={{ color: "var(--ms-text)" }}>{summary.intent}</span></div>
              <div><strong style={{ color: "var(--ms-text2)" }}>Next Action:</strong><div style={{ color: "var(--ms-text)", marginTop: 2 }}>{summary.nextAction}</div></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
