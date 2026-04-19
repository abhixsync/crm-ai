"use client";

import { useEffect } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

const APP_DOMAIN = process.env.NEXT_PUBLIC_APP_DOMAIN || "wrenforge.com";

function GoogleRedirect() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const raw = searchParams.get("callbackUrl") || "/dashboard";
    // Only allow relative paths or *.APP_DOMAIN — extra safety before NextAuth validates
    let callbackUrl = "/dashboard";
    if (raw.startsWith("/")) {
      callbackUrl = raw;
    } else {
      try {
        const { hostname } = new URL(raw);
        if (hostname === APP_DOMAIN || hostname.endsWith(`.${APP_DOMAIN}`)) {
          callbackUrl = raw;
        }
      } catch {}
    }
    signIn("google", { callbackUrl });
  }, [searchParams]);

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", fontSize: 14, color: "#888" }}>
      Redirecting to Google…
    </div>
  );
}

export default function GoogleRedirectPage() {
  return (
    <Suspense>
      <GoogleRedirect />
    </Suspense>
  );
}
