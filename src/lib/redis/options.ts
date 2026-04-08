import type { RedisOptions } from "ioredis";

/**
 * Returns ioredis constructor options from either REDIS_URL (Upstash / any managed provider)
 * or individual REDIS_HOST / REDIS_PORT / REDIS_PASSWORD env vars (local dev).
 *
 * REDIS_URL takes precedence. TLS is enabled automatically for rediss:// URLs.
 */
export function getRedisOptions(extra: Partial<RedisOptions> = {}): RedisOptions {
  const url = process.env.REDIS_URL;
  if (url) {
    const parsed = new URL(url);
    const opts: Partial<RedisOptions> = {
      host: parsed.hostname,
      port: Number(parsed.port) || 6379,
      password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
      username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
    };
    if (url.startsWith("rediss://")) {
      opts.tls = {};
    }
    return { ...opts, ...extra };
  }

  return {
    host: process.env.REDIS_HOST || "127.0.0.1",
    port: Number(process.env.REDIS_PORT || 6379),
    password: process.env.REDIS_PASSWORD || undefined,
    ...extra,
  };
}
