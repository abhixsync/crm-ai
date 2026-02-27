import fs from "node:fs/promises";
import path from "node:path";
import Redis from "ioredis";
import { prisma } from "@/lib/prisma";

const CACHE_TTL_MS = 10 * 60 * 1000;
const memoryCache = new Map<string, { value: ActiveTheme; expiresAt: number }>();

let redisClient: Redis | null = null;
let redisUnavailableUntil = 0;

export type ActiveTheme = {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  loginBackgroundUrl: string | null;
  tenantId: string | null;
  source: "default" | "tenant";
  updatedAt: string | null;
};

export type ThemeUpdatePayload = {
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  logoUrl?: string | null;
  faviconUrl?: string | null;
  loginBackgroundUrl?: string | null;
};

const DEFAULT_THEME: ActiveTheme = {
  primaryColor: "#2563eb",
  secondaryColor: "#64748b",
  accentColor: "#22c55e",
  logoUrl: null,
  faviconUrl: null,
  loginBackgroundUrl: null,
  tenantId: null,
  source: "default",
  updatedAt: null,
};

function getCacheKey(tenantId: string) {
  return `theme:${tenantId}`;
}

function normalizeColor(input: unknown, fallback: string) {
  const value = String(input || "").trim();
  if (!value) return fallback;
  if (/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(value)) return value;
  return fallback;
}

function normalizeTheme(theme: any, tenantId: string | null): ActiveTheme {
  if (!theme) {
    return {
      ...DEFAULT_THEME,
      tenantId,
    };
  }

  return {
    primaryColor: normalizeColor(theme.primaryColor, DEFAULT_THEME.primaryColor),
    secondaryColor: normalizeColor(theme.secondaryColor, DEFAULT_THEME.secondaryColor),
    accentColor: normalizeColor(theme.accentColor, DEFAULT_THEME.accentColor),
    logoUrl: theme.logoUrl || null,
    faviconUrl: theme.faviconUrl || null,
    loginBackgroundUrl: theme.loginBackgroundUrl || null,
    tenantId,
    source: "tenant",
    updatedAt: theme.updatedAt ? new Date(theme.updatedAt).toISOString() : null,
  };
}

async function getRedisClient() {
  if (Date.now() < redisUnavailableUntil) {
    return null;
  }

  if (redisClient) return redisClient;

  try {
    redisClient = new Redis({
      host: process.env.REDIS_HOST || "127.0.0.1",
      port: Number(process.env.REDIS_PORT || 6379),
      password: process.env.REDIS_PASSWORD || undefined,
      maxRetriesPerRequest: 1,
      lazyConnect: true,
    });

    await redisClient.connect();
    return redisClient;
  } catch {
    redisUnavailableUntil = Date.now() + 30000;
    if (redisClient) {
      try {
        redisClient.disconnect();
      } catch {}
    }
    redisClient = null;
    return null;
  }
}

async function readCache(tenantId: string): Promise<ActiveTheme | null> {
  const key = getCacheKey(tenantId);
  const local = memoryCache.get(key);

  if (local && local.expiresAt > Date.now()) {
    return local.value;
  }

  const redis = await getRedisClient();
  if (!redis) return null;

  try {
    const payload = await redis.get(key);
    if (!payload) return null;
    const parsed = JSON.parse(payload) as ActiveTheme;
    memoryCache.set(key, { value: parsed, expiresAt: Date.now() + CACHE_TTL_MS });
    return parsed;
  } catch {
    return null;
  }
}

async function writeCache(tenantId: string, value: ActiveTheme) {
  const key = getCacheKey(tenantId);
  memoryCache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });

  const redis = await getRedisClient();
  if (!redis) return;

  try {
    await redis.set(key, JSON.stringify(value), "EX", Math.floor(CACHE_TTL_MS / 1000));
  } catch {}
}

export async function invalidateThemeCache(tenantId: string) {
  const key = getCacheKey(tenantId);
  memoryCache.delete(key);

  const redis = await getRedisClient();
  if (!redis) return;

  try {
    await redis.del(key);
  } catch {}
}

export async function getActiveTheme(tenantId: string | null) {
  if (!tenantId) {
    return { ...DEFAULT_THEME, source: "default", tenantId: null };
  }

  const cached = await readCache(tenantId);
  if (cached) return cached;

  const theme = await prisma.tenantTheme.findFirst({
    where: { tenantId, isActive: true },
    orderBy: { updatedAt: "desc" },
  });

  const normalized = normalizeTheme(theme, tenantId);
  await writeCache(tenantId, normalized);
  return normalized;
}

export async function updateTenantTheme(tenantId: string, payload: ThemeUpdatePayload) {
  const existing = await prisma.tenantTheme.findFirst({
    where: { tenantId, isActive: true },
    orderBy: { updatedAt: "desc" },
  });

  const updateData = {
    primaryColor: normalizeColor(payload.primaryColor, existing?.primaryColor || DEFAULT_THEME.primaryColor),
    secondaryColor: normalizeColor(payload.secondaryColor, existing?.secondaryColor || DEFAULT_THEME.secondaryColor),
    accentColor: normalizeColor(payload.accentColor, existing?.accentColor || DEFAULT_THEME.accentColor),
    logoUrl: payload.logoUrl !== undefined ? payload.logoUrl : existing?.logoUrl || null,
    faviconUrl: payload.faviconUrl !== undefined ? payload.faviconUrl : existing?.faviconUrl || null,
    loginBackgroundUrl:
      payload.loginBackgroundUrl !== undefined ? payload.loginBackgroundUrl : existing?.loginBackgroundUrl || null,
    isActive: true,
  };

  if (existing) {
    await prisma.tenantTheme.update({ where: { id: existing.id }, data: updateData });
  } else {
    await prisma.tenantTheme.create({ data: { tenantId, ...updateData } });
  }

  await invalidateThemeCache(tenantId);
  return getActiveTheme(tenantId);
}

function sanitizeFileName(fileName: string) {
  const base = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${Date.now()}_${base}`;
}

export async function uploadThemeAsset(tenantId: string, file: File) {
  const buffer = Buffer.from(await file.arrayBuffer());
  const assetDir = path.join(process.cwd(), "public", "uploads", "themes", tenantId);
  await fs.mkdir(assetDir, { recursive: true });

  const safeName = sanitizeFileName(file.name || "asset.bin");
  const absolutePath = path.join(assetDir, safeName);
  await fs.writeFile(absolutePath, buffer);

  return `/uploads/themes/${tenantId}/${safeName}`;
}

export function getDefaultTheme() {
  return { ...DEFAULT_THEME };
}
