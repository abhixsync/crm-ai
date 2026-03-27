// Temporary debug handler – remove after testing.
// Tests what resolveTenantTheme returns for a specific tenantId.
import { resolveTenantTheme, invalidateThemeCache } from "@/modules/theme/theme.service";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tenantId = searchParams.get("tenantId") || null;
  const bust = searchParams.get("bust"); // pass ?bust=1 to force invalidation first

  if (bust) {
    await invalidateThemeCache(tenantId);
  }

  const theme = await resolveTenantTheme(tenantId);
  return Response.json({
    tenantId_requested: tenantId,
    uiLayout: theme.uiLayout,
    source: theme.source,
    updatedAt: theme.updatedAt,
  });
}
