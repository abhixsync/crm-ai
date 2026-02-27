"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useTheme } from "@/core/theme/useTheme";

export function ThemeAssets() {
  const { data: session } = useSession();
  const { theme } = useTheme();

  useEffect(() => {
    // Update favicon
    if (theme.faviconUrl) {
      let link = document.querySelector("link[rel='icon']");
      if (!link) {
        link = document.createElement("link");
        link.rel = "icon";
        document.head.appendChild(link);
      }
      link.href = theme.faviconUrl;
    }

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
  }, [theme.faviconUrl, session]);

  return null;
}