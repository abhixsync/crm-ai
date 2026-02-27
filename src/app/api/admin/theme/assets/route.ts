import { requireSession } from "@/lib/server/auth-guard";
import { uploadThemeAssetController } from "@/modules/theme/theme.controller";

export async function POST(request: Request) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  try {
    const formData = await request.formData();
    const tenantId = String(formData.get("tenantId") || "").trim() || null;
    return uploadThemeAssetController(auth.session as any, formData, tenantId);
  } catch (error: any) {
    return Response.json({ error: error?.message || "Unable to upload theme asset." }, { status: 400 });
  }
}
