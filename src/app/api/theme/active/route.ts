import { requireSession } from "@/lib/server/auth-guard";
import { getActiveThemeController, getFallbackThemeResponse } from "@/modules/theme/theme.controller";

export async function GET(request: Request) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get("tenantId");
    const theme = await getActiveThemeController(auth.session as any, tenantId);
    return Response.json({ theme });
  } catch {
    return getFallbackThemeResponse();
  }
}
