import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getActiveTheme, getDefaultTheme } from "@/modules/theme/theme.service";

export async function GET(request: Request) {
  try {
    const superAdmin = await prisma.user.findFirst({
      where: {
        role: UserRole.SUPER_ADMIN,
        tenantId: { not: null },
        isActive: true,
      },
      select: { tenantId: true },
      orderBy: { createdAt: "asc" },
    });

    const baseTenantId = superAdmin?.tenantId ?? null;
    const theme = await getActiveTheme(baseTenantId);

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