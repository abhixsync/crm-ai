import { hasRole } from "@/lib/server/auth-guard";
import { assertTenantMatch, resolveTenantContext } from "@/middleware/tenant.middleware";
import {
  getActiveTheme,
  getDefaultTheme,
  updateTenantTheme,
  uploadThemeAsset,
  resolveTenantTheme,
  resetTenantTheme,
  hasTenantCustomTheme,
  getTenantThemeStatus,
  type ThemeUpdatePayload,
} from "./theme.service";
import { EditableTheme } from "@/core/theme/system-defaults";

function resolveTargetTenantId(session: any, payloadTenantId?: string | null, isBaseTheme?: boolean) {
  const context = resolveTenantContext(session);

  // Super admin can set base theme or any tenant's theme
  if (context.isSuperAdmin) {
    if (isBaseTheme) {
      return null; // Base theme has null tenantId
    }
    return payloadTenantId || context.tenantId;
  }

  // Regular admins can only modify their own tenant
  assertTenantMatch(context.tenantId, payloadTenantId || context.tenantId);
  return context.tenantId;
}

export async function getActiveThemeController(session: any, requestedTenantId?: string | null) {
  const tenantId = resolveTargetTenantId(session, requestedTenantId);
  return resolveTenantTheme(tenantId);
}

export async function updateThemeController(
  session: any,
  payload: ThemeUpdatePayload & { tenantId?: string | null; isBaseTheme?: boolean }
) {
  if (!hasRole(session, ["ADMIN", "SUPER_ADMIN"])) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const isBaseTheme = payload.isBaseTheme || false;
  const tenantId = resolveTargetTenantId(session, payload.tenantId, isBaseTheme);

  // Remove control fields from payload before saving
  const { tenantId: _, isBaseTheme: __, ...themePayload } = payload;

  const theme = await updateTenantTheme(tenantId, themePayload, isBaseTheme);
  return Response.json({ theme });
}

export async function uploadThemeAssetController(
  session: any,
  formData: FormData,
  requestedTenantId?: string | null,
  isBaseTheme?: boolean
) {
  if (!hasRole(session, ["ADMIN", "SUPER_ADMIN"])) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const tenantId = resolveTargetTenantId(session, requestedTenantId, isBaseTheme);

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "file is required." }, { status: 400 });
  }

  const assetKey = String(formData.get("assetKey") || "").trim();
  if (!assetKey) {
    return Response.json({ error: "assetKey is required." }, { status: 400 });
  }

  const url = await uploadThemeAsset(tenantId, file);
  const patch: Partial<EditableTheme> = {};

  if (assetKey === "logo") patch.logoUrl = url;
  if (assetKey === "favicon") patch.faviconUrl = url;
  if (assetKey === "loginBackground") patch.loginBackgroundUrl = url;
  if (assetKey === "applicationBackground") patch.applicationBackgroundUrl = url;

  if (Object.keys(patch).length === 0) {
    return Response.json({ error: "Unsupported assetKey." }, { status: 400 });
  }

  const theme = await updateTenantTheme(tenantId, patch, isBaseTheme || false);
  return Response.json({ url, theme });
}

export function getFallbackThemeResponse() {
  return Response.json({ theme: getDefaultTheme() });
}

// 🔄 RESET TENANT THEME CONTROLLER
export async function resetTenantThemeController(session: any, requestedTenantId?: string | null) {
  if (!hasRole(session, ["ADMIN", "SUPER_ADMIN"])) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const tenantId = resolveTargetTenantId(session, requestedTenantId);

  if (!tenantId) {
    return Response.json({ error: "Tenant ID is required" }, { status: 400 });
  }

  const theme = await resetTenantTheme(tenantId);
  return Response.json({ theme, message: "Theme reset to default successfully" });
}

// 📊 GET TENANT THEME STATUS CONTROLLER
export async function getTenantThemeStatusController(session: any, requestedTenantId?: string | null) {
  const tenantId = resolveTargetTenantId(session, requestedTenantId);

  if (!tenantId) {
    return Response.json({ error: "Tenant ID is required" }, { status: 400 });
  }

  const status = await getTenantThemeStatus(tenantId);
  return Response.json({ status });
}
