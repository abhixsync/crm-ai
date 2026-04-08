import { Suspense } from "react";
import { headers } from "next/headers";
import { getActiveTheme } from "@/modules/theme/theme.service";
import { prisma } from "@/lib/prisma";
import LoginForm from "./login-form";

export const metadata = {
  title: "Sign In",
  description: "Sign in to your CRM AI account to manage customers, calls, and campaigns.",
};

export default async function LoginPage() {
  const headersList = await headers();
  const tenantId   = headersList.get("x-resolved-tenant-id")   || null;
  const tenantSlug = headersList.get("x-resolved-tenant-slug") || null;

  let theme = {
    loginBackgroundUrl: null, logoUrl: null, themeName: null,
    displayName: null, primaryColor: null, secondaryColor: null,
    accentColor: null, uiLayout: "modern",
  };

  try {
    const active = await getActiveTheme(tenantId);
    let displayName = active?.themeName || null;
    if (active?.tenantId) {
      try {
        const tenant = await prisma.tenant.findUnique({
          where: { id: active.tenantId },
          select: { crmName: true, name: true },
        });
        if (tenant) displayName = tenant.crmName || tenant.name || displayName;
      } catch {}
    }
    theme = {
      displayName,
      themeName: active?.themeName || null,
      primaryColor: active?.primaryColor || null,
      secondaryColor: active?.secondaryColor || null,
      accentColor: active?.accentColor || null,
      loginBackgroundUrl: active?.loginBackgroundUrl || null,
      logoUrl: active?.logoUrl || null,
      uiLayout: active?.uiLayout || "modern",
    };
  } catch {}

  return (
    <Suspense>
      <LoginForm theme={theme} tenantId={tenantId} tenantSlug={tenantSlug} />
    </Suspense>
  );
}
