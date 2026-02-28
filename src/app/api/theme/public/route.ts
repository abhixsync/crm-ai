import { getActiveTheme, getDefaultTheme } from "@/modules/theme/theme.service";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    const theme = await getActiveTheme(null);

    // Determine a display name: prefer tenant.crmName/name if base theme is tied to a tenant
    let displayName = theme?.themeName || null;
    try {
      if (theme?.tenantId) {
        const tenant = await prisma.tenant.findUnique({ where: { id: theme.tenantId } });
        if (tenant) displayName = tenant.crmName || tenant.name || displayName;
      }
    } catch {
      // ignore lookup failures, use themeName fallback
    }

    // Only return public fields (include displayName and primaryColor for login)
    const publicTheme = {
      displayName,
      themeName: theme?.themeName || null,
      primaryColor: theme?.primaryColor || null,
      secondaryColor: theme?.secondaryColor || null,
      accentColor: theme?.accentColor || null,
      faviconUrl: theme?.faviconUrl || null,
      loginBackgroundUrl: theme?.loginBackgroundUrl || null,
      applicationBackgroundUrl: theme?.applicationBackgroundUrl || null,
    };

    return Response.json({ theme: publicTheme });
  } catch {
    const fallback = getDefaultTheme();
    return Response.json({
      theme: {
        displayName: fallback.themeName || null,
        themeName: fallback.themeName || null,
        primaryColor: fallback.primaryColor || null,
        secondaryColor: fallback.secondaryColor || null,
        accentColor: fallback.accentColor || null,
        faviconUrl: fallback.faviconUrl || null,
        loginBackgroundUrl: fallback.loginBackgroundUrl || null,
        applicationBackgroundUrl: fallback.applicationBackgroundUrl || null,
      },
    });
  }
}