"use client";

import { useEffect, useMemo, useState } from "react";
import { useTheme } from "@/core/theme/useTheme";

type AssetVariants = {
  mobile?: string | null;
  tablet?: string | null;
  desktop?: string | null;
};

function normalizeAsset(input: unknown): AssetVariants {
  if (!input) return {};
  if (typeof input === "string") {
    return { mobile: input, tablet: input, desktop: input };
  }
  if (typeof input === "object") {
    const entry = input as Record<string, string | null | undefined>;
    return {
      mobile: entry.mobile || null,
      tablet: entry.tablet || null,
      desktop: entry.desktop || null,
    };
  }
  return {};
}

export function resolveResponsiveAsset(asset: unknown, width: number, fallbackUrl: string | null = null) {
  const variants = normalizeAsset(asset);

  if (width < 640) {
    return variants.mobile || variants.tablet || variants.desktop || fallbackUrl;
  }

  if (width < 1024) {
    return variants.tablet || variants.desktop || variants.mobile || fallbackUrl;
  }

  return variants.desktop || variants.tablet || variants.mobile || fallbackUrl;
}

export function useThemeAsset(assetKey: string, fallbackUrl: string | null = null) {
  const { theme } = useTheme();
  const [width, setWidth] = useState<number>(typeof window === "undefined" ? 1280 : window.innerWidth);

  useEffect(() => {
    function onResize() {
      setWidth(window.innerWidth);
    }

    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const url = useMemo(() => {
    const assets = (theme as any)?.assets || {};
    const direct = (theme as any)?.[assetKey];
    return resolveResponsiveAsset(assets[assetKey] ?? direct, width, fallbackUrl);
  }, [assetKey, fallbackUrl, theme, width]);

  return {
    url,
    isFallback: !url || url === fallbackUrl,
    breakpoint: width < 640 ? "mobile" : width < 1024 ? "tablet" : "desktop",
  };
}
