import { hasRole } from "@/lib/server/auth-guard";
import { assertTenantMatch, resolveTenantContext } from "@/middleware/tenant.middleware";
import {
  getActiveTheme,
  getDefaultTheme,
  updateTenantTheme,
  uploadThemeAsset,
  type ThemeUpdatePayload,
} from "./theme.service";

function resolveTargetTenantId(session: any, payloadTenantId?: string | null) {
  const context = resolveTenantContext(session);

  if (context.isSuperAdmin) {
    return payloadTenantId || context.tenantId;
  }

  assertTenantMatch(context.tenantId, payloadTenantId || context.tenantId);
  return context.tenantId;
}

export async function getActiveThemeController(session: any, requestedTenantId?: string | null) {
  const tenantId = resolveTargetTenantId(session, requestedTenantId);
  return getActiveTheme(tenantId || null);
}

export async function updateThemeController(session: any, payload: ThemeUpdatePayload & { tenantId?: string | null }) {
  if (!hasRole(session, ["ADMIN", "SUPER_ADMIN"])) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const tenantId = resolveTargetTenantId(session, payload.tenantId || null);
  if (!tenantId) {
    return Response.json({ error: "tenantId is required for theme update." }, { status: 400 });
  }

  const theme = await updateTenantTheme(tenantId, payload);
  return Response.json({ theme });
}

export async function uploadThemeAssetController(
  session: any,
  formData: FormData,
  requestedTenantId?: string | null
) {
  if (!hasRole(session, ["ADMIN", "SUPER_ADMIN"])) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const tenantId = resolveTargetTenantId(session, requestedTenantId || null);
  if (!tenantId) {
    return Response.json({ error: "tenantId is required for asset upload." }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "file is required." }, { status: 400 });
  }

  const assetKey = String(formData.get("assetKey") || "").trim();
  if (!assetKey) {
    return Response.json({ error: "assetKey is required." }, { status: 400 });
  }

  const url = await uploadThemeAsset(tenantId, file);
  const patch: ThemeUpdatePayload = {};

  if (assetKey === "logo") patch.logoUrl = url;
  if (assetKey === "favicon") patch.faviconUrl = url;
  if (assetKey === "loginBackground") patch.loginBackgroundUrl = url;

  if (Object.keys(patch).length === 0) {
    return Response.json({ error: "Unsupported assetKey." }, { status: 400 });
  }

  const theme = await updateTenantTheme(tenantId, patch);
  return Response.json({ url, theme });
}

export function getFallbackThemeResponse() {
  return Response.json({ theme: getDefaultTheme() });
}
