"use client";

import { useState, useEffect, useCallback, useTransition } from "react";
import { useSession, signOut } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import "./modern-shell.css";
import { LANGUAGES, LANG_STORAGE_KEY, t, getLangConfig } from "@/lib/i18n/languages";
import { useTenantSwitcher } from "@/components/providers/tenant-switcher-provider";

const THEME_STORAGE_KEY = "ms-ui-theme";

// SVG icons for nav items
const icons = {
  dashboard: (
    <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  ),
  customers: (
    <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
    </svg>
  ),
  review: (
    <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  ),
  calls: (
    <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.8a19.79 19.79 0 01-3.07-8.67A2 2 0 012 .84h3a2 2 0 012 1.72" />
    </svg>
  ),
  analytics: (
    <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  ),
  campaigns: (
    <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  ),
  followups: (
    <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
      <polyline points="9 16 11 18 15 14" />
    </svg>
  ),
  uploads: (
    <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  ),
  audit: (
    <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
  deals: (
    <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
    </svg>
  ),
  messages: (
    <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
    </svg>
  ),
  health: (
    <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  ),
  demo: (
    <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10" /><polygon points="10 8 16 12 10 16 10 8" />
    </svg>
  ),
  aiconfig: (
    <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.07 4.93a10 10 0 010 14.14M4.93 4.93a10 10 0 000 14.14" />
    </svg>
  ),
  intents: (
    <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
    </svg>
  ),
  dnc: (
    <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10" />
      <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
    </svg>
  ),
  loanAssistant: (
    <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M12 2a4 4 0 00-4 4v4h8V6a4 4 0 00-4-4z" />
      <rect x="4" y="10" width="16" height="8" rx="2" />
      <circle cx="9" cy="14" r="1" fill="currentColor" /><circle cx="15" cy="14" r="1" fill="currentColor" />
      <path d="M8 18v2m8-2v2" />
    </svg>
  ),
  roles: (
    <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" />
      <polyline points="23 21 23 19 19 15" /><line x1="17" y1="17" x2="23" y2="17" />
    </svg>
  ),
  teams: (
    <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
    </svg>
  ),
  tenantSettings: (
    <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  ),
  theme: (
    <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
    </svg>
  ),
  globalTheme: (
    <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
    </svg>
  ),
  billing: (
    <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <rect x="1" y="4" width="22" height="16" rx="2" /><line x1="1" y1="10" x2="23" y2="10" />
    </svg>
  ),
  webhooks: (
    <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
    </svg>
  ),
  subscriptionAdmin: (
    <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  ),
  settings: (
    <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  ),
  menu: (
    <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  ),
  sun: (
    <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  ),
  moon: (
    <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
    </svg>
  ),
  brand: (
    <svg fill="none" stroke="var(--ms-bg)" strokeWidth="2.5" viewBox="0 0 24 24">
      <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.8" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  ),
};

function getInitials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function buildNavItems(role) {
  const isAdmin = role === "ADMIN" || role === "SUPER_ADMIN";
  const isSuperAdmin = role === "SUPER_ADMIN";

  const items = [
    // ─── Main ───
    { key: "dashboard",  href: "/dashboard",          label: "Dashboard",       icon: icons.dashboard,  section: "Main" },
    { key: "customers",  href: "/customers",           label: "Customers",       icon: icons.customers,  section: "Main" },
    { key: "review",     href: "/admin/manual-review", label: "Manual Review",   icon: icons.review,     section: "Main" },
    { key: "calls",      href: "/calls",               label: "Call Logs",       icon: icons.calls,      section: "Main" },
    { key: "analytics",  href: "/admin/analytics",     label: "Analytics",       icon: icons.analytics,  section: "Main" },
  ];

  if (isAdmin) {
    items.push(
      { key: "campaigns",  href: "/admin/automation",    label: "Campaigns",       icon: icons.campaigns,  section: "Main" },
      { key: "followups",  href: "/admin/follow-ups",    label: "Follow-up Tasks", icon: icons.followups,  section: "Main" },
      { key: "uploads",    href: "/admin/lead-uploads",  label: "Lead Uploads",    icon: icons.uploads,    section: "Main" },
    );
  }

  items.push(
    { key: "audit",      href: "/admin/audit-logs",    label: "Audit Logs",      icon: icons.audit,      section: "Main" },
  );

  if (isAdmin) {
    items.push(
      // ─── New Features ───
      { key: "deals",      href: "/admin/deals",         label: "Deals",           icon: icons.deals,      section: "Pipeline" },
      { key: "messages",   href: "/messages",            label: "Messages",        icon: icons.messages,   section: "Pipeline" },

      // ─── AI Engine ───
      { key: "health",     href: "/admin/automation-health", label: "Automation Health", icon: icons.health, section: "AI Engine" },
      { key: "demo",       href: "/admin/ai-call-demo",  label: "AI Call Demo",    icon: icons.demo,       section: "AI Engine" },
      { key: "aiconfig",   href: "/admin/ai-system-prompt", label: "AI Assistance", icon: icons.aiconfig,  section: "AI Engine" },
      { key: "intents",    href: "/admin/intent-training", label: "Intent Training", icon: icons.intents,  section: "AI Engine" },
      { key: "dnc",        href: "/admin/dnc",           label: "DNC Registry",    icon: icons.dnc,        section: "AI Engine" },
      { key: "loanAssistant", href: "/admin/loan-assistant-settings", label: "Loan Assistant", icon: icons.loanAssistant, section: "AI Engine" },

      // ─── Config ───
      { key: "teams",      href: "/admin/teams",         label: "Teams",           icon: icons.teams,      section: "Config" },
      { key: "tenantSettings", href: "/admin/settings",  label: "Tenant Settings", icon: icons.tenantSettings, section: "Config" },
      { key: "webhooks",   href: "/admin/webhooks",      label: "Webhooks",        icon: icons.webhooks,   section: "Config" },
      { key: "billing",    href: "/admin/billing",       label: "Billing",         icon: icons.billing,    section: "Config" },

      // ─── Theme ───
      { key: "theme",      href: "/admin/modular-theme", label: "Modular Theme", icon: icons.theme, section: "Theme" },
    );
  }

  if (isSuperAdmin) {
    items.push(
      { key: "globaltheme",       href: "/admin/global-appearance",    label: "Global Theme",        icon: icons.globalTheme,       section: "Superadmin" },
      { key: "roles",             href: "/admin/user-management",      label: "Roles & Permissions", icon: icons.roles,             section: "Superadmin" },
      { key: "subscriptionAdmin", href: "/admin/subscription-config",  label: "Subscription Config", icon: icons.subscriptionAdmin, section: "Superadmin" },
      { key: "planManagement",    href: "/admin/plan-management",      label: "Plan Management",     icon: icons.billing,           section: "Superadmin" },
    );
  }

  return items;
}

function getActiveKey(pathname) {
  if (pathname === "/dashboard") return "dashboard";
  if (pathname.startsWith("/customers"))             return "customers";
  if (pathname.startsWith("/calls"))                 return "calls";
  if (pathname.startsWith("/messages"))              return "messages";
  if (pathname.startsWith("/admin/manual-review"))   return "review";
  if (pathname.startsWith("/admin/analytics"))       return "analytics";
  if (pathname.startsWith("/admin/automation-health")) return "health";
  if (pathname.startsWith("/admin/automation"))      return "campaigns";
  if (pathname.startsWith("/admin/follow-ups"))      return "followups";
  if (pathname.startsWith("/admin/lead-uploads"))    return "uploads";
  if (pathname.startsWith("/admin/audit-logs"))      return "audit";
  if (pathname.startsWith("/admin/deals"))           return "deals";
  if (pathname.startsWith("/admin/ai-call-demo"))    return "demo";
  if (pathname.startsWith("/admin/ai-system-prompt") || pathname.startsWith("/admin/ai-providers") || pathname.startsWith("/admin/telephony-providers")) return "aiconfig";
  if (pathname.startsWith("/admin/intent-training")) return "intents";
  if (pathname.startsWith("/admin/dnc"))             return "dnc";
  if (pathname.startsWith("/admin/loan-assistant-settings")) return "loanAssistant";
  if (pathname.startsWith("/admin/teams"))           return "teams";
  if (pathname.startsWith("/admin/webhooks"))        return "webhooks";
  if (pathname.startsWith("/admin/billing"))         return "billing";
  if (pathname.startsWith("/admin/modular-theme")) return "theme";
  if (pathname.startsWith("/admin/global-appearance")) return "globaltheme";
  if (pathname.startsWith("/admin/settings"))        return "tenantSettings";
  if (pathname.startsWith("/admin/subscription-config")) return "subscriptionAdmin";
  if (pathname.startsWith("/admin/plan-management")) return "planManagement";
  if (pathname.startsWith("/admin/user-management")) return "roles";
  return "dashboard";
}

function getPageTitle(activeKey) {
  const titles = {
    dashboard:    "Dashboard",
    customers:    "Customers",
    review:       "Manual Review",
    calls:        "Call Logs",
    analytics:    "Analytics",
    campaigns:    "Campaigns",
    followups:    "Follow-up Tasks",
    uploads:      "Lead Uploads",
    audit:        "Audit Logs",
    deals:        "Deals",
    messages:     "Messages",
    health:       "Automation Health",
    demo:         "AI Call Demo",
    aiconfig:     "AI Assistance",
    intents:      "Intent Training",
    dnc:          "DNC Registry",
    loanAssistant: "Loan Assistant",
    roles:        "Roles & Permissions",
    teams:        "Teams",
    tenantSettings: "Tenant Settings",
    webhooks:     "Webhooks",
    billing:      "Billing",
    theme:        "Modular Theme",
    globaltheme:  "Global Theme",
    subscriptionAdmin: "Subscription Config",
    planManagement: "Plan Management",
  };
  return titles[activeKey] || "Dashboard";
}

export function ModernShell({ children, brandName, brandSub, logoUrl, tenantName, initialRole }) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [uiTheme, setUiTheme] = useState("dark");
  const [uiLang, setUiLang] = useState("en");
  const [langOpen, setLangOpen] = useState(false);
  const [tenantOpen, setTenantOpen] = useState(false);
  const [pendingHref, setPendingHref] = useState(null);
  const { selectedTenantId, selectedTenantName, tenants, switchTenant, isSuperAdmin: isSATenant } = useTenantSwitcher();

  // Clear pending state when navigation completes
  useEffect(() => {
    setPendingHref(null);
  }, [pathname]);

  // Read theme + language preference from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark") {
      setUiTheme(stored);
    }
    const storedLang = localStorage.getItem(LANG_STORAGE_KEY);
    if (storedLang) setUiLang(storedLang);
  }, []);

  // Apply data-ui-theme to html element
  useEffect(() => {
    document.documentElement.setAttribute("data-ui-theme", uiTheme);
  }, [uiTheme]);

  const toggleTheme = useCallback(() => {
    setUiTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      localStorage.setItem(THEME_STORAGE_KEY, next);
      return next;
    });
  }, []);

  const changeLang = useCallback((code) => {
    setUiLang(code);
    setLangOpen(false);
    localStorage.setItem(LANG_STORAGE_KEY, code);
    document.documentElement.setAttribute("lang", code);
    // Persist to server for admin users
    fetch("/api/admin/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uiLanguage: code }),
    }).catch(() => {});
  }, []);

  const user = session?.user;
  const role = user?.role || initialRole || "SALES";
  const navItems = buildNavItems(role);

  const activeKey = getActiveKey(pathname);
  const pageTitle = getPageTitle(activeKey);

  const userName = user?.name || "User";
  const userInitials = getInitials(userName);
  const displayBrand = brandName || "CRM AI";
  const displaySub = brandSub || "AI Sales Platform";

  // Close drawer on route change
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  // Group nav items by section
  let currentSection = null;

  return (
    <div className="ms-shell">
      {/* Top loading bar */}
      {isPending && <div className="ms-nav-progress" />}

      {/* Mobile drawer backdrop */}
      <div
        className={`ms-drawer-backdrop ${drawerOpen ? "open" : ""}`}
        onClick={() => setDrawerOpen(false)}
      />

      {/* Sidebar */}
      <aside className={`ms-sb ${drawerOpen ? "open" : ""}`}>
        <div className="ms-brand">
          <div className="ms-brand-mark">
            {logoUrl ? (
              <img src={logoUrl} alt={displayBrand} />
            ) : (
              icons.brand
            )}
          </div>
          <div>
            <div className="ms-brand-name">{displayBrand}</div>
            <div className="ms-brand-sub">{displaySub}</div>
          </div>
        </div>

        <nav className="ms-nav">
          {navItems.map((item) => {
            const showSection = item.section !== currentSection;
            if (showSection) currentSection = item.section;
            return (
              <div key={item.key}>
                {showSection && (
                  <div className="ms-nav-sec">{t(`section.${item.section}`, uiLang)}</div>
                )}
                <Link
                  href={item.href}
                  className={`ms-nav-btn ${activeKey === item.key ? "active" : ""}${pendingHref === item.href ? " pending" : ""}`}
                  onClick={(e) => {
                    e.preventDefault();
                    setDrawerOpen(false);
                    if (pathname !== item.href) {
                      setPendingHref(item.href);
                      startTransition(() => router.push(item.href));
                    }
                  }}
                >
                  {item.icon}
                  {t(`nav.${item.key}`, uiLang) !== `nav.${item.key}` ? t(`nav.${item.key}`, uiLang) : item.label}
                  {pendingHref === item.href && <span className="ms-nav-spinner" />}
                </Link>
              </div>
            );
          })}
        </nav>

        <div className="ms-sb-foot">
          <div className="ms-user-av">{userInitials}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="ms-user-name">{userName}</div>
            <div className="ms-user-role">{role}{(isSATenant ? (selectedTenantName ? ` · ${selectedTenantName}` : "") : (tenantName ? ` · ${tenantName}` : ""))}</div>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            title="Logout"
            className="ms-btn-logout"
          >
            <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" style={{ width: 16, height: 16 }}>
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        </div>
      </aside>

      {/* Main content area */}
      <div className="ms-main">
        <div className="ms-topbar">
          <button
            className="ms-mobile-menu-btn"
            onClick={() => setDrawerOpen((prev) => !prev)}
            aria-label="Toggle menu"
          >
            {icons.menu}
          </button>
          <span className="ms-pg-title">{t(`nav.${activeKey}`, uiLang) !== `nav.${activeKey}` ? t(`nav.${activeKey}`, uiLang) : pageTitle}</span>

          {/* Tenant switcher (SUPER_ADMIN only) */}
          {isSATenant && tenants.length > 0 && (
            <div style={{ position: "relative" }}>
              <button
                className="ms-tenant-trigger"
                onClick={() => setTenantOpen((v) => !v)}
                title="Switch tenant"
              >
                <span className="ms-tenant-trigger-name">{selectedTenantName || "Select Tenant"}</span>
                <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" style={{ width: 12, height: 12 }}>
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              {tenantOpen && (
                <>
                  <div style={{ position: "fixed", inset: 0, zIndex: 99 }} onClick={() => setTenantOpen(false)} />
                  <div className="ms-tenant-dropdown">
                    {tenants.map((tn) => (
                      <button
                        key={tn.id}
                        className={`ms-tenant-option${selectedTenantId === tn.id ? " active" : ""}`}
                        onClick={() => { switchTenant(tn.id); setTenantOpen(false); }}
                      >
                        <span>{tn.name}</span>
                        <span style={{ fontSize: 10, color: "var(--ms-text3)" }}>{tn.slug}</span>
                        {selectedTenantId === tn.id && <span style={{ marginLeft: "auto", color: "var(--ms-accent)" }}>✓</span>}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Language switcher */}
          <div style={{ position: "relative" }}>
            <button
              className="ms-theme-toggle"
              onClick={() => setLangOpen((v) => !v)}
              title="Change language"
              style={{ fontSize: 14, width: "auto", padding: "0 8px" }}
            >
              {getLangConfig(uiLang).flag}
            </button>
            {langOpen && (
              <>
                <div style={{ position: "fixed", inset: 0, zIndex: 99 }} onClick={() => setLangOpen(false)} />
                <div className="ms-lang-dropdown">
                  {LANGUAGES.map((lang) => (
                    <button
                      key={lang.code}
                      className={`ms-lang-option${uiLang === lang.code ? " active" : ""}`}
                      onClick={() => changeLang(lang.code)}
                    >
                      <span>{lang.flag}</span>
                      <span>{lang.label}</span>
                      {uiLang === lang.code && <span style={{ marginLeft: "auto", color: "var(--ms-accent)" }}>✓</span>}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <button
            className="ms-theme-toggle"
            onClick={toggleTheme}
            title={uiTheme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            {uiTheme === "dark" ? icons.sun : icons.moon}
          </button>
        </div>

        <div className="ms-pane">
          {children}
        </div>
      </div>
    </div>
  );
}
