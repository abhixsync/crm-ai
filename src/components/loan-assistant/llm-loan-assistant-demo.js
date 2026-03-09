"use client";

import { useState, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/**
 * LLM Loan Assistant Demo with Voice Support
 * Uses intelligent AI (ChatGPT/Claude-level) instead of keywords
 */
export function LLMLoanAssistantDemo() {
  const [profile, setProfile] = useState({
    name: "Rahul",
    city: "Delhi",
    monthly_income: 50000,
    employment_type: "salaried",
    credit_score: 720,
    existing_loans: "none",
    loan_interest_type: "personal_loan",
  });

  const [sessionId, setSessionId] = useState(null);
  const [conversation, setConversation] = useState([]);
  const [customerMessage, setCustomerMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [autoPlayVoice, setAutoPlayVoice] = useState(true);
  const recognitionRef = useRef(null);

  const getStatusText = () => {
    if (!sessionId) return "Idle";
    if (isSpeaking) return "AI talking…";
    if (isListening) return "Listening…";
    if (isLoading) return "Thinking…";
    return isVoiceMode ? "Waiting for you…" : "Chat active";
  };

  const canUseBrowserTTS =
    typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;

  const startVoiceRecognition = () => {
    if (typeof window === "undefined") return;
    if (!isVoiceMode || !sessionId) return;
    // Don't start listening while AI is speaking, to avoid AI hearing itself
    if (isSpeaking) {
      console.log("⏸️ Skipping recognition start because AI is speaking");
      return;
    }

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.warn("Speech Recognition not supported in this browser");
      setError(
        "Voice listening is not supported in this browser. Please use the latest Chrome or Edge for full voice demo."
      );
      return;
    }

    // Avoid multiple parallel recognitions
    if (recognitionRef.current && isListening) {
      return;
    }

    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;

    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "hi-IN"; // Hindi for Hinglish support

    recognition.onstart = () => {
      setIsListening(true);
      console.log("🎤 Listening...");
    };

    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0].transcript)
        .join("");

      console.log("📝 Transcript:", transcript);
      setCustomerMessage(transcript);

      // Automatically send the customer's speech as their message
      if (transcript.trim()) {
        sendMessageToServer(transcript);
      }
    };

    recognition.onerror = (event) => {
      // "aborted" is expected when we intentionally stop() during AI speech
      if (event.error === "aborted") {
        console.log("🎤 Recognition aborted (expected)");
      } else {
        console.error("Speech recognition error:", event.error);
        setError("Voice input failed: " + event.error);
      }
      setIsListening(false);
      console.log("🎤 Listening stopped (error)");
    };

    recognition.onend = () => {
      setIsListening(false);
      console.log("🎤 Listening stopped (natural end)");

      // If the call is still active and AI is not speaking,
      // keep listening continuously like a real phone call.
      if (isVoiceMode && sessionId && !isSpeaking) {
        console.log("🔁 Restarting recognition after natural end");
        startVoiceRecognition();
      }
    };

    recognition.start();
  };

  const speakText = (text) => {
    if (!canUseBrowserTTS || !text) return;

    try {
      window.speechSynthesis.cancel();
      const utterance = new window.SpeechSynthesisUtterance(text);
      utterance.lang = "hi-IN";
      utterance.onstart = () => {
        setIsSpeaking(true);
        // If we were listening, stop so the AI doesn't hear its own voice
        if (recognitionRef.current) {
          try {
            recognitionRef.current.abort();
          } catch {
            // ignore
          }
        }
      };
      utterance.onend = () => {
        setIsSpeaking(false);
        // After AI finishes speaking, start listening for the customer
        if (isVoiceMode && sessionId) {
          console.log("🔁 Starting recognition after AI speech");
          startVoiceRecognition();
        }
      };
      utterance.onerror = () => {
        setIsSpeaking(false);
        if (isVoiceMode && sessionId) {
          console.log("🔁 Recovering recognition after TTS error");
          startVoiceRecognition();
        }
      };
      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.error("Speech synthesis failed:", e);
      setIsSpeaking(false);
    }
  };

  /**
   * Initialize conversation
   */
  const handleStartCall = async () => {
    setError(null);
    setIsLoading(true);
    setConversation([]);

    try {
      const response = await fetch("/api/loan-assistant/voice-conversation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "init",
          customer_profile: profile,
          company_name: "XYZ Finance",
          is_voice_call: isVoiceMode,
        }),
      });

      const data = await response.json();

      if (!data.success) {
        setError(data.error || "Failed to initialize conversation");
        return;
      }

      setSessionId(data.session_id);
      const openingTurn = {
        type: "ai",
        message: data.ai_response.ai_message,
        stage: data.ai_response.conversation_stage,
      };

      setConversation([openingTurn]);

      // In voice mode:
      // - If autoplay is ON, let AI speak first, then speakText() will start recognition in onend.
      // - If autoplay is OFF, start listening immediately.
      if (isVoiceMode) {
        if (autoPlayVoice && canUseBrowserTTS) {
          speakText(openingTurn.message);
        } else {
          console.log("🔁 Starting initial voice recognition after init (no autoplay)");
          startVoiceRecognition();
        }
      }

      console.log("✅ Conversation initialized:", data);
    } catch (err) {
      setError("Network error: " + err.message);
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Core send logic shared by text and voice
   */
  const sendMessageToServer = async (userMsg) => {
    if (!userMsg.trim() || !sessionId) return;

    setError(null);
    setIsLoading(true);

    // Add user message to conversation
    setConversation((prev) => [
      ...prev,
      { type: "customer", message: userMsg },
    ]);

    try {
      const response = await fetch("/api/loan-assistant/voice-conversation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "next",
          session_id: sessionId,
          customer_message: userMsg,
        }),
      });

      const data = await response.json();

      if (!data.success) {
        setError(data.error || "Failed to process message");
        return;
      }

      // Add AI response
      const aiTurn = {
        type: "ai",
        message: data.ai_response.ai_message,
        stage: data.ai_response.conversation_stage,
        intent: data.customer_analysis.intent,
        confidence: data.customer_analysis.confidence,
      };

      setConversation((prev) => [...prev, aiTurn]);

      if (isVoiceMode) {
        // In voice mode:
        // - If autoplay is ON, speak the AI reply and let speakText() restart recognition in onend.
        // - If autoplay is OFF, immediately start listening for the next customer turn.
        if (autoPlayVoice && canUseBrowserTTS) {
          speakText(aiTurn.message);
        } else {
          console.log("🔁 Starting recognition for next customer turn (no autoplay)");
          startVoiceRecognition();
        }
      }

      // If session ended, reset
      if (!data.is_session_active) {
        setSessionId(null);
        // Stop any ongoing recognition when call ends
        if (recognitionRef.current) {
          try {
            recognitionRef.current.abort();
          } catch {
            // ignore
          }
        }
        console.log("✅ Conversation ended:", data.call_summary);
      }

      console.log("📊 Analysis:", data.customer_analysis);
    } catch (err) {
      setError("Network error: " + err.message);
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Send customer message from text input (chat-style)
   */
  const handleSendMessage = async () => {
    if (!customerMessage.trim() || !sessionId) return;
    const userMsg = customerMessage;
    setCustomerMessage("");
    await sendMessageToServer(userMsg);
  };

  return (
    <div className="space-y-6">
      {/* Customer Profile Form */}
      <Card className="p-6">
        <h2 className="mb-4 text-lg font-semibold">Customer Profile</h2>
        <div className="grid grid-cols-2 gap-4">
          {Object.entries(profile).map(([key, value]) => (
            <div key={key}>
              <label className="block text-sm font-medium capitalize">
                {key.replace(/_/g, " ")}
              </label>
              <input
                type={typeof value === "number" ? "number" : "text"}
                value={value}
                onChange={(e) =>
                  setProfile({
                    ...profile,
                    [key]:
                      typeof value === "number"
                        ? parseInt(e.target.value) || 0
                        : e.target.value,
                  })
                }
                className="mt-1 w-full rounded border px-3 py-2"
                disabled={!!sessionId}
              />
            </div>
          ))}
        </div>

        {/* Mode Selection */}
        <div className="mt-4 flex gap-4">
          <label className="flex items-center">
            <input
              type="radio"
              checked={!isVoiceMode}
              onChange={() => setIsVoiceMode(false)}
              disabled={!!sessionId}
            />
            <span className="ml-2">Chat Mode</span>
          </label>
          <label className="flex items-center">
            <input
              type="radio"
              checked={isVoiceMode}
              onChange={() => setIsVoiceMode(true)}
              disabled={!!sessionId}
            />
            <span className="ml-2">Voice Mode</span>
          </label>
          {isVoiceMode && (
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={autoPlayVoice}
                onChange={(e) => setAutoPlayVoice(e.target.checked)}
                disabled={!canUseBrowserTTS}
              />
              <span className="ml-2">
                Play AI voice{!canUseBrowserTTS ? " (not supported in this browser)" : ""}
              </span>
            </label>
          )}
        </div>

        {/* Action Buttons */}
        <div className="mt-4 flex gap-2">
          <Button
            onClick={handleStartCall}
            disabled={!!sessionId || isLoading}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {isLoading ? "Starting..." : "Start Call"}
          </Button>
          {sessionId && (
            <Button
              onClick={() => {
                setSessionId(null);
                setConversation([]);
                // Stop any ongoing recognition when call is manually ended
                if (recognitionRef.current) {
                  try {
                    recognitionRef.current.abort();
                  } catch {
                    // ignore
                  }
                }
              }}
              variant="outline"
            >
              End Call
            </Button>
          )}
        </div>
      </Card>

      {/* Error Display */}
      {error && (
        <Card className="border-red-300 bg-red-50 p-4">
          <p className="text-sm text-red-800">❌ {error}</p>
        </Card>
      )}

      {/* Conversation Display */}
      {sessionId && (
        <Card className="p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">
              {isVoiceMode ? "🎤 Voice Call" : "💬 Chat"}
            </h2>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
              {getStatusText()}
            </span>
          </div>

          {/* Conversation History */}
          <div className="mb-4 max-h-96 space-y-3 overflow-y-auto rounded bg-gray-50 p-4">
            {conversation.length === 0 ? (
              <p className="text-sm text-gray-500">Waiting for response...</p>
            ) : (
              conversation.map((turn, idx) => (
                <div
                  key={idx}
                  className={`rounded p-3 ${
                    turn.type === "ai"
                      ? "bg-blue-100 text-blue-900"
                      : "bg-green-100 text-green-900"
                  }`}
                >
                  <p className="text-xs font-semibold w-12">
                    {turn.type === "ai" ? "🤖 AI" : "👤 You"}
                  </p>
                  <p className="mt-1 text-sm">{turn.message}</p>
                  {turn.intent && (
                    <p className="mt-1 text-xs opacity-75">
                      Intent: {turn.intent} ({(turn.confidence * 100).toFixed(0)}%)
                    </p>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Message Input / Voice Controls */}
          <div className="flex gap-2">
            {/* Chat mode: show text input + Send button */}
            {!isVoiceMode && (
              <>
                <input
                  type="text"
                  value={customerMessage}
                  onChange={(e) => setCustomerMessage(e.target.value)}
                  onKeyPress={(e) => e.key === "Enter" && handleSendMessage()}
                  placeholder="Type your response..."
                  className="flex-1 rounded border px-3 py-2"
                  disabled={isLoading}
                />
                <Button
                  onClick={handleSendMessage}
                  disabled={!customerMessage.trim() || isLoading}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {isLoading ? "..." : "Send"}
                </Button>
              </>
            )}

            {/* Voice mode: hide text input/send, keep optional Replay button */}
            {isVoiceMode && canUseBrowserTTS && (
              <Button
                type="button"
                onClick={() => {
                  const lastAiTurn = [...conversation].reverse().find((t) => t.type === "ai");
                  if (lastAiTurn) {
                    speakText(lastAiTurn.message);
                  }
                }}
                variant="outline"
                disabled={!conversation.some((t) => t.type === "ai") || isSpeaking}
              >
                {isSpeaking ? "🔊 Playing..." : "🔊 Replay"}
              </Button>
            )}
          </div>
        </Card>
      )}

      {/* Info Box */}
      <Card className="border-blue-200 bg-blue-50 p-4">
        <p className="text-sm text-blue-900">
          ℹ️ This uses OpenAI's intelligent API (like ChatGPT) to understand
          context naturally - not just keywords.{isVoiceMode && " Voice mode uses browser speech recognition and can be integrated with Twilio for real phone calls."}
        </p>
      </Card>
    </div>
  );
}
