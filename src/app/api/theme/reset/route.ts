import { requireSession } from "@/lib/server/auth-guard";
import { resetTenantThemeController } from "@/modules/theme/theme.controller";

export async function POST(request: Request) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get("tenantId");
    return await resetTenantThemeController(auth.session as any, tenantId);
  } catch (error: any) {
    return Response.json({ error: error.message || "Failed to reset theme" }, { status: 500 });
  }
}