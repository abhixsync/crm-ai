"use client";

import React, { createContext, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { SYSTEM_THEME_DEFAULT, type ThemeTokens } from "./system-defaults";
import {
  getThemeCssVariables,
  getThemeFingerprint,
  sanitizeThemeCustomCss,
} from "@/core/theme/theme-utils";

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

  const cssVariables = getThemeCssVariables(theme);
  const serializedVariables = Object.entries(cssVariables)
    .map(([key, value]) => `${key}:${value}`)
    .join(";");
  root.style.cssText = `${root.style.cssText};${serializedVariables}`;

  const safeCustomCss = sanitizeThemeCustomCss(theme.customCss);
  const existingStyle = document.getElementById("theme-custom-css");

  if (safeCustomCss) {
    if (existingStyle) {
      existingStyle.textContent = safeCustomCss;
    } else {
      const style = document.createElement("style");
      style.id = "theme-custom-css";
      style.textContent = safeCustomCss;
      document.head.appendChild(style);
    }
  } else if (existingStyle) {
    existingStyle.remove();
  }

  root.setAttribute("data-theme-ready", "true");
}

type ThemeProviderProps = {
  children: React.ReactNode;
  preloadedTheme?: Partial<TenantTheme> | null;
  preloadedTenantId?: string | null;
};

export function ThemeProvider({ children, preloadedTheme = null, preloadedTenantId = null }: ThemeProviderProps) {
  const { data: session, status } = useSession();
  const [theme, setTheme] = useState<TenantTheme>(() =>
    preloadedTheme ? ({ ...DEFAULT_THEME, ...preloadedTheme } as TenantTheme) : DEFAULT_THEME
  );
  const [loadingTheme, setLoadingTheme] = useState(false);
  const requestSequenceRef = useRef(0);
  const mountedRef = useRef(true);
  const lastResolvedTenantRef = useRef<string | null>(preloadedTenantId);
  const skipInitialFetchRef = useRef(Boolean(preloadedTheme));
  const appliedFingerprintRef = useRef<string>("");

  const fetchTheme = useCallback(async () => {
    if (status === "loading") return;
    if (status !== "authenticated") {
      lastResolvedTenantRef.current = null;
      setLoadingTheme(false);
      return;
    }

    const tenantId = String((session as { user?: { tenantId?: string | null } } | null)?.user?.tenantId || "");

    if (skipInitialFetchRef.current && lastResolvedTenantRef.current === tenantId) {
      skipInitialFetchRef.current = false;
      return;
    }

    if (lastResolvedTenantRef.current === tenantId && !loadingTheme) {
      return;
    }

    const requestId = requestSequenceRef.current + 1;
    requestSequenceRef.current = requestId;

    setLoadingTheme(true);
    try {
      const query = tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : "";
      const response = await fetch(`/api/theme/active${query}`, {
        cache: "no-store",
      });

      if (!mountedRef.current || requestId !== requestSequenceRef.current) {
        return;
      }

      if (!response.ok) {
        throw new Error("Unable to load theme");
      }

      const payload = await response.json();

      if (!mountedRef.current || requestId !== requestSequenceRef.current) {
        return;
      }

      const nextTheme = (payload?.theme || DEFAULT_THEME) as TenantTheme;
      setTheme((current) => ({ ...current, ...nextTheme }));
      lastResolvedTenantRef.current = tenantId;
    } catch (error) {
      if (!mountedRef.current || requestId !== requestSequenceRef.current) return;
      setTheme(DEFAULT_THEME);
    } finally {
      if (mountedRef.current && requestId === requestSequenceRef.current) {
        setLoadingTheme(false);
      }
    }
  }, [loadingTheme, session, status]);

  useEffect(() => {
    fetchTheme();
  }, [fetchTheme]);

  useEffect(() => {
    const fingerprint = getThemeFingerprint(theme);
    if (fingerprint === appliedFingerprintRef.current) {
      return;
    }

    applyThemeVariables(theme);
    appliedFingerprintRef.current = fingerprint;
  }, [theme]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refreshTheme = useCallback(async () => {
    lastResolvedTenantRef.current = null;
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
