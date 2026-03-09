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
    name: "Abhishek Shukla",
    city: "Meerut",
    monthly_income: 500000,
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
  const [isCallActive, setIsCallActive] = useState(false);
  const [autoPlayVoice, setAutoPlayVoice] = useState(true);
  const recognitionRef = useRef(null);
  const activeUtteranceRef = useRef(null);  // Track which utterance is currently active
  const recognitionRestartScheduledRef = useRef(false);  // Prevent multiple restart timeouts
  const isAISpeakingRef = useRef(false);  // Track if AI audio is actively playing
  const callActiveRef = useRef(false); // Single source of truth for whether listening is allowed

  const getStatusText = () => {
    if (!sessionId) return "Idle";
    if (!isCallActive) return "Call ended";
    if (isSpeaking) return "AI talking…";
    if (isListening) return "Listening…";
    if (isLoading) return "Thinking…";
    return "Chat active";
  };

  const canUseBrowserTTS =
    typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;

  const updateCallActive = (active) => {
    callActiveRef.current = active;
    setIsCallActive(active);
  };

  const stopVoiceIO = () => {
    setIsListening(false);
    setIsSpeaking(false);
    recognitionRestartScheduledRef.current = false;
    isAISpeakingRef.current = false;
    activeUtteranceRef.current = null;

    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    }

    if (canUseBrowserTTS) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // ignore
      }
    }
  };

  const handleEndCall = () => {
    updateCallActive(false);
    stopVoiceIO();
    setSessionId(null);
    setConversation([]);
  };

  const startVoiceRecognition = (sessionIdParam, isVoiceModeParam, isSpeakingParam) => {
    // Use parameters if provided, otherwise use state (for backward compatibility)
    const effectiveSessionId = sessionIdParam !== undefined ? sessionIdParam : sessionId;
    const effectiveIsVoiceMode = isVoiceModeParam !== undefined ? isVoiceModeParam : isVoiceMode;
    const effectiveIsSpeaking = isSpeakingParam !== undefined ? isSpeakingParam : isSpeaking;
    
    console.log(`[VOICE] startVoiceRecognition called - isVoiceMode: ${effectiveIsVoiceMode}, sessionId: ${effectiveSessionId}, isSpeaking: ${effectiveIsSpeaking}`);
    console.log(`[VOICE] (params provided: sessionId=${sessionIdParam}, isVoiceMode=${isVoiceModeParam}, isSpeaking=${isSpeakingParam})`);
    
    // CRITICAL GUARD: Don't listen while AI audio is playing or recently finished
    if (isAISpeakingRef.current) {
      console.log("[VOICE] ❌ BLOCKING: AI audio is still playing - cannot start recognition yet");
      return;
    }
    
    if (typeof window === "undefined") {
      console.log("[VOICE] ❌ Window undefined (SSR context)");
      return;
    }
    
    if (!effectiveIsVoiceMode || !effectiveSessionId) {
      console.log(`[VOICE] ❌ Not in voice mode or no session - isVoiceMode: ${effectiveIsVoiceMode}, sessionId: ${effectiveSessionId}`);
      return;
    }

    if (!callActiveRef.current) {
      console.log("[VOICE] ❌ Call is not active - skipping recognition start");
      return;
    }
    
    // Don't start listening while AI is speaking, to avoid AI hearing itself
    if (effectiveIsSpeaking) {
      console.log("[VOICE] ⏸️ Skipping recognition start because AI is speaking");
      return;
    }

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.warn("[VOICE] ❌ Speech Recognition API not supported");
      setError(
        "Voice listening is not supported in this browser. Please use the latest Chrome or Edge for full voice demo."
      );
      return;
    }

    // Avoid multiple parallel recognitions
    if (recognitionRef.current && isListening) {
      console.log("[VOICE] ⚠️ Recognition already active, skipping");
      return;
    }

    console.log("[VOICE] 🚀 Creating new SpeechRecognition instance");
    const recognition = new SpeechRecognition();
    const instanceId = Math.random().toString(36).substr(2, 9);
    console.log(`[VOICE] 📌 New instance ID: ${instanceId}`);
    recognitionRef.current = recognition;

    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "hi-IN"; // Hindi for Hinglish support

    recognition.onstart = () => {
      console.log(`[VOICE] ✅ Recognition STARTED (instance: ${instanceId}) - now listening for speech`);
      console.log("[VOICE] 🎤 SPEAK NOW! (waiting for audio...)");
      setIsListening(true);
    };

    recognition.onresult = (event) => {
      // Clear the no-audio timeout since we got audio
      if (recognition.audioTimeout) {
        clearTimeout(recognition.audioTimeout);
      }
      
      console.log(`[VOICE] 📝 Speech result received - results count: ${event.results.length}`);
      const transcript = Array.from(event.results)
        .map((result) => {
          console.log(`[VOICE]   - Result: "${result[0].transcript}" (confidence: ${result[0].confidence})`);
          return result[0].transcript;
        })
        .join("");

      console.log("[VOICE] 📝 Final Transcript:", transcript);
      setCustomerMessage(transcript);

      if (!callActiveRef.current) {
        console.log("[VOICE] ⏹️ Ignoring transcript because call is no longer active");
        return;
      }

      // Automatically send the customer's speech as their message
      // Pass the sessionId explicitly to avoid closure issues
      if (transcript.trim()) {
        console.log("[VOICE] 📤 Sending transcript to server automatically with sessionId:", effectiveSessionId);
        sendMessageToServer(transcript, effectiveSessionId, isVoiceMode);
      }
    };

    recognition.onerror = (event) => {
      console.log(`[VOICE] ❌ Recognition error (instance: ${instanceId}): ${event.error}`);
      // "aborted" is expected when we intentionally stop() during AI speech
      if (event.error === "aborted") {
        console.log("[VOICE] 🎤 Recognition aborted (expected - AI was speaking)");
      } else {
        console.error("[VOICE] 🎤 Speech recognition error:", event.error);
        
        // Provide friendly error messages based on the error type
        let userMessage = "";
        switch(event.error) {
          case "no-speech":
            userMessage = "🎤 I didn't hear anything. Please speak clearly!";
            break;
          case "audio-capture":
            userMessage = "🎙️ Microphone issue. Please check your microphone and try again.";
            break;
          case "permission-denied":
          case "not-allowed":
            userMessage = "🔐 Microphone permission denied. Please enable microphone access in browser settings.";
            break;
          case "network":
            userMessage = "🌐 Connection issue. Please check your internet and try again.";
            break;
          default:
            userMessage = `🎤 Please speak clearly. If this continues, try refreshing the page. (Error: ${event.error})`;
        }
        
        setError(userMessage);
      }
      setIsListening(false);
    };

    recognition.onend = () => {
      console.log(`[VOICE] 🛑 Recognition ENDED (instance: ${instanceId}, stopped listening)`);
      setIsListening(false);

      // Only restart if AI is NOT currently speaking
      // Auto-restart is controlled by speech synthesis callbacks, not here
      if (isAISpeakingRef.current) {
        console.log("[VOICE] 🛑 Recognition ended while AI speaking - no restart (AI will restart listening after it finishes)");
        return;
      }

      console.warn("[VOICE] ⚠️  DIAGNOSTIC: Speech ended. Possible reasons:");
      console.warn("  1. User stopped speaking");
      console.warn("  2. Browser microphone permissions issue");
      console.warn("  3. Microphone physically muted");
      console.warn("  4. No speech detected (timeout)");

      // Only auto-restart if we're definitely not during AI speech
      if (effectiveIsVoiceMode && effectiveSessionId && !isAISpeakingRef.current && callActiveRef.current) {
        if (!recognitionRestartScheduledRef.current) {
          recognitionRestartScheduledRef.current = true;
          console.log("[VOICE] ⏱️  Waiting 1s before restarting (browser needs gap between attempts)");
          setTimeout(() => {
            recognitionRestartScheduledRef.current = false;
            if (!callActiveRef.current) {
              console.log("[VOICE] ⏹️ Call ended before scheduled restart - not restarting recognition");
              return;
            }
            console.log("[VOICE] 🔁 AUTO-RESTARTING recognition for continuous listening");
            startVoiceRecognition(effectiveSessionId, effectiveIsVoiceMode, false);
          }, 1000);
        } else {
          console.log("[VOICE] ⏳ Recognition restart already scheduled, skipping duplicate");
        }
      }
    };

    console.log(`[VOICE] ▶️ Calling recognition.start() for instance: ${instanceId}`);
    try {
      recognition.start();
      console.log(`[VOICE] ✅ recognition.start() called successfully (instance: ${instanceId})`);
      
      // Set a timeout to warn if no audio detected after 3 seconds
      const noAudioTimeout = setTimeout(() => {
        if (recognitionRef.current === recognition && isListening) {
          console.warn(`[VOICE] ⏱️  TIMEOUT: No audio detected after 3 seconds (instance: ${instanceId})`);
          console.warn("   → Microphone may not be working or permission denied");
          console.warn("   → Check your browser microphone access settings");
          
          // Show a friendly message to the user
          setError("🎤 Please speak - I'm not hearing anything. If the microphone is on, try speaking louder!");
        }
      }, 3000);
      
      // Store timeout ID to clear if speech is detected
      recognition.audioTimeout = noAudioTimeout;
    } catch (err) {
      console.error(`[VOICE] ❌ Error calling recognition.start() (instance: ${instanceId}):`, err);
      console.error("[VOICE] Error message:", err.message);
      console.error("[VOICE] Error code:", err.code);
      setIsListening(false);
      
      if (err.message.includes("permission")) {
        setError("🔐 Microphone permission denied. Please enable microphone access in your browser settings and try again.");
      } else {
        setError("🎤 Unable to start microphone. Please check your microphone and try again.");
      }
    }
  };

  const speakText = (text, sessionIdForCallback, isVoiceModeForCallback, shouldRestartListening = true) => {
    console.log(`[VOICE] speakText() called - canUseBrowserTTS: ${canUseBrowserTTS}, text length: ${text?.length || 0}`);
    console.log(`[VOICE] Parameters - sessionId: ${sessionIdForCallback}, isVoiceMode: ${isVoiceModeForCallback}`);
    
    if (!canUseBrowserTTS || !text) {
      console.log(`[VOICE] ❌ Cannot speak - canUseBrowserTTS: ${canUseBrowserTTS}, text: ${!!text}`);
      return;
    }

    try {
      console.log("[VOICE] 🔊 Canceling any previous speech");
      window.speechSynthesis.cancel();
      isAISpeakingRef.current = false;  // Reset the flag
      
      const utterance = new window.SpeechSynthesisUtterance(text);
      utterance.lang = "hi-IN";
      activeUtteranceRef.current = utterance;  // Track this as the active utterance
      
      utterance.onstart = () => {
        console.log("[VOICE] 🔊 AI STARTED SPEAKING");
        isAISpeakingRef.current = true;  // Mark AI is speaking
        setIsSpeaking(true);
        // Abort any listening recognition
        if (recognitionRef.current) {
          console.log("[VOICE] 🔊 Aborting recognition - AI is speaking");
          try {
            recognitionRef.current.abort();
          } catch (err) {
            console.log("[VOICE] ⚠️ Error aborting recognition:", err.message);
          }
        }
      };
      
      utterance.onend = () => {
        // Only process onend if this is still the active utterance
        if (activeUtteranceRef.current === utterance) {
          console.log("[VOICE] 🔊 AI FINISHED SPEAKING");
          setIsSpeaking(false);
          activeUtteranceRef.current = null;
          
          // CRITICAL: Keep isAISpeakingRef true for 2 more seconds
          // This prevents recognition from picking up residual audio/speaker feedback
          console.log("[VOICE] ⏳ AI audio still playing - waiting 2s to ensure complete playback");
          
          setTimeout(() => {
            isAISpeakingRef.current = false;
            console.log("[VOICE] ✅ AI audio fully stopped - now safe to listen");
            
            // NOW start listening after audio has truly finished
            console.log(`[VOICE] Checking restart conditions - isVoiceMode: ${isVoiceModeForCallback}, sessionId: ${sessionIdForCallback}`);
            if (shouldRestartListening && callActiveRef.current && isVoiceModeForCallback && sessionIdForCallback) {
              console.log("[VOICE] 🔄 Starting recognition for customer input");
              startVoiceRecognition(sessionIdForCallback, isVoiceModeForCallback, false);
            } else {
              console.log("[VOICE] ⏹️ Not restarting recognition after speech end");
            }
          }, 2000);  // 2 second delay to ensure audio completely finished
        }
      };
      
      utterance.onerror = (err) => {
        // Only process onerror if this is still the active utterance
        if (activeUtteranceRef.current === utterance) {
          console.error("[VOICE] ❌ Speech synthesis error:", err);
          setIsSpeaking(false);
          activeUtteranceRef.current = null;
          
          // Mark AI audio as done
          isAISpeakingRef.current = false;
          
          if (shouldRestartListening && callActiveRef.current && isVoiceModeForCallback && sessionIdForCallback) {
            console.log("[VOICE] 🔄 Recovering - starting recognition after TTS error");
            setTimeout(() => {
              startVoiceRecognition(sessionIdForCallback, isVoiceModeForCallback, false);
            }, 500);
          }
        }
      };
      
      console.log("[VOICE] 🔊 Starting speech synthesis");
      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.error("[VOICE] ❌ Speech synthesis exception:", e);
      setIsSpeaking(false);
      isAISpeakingRef.current = false;
    }
  };

  /**
   * Initialize conversation
   */
  const handleStartCall = async () => {
    console.log("[CALL] handleStartCall() - Starting call initialization");
    console.log(`[CALL] Mode: isVoiceMode=${isVoiceMode}, autoPlayVoice=${autoPlayVoice}, canUseBrowserTTS=${canUseBrowserTTS}`);
    
    setError(null);
    setIsLoading(true);
    setConversation([]);

    try {
      console.log("[CALL] 📡 Sending init request to /api/loan-assistant/voice-conversation");
      const requestBody = {
        action: "init",
        customer_profile: profile,
        is_voice_call: isVoiceMode,
      };

      const response = await fetch("/api/loan-assistant/voice-conversation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();

      if (!data.success) {
        console.log("[CALL] ❌ Failed to initialize:", data.error);
        updateCallActive(false);
        setError(data.error || "Failed to initialize conversation");
        return;
      }

      console.log("[CALL] ✅ Conversation initialized");
      setSessionId(data.session_id);
      updateCallActive(true);
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
          console.log("[CALL] 🔊 Voice mode + autoplay ON - speaking opening message");
          speakText(openingTurn.message, data.session_id, true, true);
        } else {
          console.log("[CALL] 🎤 Voice mode + autoplay OFF - starting immediate recognition");
          startVoiceRecognition(data.session_id, true, false);
        }
      } else {
        console.log("[CALL] 💬 Chat mode - no voice processing");
      }

      console.log("[CALL] ✅ Conversation initialized:", data);
    } catch (err) {
      console.log("[CALL] ❌ Network error:", err.message);
      updateCallActive(false);
      setError("Network error: " + err.message);
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Core send logic shared by text and voice
   */
  const sendMessageToServer = async (userMsg, sessionIdParam, isVoiceModeParam) => {
    // Use parameters if provided, otherwise use state (for backward compatibility)
    const effectiveSessionId = sessionIdParam !== undefined ? sessionIdParam : sessionId;
    const effectiveIsVoiceMode = isVoiceModeParam !== undefined ? isVoiceModeParam : isVoiceMode;
    
    console.log(`[MSG] sendMessageToServer() - message: "${userMsg.substring(0, 50)}..."`);
    console.log(`[MSG] isVoiceMode: ${effectiveIsVoiceMode}, sessionId: ${effectiveSessionId}, isLoading: ${isLoading}`);
    console.log(`[MSG] (params provided: sessionId=${sessionIdParam}, isVoiceMode=${isVoiceModeParam}`);
    
    if (!userMsg.trim() || !effectiveSessionId) {
      console.log("[MSG] ❌ Skipping - empty message or no session");
      return;
    }

    setError(null);
    setIsLoading(true);

    // Add user message to conversation
    setConversation((prev) => [
      ...prev,
      { type: "customer", message: userMsg },
    ]);

    try {
      console.log("[MSG] 📡 Sending to server");
      const response = await fetch("/api/loan-assistant/voice-conversation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "next",
          session_id: effectiveSessionId,
          customer_message: userMsg,
          is_voice_call: effectiveIsVoiceMode,
        }),
      });

      const data = await response.json();

      if (!data.success) {
        console.log("[MSG] ❌ Server error:", data.error);
        setError(data.error || "Failed to process message");
        return;
      }

      console.log("[MSG] ✅ AI response received");
      
      // Add AI response
      const aiTurn = {
        type: "ai",
        message: data.ai_response.ai_message,
        stage: data.ai_response.conversation_stage,
        intent: data.customer_analysis.intent,
        confidence: data.customer_analysis.confidence,
      };

      setConversation((prev) => [...prev, aiTurn]);

      const conversationStage = String(data.ai_response?.conversation_stage || "").toLowerCase();
      const isClosingStage = conversationStage === "closing";
      const shouldEndSession = data.is_session_active === false || isClosingStage;

      if (shouldEndSession) {
        console.log("[MSG] 🛑 Conversation closing/session ended - disabling microphone restarts");
        updateCallActive(false);
      }

      if (effectiveIsVoiceMode) {
        console.log(`[MSG] Voice mode processing - autoPlayVoice: ${autoPlayVoice}, canUseBrowserTTS: ${canUseBrowserTTS}`);

        if (autoPlayVoice && canUseBrowserTTS) {
          console.log("[MSG] 🔊 Speaking AI response");
          speakText(aiTurn.message, effectiveSessionId, effectiveIsVoiceMode, !shouldEndSession);
        } else if (!shouldEndSession) {
          console.log("[MSG] 🎤 Starting recognition for next customer turn");
          startVoiceRecognition(effectiveSessionId, effectiveIsVoiceMode, false);
        } else {
          stopVoiceIO();
        }
      } else {
        console.log("[MSG] 💬 Chat mode or conversation closed - no voice processing");
      }

      if (shouldEndSession) {
        console.log("[MSG] ✅ Session has ended. Click End Call to clear this conversation.");
        console.log("✅ Conversation ended:", data.call_summary);
      }

      console.log("[MSG] 📊 Analysis:", data.customer_analysis);
    } catch (err) {
      console.log("[MSG] ❌ Network error:", err.message);
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
    await sendMessageToServer(userMsg, sessionId, isVoiceMode);
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
              onClick={handleEndCall}
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
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                {getStatusText()}
              </span>
              <Button onClick={handleEndCall} variant="outline">
                End Call
              </Button>
            </div>
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
                  disabled={isLoading || !isCallActive}
                />
                <Button
                  onClick={handleSendMessage}
                  disabled={!customerMessage.trim() || isLoading || !isCallActive}
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
                    speakText(lastAiTurn.message, sessionId, isVoiceMode, false);
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
