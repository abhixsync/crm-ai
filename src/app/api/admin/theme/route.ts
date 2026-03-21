import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/server/auth-guard";
import { updateThemeController } from "@/modules/theme/theme.controller";

export async function PUT(request: Request) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  try {
    const payload = await request.json();
    const response = await updateThemeController(auth.session, payload || {});
    // When the UI layout changes, bust Next.js's own page/layout segment cache
    // so the next navigation gets a freshly server-rendered shell.
    if (response.ok && payload?.uiLayout) {
      revalidatePath("/", "layout");
    }
    return response;
  } catch (error: any) {
    return Response.json({ error: error?.message || "Unable to update theme." }, { status: 400 });
  }
}
