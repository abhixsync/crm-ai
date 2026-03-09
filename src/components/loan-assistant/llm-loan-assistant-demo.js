"use client";

import { useState } from "react";
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
      setConversation([
        {
          type: "ai",
          message: data.ai_response.ai_message,
          stage: data.ai_response.conversation_stage,
        },
      ]);

      console.log("✅ Conversation initialized:", data);
    } catch (err) {
      setError("Network error: " + err.message);
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Send customer message
   */
  const handleSendMessage = async () => {
    if (!customerMessage.trim() || !sessionId) return;

    setError(null);
    setIsLoading(true);
    const userMsg = customerMessage;
    setCustomerMessage("");

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
      setConversation((prev) => [
        ...prev,
        {
          type: "ai",
          message: data.ai_response.ai_message,
          stage: data.ai_response.conversation_stage,
          intent: data.customer_analysis.intent,
          confidence: data.customer_analysis.confidence,
        },
      ]);

      // If session ended, reset
      if (!data.is_session_active) {
        setSessionId(null);
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
   * Voice input using browser Speech Recognition API
   */
  const handleVoiceInput = async () => {
    if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
      alert("Speech Recognition not supported in this browser");
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();

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

      setCustomerMessage(transcript);
      console.log("📝 Transcript:", transcript);
    };

    recognition.onerror = (event) => {
      console.error("Speech recognition error:", event.error);
      setError("Voice input failed: " + event.error);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.start();
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
          <h2 className="mb-4 text-lg font-semibold">
            {isVoiceMode ? "🎤 Voice Call" : "💬 Chat"}
          </h2>

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

          {/* Message Input */}
          <div className="flex gap-2">
            <input
              type="text"
              value={customerMessage}
              onChange={(e) => setCustomerMessage(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && handleSendMessage()}
              placeholder="Type your response..."
              className="flex-1 rounded border px-3 py-2"
              disabled={isLoading || isListening}
            />

            {isVoiceMode && (
              <Button
                onClick={handleVoiceInput}
                disabled={isLoading || !sessionId}
                className={`${
                  isListening
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-green-600 hover:bg-green-700"
                }`}
              >
                {isListening ? "🎤 Listening..." : "🎤"}
              </Button>
            )}

            <Button
              onClick={handleSendMessage}
              disabled={!customerMessage.trim() || isLoading}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isLoading ? "..." : "Send"}
            </Button>
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
