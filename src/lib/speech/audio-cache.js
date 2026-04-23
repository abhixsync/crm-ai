import Redis from "ioredis";
import { getRedisOptions } from "@/lib/redis/options";
import { randomUUID } from "node:crypto";

const AUDIO_TTL_SECONDS = 60;
const KEY_PREFIX = "audio-clip:";
const memoryStore = new Map();
let redisClient = null;
let redisUnavailableUntil = 0;

async function getRedis() {
  if (process.env.DISABLE_REDIS === "true") return null;
  if (Date.now() < redisUnavailableUntil) return null;
  if (redisClient) return redisClient;
  try {
    redisClient = new Redis(getRedisOptions({ maxRetriesPerRequest: 1, lazyConnect: true }));
    await redisClient.connect();
    return redisClient;
  } catch {
    redisUnavailableUntil = Date.now() + 30_000;
    if (redisClient) { try { redisClient.disconnect(); } catch {} }
    redisClient = null;
    return null;
  }
}

// Store audio buffer, returns UUID id
export async function storeAudio(buffer, mimeType = "audio/mpeg") {
  const id = randomUUID();
  const key = `${KEY_PREFIX}${id}`;
  const payload = JSON.stringify({ audio: buffer.toString("base64"), mimeType });
  try {
    const redis = await getRedis();
    if (redis) {
      await redis.setex(key, AUDIO_TTL_SECONDS, payload);
      return id;
    }
  } catch {}
  // memory fallback
  memoryStore.set(id, { buffer, mimeType });
  setTimeout(() => memoryStore.delete(id), AUDIO_TTL_SECONDS * 1000);
  return id;
}

// Get audio by id — returns { buffer, mimeType } or null
export async function getAudio(id) {
  const key = `${KEY_PREFIX}${id}`;
  try {
    const redis = await getRedis();
    if (redis) {
      const raw = await redis.get(key);
      if (!raw) return null;
      const { audio, mimeType } = JSON.parse(raw);
      return { buffer: Buffer.from(audio, "base64"), mimeType };
    }
  } catch {}
  const entry = memoryStore.get(id);
  if (!entry) return null;
  return { buffer: entry.buffer, mimeType: entry.mimeType };
}
