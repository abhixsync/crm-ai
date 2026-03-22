"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import "./modern-shell.css";

const THEME_STORAGE_KEY = "ms-ui-theme";

// SVG icons for nav items
const icons = {
  dashboard: (
    <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  ),
  customers: (
    <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
    </svg>
  ),
  calls: (
    <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.8a19.79 19.79 0 01-3.07-8.67A2 2 0 012 .84h3a2 2 0 012 1.72" />
    </svg>
  ),
  campaigns: (
    <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  ),
  aiconfig: (
    <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.07 4.93a10 10 0 010 14.14M4.93 4.93a10 10 0 000 14.14" />
    </svg>
  ),
  settings: (
    <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  ),
  users: (
    <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
      <circle cx="8.5" cy="7" r="4" />
      <path d="M20 8v6" />
      <path d="M17 11h6" />
    </svg>
  ),
  tenants: (
    <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M3 21h18" />
      <path d="M5 21V7l7-4 7 4v14" />
      <path d="M9 9h.01" />
      <path d="M9 13h.01" />
      <path d="M15 9h.01" />
      <path d="M15 13h.01" />
    </svg>
  ),
  providers: (
    <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M9 7V3" />
      <path d="M15 7V3" />
      <path d="M9 21v-4" />
      <path d="M15 21v-4" />
      <rect x="5" y="7" width="14" height="10" rx="2" />
    </svg>
  ),
  appearance: (
    <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M12 3a9 9 0 100 18 1.5 1.5 0 001.5-1.5 1.5 1.5 0 00-.44-1.06 1.5 1.5 0 01-.44-1.06A1.5 1.5 0 0114.12 16H16a5 5 0 000-10h-4z" />
      <circle cx="7.5" cy="10.5" r=".5" />
      <circle cx="12" cy="7.5" r=".5" />
      <circle cx="16.5" cy="10.5" r=".5" />
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
  const items = [
    { key: "dashboard", href: "/dashboard", label: "Dashboard", icon: icons.dashboard, section: "Main" },
    { key: "customers", href: "/customers", label: "Customers", icon: icons.customers, section: "Main" },
    { key: "calls", href: "/calls", label: "Call Logs", icon: icons.calls, section: "Main" },
  ];

  if (role === "ADMIN" || role === "SUPER_ADMIN") {
    items.push(
      { key: "campaigns", href: "/admin/automation", label: "Campaigns", icon: icons.campaigns, section: "Main" },
    );
  }

  if (role === "ADMIN" || role === "SUPER_ADMIN") {
    items.push(
      { key: "aiconfig", href: "/admin/ai-system-prompt", label: "AI Config", icon: icons.aiconfig, section: "Config" },
    );
  }

  items.push(
    { key: "settings", href: "/admin/settings?type=profile", label: "Settings", icon: icons.settings, section: "Config" },
  );

  if (role === "ADMIN" || role === "SUPER_ADMIN") {
    items.push(
      { key: "users", href: "/admin/user-management", label: "Users", icon: icons.users, section: "Config" },
    );
  }

  if (role === "SUPER_ADMIN") {
    items.push(
      { key: "tenants", href: "/admin/tenants", label: "Tenants", icon: icons.tenants, section: "Admin" },
      { key: "providers", href: "/admin/providers", label: "Providers", icon: icons.providers, section: "Admin" },
      { key: "appearance", href: "/admin/global-appearance", label: "Appearance", icon: icons.appearance, section: "Admin" },
    );
  }

  return items;
}

function getActiveKey(pathname, searchParams) {
  if (pathname === "/dashboard") {
    return "dashboard";
  }
  if (pathname.startsWith("/customers")) return "customers";
  if (pathname.startsWith("/calls")) return "calls";
  if (pathname.startsWith("/admin/automation")) return "campaigns";
  if (pathname.startsWith("/admin/ai-system-prompt")) return "aiconfig";
  if (pathname.startsWith("/admin/settings")) return "settings";
  if (pathname.startsWith("/admin/user-management")) return "users";
  if (pathname.startsWith("/admin/tenants")) return "tenants";
  if (pathname.startsWith("/admin/providers") || pathname.startsWith("/admin/telephony-providers") || pathname.startsWith("/admin/ai-providers")) return "providers";
  if (pathname.startsWith("/admin/global-appearance")) return "appearance";
  return "dashboard";
}

function getPageTitle(activeKey) {
  const titles = {
    dashboard: "Dashboard",
    customers: "Customers",
    calls: "Call Logs",
    campaigns: "Campaigns",
    aiconfig: "AI Config",
    settings: "Settings",
    users: "Users",
    tenants: "Tenants",
    providers: "Providers",
    appearance: "Appearance",
  };
  return titles[activeKey] || "Dashboard";
}

export function ModernShell({ children, brandName, brandSub, logoUrl, tenantName, initialRole }) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [uiTheme, setUiTheme] = useState(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(THEME_STORAGE_KEY);
      if (stored === "light" || stored === "dark") {
        return stored;
      }
    }
    return "dark";
  });

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

  const user = session?.user;
  const role = user?.role || initialRole || "SALES";
  const navItems = buildNavItems(role);
  const groupedNavItems = useMemo(
    () =>
      navItems.map((item, index) => ({
        ...item,
        showSection: index === 0 || item.section !== navItems[index - 1].section,
      })),
    [navItems]
  );

  // Build a URLSearchParams-like object from the pathname for active detection
  const searchParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const activeKey = getActiveKey(pathname, searchParams);
  const pageTitle = getPageTitle(activeKey);

  const userName = user?.name || "User";
  const userInitials = getInitials(userName);
  const displayBrand = brandName || "CRM AI";
  const displaySub = brandSub || "AI Sales Platform";

  return (
    <div className="ms-shell">
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
          {groupedNavItems.map((item) => {
            return (
              <div key={item.key}>
                {item.showSection && (
                  <div className="ms-nav-sec">{item.section}</div>
                )}
                <Link
                  href={item.href}
                  className={`ms-nav-btn ${activeKey === item.key ? "active" : ""}`}
                  onClick={() => setDrawerOpen(false)}
                >
                  {item.icon}
                  {item.label}
                </Link>
              </div>
            );
          })}
        </nav>

        <div className="ms-sb-foot">
          <div className="ms-user-av">{userInitials}</div>
          <div>
            <div className="ms-user-name">{userName}</div>
            <div className="ms-user-role">{role} · {tenantName || "Tenant"}</div>
          </div>
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
          <span className="ms-pg-title">{pageTitle}</span>
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
