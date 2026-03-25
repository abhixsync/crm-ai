import { createClient as createDeepgramClient } from "@deepgram/sdk";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { synthesizeWithGoogleTTS } from "@/lib/speech/google-tts";

export async function transcribeAudio(buffer, mimeType = "audio/wav") {
  if (!process.env.DEEPGRAM_API_KEY) {
    return "";
  }

  const deepgram = createDeepgramClient(process.env.DEEPGRAM_API_KEY);
  const response = await deepgram.listen.prerecorded.transcribeFile(buffer, {
    model: "nova-2",
    mimetype: mimeType,
  });

  return (
    response?.result?.results?.channels?.[0]?.alternatives?.[0]?.transcript ||
    ""
  );
}

/**
 * Synthesize speech: Google Cloud TTS (preferred) → ElevenLabs (fallback).
 * Returns base64 audio content or ElevenLabs stream, or null if neither is configured.
 */
export async function synthesizeSpeech(text, options = {}) {
  // Try Google Cloud TTS first (cheaper, better Hindi voices)
  const googleResult = await synthesizeWithGoogleTTS(text, options);
  if (googleResult) {
    return googleResult;
  }

  // Fall back to ElevenLabs
  if (!process.env.ELEVENLABS_API_KEY) {
    return null;
  }

  const client = new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY });
  return client.generate({
    voice: "Rachel",
    text,
    modelId: "eleven_multilingual_v2",
  });
}