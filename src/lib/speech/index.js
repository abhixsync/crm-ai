import { createClient as createDeepgramClient } from "@deepgram/sdk";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

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

export async function synthesizeSpeech(text) {
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