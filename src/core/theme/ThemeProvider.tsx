"use client";

import React, { createContext, useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { SYSTEM_THEME_DEFAULT, type ThemeTokens } from "./system-defaults";

export type TenantTheme = ThemeTokens & {
  source: "default" | "base" | "tenant";
  updatedAt: string | null;
};

type ThemeContextValue = {
  theme: TenantTheme;
  loadingTheme: boolean;
  refreshTheme: () => Promise<void>;
  setThemeOptimistic: (patch: Partial<TenantTheme>) => void;
};

const DEFAULT_THEME: TenantTheme = {
  ...SYSTEM_THEME_DEFAULT,
  source: "default",
  updatedAt: null,
};

export const ThemeContext = createContext<ThemeContextValue>({
  theme: DEFAULT_THEME,
  loadingTheme: false,
  refreshTheme: async () => {},
  setThemeOptimistic: () => {},
});

function applyThemeVariables(theme: TenantTheme) {
  const root = document.documentElement;

  // Bridge legacy/global tokens used across app styles
  root.style.setProperty("--background", theme.backgroundColor);
  root.style.setProperty("--foreground", theme.textPrimary);

  // 🎨 Core Colors
  root.style.setProperty("--color-primary", theme.primaryColor);
  root.style.setProperty("--color-secondary", theme.secondaryColor);
  root.style.setProperty("--color-accent", theme.accentColor);
  root.style.setProperty("--color-background", theme.backgroundColor);
  root.style.setProperty("--color-surface", theme.surfaceColor);
  root.style.setProperty("--color-sidebar", theme.sidebarColor);
  root.style.setProperty("--color-header", theme.headerColor);

  // 📝 Text Colors
  root.style.setProperty("--color-text-primary", theme.textPrimary);
  root.style.setProperty("--color-text-secondary", theme.textSecondary);
  root.style.setProperty("--color-border", theme.borderColor);

  // ✅ Status Colors
  root.style.setProperty("--color-success", theme.successColor);
  root.style.setProperty("--color-warning", theme.warningColor);
  root.style.setProperty("--color-error", theme.errorColor);
  root.style.setProperty("--color-info", theme.infoColor);

  // 🔤 Typography
  root.style.setProperty("--font-family", theme.fontFamily);
  root.style.setProperty("--font-scale", theme.fontScale);

  // 📐 Layout & Spacing
  root.style.setProperty("--border-radius", theme.borderRadius);
  root.style.setProperty("--button-radius", theme.buttonRadius);
  root.style.setProperty("--card-radius", theme.cardRadius);
  root.style.setProperty("--input-radius", theme.inputRadius);
  root.style.setProperty("--shadow-intensity", theme.shadowIntensity);
  root.style.setProperty("--layout-density", theme.layoutDensity);

  // 🧭 Navigation
  root.style.setProperty("--sidebar-style", theme.sidebarStyle);
  root.style.setProperty("--table-style", theme.tableStyle);

  // 🌙 Dark Mode
  root.style.setProperty("--dark-mode", theme.darkMode ? "true" : "false");

  // 🖼️ Backgrounds (with fallbacks)
  if (theme.applicationBackgroundUrl) {
    root.style.setProperty("--bg-application", `url(${theme.applicationBackgroundUrl})`);
  } else {
    root.style.setProperty("--bg-application", `linear-gradient(135deg, ${theme.backgroundColor} 0%, ${theme.surfaceColor} 100%)`);
  }

  // 🎨 Custom CSS
  if (theme.customCss) {
    const existingStyle = document.getElementById("theme-custom-css");
    if (existingStyle) {
      existingStyle.textContent = theme.customCss;
    } else {
      const style = document.createElement("style");
      style.id = "theme-custom-css";
      style.textContent = theme.customCss;
      document.head.appendChild(style);
    }
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const [theme, setTheme] = useState<TenantTheme>(DEFAULT_THEME);
  const [loadingTheme, setLoadingTheme] = useState(false);

  const fetchTheme = useCallback(async () => {
    if (status === "loading") return;

    setLoadingTheme(true);
    try {
      const tenantId = (session as any)?.user?.tenantId || "";
      const query = tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : "";
      const response = await fetch(`/api/theme/active${query}`, { cache: "no-store" });
      const payload = await response.json();
      const nextTheme = payload?.theme || DEFAULT_THEME;
      setTheme(nextTheme);
    } catch {
      setTheme(DEFAULT_THEME);
    } finally {
      setLoadingTheme(false);
    }
  }, [session, status]);

  useEffect(() => {
    fetchTheme();
  }, [fetchTheme]);

  useEffect(() => {
    applyThemeVariables(theme);
  }, [theme]);

  const refreshTheme = useCallback(async () => {
    await fetchTheme();
  }, [fetchTheme]);

  const setThemeOptimistic = useCallback((patch: Partial<TenantTheme>) => {
    setTheme((current) => ({ ...current, ...patch }));
  }, []);

  const value = useMemo(
    () => ({
      theme,
      loadingTheme,
      refreshTheme,
      setThemeOptimistic,
    }),
    [theme, loadingTheme, refreshTheme, setThemeOptimistic]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
