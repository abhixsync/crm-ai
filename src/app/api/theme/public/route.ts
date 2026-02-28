import { getActiveTheme, getDefaultTheme } from "@/modules/theme/theme.service";

export async function GET(request: Request) {
  try {
    const theme = await getActiveTheme(null);

    // Only return public fields
    const publicTheme = {
      faviconUrl: theme?.faviconUrl || null,
      loginBackgroundUrl: theme?.loginBackgroundUrl || null,
      applicationBackgroundUrl: theme?.applicationBackgroundUrl || null,
    };

    return Response.json({ theme: publicTheme });
  } catch {
    const fallback = getDefaultTheme();
    return Response.json({
      theme: {
        faviconUrl: fallback.faviconUrl,
        loginBackgroundUrl: fallback.loginBackgroundUrl,
        applicationBackgroundUrl: fallback.applicationBackgroundUrl,
      },
    });
  }
}