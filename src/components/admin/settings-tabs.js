"use client";

import React, { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { AccountSettingsPage } from "@/modules/admin/settings/AccountSettingsPage";
import { MyAccountSettingsPage } from "@/modules/admin/settings/MyAccountSettingsPage";
import { ThemeSettingsPage } from "@/modules/admin/theme/ThemeSettingsPage";
import { LoanAssistantAdmin } from "@/components/loan-assistant/loan-assistant-admin";

const TAB_TO_TYPE = {
  "my-profile": "profile",
  account: "account",
  theme: "theme",
  "loan-assistant": "loan",
  "ui-settings": "ui-settings",
};

const TYPE_TO_TAB = {
  profile: "my-profile",
  "my-profile": "my-profile",
  "my-account": "my-profile",
  account: "account",
  theme: "theme",
  loan: "loan-assistant",
  "loan-assistant": "loan-assistant",
  "ui-settings": "ui-settings",
};

function resolveTabFromTypeParam(typeParam) {
  const normalizedType = String(typeParam || "").trim().toLowerCase();
  return TYPE_TO_TAB[normalizedType] || "account";
}

function resolveTypeFromTab(tabKey) {
  return TAB_TO_TYPE[tabKey] || "account";
}

export function SettingsTabs({ initialRole, initialLayout }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const typeParam = searchParams.get("type");
  const queryString = searchParams.toString();
  const activeTab = resolveTabFromTypeParam(typeParam);
  const isSuperAdmin = (session?.user?.role || initialRole) === "SUPER_ADMIN";

  useEffect(() => {
    const canonicalType = resolveTypeFromTab(activeTab);
    const normalizedType = String(typeParam || "").trim().toLowerCase();

    if (normalizedType === canonicalType) {
      return;
    }

    const nextParams = new URLSearchParams(queryString);
    nextParams.set("type", canonicalType);
    router.replace(`${pathname}?${nextParams.toString()}`);
  }, [activeTab, typeParam, queryString, pathname, router]);

  function openTab(tabKey) {
    const nextType = resolveTypeFromTab(tabKey);
    const normalizedType = String(typeParam || "").trim().toLowerCase();

    if (normalizedType === nextType) {
      return;
    }

    const nextParams = new URLSearchParams(queryString);
    nextParams.set("type", nextType);
    router.push(`${pathname}?${nextParams.toString()}`);
  }

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:gap-8">
      <div className="w-full flex-shrink-0 lg:w-64">
        <nav className="flex gap-2 overflow-x-auto pb-1 lg:block lg:space-y-1 lg:overflow-visible lg:pb-0">
          <button
            onClick={() => openTab("my-profile")}
            className={`shrink-0 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium lg:w-full lg:text-left ${
              activeTab === "my-profile"
                ? "bg-muted text-foreground border-b-2 border-primary lg:border-b-0 lg:border-r-2"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            My Profile
          </button>
          <button
            onClick={() => openTab("account")}
            className={`shrink-0 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium lg:w-full lg:text-left ${
              activeTab === "account"
                ? "bg-muted text-foreground border-b-2 border-primary lg:border-b-0 lg:border-r-2"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            Organization Settings
          </button>
          <button
            onClick={() => openTab("theme")}
            className={`shrink-0 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium lg:w-full lg:text-left ${
              activeTab === "theme"
                ? "bg-muted text-foreground border-b-2 border-primary lg:border-b-0 lg:border-r-2"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            Theme Settings
          </button>
          <button
            onClick={() => openTab("loan-assistant")}
            className={`shrink-0 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium lg:w-full lg:text-left ${
              activeTab === "loan-assistant"
                ? "bg-muted text-foreground border-b-2 border-primary lg:border-b-0 lg:border-r-2"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            Loan Assistant
          </button>
          {isSuperAdmin && (
            <button
              onClick={() => openTab("ui-settings")}
              className={`shrink-0 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium lg:w-full lg:text-left ${
                activeTab === "ui-settings"
                  ? "bg-muted text-foreground border-b-2 border-primary lg:border-b-0 lg:border-r-2"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              UI Settings
            </button>
          )}
        </nav>
      </div>

      <div className="min-w-0 flex-1">
        {activeTab === "my-profile" && <MyAccountSettingsPage />}
        {activeTab === "account" && <AccountSettingsPage />}
        {activeTab === "theme" && <ThemeSettingsPage />}
        {activeTab === "loan-assistant" && <LoanAssistantAdmin />}
        {activeTab === "ui-settings" && isSuperAdmin && <ClassicUiSettingsPanel initialLayout={initialLayout} />}
      </div>
    </div>
  );
}

function ClassicUiSettingsPanel({ initialLayout }) {
  const [currentLayout, setCurrentLayout] = useState(initialLayout || "classic");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // Refresh from API to stay in sync, but initialLayout prevents flash
    fetch("/api/theme/active")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.theme?.uiLayout) setCurrentLayout(data.theme.uiLayout);
      })
      .catch(() => {});
  }, []);

  const switchLayout = useCallback(async (layout) => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/theme", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uiLayout: layout, isBaseTheme: true }),
      });
      if (res.ok) {
        setCurrentLayout(layout);
        toast.success(`UI layout set to "${layout}". Applying changes…`);
        // Hard reload: bypasses Next.js Router Cache and forces a fresh server render
        // so the new shell (modern/classic) is picked up immediately.
        setTimeout(() => window.location.reload(), 800);
      } else {
        toast.error("Failed to update UI layout");
      }
    } catch {
      toast.error("Failed to update UI layout");
    } finally {
      setSaving(false);
    }
  }, []);

  const layouts = [
    { key: "modern", label: "Modern", desc: "Sidebar + topbar shell with dark/light theme toggle" },
    { key: "classic", label: "Classic", desc: "Original hamburger menu layout with shadcn components" },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-foreground">UI Layout</h3>
        <p className="text-sm text-muted-foreground">
          Choose the UI layout for this tenant. Changes apply after page reload.
        </p>
      </div>
      <div className="flex flex-col gap-3">
        {layouts.map(({ key, label, desc }) => (
          <button
            key={key}
            onClick={() => !saving && switchLayout(key)}
            disabled={saving}
            className={`rounded-lg border p-4 text-left transition-colors ${
              currentLayout === key
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/50 hover:bg-muted"
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-foreground">{label}</span>
              {currentLayout === key && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  Active
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{desc}</p>
          </button>
        ))}
      </div>
    </div>
  );
}