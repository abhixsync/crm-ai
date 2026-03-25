/**
 * Google Cloud Text-to-Speech integration
 * Used for standalone TTS (simulator audio, non-Twilio playback).
 * For Twilio calls, use the built-in Google voices via <Say voice="Google.hi-IN-Wavenet-A">.
 */

export const GOOGLE_TTS_VOICES = {
  HINDI_FEMALE_WAVENET: { languageCode: "hi-IN", name: "hi-IN-Wavenet-A" },
  HINDI_MALE_WAVENET: { languageCode: "hi-IN", name: "hi-IN-Wavenet-B" },
  HINDI_FEMALE_NEURAL: { languageCode: "hi-IN", name: "hi-IN-Neural2-A" },
  ENGLISH_INDIA_FEMALE: { languageCode: "en-IN", name: "en-IN-Wavenet-A" },
  ENGLISH_INDIA_MALE: { languageCode: "en-IN", name: "en-IN-Wavenet-B" },
};

export const DEFAULT_VOICE = GOOGLE_TTS_VOICES.HINDI_FEMALE_WAVENET;

/**
 * Synthesize speech using Google Cloud TTS REST API.
 * @param {string} text - Text to convert to speech
 * @param {object} options - { languageCode, voiceName, speakingRate, pitch }
 * @returns {Promise<{ audioContent: string, contentType: string } | null>} Base64 audio or null
 */
export async function synthesizeWithGoogleTTS(text, options = {}) {
  const apiKey = process.env.GOOGLE_CLOUD_TTS_API_KEY;
  if (!apiKey) {
    return null;
  }

  const voice = {
    languageCode: options.languageCode || DEFAULT_VOICE.languageCode,
    name: options.voiceName || DEFAULT_VOICE.name,
  };

  const audioConfig = {
    audioEncoding: "MP3",
    speakingRate: options.speakingRate || 0.95,
    pitch: options.pitch || 0,
  };

  try {
    const response = await fetch(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: { text },
          voice,
          audioConfig,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error("[google-tts] API error:", response.status, error);
      return null;
    }

    const data = await response.json();
    return {
      audioContent: data.audioContent, // base64-encoded MP3
      contentType: "audio/mpeg",
    };
  } catch (error) {
    console.error("[google-tts] Error:", error.message);
    return null;
  }
}
