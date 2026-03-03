"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useTheme } from "@/core/theme/useTheme";

export function ThemeAssets() {
  const { status } = useSession();
  const { theme } = useTheme();

  useEffect(() => {
    const applyFavicon = (url, version) => {
      const normalizedUrl = String(url || "").trim();
      if (!normalizedUrl) return;

      const cacheBustedUrl = normalizedUrl.includes("?")
        ? `${normalizedUrl}&v=${encodeURIComponent(version || Date.now())}`
        : `${normalizedUrl}?v=${encodeURIComponent(version || Date.now())}`;

      const relValues = ["icon", "shortcut icon", "apple-touch-icon"];

      relValues.forEach((rel) => {
        let link = document.querySelector(`link[rel='${rel}']`);
        if (!link) {
          link = document.createElement("link");
          link.rel = rel;
          document.head.appendChild(link);
        }
        link.href = cacheBustedUrl;
      });
    };

    if (theme.faviconUrl) {
      applyFavicon(theme.faviconUrl, theme.updatedAt);
      return;
    }

    const fetchThemeForFavicon = async () => {
      if (status === "authenticated") {
        try {
          const activeResponse = await fetch("/api/theme/active", { cache: "no-store" });
          if (activeResponse.ok) {
            const activeData = await activeResponse.json();
            if (activeData?.theme?.faviconUrl) {
              applyFavicon(activeData.theme.faviconUrl, activeData?.theme?.updatedAt);
              return;
            }
          }
        } catch {}
      }

      try {
        const publicResponse = await fetch("/api/theme/public", { cache: "no-store" });
        const publicData = await publicResponse.json();
        applyFavicon(publicData?.theme?.faviconUrl || null, publicData?.theme?.updatedAt);
      } catch {}
    };

    if (status !== "loading") {
      fetchThemeForFavicon();
    }
  }, [theme.faviconUrl, theme.updatedAt, status]);


  return null;
}