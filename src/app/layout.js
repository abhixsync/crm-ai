import { Geist, Geist_Mono } from "next/font/google";
import { cache } from "react";
import { getServerSession } from "next-auth";
import "./globals.css";
import { AuthSessionProvider } from "@/components/providers/session-provider";
import { GlobalHamburgerMenu } from "@/components/layout/global-hamburger-menu";
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
  if (tenantId) {
    try {
      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { crmName: true, name: true },
      });
      crmTitle = tenant?.crmName || tenant?.name || "CRM";
    } catch {
      crmTitle = "CRM";
    }
  }

  return {
    session,
    tenantId,
    preloadedTheme,
    crmTitle,
  };
});

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
  const { tenantId, preloadedTheme } = await getBootstrapData();

  const cssVariables = getThemeCssVariables(preloadedTheme);

  return (
    <html lang="en" data-theme-ready="true" style={cssVariables}>
      <head>
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        style={{ background: "var(--bg-application)", backgroundSize: "cover", backgroundPosition: "center", backgroundRepeat: "no-repeat" }}
      >
        <AuthSessionProvider>
          <ThemeProvider preloadedTheme={preloadedTheme} preloadedTenantId={tenantId}>
            <ThemeAssets />
            <GlobalHamburgerMenu />
            {children}
          </ThemeProvider>
          <Toaster position="top-right" richColors closeButton />
        </AuthSessionProvider>
      </body>
    </html>
  );
}
