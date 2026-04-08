import Redis from "ioredis";
import { getRedisOptions } from "@/lib/redis/options";

let redisClient: Redis | null = null;
let connectingPromise: Promise<Redis | null> | null = null;
let redisUnavailableUntil = 0;

async function getRedisClient(): Promise<Redis | null> {
  if (process.env.DISABLE_REDIS === "true") return null;
  if (Date.now() < redisUnavailableUntil) return null;
  if (redisClient) return redisClient;
  if (connectingPromise) return connectingPromise;

  connectingPromise = (async () => {
    try {
      const client = new Redis(getRedisOptions({ maxRetriesPerRequest: 1, lazyConnect: true }));
      client.on("error", () => { redisClient = null; });
      await client.connect();
      redisUnavailableUntil = 0;
      redisClient = client;
      return client;
    } catch {
      redisUnavailableUntil = Date.now() + 30_000;
      redisClient = null;
      return null;
    } finally {
      connectingPromise = null;
    }
  })();
  return connectingPromise;
}

export async function getCached<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>
): Promise<T> {
  const redis = await getRedisClient();

  if (redis) {
    try {
      const cached = await redis.get(key);
      if (cached) return JSON.parse(cached) as T;
    } catch {}
  }

  const value = await fetcher();

  if (redis) {
    try {
      await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
    } catch {}
  }

  return value;
}

export async function invalidateCache(...keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  const redis = await getRedisClient();
  if (!redis) return;
  try {
    await redis.del(...keys);
  } catch {}
}
