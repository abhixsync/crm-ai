import { requireSession } from "@/lib/server/auth-guard";
import { getActiveTheme, getDefaultTheme } from "@/modules/theme/theme.service";

export async function GET() {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  try {
    const theme = await getActiveTheme(null);
    return Response.json({ theme });
  } catch {
    return Response.json({ theme: getDefaultTheme() });
  }
}
