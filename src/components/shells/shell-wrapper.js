"use client";

import { usePathname } from "next/navigation";
import { resolveShell, DEFAULT_LAYOUT } from "@/components/shells/registry";
import { GlobalHamburgerMenu } from "@/components/layout/global-hamburger-menu";
import { ShellContextProvider } from "@/components/shells/shell-context";

export function ShellWrapper({ uiLayout, brandName, brandSub, logoUrl, tenantName, initialRole, children }) {
  const pathname = usePathname();

  // No shell on login / register / verify-email pages
  if (pathname === "/login" || pathname === "/register" || pathname === "/verify-email") {
    return <ShellContextProvider layout="none">{children}</ShellContextProvider>;
  }

  // No shell on loan-assistant-demo pages (standalone)
  if (pathname.startsWith("/loan-assistant-demo") || pathname.startsWith("/llm-loan-assistant-demo")) {
    return <ShellContextProvider layout="none">{children}</ShellContextProvider>;
  }

  const layout = uiLayout || DEFAULT_LAYOUT;

  if (layout === "modern") {
    const ModernShell = resolveShell("modern");
    return (
      <ShellContextProvider layout="modern">
        <ModernShell
          brandName={brandName}
          brandSub={brandSub}
          logoUrl={logoUrl}
          tenantName={tenantName}
          initialRole={initialRole}
        >
          {children}
        </ModernShell>
      </ShellContextProvider>
    );
  }

  // Classic layout — render hamburger menu + children
  return (
    <ShellContextProvider layout="classic">
      <GlobalHamburgerMenu />
      {children}
    </ShellContextProvider>
  );
}
