import { Geist, Geist_Mono } from "next/font/google";
import { cache } from "react";
import { getServerSession } from "next-auth";
import "./globals.css";
import { AuthSessionProvider } from "@/components/providers/session-provider";
import { TenantSwitcherProvider } from "@/components/providers/tenant-switcher-provider";
import { ShellWrapper } from "@/components/shells/shell-wrapper";
import { ThemeProvider } from "@/core/theme/ThemeProvider";
import { ThemeAssets } from "@/components/theme/theme-assets";
import { Toaster } from "sonner";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SYSTEM_THEME_DEFAULT } from "@/core/theme/system-defaults";
import { getThemeCssVariables } from "@/core/theme/theme-utils";
import { getActiveTheme } from "@/modules/theme/theme.service";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const getBootstrapData = cache(async () => {
  const session = await getServerSession(authOptions);
  const isAuthenticated = Boolean(session?.user?.id);
  const tenantId = isAuthenticated ? (session?.user?.tenantId || null) : null;

  let preloadedTheme = SYSTEM_THEME_DEFAULT;
  try {
    preloadedTheme = await getActiveTheme(tenantId);
  } catch {
    preloadedTheme = SYSTEM_THEME_DEFAULT;
  }

  let crmTitle = "Loan Enterprise CRM";
  let tenantName = "";
  if (tenantId) {
    try {
      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { crmName: true, name: true },
      });
      crmTitle = tenant?.crmName || tenant?.name || "CRM";
      tenantName = tenant?.name || "";
    } catch {
      crmTitle = "CRM";
    }
  }

  const uiLayout = preloadedTheme?.uiLayout || "modern";

  return {
    session,
    tenantId,
    preloadedTheme,
    crmTitle,
    tenantName,
    uiLayout,
  };
});

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export async function generateMetadata() {
  const { preloadedTheme, crmTitle } = await getBootstrapData();
  const rawFavicon = String(preloadedTheme?.faviconUrl || "").trim();
  const faviconWithVersion = rawFavicon
    ? (rawFavicon.includes("?")
      ? `${rawFavicon}&v=${encodeURIComponent(preloadedTheme?.updatedAt || "current")}`
      : `${rawFavicon}?v=${encodeURIComponent(preloadedTheme?.updatedAt || "current")}`)
    : null;
  const description = `${crmTitle} - AI-enabled CRM for loan lead management and automated customer calling`;
  const iconList = faviconWithVersion
    ? {
      icon: faviconWithVersion,
      shortcut: faviconWithVersion,
      apple: faviconWithVersion,
    }
    : undefined;

  return {
    title: crmTitle,
    description,
    icons: iconList,
    openGraph: {
      title: crmTitle,
      description,
      siteName: crmTitle,
      images: faviconWithVersion ? [{ url: faviconWithVersion }] : undefined,
    },
    twitter: {
      card: "summary",
      title: crmTitle,
      description,
      images: faviconWithVersion ? [faviconWithVersion] : undefined,
    },
  };
}

export default async function RootLayout({ children }) {
  const { tenantId, preloadedTheme, crmTitle, tenantName, uiLayout, session } = await getBootstrapData();

  const cssVariables = getThemeCssVariables(preloadedTheme);
  const brandName = crmTitle || "CRM AI";
  const logoUrl = preloadedTheme?.logoUrl || null;

  return (
    <html lang="en" data-theme-ready="true" style={cssVariables} suppressHydrationWarning>
      <head>
        {/* Inline script to apply the stored dark/light preference before first paint,
            preventing a flash when the user's preference differs from the default. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('ms-ui-theme')||'light';document.documentElement.setAttribute('data-ui-theme',t);}catch(e){document.documentElement.setAttribute('data-ui-theme','light');}})();`,
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        style={{ background: "var(--bg-application)", backgroundSize: "cover", backgroundPosition: "center", backgroundRepeat: "no-repeat" }}
      >
        <AuthSessionProvider>
          <ThemeProvider preloadedTheme={preloadedTheme} preloadedTenantId={tenantId}>
            <ThemeAssets />
            <TenantSwitcherProvider>
              <ShellWrapper
                uiLayout={uiLayout}
                brandName={brandName}
                brandSub="AI Sales Platform"
                logoUrl={logoUrl}
                tenantName={tenantName}
                initialRole={session?.user?.role || null}
              >
                {children}
              </ShellWrapper>
            </TenantSwitcherProvider>
          </ThemeProvider>
          <Toaster position="top-right" richColors closeButton />
        </AuthSessionProvider>
      </body>
    </html>
  );
}
