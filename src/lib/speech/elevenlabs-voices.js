import { prisma } from "@/lib/prisma";
import { getCached, invalidateCache } from "@/lib/cache/api-cache";

export const DEFAULT_ELEVENLABS_VOICE_ID = "MF3mGyEYCl7XYWbV9V6H"; // Elli
export const DEFAULT_ELEVENLABS_MODEL = "eleven_multilingual_v2";
export const ELEVENLABS_TURBO_MODEL = "eleven_turbo_v2_5";

export const ELEVENLABS_FEMALE_VOICES = [
  { id: "MF3mGyEYCl7XYWbV9V6H", name: "Elli",      description: "Sweet, gentle — ideal for Hindi loan calls" },
  { id: "AZnzlk1XvdvUBZXUNXIN", name: "Domi",      description: "Warm, confident, engaging" },
  { id: "EXAVITQu4vr4xnSDxMaL", name: "Bella",     description: "Soft, young, friendly" },
  { id: "21m00Tcm4TlvDq8ikWAM", name: "Rachel",    description: "Clear, professional, neutral" },
  { id: "ThT5KcBeYPX3keUQqHPh", name: "Dorothy",   description: "Warm, mature, British" },
  { id: "XrExE9yKIg1WjnnlVkGX", name: "Matilda",   description: "Warm, friendly, natural" },
  { id: "oWAxZDx7w5VEj9dCyTzz", name: "Grace",     description: "Nurturing, Southern warmth" },
  { id: "XB0fDUnXU5powFXDhCwa", name: "Charlotte", description: "Expressive, multilingual" },
  { id: "9BWtsMINqrJLrRacOk9x", name: "Aria",      description: "Natural, conversational" },
  { id: "Xb7hH8MSUJpSbSDYk0k2", name: "Alice",     description: "Confident, articulate" },
];

const VOICE_SETTING_KEY = "ELEVENLABS_VOICE";

export async function getTenantVoiceId(tenantId) {
  if (!tenantId) return DEFAULT_ELEVENLABS_VOICE_ID;
  return getCached(`tenant-voice:${tenantId}`, 300, async () => {
    try {
      const setting = await prisma.automationSetting.findUnique({
        where: { tenantId_key: { tenantId, key: VOICE_SETTING_KEY } },
      });
      return setting?.value?.voiceId || DEFAULT_ELEVENLABS_VOICE_ID;
    } catch {
      return DEFAULT_ELEVENLABS_VOICE_ID;
    }
  });
}

export async function setTenantVoiceId(tenantId, voiceId) {
  const voice = ELEVENLABS_FEMALE_VOICES.find((v) => v.id === voiceId);
  if (!voice) throw new Error(`Invalid voice ID: ${voiceId}`);
  await prisma.automationSetting.upsert({
    where: { tenantId_key: { tenantId, key: VOICE_SETTING_KEY } },
    create: { tenantId, key: VOICE_SETTING_KEY, value: { voiceId, voiceName: voice.name } },
    update: { value: { voiceId, voiceName: voice.name } },
  });
  await invalidateCache(`tenant-voice:${tenantId}`);
}
