"use client";

import React, { createContext, useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";

export type TenantTheme = {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  logoUrl?: string | null;
  faviconUrl?: string | null;
  loginBackgroundUrl?: string | null;
  source?: "default" | "tenant";
  tenantId?: string | null;
  updatedAt?: string | null;
  assets?: Record<string, unknown>;
};

type ThemeContextValue = {
  theme: TenantTheme;
  loadingTheme: boolean;
  refreshTheme: () => Promise<void>;
  setThemeOptimistic: (patch: Partial<TenantTheme>) => void;
};

const DEFAULT_THEME: TenantTheme = {
  primaryColor: "#2563eb",
  secondaryColor: "#64748b",
  accentColor: "#22c55e",
  logoUrl: null,
  faviconUrl: null,
  loginBackgroundUrl: null,
  source: "default",
  tenantId: null,
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
  root.style.setProperty("--color-primary", theme.primaryColor || DEFAULT_THEME.primaryColor);
  root.style.setProperty("--color-secondary", theme.secondaryColor || DEFAULT_THEME.secondaryColor);
  root.style.setProperty("--color-accent", theme.accentColor || DEFAULT_THEME.accentColor);
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
      setTheme({ ...DEFAULT_THEME, ...nextTheme });
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
