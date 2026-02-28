import fs from "node:fs/promises";
import path from "node:path";
import Redis from "ioredis";
import { prisma } from "@/lib/prisma";
import { SYSTEM_THEME_DEFAULT, EditableTheme, ThemeTokens, ensureThemeTokens } from "@/core/theme/system-defaults";

const CACHE_TTL_MS = 10 * 60 * 1000;
const memoryCache = new Map<string, { value: ActiveTheme; expiresAt: number }>();

let redisClient: Redis | null = null;
let redisUnavailableUntil = 0;

// 🎨 MUTABLE SYSTEM DEFAULT - For merging operations
const MUTABLE_SYSTEM_DEFAULT: ThemeTokens = {
  tenantId: null,
  isBaseTheme: false,
  themeName: "System Default",
  primaryColor: "#2563eb",
  secondaryColor: "#64748b",
  accentColor: "#22c55e",
  backgroundColor: "#f8fafc",
  surfaceColor: "#ffffff",
  sidebarColor: "#ffffff",
  headerColor: "#ffffff",
  textPrimary: "#0f172a",
  textSecondary: "#64748b",
  borderColor: "#e2e8f0",
  successColor: "#22c55e",
  warningColor: "#f59e0b",
  errorColor: "#ef4444",
  infoColor: "#3b82f6",
  fontFamily: "Inter, system-ui, sans-serif",
  fontScale: "medium",
  borderRadius: "8px",
  buttonRadius: "6px",
  cardRadius: "8px",
  inputRadius: "6px",
  shadowIntensity: "medium",
  layoutDensity: "comfortable",
  sidebarStyle: "default",
  tableStyle: "default",
  darkMode: false,
  logoUrl: null,
  faviconUrl: null,
  loginBackgroundUrl: null,
  applicationBackgroundUrl: null,
  customCss: null,
  isActive: true,
};

// 🎨 ACTIVE THEME - What gets sent to UI
export type ActiveTheme = ThemeTokens & {
  source: "default" | "base" | "tenant";
  updatedAt: string | null;
};

// 🔄 THEME UPDATE PAYLOAD - For API updates
export type ThemeUpdatePayload = Partial<ThemeTokens>;

// 🗝️ CACHE KEY GENERATION
function getCacheKey(tenantId: string | null) {
  return `theme:${tenantId || "null"}`;
}

// 🔄 DEEP MERGE UTILITY
function deepMerge<T extends Record<string, any>>(target: T, source: Partial<T>): T {
  const result = { ...target };

  for (const key in source) {
    if (source[key] !== undefined && source[key] !== null) {
      result[key] = source[key];
    }
  }

  return result;
}

// 🎯 THEME RESOLVER - CORE INHERITANCE LOGIC
export async function resolveTenantTheme(tenantId: string | null): Promise<ActiveTheme> {
  // 1️⃣ Try cache first
  const cacheKey = getCacheKey(tenantId);
  const cached = await readCache(cacheKey);
  if (cached) return cached;

  // 2️⃣ Load tenant override (if tenantId provided)
  let tenantOverride: Partial<ThemeTokens> | null = null;
  let tenantOverrideUpdatedAt: string | null = null;
  if (tenantId) {
    const tenantTheme = await prisma.tenantTheme.findFirst({
      where: { tenantId, isBaseTheme: false, isActive: true },
      orderBy: { updatedAt: "desc" },
    });
    if (tenantTheme) {
      const { id, tenantId: _, createdAt, updatedAt, ...themeData } = tenantTheme;

      // Only include fields that differ from system defaults (i.e., were explicitly customized)
      const customizedFields: Partial<ThemeTokens> = {};
      Object.keys(themeData).forEach(key => {
        if (key in MUTABLE_SYSTEM_DEFAULT) {
          const systemValue = (MUTABLE_SYSTEM_DEFAULT as any)[key];
          const tenantValue = (themeData as any)[key];
          if (tenantValue !== systemValue) {
            (customizedFields as any)[key] = tenantValue;
          }
        }
      });

      tenantOverride = customizedFields;
      tenantOverrideUpdatedAt = updatedAt.toISOString();
    }
  }

  // 3️⃣ Load base theme (global defaults)
  const baseTheme = await prisma.tenantTheme.findFirst({
    where: { isBaseTheme: true, isActive: true },
    orderBy: { updatedAt: "desc" },
  });
  const baseThemeTokens: Partial<ThemeTokens> = baseTheme ? {
    tenantId: baseTheme.tenantId,
    isBaseTheme: baseTheme.isBaseTheme,
    themeName: baseTheme.themeName,
    primaryColor: baseTheme.primaryColor,
    secondaryColor: baseTheme.secondaryColor,
    accentColor: baseTheme.accentColor,
    backgroundColor: baseTheme.backgroundColor,
    surfaceColor: baseTheme.surfaceColor,
    sidebarColor: baseTheme.sidebarColor,
    headerColor: baseTheme.headerColor,
    textPrimary: baseTheme.textPrimary,
    textSecondary: baseTheme.textSecondary,
    borderColor: baseTheme.borderColor,
    successColor: baseTheme.successColor,
    warningColor: baseTheme.warningColor,
    errorColor: baseTheme.errorColor,
    infoColor: baseTheme.infoColor,
    fontFamily: baseTheme.fontFamily,
    fontScale: baseTheme.fontScale,
    borderRadius: baseTheme.borderRadius,
    buttonRadius: baseTheme.buttonRadius,
    cardRadius: baseTheme.cardRadius,
    inputRadius: baseTheme.inputRadius,
    shadowIntensity: baseTheme.shadowIntensity,
    layoutDensity: baseTheme.layoutDensity,
    sidebarStyle: baseTheme.sidebarStyle,
    tableStyle: baseTheme.tableStyle,
    darkMode: baseTheme.darkMode,
    logoUrl: baseTheme.logoUrl,
    faviconUrl: baseTheme.faviconUrl,
    loginBackgroundUrl: baseTheme.loginBackgroundUrl,
    applicationBackgroundUrl: baseTheme.applicationBackgroundUrl,
    customCss: baseTheme.customCss,
    isActive: baseTheme.isActive,
  } : {};

  // 4️⃣ Resolve inheritance: Tenant Override → Base Theme → System Default
  const resolvedTokens = deepMerge(
    deepMerge(MUTABLE_SYSTEM_DEFAULT, baseThemeTokens),
    tenantOverride || {}
  );

  // 5️⃣ Build active theme response
  const activeTheme: ActiveTheme = {
    ...resolvedTokens,
    source: tenantOverride ? "tenant" : baseTheme ? "base" : "default",
    updatedAt: tenantOverrideUpdatedAt ||
               (baseTheme ? new Date(baseTheme.updatedAt).toISOString() : null),
  };

  // 6️⃣ Cache and return
  await writeCache(cacheKey, activeTheme);
  return activeTheme;
}

// 📥 LEGACY getActiveTheme - BACKWARD COMPATIBILITY
export async function getActiveTheme(tenantId: string | null): Promise<ActiveTheme> {
  return resolveTenantTheme(tenantId);
}

// 🧹 LEGACY FUNCTIONS - DEPRECATED (keeping for compatibility)
function normalizeColor(input: unknown, fallback: string) {
  const value = String(input || "").trim();
  if (!value) return fallback;
  if (/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(value)) return value;
  return fallback;
}

function normalizeTheme(theme: any, tenantId: string | null): ActiveTheme {
  if (!theme) {
    return {
      ...SYSTEM_THEME_DEFAULT,
      tenantId,
      source: "default",
    };
  }

  return {
    ...SYSTEM_THEME_DEFAULT,
    primaryColor: normalizeColor(theme.primaryColor, SYSTEM_THEME_DEFAULT.primaryColor),
    secondaryColor: normalizeColor(theme.secondaryColor, SYSTEM_THEME_DEFAULT.secondaryColor),
    accentColor: normalizeColor(theme.accentColor, SYSTEM_THEME_DEFAULT.accentColor),
    logoUrl: theme.logoUrl || null,
    faviconUrl: theme.faviconUrl || null,
    loginBackgroundUrl: theme.loginBackgroundUrl || null,
    applicationBackgroundUrl: theme.applicationBackgroundUrl || null,
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

export async function invalidateThemeCache(tenantId: string | null) {
  const key = getCacheKey(tenantId);
  memoryCache.delete(key);

  const redis = await getRedisClient();
  if (!redis) return;

  try {
    await redis.del(key);
  } catch {}
}

// 🎨 UPDATE THEME - Supports both base themes and tenant overrides
export async function updateTenantTheme(
  tenantId: string | null,
  payload: ThemeUpdatePayload,
  isBaseTheme: boolean = false
) {
  // Validate constraints
  if (isBaseTheme && tenantId !== null) {
    throw new Error("Base theme must have null tenantId");
  }
  if (!isBaseTheme && tenantId === null) {
    throw new Error("Tenant override must have non-null tenantId");
  }

  // Find existing theme (active or inactive)
  const existing = await prisma.tenantTheme.findFirst({
    where: {
      tenantId,
      isBaseTheme,
    },
    orderBy: { updatedAt: "desc" },
  });

  // Prepare update data with safe defaults
  const updateData = {
    ...payload,
    isBaseTheme,
    isActive: true,
  };

  if (existing) {
    // Update existing record (reactivates if it was inactive)
    await prisma.tenantTheme.update({
      where: { id: existing.id },
      data: updateData
    });
  } else {
    // Create new record
    await prisma.tenantTheme.create({
      data: {
        tenantId,
        ...updateData,
      },
    });
  }

  // Invalidate cache for affected tenants
  if (isBaseTheme) {
    // Base theme change affects all tenants - clear all caches
    memoryCache.clear();
    const redis = await getRedisClient();
    if (redis) {
      try {
        // Clear all theme caches (this is a broad invalidation)
        const keys = await redis.keys("theme:*");
        if (keys.length > 0) {
          await redis.del(...keys);
        }
      } catch {}
    }
  } else {
    // Tenant override change only affects this tenant
    await invalidateThemeCache(tenantId);
  }

  return resolveTenantTheme(tenantId);
}

// 🖼️ UPLOAD THEME ASSET
function sanitizeFileName(fileName: string) {
  const base = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${Date.now()}_${base}`;
}

export async function uploadThemeAsset(tenantId: string | null, file: File) {
  const targetTenantId = tenantId || "global"; // Use "global" for base theme assets
  const buffer = Buffer.from(await file.arrayBuffer());
  const assetDir = path.join(process.cwd(), "public", "uploads", "themes", targetTenantId);
  await fs.mkdir(assetDir, { recursive: true });

  const safeName = sanitizeFileName(file.name || "asset.bin");
  const absolutePath = path.join(assetDir, safeName);
  await fs.writeFile(absolutePath, buffer);

  return `/uploads/themes/${targetTenantId}/${safeName}`;
}

// 🏷️ GET DEFAULT THEME (LEGACY)
export function getDefaultTheme() {
  return { ...SYSTEM_THEME_DEFAULT, source: "default" as const, updatedAt: null };
}

// 🔄 RESET TENANT THEME TO DEFAULT - Delete tenant override to inherit from base theme
export async function resetTenantTheme(tenantId: string) {
  if (!tenantId) {
    throw new Error("Tenant ID is required to reset theme");
  }

  // Find and deactivate the tenant's theme override
  const existing = await prisma.tenantTheme.findFirst({
    where: {
      tenantId,
      isBaseTheme: false,
      isActive: true,
    },
    orderBy: { updatedAt: "desc" },
  });

  if (existing) {
    await prisma.tenantTheme.update({
      where: { id: existing.id },
      data: { isActive: false },
    });
  }

  // Invalidate cache for this tenant
  await invalidateThemeCache(tenantId);

  return resolveTenantTheme(tenantId);
}

// 🔍 CHECK IF TENANT HAS CUSTOM THEME
export async function hasTenantCustomTheme(tenantId: string): Promise<boolean> {
  if (!tenantId) return false;

  const count = await prisma.tenantTheme.count({
    where: {
      tenantId,
      isBaseTheme: false,
      isActive: true,
    },
  });

  return count > 0;
}

// 📊 GET TENANT THEME STATUS - For UI display
export async function getTenantThemeStatus(tenantId: string) {
  const hasCustom = await hasTenantCustomTheme(tenantId);
  const activeTheme = await resolveTenantTheme(tenantId);

  return {
    hasCustomTheme: hasCustom,
    source: activeTheme.source,
    updatedAt: activeTheme.updatedAt,
    canReset: hasCustom,
  };
}
