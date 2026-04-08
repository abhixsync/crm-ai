import Redis from "ioredis";

let pubClient: Redis | null = null;

function getPublisher(): Redis | null {
  if (process.env.DISABLE_REDIS === "true") return null;
  if (pubClient && pubClient.status !== "end" && pubClient.status !== "close") {
    return pubClient;
  }
  pubClient = new Redis({
    host: process.env.REDIS_HOST || "127.0.0.1",
    port: Number(process.env.REDIS_PORT || 6379),
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: 1,
    lazyConnect: false,
  });
  pubClient.on("error", () => {
    pubClient = null;
  });
  return pubClient;
}

export async function publishEvent(
  tenantId: string,
  event: { type: string; payload?: unknown }
): Promise<void> {
  const client = getPublisher();
  if (!client) return;
  try {
    await client.publish(`realtime:${tenantId}`, JSON.stringify(event));
  } catch {
    // Fire-and-forget — never surface errors to callers
  }
}

export function createRedisSubscriber(): Redis | null {
  if (process.env.DISABLE_REDIS === "true") return null;
  const client = new Redis({
    host: process.env.REDIS_HOST || "127.0.0.1",
    port: Number(process.env.REDIS_PORT || 6379),
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: 1,
  });
  client.on("error", () => {});
  return client;
}
