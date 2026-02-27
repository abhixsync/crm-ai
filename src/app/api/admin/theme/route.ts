import { requireSession } from "@/lib/server/auth-guard";
import { updateThemeController } from "@/modules/theme/theme.controller";

export async function PUT(request: Request) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  try {
    const payload = await request.json();
    return updateThemeController(auth.session as any, payload || {});
  } catch (error: any) {
    return Response.json({ error: error?.message || "Unable to update theme." }, { status: 400 });
  }
}
