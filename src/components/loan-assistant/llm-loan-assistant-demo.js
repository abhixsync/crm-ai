"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { detectLanguageStyleFromText } from "@/lib/ai/language-style";

function buildCustomerOptionLabel(customer) {
  const name = `${String(customer?.firstName || "").trim()} ${String(customer?.lastName || "").trim()}`.trim();
  const phone = String(customer?.phone || "").trim();
  const city = String(customer?.city || "").trim();

  const base = name || phone || "Unnamed Customer";
  if (city && phone) {
    return `${base} - ${city} - ${phone}`;
  }
  if (city) {
    return `${base} - ${city}`;
  }
  if (phone && base !== phone) {
    return `${base} - ${phone}`;
  }

  return base;
}

function toNumberOrFallback(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * LLM Loan Assistant Demo with Voice Support
 * Uses intelligent AI (ChatGPT/Claude-level) instead of keywords
 */
export function LLMLoanAssistantDemo() {
  const { data: session } = useSession();
  const isSuperAdmin = session?.user?.role === "SUPER_ADMIN";
  const [profile, setProfile] = useState({
    name: "John Doe",
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
  const [customerOptions, setCustomerOptions] = useState([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [selectedCustomerContext, setSelectedCustomerContext] = useState(null);
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(false);
  const [customersLoadError, setCustomersLoadError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isCallActive, setIsCallActive] = useState(false);
  const [autoPlayVoice, setAutoPlayVoice] = useState(true);
  const [languageStyle, setLanguageStyle] = useState("unknown");
  const [languageScript, setLanguageScript] = useState("unknown");
  const [selectedVoiceLabel, setSelectedVoiceLabel] = useState("");
  const [voiceWarning, setVoiceWarning] = useState("");
  const recognitionRef = useRef(null);
  const activeAudioRef = useRef(null);
  const activeAudioUrlRef = useRef(null);
  const availableVoicesRef = useRef([]);
  const warnedAboutVoiceRef = useRef(false);
  const activeUtteranceRef = useRef(null);  // Track which utterance is currently active
  const recognitionRestartScheduledRef = useRef(false);  // Prevent multiple restart timeouts
  const isAISpeakingRef = useRef(false);  // Track if AI audio is actively playing
  const callActiveRef = useRef(false); // Single source of truth for whether listening is allowed
  const isLoadingRef = useRef(false);
  const messageInFlightRef = useRef(false);
  const lastVoiceTranscriptRef = useRef({ normalized: "", ts: 0 });

  const updateVoiceWarning = (message) => {
    if (isSuperAdmin) {
      setVoiceWarning(String(message || ""));
      return;
    }

    setVoiceWarning("");
  };

  const getStatusText = () => {
    if (!sessionId) return "Idle";
    if (!isCallActive) return "Call ended";
    if (isSpeaking) return "AI talking…";
    if (isListening) return "Listening…";
    if (isLoading) return "Thinking…";
    return "Chat active";
  };

  const getActiveCustomerBadgeText = () => {
    const customerName = String(selectedCustomerContext?.name || "").trim();
    const customerPhone = String(selectedCustomerContext?.phone || "").trim();

    if (!customerName && !customerPhone) {
      return "";
    }

    if (customerName && customerPhone) {
      return `${customerName} - ${customerPhone}`;
    }

    return customerName || customerPhone;
  };

  const canUseBrowserTTS =
    typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
  const canPlayAudioElement = typeof window !== "undefined" && typeof Audio !== "undefined";

  const disableElevenLabsTTS = String(process.env.NEXT_PUBLIC_DISABLE_ELEVENLABS_TTS || "false").toLowerCase() === "true";
  const ttsProvider = String(process.env.NEXT_PUBLIC_TTS_PROVIDER || "elevenlabs").toLowerCase();
  const useElevenLabsTTS = ttsProvider === "elevenlabs" && !disableElevenLabsTTS;
  const activeTtsProvider = useElevenLabsTTS ? "elevenlabs" : "browser";
  const allowBrowserTtsFallback = String(
    process.env.NEXT_PUBLIC_TTS_ALLOW_BROWSER_FALLBACK
      ?? process.env.NEXT_PUBLIC_TTS_FALLBACK_BROWSER
      ?? "true"
  ).toLowerCase() !== "false";
  const canUseAnyTTS = useElevenLabsTTS ? canPlayAudioElement : canUseBrowserTTS;

  const parsedAiToListenDelayMs = Number(process.env.NEXT_PUBLIC_AI_TO_LISTEN_DELAY_MS);
  const aiToListenDelayMs = Number.isFinite(parsedAiToListenDelayMs) && parsedAiToListenDelayMs >= 0
    ? parsedAiToListenDelayMs
    : 2000;

  const elevenLabsVoiceIdDefault = String(process.env.NEXT_PUBLIC_ELEVENLABS_VOICE_ID_DEFAULT || "").trim();
  const elevenLabsVoiceIdEn = String(process.env.NEXT_PUBLIC_ELEVENLABS_VOICE_ID_EN || "").trim();
  const elevenLabsVoiceIdHi = String(process.env.NEXT_PUBLIC_ELEVENLABS_VOICE_ID_HI || "").trim();

  const preferredVoiceGender = String(process.env.NEXT_PUBLIC_TTS_GENDER || "female").toLowerCase() === "male"
    ? "male"
    : "female";
  const preferredVoiceRegion = String(process.env.NEXT_PUBLIC_TTS_PREFERRED_REGION || "india").toLowerCase();
  const preferIndianVoice = preferredVoiceRegion !== "global";
  const preferredVoiceNameEn = String(process.env.NEXT_PUBLIC_TTS_PREFERRED_VOICE_EN || "").trim().toLowerCase();
  const preferredVoiceNameHi = String(process.env.NEXT_PUBLIC_TTS_PREFERRED_VOICE_HI || "").trim().toLowerCase();

  const parsedTtsRate = Number(process.env.NEXT_PUBLIC_TTS_RATE);
  const ttsRate = Number.isFinite(parsedTtsRate) && parsedTtsRate >= 0.7 && parsedTtsRate <= 1.3
    ? parsedTtsRate
    : 0.95;

  const parsedTtsPitch = Number(process.env.NEXT_PUBLIC_TTS_PITCH);
  const ttsPitch = Number.isFinite(parsedTtsPitch) && parsedTtsPitch >= 0.8 && parsedTtsPitch <= 1.2
    ? parsedTtsPitch
    : 1.0;

  const FEMALE_VOICE_HINT_REGEX = /female|woman|heera|kalpana|swara|priya|aditi|samantha|google hindi|google uk english female|zira/i;
  const MALE_VOICE_HINT_REGEX = /male|man|ravi|arjun|david|alex|daniel|google uk english male/i;
  const INDIAN_VOICE_HINT_REGEX = /india|indian|hindi|en-in|hi-in|heera|swara|raveena|aditi|kalpana|priya/i;

  useEffect(() => {
    const adminName = String(session?.user?.name || "").trim();
    if (!adminName) {
      return;
    }

    setProfile((current) => {
      if (String(current.name || "").trim()) {
        return current;
      }

      return {
        ...current,
        name: adminName,
      };
    });
  }, [session?.user?.name]);

  useEffect(() => {
    if (!session?.user) {
      return undefined;
    }

    let cancelled = false;

    const loadCustomers = async () => {
      setIsLoadingCustomers(true);
      setCustomersLoadError("");

      try {
        const response = await fetch("/api/customers?page=1&pageSize=100");
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          const message = String(data?.error || `Failed to load customers (${response.status})`).trim();
          throw new Error(message);
        }

        if (cancelled) {
          return;
        }

        const customers = Array.isArray(data?.customers) ? data.customers : [];
        setCustomerOptions(customers);
      } catch (loadError) {
        if (cancelled) {
          return;
        }

        setCustomerOptions([]);
        setCustomersLoadError(String(loadError?.message || "Unable to load customer dropdown.").trim());
      } finally {
        if (!cancelled) {
          setIsLoadingCustomers(false);
        }
      }
    };

    loadCustomers();

    return () => {
      cancelled = true;
    };
  }, [session?.user?.id, session?.user?.tenantId]);

  useEffect(() => {
    if (!isSuperAdmin && voiceWarning) {
      setVoiceWarning("");
    }
  }, [isSuperAdmin, voiceWarning]);

  useEffect(() => {
    if (!canUseBrowserTTS) {
      return undefined;
    }

    const synth = window.speechSynthesis;

    const syncVoices = () => {
      const voices = synth.getVoices() || [];
      if (voices.length) {
        availableVoicesRef.current = voices;
        console.log(`[VOICE] Loaded ${voices.length} TTS voices`);
      }
    };

    syncVoices();

    if (typeof synth.addEventListener === "function") {
      synth.addEventListener("voiceschanged", syncVoices);
      return () => {
        synth.removeEventListener("voiceschanged", syncVoices);
      };
    }

    const prevHandler = synth.onvoiceschanged;
    synth.onvoiceschanged = () => {
      if (typeof prevHandler === "function") {
        prevHandler();
      }
      syncVoices();
    };

    return () => {
      synth.onvoiceschanged = prevHandler || null;
    };
  }, [canUseBrowserTTS]);

  useEffect(() => {
    isLoadingRef.current = isLoading;
  }, [isLoading]);

  // useEffect(() => {
  //   if (disableElevenLabsTTS && ttsProvider === "elevenlabs") {
  //     setVoiceWarning("ElevenLabs is disabled by NEXT_PUBLIC_DISABLE_ELEVENLABS_TTS=true. Using browser voice.");
  //     return;
  //   }

  //   setVoiceWarning((current) => {
  //     if (current.startsWith("ElevenLabs is disabled by NEXT_PUBLIC_DISABLE_ELEVENLABS_TTS=true")) {
  //       return "";
  //     }
  //     return current;
  //   });
  // }, [disableElevenLabsTTS, ttsProvider]);

  const updateCallActive = (active) => {
    callActiveRef.current = active;
    setIsCallActive(active);
  };

  const getSpeechLangFromStyle = (style, script = "unknown") => {
    const normalizedStyle = String(style || "").toLowerCase();
    const normalizedScript = String(script || "").toLowerCase();

    if (normalizedStyle === "hindi") {
      return "hi-IN";
    }

    if (normalizedStyle === "hinglish") {
      return normalizedScript === "devanagari" ? "hi-IN" : "en-IN";
    }

    return "en-IN";
  };

  const getAvailableVoices = () => {
    if (!canUseBrowserTTS) {
      return [];
    }

    const currentVoices = window.speechSynthesis.getVoices() || [];
    if (currentVoices.length) {
      availableVoicesRef.current = currentVoices;
    }
    return availableVoicesRef.current;
  };

  const voiceLooksFemale = (voice) => {
    const label = `${voice?.name || ""} ${voice?.voiceURI || ""}`.toLowerCase();
    return FEMALE_VOICE_HINT_REGEX.test(label);
  };

  const voiceLooksMale = (voice) => {
    const label = `${voice?.name || ""} ${voice?.voiceURI || ""}`.toLowerCase();
    return MALE_VOICE_HINT_REGEX.test(label);
  };

  const voiceLooksIndian = (voice) => {
    const lang = String(voice?.lang || "").toLowerCase();
    const label = `${voice?.name || ""} ${voice?.voiceURI || ""}`.toLowerCase();
    return lang.endsWith("-in") || INDIAN_VOICE_HINT_REGEX.test(`${lang} ${label}`);
  };

  const pickBestVoiceForLang = (speechLang) => {
    const voices = getAvailableVoices();
    if (!voices.length) {
      return null;
    }

    const normalizedLang = String(speechLang || "en-IN").toLowerCase();
    const baseLang = normalizedLang.split("-")[0];
    const preferredVoiceName = baseLang === "hi" ? preferredVoiceNameHi : preferredVoiceNameEn;

    let bestVoice = null;
    let bestScore = -1;

    for (const voice of voices) {
      const voiceLang = String(voice.lang || "").toLowerCase();
      const voiceBase = voiceLang.split("-")[0];
      const voiceLabel = `${voice.name || ""} ${voice.voiceURI || ""}`.toLowerCase();

      let score = 0;

      if (preferredVoiceName && (voice.name || "").toLowerCase() === preferredVoiceName) {
        score += 200;
      }
      if (preferredVoiceName && voiceLabel.includes(preferredVoiceName)) {
        score += 140;
      }

      if (voiceLang === normalizedLang) {
        score += 90;
      } else if (voiceBase === baseLang) {
        score += 65;
      }

      if (preferIndianVoice && voiceLooksIndian(voice)) {
        score += 55;
      }

      if (voiceLang.endsWith("-in")) {
        score += 45;
      }

      if (preferredVoiceGender === "female" && voiceLooksFemale(voice)) {
        score += 35;
      }
      if (preferredVoiceGender === "male" && voiceLooksMale(voice)) {
        score += 35;
      }

      if (voice.localService) {
        score += 3;
      }
      if (voice.default) {
        score += 2;
      }

      if (score > bestScore) {
        bestScore = score;
        bestVoice = voice;
      }
    }

    return bestVoice;
  };

  const stopActiveAudioPlayback = () => {
    if (activeAudioRef.current) {
      try {
        activeAudioRef.current.pause();
      } catch {
        // ignore
      }
      activeAudioRef.current.onended = null;
      activeAudioRef.current.onerror = null;
      activeAudioRef.current.onplay = null;
      activeAudioRef.current = null;
    }

    if (activeAudioUrlRef.current) {
      try {
        URL.revokeObjectURL(activeAudioUrlRef.current);
      } catch {
        // ignore
      }
      activeAudioUrlRef.current = null;
    }
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

    stopActiveAudioPlayback();
  };

  const applySelectedCustomerProfile = (customerId) => {
    const normalizedId = String(customerId || "").trim();
    setSelectedCustomerId(normalizedId);

    if (!normalizedId) {
      setSelectedCustomerContext(null);
      return;
    }

    const selected = customerOptions.find((customer) => String(customer?.id || "").trim() === normalizedId);
    if (!selected) {
      setSelectedCustomerContext(null);
      return;
    }

    const fullName = `${String(selected.firstName || "").trim()} ${String(selected.lastName || "").trim()}`.trim();
    const selectedExistingLoans = String(selected.existingLoans || selected.loanType || "").trim();
    const selectedLoanInterestType = String(
      selected.loanInterestType || selected.loan_interest_type || selected.preferredLoanType || ""
    ).trim();
    const shouldResetLoanInterestType = !selectedLoanInterestType && Boolean(String(selected.loanType || "").trim());

    setProfile((current) => ({
      ...current,
      name: fullName || current.name,
      city: String(selected.city || "").trim() || current.city,
      monthly_income: toNumberOrFallback(selected.monthlyIncome, current.monthly_income),
      employment_type: String(selected.employmentType || "").trim() || current.employment_type,
      credit_score: toNumberOrFallback(selected.creditScore, current.credit_score),
      existing_loans: selectedExistingLoans || current.existing_loans,
      loan_interest_type: shouldResetLoanInterestType
        ? ""
        : selectedLoanInterestType || current.loan_interest_type,
    }));

    setSelectedCustomerContext({
      id: selected.id,
      name: fullName || null,
      phone: selected.phone || null,
      email: selected.email || null,
    });
  };

  const handleEndCall = () => {
    updateCallActive(false);
    messageInFlightRef.current = false;
    lastVoiceTranscriptRef.current = { normalized: "", ts: 0 };
    stopVoiceIO();
    setSessionId(null);
    setConversation([]);
    setLanguageStyle("unknown");
    setLanguageScript("unknown");
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

    if (isLoadingRef.current || messageInFlightRef.current) {
      console.log("[VOICE] ⏳ Blocking recognition start while waiting for AI response");
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
    let didReceiveFinalTranscript = false;
    let lastRecognitionError = null;
    console.log(`[VOICE] 📌 New instance ID: ${instanceId}`);
    recognitionRef.current = recognition;

    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = getSpeechLangFromStyle(languageStyle, languageScript);

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

      if (transcript.trim()) {
        didReceiveFinalTranscript = true;
      }

      console.log("[VOICE] 📝 Final Transcript:", transcript);
      setCustomerMessage(transcript);

      const localSignal = detectLanguageStyleFromText(transcript);
      if (localSignal.style && localSignal.style !== "unknown") {
        setLanguageStyle(localSignal.style);
        setLanguageScript(localSignal.script || "unknown");
      }

      if (!callActiveRef.current) {
        console.log("[VOICE] ⏹️ Ignoring transcript because call is no longer active");
        return;
      }

      // Automatically send the customer's speech as their message
      // Pass the sessionId explicitly to avoid closure issues
      if (transcript.trim()) {
        console.log("[VOICE] 📤 Sending transcript to server automatically with sessionId:", effectiveSessionId);
        sendMessageToServer(transcript, effectiveSessionId, effectiveIsVoiceMode);
      }
    };

    recognition.onerror = (event) => {
      lastRecognitionError = event.error;
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
      // Always clear timeout when recognition session ends.
      if (recognition.audioTimeout) {
        clearTimeout(recognition.audioTimeout);
      }

      console.log(`[VOICE] 🛑 Recognition ENDED (instance: ${instanceId}, stopped listening)`);
      setIsListening(false);

      // Only restart if AI is NOT currently speaking
      // Auto-restart is controlled by speech synthesis callbacks, not here
      if (isAISpeakingRef.current) {
        console.log("[VOICE] 🛑 Recognition ended while AI speaking - no restart (AI will restart listening after it finishes)");
        return;
      }

      if (didReceiveFinalTranscript) {
        console.log("[VOICE] ✅ Recognition ended after capturing speech - skipping no-speech diagnostic");
      } else if (lastRecognitionError && lastRecognitionError !== "aborted") {
        console.warn(`[VOICE] ⚠️  Recognition ended after error: ${lastRecognitionError}`);
      } else if (!lastRecognitionError) {
        console.warn("[VOICE] ⚠️  DIAGNOSTIC: Speech ended without transcript. Possible reasons:");
        console.warn("  1. User stopped speaking");
        console.warn("  2. Browser microphone permissions issue");
        console.warn("  3. Microphone physically muted");
        console.warn("  4. No speech detected (timeout)");
      }

      // If we already got a transcript, the response pipeline will control when to listen next.
      if (didReceiveFinalTranscript) {
        return;
      }

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

  const handleSpeechStarted = () => {
    console.log("[VOICE] 🔊 AI STARTED SPEAKING");
    isAISpeakingRef.current = true;
    setIsSpeaking(true);

    if (recognitionRef.current) {
      console.log("[VOICE] 🔊 Aborting recognition - AI is speaking");
      try {
        recognitionRef.current.abort();
      } catch (err) {
        console.log("[VOICE] ⚠️ Error aborting recognition:", err.message);
      }
    }
  };

  const handleSpeechFinished = (sessionIdForCallback, isVoiceModeForCallback, shouldRestartListening) => {
    console.log("[VOICE] 🔊 AI FINISHED SPEAKING");
    setIsSpeaking(false);

    console.log(`[VOICE] ⏳ AI audio still playing - waiting ${aiToListenDelayMs}ms before listening`);
    setTimeout(() => {
      isAISpeakingRef.current = false;
      console.log("[VOICE] ✅ AI audio fully stopped - now safe to listen");

      if (shouldRestartListening && callActiveRef.current && isVoiceModeForCallback && sessionIdForCallback) {
        console.log("[VOICE] 🔄 Starting recognition for customer input");
        startVoiceRecognition(sessionIdForCallback, isVoiceModeForCallback, false);
      } else {
        console.log("[VOICE] ⏹️ Not restarting recognition after speech end");
      }
    }, aiToListenDelayMs);
  };

  const speakTextWithBrowser = (text, effectiveStyle, effectiveScript, sessionIdForCallback, isVoiceModeForCallback, shouldRestartListening = true) => {
    if (!canUseBrowserTTS) {
      return false;
    }

    try {
      window.speechSynthesis.cancel();
      const utterance = new window.SpeechSynthesisUtterance(text);
      utterance.lang = getSpeechLangFromStyle(effectiveStyle, effectiveScript);
      utterance.rate = ttsRate;
      utterance.pitch = ttsPitch;

      const selectedVoice = pickBestVoiceForLang(utterance.lang);
      if (selectedVoice) {
        utterance.voice = selectedVoice;
        utterance.lang = selectedVoice.lang || utterance.lang;
        const displayLabel = `${selectedVoice.name} (${selectedVoice.lang || "unknown"})`;
        setSelectedVoiceLabel(displayLabel);

        const foundPreferredGender = preferredVoiceGender === "female"
          ? voiceLooksFemale(selectedVoice)
          : voiceLooksMale(selectedVoice);
        const foundIndianVoice = voiceLooksIndian(selectedVoice);

        if (preferIndianVoice && preferredVoiceGender === "female" && (!foundIndianVoice || !foundPreferredGender)) {
          if (!warnedAboutVoiceRef.current) {
            warnedAboutVoiceRef.current = true;
            updateVoiceWarning("Indian female browser voice is not available in this OS voice pack.");
          }
        } else {
          updateVoiceWarning("");
        }
      }

      activeUtteranceRef.current = utterance;

      utterance.onstart = () => {
        handleSpeechStarted();
      };

      utterance.onend = () => {
        if (activeUtteranceRef.current === utterance) {
          activeUtteranceRef.current = null;
          handleSpeechFinished(sessionIdForCallback, isVoiceModeForCallback, shouldRestartListening);
        }
      };

      utterance.onerror = (err) => {
        if (activeUtteranceRef.current === utterance) {
          console.error("[VOICE] ❌ Browser speech synthesis error:", err);
          activeUtteranceRef.current = null;
          isAISpeakingRef.current = false;
          setIsSpeaking(false);
        }
      };

      console.log("[VOICE] 🔊 Starting browser speech synthesis");
      window.speechSynthesis.speak(utterance);
      return true;
    } catch (error) {
      console.error("[VOICE] ❌ Browser TTS exception:", error);
      return false;
    }
  };

  const speakTextWithElevenLabs = async (text, effectiveStyle, effectiveScript, sessionIdForCallback, isVoiceModeForCallback, shouldRestartListening = true) => {
    if (!canPlayAudioElement) {
      throw new Error("Audio playback is not supported in this browser.");
    }

    const languageCode = getSpeechLangFromStyle(effectiveStyle, effectiveScript);
    const voiceIdHint = languageCode.toLowerCase().startsWith("hi")
      ? (elevenLabsVoiceIdHi || elevenLabsVoiceIdDefault || "")
      : (elevenLabsVoiceIdEn || elevenLabsVoiceIdDefault || "");

    const response = await fetch("/api/loan-assistant/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        language_style: effectiveStyle,
        language_script: effectiveScript,
        language_code: languageCode,
        voice_id: voiceIdHint,
      }),
    });

    if (!response.ok) {
      const errorPayload = await response.json().catch(() => ({}));
      const baseError = errorPayload.error || `ElevenLabs TTS failed (${response.status})`;
      const detail = typeof errorPayload.details === "string" ? errorPayload.details.trim() : "";
      throw new Error(detail ? `${baseError} ${detail}` : baseError);
    }

    const voiceLabel = response.headers.get("x-voice-label") || response.headers.get("x-voice-id") || "default";
    setSelectedVoiceLabel(`ElevenLabs (${voiceLabel})`);

    const audioBlob = await response.blob();
    if (!audioBlob || audioBlob.size === 0) {
      throw new Error("ElevenLabs returned empty audio.");
    }

    stopActiveAudioPlayback();

    const audioUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(audioUrl);
    activeAudioUrlRef.current = audioUrl;
    activeAudioRef.current = audio;

    audio.onplay = () => {
      handleSpeechStarted();
    };

    audio.onended = () => {
      if (activeAudioRef.current === audio) {
        stopActiveAudioPlayback();
        handleSpeechFinished(sessionIdForCallback, isVoiceModeForCallback, shouldRestartListening);
      }
    };

    audio.onerror = () => {
      if (activeAudioRef.current === audio) {
        stopActiveAudioPlayback();
        isAISpeakingRef.current = false;
        setIsSpeaking(false);

        if (shouldRestartListening && callActiveRef.current && isVoiceModeForCallback && sessionIdForCallback) {
          setTimeout(() => {
            startVoiceRecognition(sessionIdForCallback, isVoiceModeForCallback, false);
          }, 500);
        }
      }
      console.error("[VOICE] ❌ ElevenLabs audio playback failed");
    };

    await audio.play();
  };

  const speakText = (text, sessionIdForCallback, isVoiceModeForCallback, shouldRestartListening = true) => {
    console.log(`[VOICE] speakText() called - provider: ${activeTtsProvider}, text length: ${text?.length || 0}`);

    if (!text) {
      return;
    }

    if (!canUseAnyTTS) {
      updateVoiceWarning("No supported TTS playback available in this browser.");
      return;
    }

    if (canUseBrowserTTS) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // ignore
      }
    }

    stopActiveAudioPlayback();
    isAISpeakingRef.current = false;

    const textSignal = detectLanguageStyleFromText(text);
    const effectiveStyle =
      textSignal.style && textSignal.style !== "unknown"
        ? textSignal.style
        : languageStyle;
    const effectiveScript =
      textSignal.style && textSignal.style !== "unknown"
        ? textSignal.script
        : languageScript;

    if (useElevenLabsTTS) {
      speakTextWithElevenLabs(text, effectiveStyle, effectiveScript, sessionIdForCallback, isVoiceModeForCallback, shouldRestartListening)
        .then(() => {
          updateVoiceWarning("");
        })
        .catch((error) => {
          console.error("[VOICE] ❌ ElevenLabs TTS error:", error.message);
          updateVoiceWarning(`ElevenLabs TTS unavailable: ${error.message}`);

          if (allowBrowserTtsFallback) {
            const fallbackOk = speakTextWithBrowser(
              text,
              effectiveStyle,
              effectiveScript,
              sessionIdForCallback,
              isVoiceModeForCallback,
              shouldRestartListening
            );

            if (!fallbackOk) {
              setIsSpeaking(false);
              isAISpeakingRef.current = false;
            }
          }
        });
      return;
    }

    const ok = speakTextWithBrowser(
      text,
      effectiveStyle,
      effectiveScript,
      sessionIdForCallback,
      isVoiceModeForCallback,
      shouldRestartListening
    );

    if (!ok) {
      updateVoiceWarning("Browser TTS failed to play audio.");
      setIsSpeaking(false);
      isAISpeakingRef.current = false;
    }
  };

  /**
   * Initialize conversation
   */
  const handleStartCall = async () => {
    console.log("[CALL] handleStartCall() - Starting call initialization");
    console.log(`[CALL] Mode: isVoiceMode=${isVoiceMode}, autoPlayVoice=${autoPlayVoice}, canUseAnyTTS=${canUseAnyTTS}`);
    
    messageInFlightRef.current = false;
    lastVoiceTranscriptRef.current = { normalized: "", ts: 0 };
    setError(null);
    setIsLoading(true);
    setConversation([]);

    try {
      console.log("[CALL] 📡 Sending init request to /api/loan-assistant/voice-conversation");
      const requestBody = {
        action: "init",
        customer_profile: {
          ...profile,
          ...(selectedCustomerContext?.id ? { id: selectedCustomerContext.id } : {}),
          ...(selectedCustomerContext?.phone ? { phone: selectedCustomerContext.phone } : {}),
          ...(selectedCustomerContext?.email ? { email: selectedCustomerContext.email } : {}),
        },
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
      setLanguageStyle(data.ai_response?.language_style || "unknown");
      setLanguageScript(data.ai_response?.language_script || "unknown");
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
        if (autoPlayVoice && canUseAnyTTS) {
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
    
    const trimmedMessage = String(userMsg || "").trim();
    if (!trimmedMessage || !effectiveSessionId) {
      console.log("[MSG] ❌ Skipping - empty message or no session");
      return;
    }

    const normalizedMessage = trimmedMessage.toLowerCase().replace(/\s+/g, " ");
    if (effectiveIsVoiceMode) {
      const now = Date.now();
      const recent = lastVoiceTranscriptRef.current;
      if (recent.normalized && recent.normalized === normalizedMessage && now - recent.ts < 3500) {
        console.log("[MSG] ⚠️ Duplicate voice transcript detected within 3.5s - skipping");
        return;
      }
    }

    if (messageInFlightRef.current) {
      console.log("[MSG] ⏳ Previous request still in-flight - skipping overlapping send");
      return;
    }

    messageInFlightRef.current = true;
    if (effectiveIsVoiceMode) {
      lastVoiceTranscriptRef.current = { normalized: normalizedMessage, ts: Date.now() };
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

      if (data.ai_response?.language_style) {
        setLanguageStyle(data.ai_response.language_style);
      }
      if (data.ai_response?.language_script) {
        setLanguageScript(data.ai_response.language_script);
      }

      setConversation((prev) => [...prev, aiTurn]);

      const shouldEndSession = data.is_session_active === false;

      if (shouldEndSession) {
        console.log("[MSG] 🛑 Conversation closing/session ended - disabling microphone restarts");
        updateCallActive(false);
        setIsListening(false);
        if (recognitionRef.current) {
          try {
            recognitionRef.current.abort();
          } catch {
            // ignore
          }
          recognitionRef.current = null;
        }
      }

      if (effectiveIsVoiceMode) {
        console.log(`[MSG] Voice mode processing - autoPlayVoice: ${autoPlayVoice}, canUseAnyTTS: ${canUseAnyTTS}`);

        if (autoPlayVoice && canUseAnyTTS) {
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
        if (data.notification) {
          console.log("[MSG] Advisor notification result:", data.notification);
        }
      }

      console.log("[MSG] 📊 Analysis:", data.customer_analysis);
    } catch (err) {
      console.log("[MSG] ❌ Network error:", err.message);
      setError("Network error: " + err.message);
      console.error(err);
    } finally {
      messageInFlightRef.current = false;
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

        <div className="mb-4 space-y-2">
          <label className="block text-sm font-medium">Use CRM Customer</label>
          <select
            value={selectedCustomerId}
            onChange={(event) => applySelectedCustomerProfile(event.target.value)}
            disabled={!!sessionId || isLoadingCustomers}
            className="mt-1 w-full rounded border px-3 py-2"
          >
            <option value="">
              {isLoadingCustomers ? "Loading customers..." : "Custom profile (manual entry)"}
            </option>
            {customerOptions.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {buildCustomerOptionLabel(customer)}
              </option>
            ))}
          </select>
          {!isLoadingCustomers && customerOptions.length > 0 && (
            <p className="text-xs text-slate-600">
              Loaded {customerOptions.length} customers. Select one to auto-fill profile fields.
            </p>
          )}
          {!!customersLoadError && (
            <p className="text-xs text-amber-700">
              {customersLoadError}
            </p>
          )}
        </div>

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
                disabled={!canUseAnyTTS}
              />
              <span className="ml-2">
                Play AI voice{!canUseAnyTTS ? " (not supported in this browser)" : ""}
              </span>
            </label>
          )}
        </div>
        {isVoiceMode && canUseAnyTTS && selectedVoiceLabel && (
          <p className="mt-2 text-xs text-slate-600">
            Active voice: {selectedVoiceLabel}
          </p>
        )}

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

      {isSuperAdmin && voiceWarning && (
        <Card className="border-amber-300 bg-amber-50 p-4">
          <p className="text-sm text-amber-900">⚠️ {voiceWarning}</p>
        </Card>
      )}

      {/* Conversation Display */}
      {sessionId && (
        <Card className="p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex flex-col gap-1">
              <h2 className="text-lg font-semibold">
                {isVoiceMode ? "🎤 Voice Call" : "💬 Chat"}
              </h2>
              {getActiveCustomerBadgeText() && (
                <p className="inline-flex w-fit rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
                  Customer: {getActiveCustomerBadgeText()}
                </p>
              )}
            </div>
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
            {isVoiceMode && canUseAnyTTS && (
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
      {/* <Card className="border-blue-200 bg-blue-50 p-4">
        <p className="text-sm text-blue-900">
          ℹ️ This uses OpenAI&apos;s intelligent API (like ChatGPT) to understand
          context naturally - not just keywords.{isVoiceMode && " Voice mode uses browser speech recognition and can be integrated with Twilio for real phone calls."}
        </p>
      </Card> */}
    </div>
  );
}
