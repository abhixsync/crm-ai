"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useTheme } from "@/core/theme/useTheme";

export function ThemeAssets() {
  const { data: session } = useSession();
  const { theme } = useTheme();

  useEffect(() => {
    const applyFavicon = (url) => {
      if (!url) return;
      let link = document.querySelector("link[rel='icon']");
      if (!link) {
        link = document.createElement("link");
        link.rel = "icon";
        document.head.appendChild(link);
      }
      link.href = url;
    };

    if (theme.faviconUrl) {
      applyFavicon(theme.faviconUrl);
      return;
    }

    const fetchPublicTheme = async () => {
      try {
        const response = await fetch("/api/theme/public", { cache: "no-store" });
        const data = await response.json();
        applyFavicon(data?.theme?.faviconUrl || null);
      } catch {}
    };

    fetchPublicTheme();
  }, [theme.faviconUrl]);

  useEffect(() => {
    // Update title
    if (session?.user) {
      // Try to get CRM name from settings or use tenant name
      const updateTitle = async () => {
        try {
          const tenantId = session?.user?.tenantId;
          if (tenantId) {
            const response = await fetch(`/api/admin/settings?tenantId=${encodeURIComponent(tenantId)}`);
            const data = await response.json();
            const crmName = data?.crmName || data?.tenantName || "CRM";
            document.title = crmName;
          }
        } catch {
          document.title = "CRM";
        }
      };
      updateTitle();
    }
  }, [session]);

  return null;
}