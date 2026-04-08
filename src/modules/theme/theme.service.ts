import fs from "node:fs/promises";
import path from "node:path";
import Redis from "ioredis";
import { prisma } from "@/lib/prisma";
import { isDatabaseUnavailable } from "@/lib/server/database-error";
import { SYSTEM_THEME_DEFAULT, EditableTheme, ThemeTokens } from "@/core/theme/system-defaults";

const CACHE_TTL_MS = 10 * 60 * 1000;

let redisClient: Redis | null = null;
let redisUnavailableUntil = 0;
let dbUnavailableUntil = 0;
const DB_UNAVAILABLE_COOLDOWN_MS = 15000;

// 🎨 MUTABLE SYSTEM DEFAULT - Canonical defaults aligned with core theme constants.
const MUTABLE_SYSTEM_DEFAULT: ThemeTokens = {
  tenantId: SYSTEM_THEME_DEFAULT.tenantId,
  isBaseTheme: SYSTEM_THEME_DEFAULT.isBaseTheme,
  themeName: SYSTEM_THEME_DEFAULT.themeName,
  primaryColor: SYSTEM_THEME_DEFAULT.primaryColor,
  secondaryColor: SYSTEM_THEME_DEFAULT.secondaryColor,
  accentColor: SYSTEM_THEME_DEFAULT.accentColor,
  backgroundColor: SYSTEM_THEME_DEFAULT.backgroundColor,
  surfaceColor: SYSTEM_THEME_DEFAULT.surfaceColor,
  sidebarColor: SYSTEM_THEME_DEFAULT.sidebarColor,
  headerColor: SYSTEM_THEME_DEFAULT.headerColor,
  textPrimary: SYSTEM_THEME_DEFAULT.textPrimary,
  textSecondary: SYSTEM_THEME_DEFAULT.textSecondary,
  borderColor: SYSTEM_THEME_DEFAULT.borderColor,
  successColor: SYSTEM_THEME_DEFAULT.successColor,
  warningColor: SYSTEM_THEME_DEFAULT.warningColor,
  errorColor: SYSTEM_THEME_DEFAULT.errorColor,
  infoColor: SYSTEM_THEME_DEFAULT.infoColor,
  fontFamily: SYSTEM_THEME_DEFAULT.fontFamily,
  fontScale: SYSTEM_THEME_DEFAULT.fontScale,
  borderRadius: SYSTEM_THEME_DEFAULT.borderRadius,
  buttonRadius: SYSTEM_THEME_DEFAULT.buttonRadius,
  cardRadius: SYSTEM_THEME_DEFAULT.cardRadius,
  inputRadius: SYSTEM_THEME_DEFAULT.inputRadius,
  shadowIntensity: SYSTEM_THEME_DEFAULT.shadowIntensity,
  layoutDensity: SYSTEM_THEME_DEFAULT.layoutDensity,
  sidebarStyle: SYSTEM_THEME_DEFAULT.sidebarStyle,
  tableStyle: SYSTEM_THEME_DEFAULT.tableStyle,
  darkMode: SYSTEM_THEME_DEFAULT.darkMode,
  logoUrl: SYSTEM_THEME_DEFAULT.logoUrl,
  faviconUrl: SYSTEM_THEME_DEFAULT.faviconUrl,
  loginBackgroundUrl: SYSTEM_THEME_DEFAULT.loginBackgroundUrl,
  applicationBackgroundUrl: SYSTEM_THEME_DEFAULT.applicationBackgroundUrl,
  brandName: SYSTEM_THEME_DEFAULT.brandName,
  brandTagline: SYSTEM_THEME_DEFAULT.brandTagline,
  emailFromName: SYSTEM_THEME_DEFAULT.emailFromName,
  customCss: SYSTEM_THEME_DEFAULT.customCss,
  uiLayout: SYSTEM_THEME_DEFAULT.uiLayout,
  isActive: SYSTEM_THEME_DEFAULT.isActive,
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

function normalizeThemeTokens(source: Partial<ThemeTokens> | null | undefined): ThemeTokens {
  const resolved = { ...MUTABLE_SYSTEM_DEFAULT };
  const candidate = source || {};

  for (const key of Object.keys(MUTABLE_SYSTEM_DEFAULT)) {
    const value = (candidate as any)[key];
    if (value !== undefined) {
      (resolved as any)[key] = value;
    }
  }

  return resolved;
}

function mergeDefinedValues<T extends Record<string, any>>(target: T, source: Partial<T>): T {
  const merged = { ...target };

  for (const [key, value] of Object.entries(source || {})) {
    if (value !== undefined) {
      (merged as any)[key] = value;
    }
  }

  return merged;
}

// 🎯 THEME RESOLVER - CORE INHERITANCE LOGIC
export async function resolveTenantTheme(tenantId: string | null): Promise<ActiveTheme> {
  const fallbackTheme: ActiveTheme = {
    ...MUTABLE_SYSTEM_DEFAULT,
    tenantId,
    source: "default",
    updatedAt: null,
  };

  // 1️⃣ Try cache first
  const cached = await readCache(tenantId || "null");
  if (cached) {
    return cached;
  }

  // 1.5️⃣ During transient database outages, return defaults without querying repeatedly.
  if (Date.now() < dbUnavailableUntil) {
    return fallbackTheme;
  }

  try {
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

        // Only include tenant values that differ from the system default.
        // Because updateTenantTheme normalises the full record (all columns are
        // written, including unset fields which get the system default), a value
        // that equals the system default means "tenant never explicitly set this"
        // and should fall through to the base theme for proper inheritance.
        // Fields in BASE_THEME_ONLY are always excluded — they are SUPER_ADMIN-only.
        const BASE_THEME_ONLY = new Set(["uiLayout"]);
        const customizedFields: Partial<ThemeTokens> = {};
        Object.keys(themeData).forEach(key => {
          if (key in MUTABLE_SYSTEM_DEFAULT && !BASE_THEME_ONLY.has(key)) {
            const tenantValue = (themeData as any)[key];
            const systemDefault = (MUTABLE_SYSTEM_DEFAULT as any)[key];
            if (tenantValue !== undefined && tenantValue !== null && tenantValue !== systemDefault) {
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
      brandName: baseTheme.brandName ?? null,
      brandTagline: baseTheme.brandTagline ?? null,
      emailFromName: baseTheme.emailFromName ?? null,
      customCss: baseTheme.customCss,
      uiLayout: baseTheme.uiLayout,
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
    await writeCache(tenantId || "null", activeTheme);
    return activeTheme;
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      dbUnavailableUntil = Date.now() + DB_UNAVAILABLE_COOLDOWN_MS;
      return fallbackTheme;
    }

    throw error;
  }
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
  // Allow disabling Redis in development to avoid startup failures
  if (process.env.DISABLE_REDIS === "true") {
    return null;
  }
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

  const redis = await getRedisClient();
  if (!redis) return null;

  try {
    const payload = await redis.get(key);
    if (!payload) return null;
    return JSON.parse(payload) as ActiveTheme;
  } catch {
    return null;
  }
}

async function writeCache(tenantId: string, value: ActiveTheme) {
  const key = getCacheKey(tenantId);

  const redis = await getRedisClient();
  if (!redis) return;

  try {
    await redis.set(key, JSON.stringify(value), "EX", Math.floor(CACHE_TTL_MS / 1000));
  } catch {}
}

export async function invalidateThemeCache(tenantId: string | null) {
  const key = getCacheKey(tenantId);

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

  const existingTokens = normalizeThemeTokens(existing as unknown as Partial<ThemeTokens>);
  const updateData = normalizeThemeTokens(
    mergeDefinedValues(existingTokens, {
      ...payload,
      tenantId,
      isBaseTheme,
      isActive: true,
    })
  );

  if (existing) {
    // Update existing record (reactivates if it was inactive)
    await prisma.tenantTheme.update({
      where: { id: existing.id },
      data: updateData
    });
  } else {
    // Create new record — use relation connect for non-null tenantId
    const { tenantId: _tid, ...createFields } = updateData;
    await prisma.tenantTheme.create({
      data: {
        ...createFields,
        ...(tenantId ? { tenant: { connect: { id: tenantId } } } : {}),
      },
    });
  }

  // Invalidate cache for affected tenants
  if (isBaseTheme) {
    // Base theme change affects all tenants - clear all Redis caches
    const redis = await getRedisClient();
    if (redis) {
      try {
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

// 🏷️ GET BASE BRAND NAME - Resolves the platform brand name from base theme or env
export async function getBaseBrandName(): Promise<string> {
  const resolved = await resolveTenantTheme(null);
  return (resolved as any)?.brandName || process.env.NEXT_PUBLIC_APP_NAME || "CRM AI";
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
