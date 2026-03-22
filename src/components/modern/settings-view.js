"use client";

import { useCallback, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { MyAccountSettingsPage } from "@/modules/admin/settings/MyAccountSettingsPage";
import { AccountSettingsPage } from "@/modules/admin/settings/AccountSettingsPage";
import { ThemeSettingsPage } from "@/modules/admin/theme/ThemeSettingsPage";
import { LoanAssistantAdmin } from "@/components/loan-assistant/loan-assistant-admin";

const TABS = [
  { key: "profile", label: "My Profile" },
  { key: "account", label: "Organization" },
  { key: "theme", label: "Theme" },
  { key: "loan", label: "Loan Assistant" },
  { key: "ui-settings", label: "UI Settings", superAdminOnly: true },
];

function normalizeTab(type) {
  const value = String(type || "").trim().toLowerCase();
  if (["profile", "account", "theme", "loan", "ui-settings"].includes(value)) {
    return value;
  }
  return "profile";
}

export function ModernSettingsView({ initialRole, initialLayout }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const activeTab = normalizeTab(searchParams.get("type"));
  const isSuperAdmin = (session?.user?.role || initialRole) === "SUPER_ADMIN";
  const [currentLayout, setCurrentLayout] = useState(initialLayout || "modern");

  function switchTab(type) {
    const nextTab = normalizeTab(type);
    if (nextTab === activeTab) return;
    router.push(`/admin/settings?type=${nextTab}`);
  }

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
      <div className="ms-card">
        <div className="ms-tabs">
          {TABS.filter((tab) => !tab.superAdminOnly || isSuperAdmin).map((tab) => (
            <button
              key={tab.key}
              className={`ms-tab${activeTab === tab.key ? " active" : ""}`}
              onClick={() => switchTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {activeTab === "profile" && (
          <div className="ms-module-frame ms-module-skin ms-settings-module ms-settings-profile">
            <MyAccountSettingsPage />
          </div>
        )}
        {activeTab === "account" && (
          <div className="ms-module-frame ms-module-skin ms-settings-module ms-settings-account">
            <AccountSettingsPage />
          </div>
        )}
        {activeTab === "theme" && (
          <div className="ms-module-frame ms-module-skin ms-settings-module ms-settings-theme">
            <ThemeSettingsPage />
          </div>
        )}
        {activeTab === "loan" && (
          <div className="ms-module-frame ms-module-skin ms-settings-module ms-settings-loan">
            <LoanAssistantAdmin />
          </div>
        )}
        {activeTab === "ui-settings" && isSuperAdmin && (
          <UiSettingsPanel currentLayout={currentLayout} onLayoutChange={setCurrentLayout} />
        )}
      </div>
    </div>
  );
}

function UiSettingsPanel({ currentLayout, onLayoutChange }) {
  const [saving, setSaving] = useState(false);

  const switchLayout = useCallback(async (layout) => {
    if (layout === currentLayout) return;
    onLayoutChange(layout);
    setSaving(true);
    const toastId = toast.loading(`Applying ${layout} layout...`);
    try {
      const res = await fetch("/api/admin/theme", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uiLayout: layout, isBaseTheme: true }),
      });
      if (res.ok) {
        toast.success(`${layout === "modern" ? "Modern" : "Classic"} layout applied!`, { id: toastId });
        setTimeout(() => window.location.reload(), 600);
      } else {
        onLayoutChange(currentLayout);
        toast.error("Failed to update UI layout", { id: toastId });
        setSaving(false);
      }
    } catch {
      onLayoutChange(currentLayout);
      toast.error("Failed to update UI layout", { id: toastId });
      setSaving(false);
    }
  }, [onLayoutChange, currentLayout]);

  const layouts = [
    { key: "modern", label: "Modern", desc: "Sidebar + topbar shell with dark/light theme toggle" },
    { key: "classic", label: "Classic", desc: "Original hamburger menu layout with shadcn components" },
  ];

  return (
    <div className="ms-card" style={{ padding: 20 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ms-text)", marginBottom: 16 }}>UI Layout</div>
      <p style={{ fontSize: 12, color: "var(--ms-text2)", marginBottom: 16 }}>
        Choose the UI layout. The page will reload automatically to apply changes.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {layouts.map(({ key, label, desc }) => (
          <div
            key={key}
            onClick={() => !saving && switchLayout(key)}
            style={{
              padding: "14px 16px",
              borderRadius: 8,
              border: `1px solid ${currentLayout === key ? "var(--ms-accent)" : "var(--ms-border2)"}`,
              background: currentLayout === key ? "var(--ms-accent-dim)" : "transparent",
              cursor: saving ? "wait" : "pointer",
              transition: "all .15s",
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600, color: currentLayout === key ? "var(--ms-accent-txt)" : "var(--ms-text)" }}>
              {label}
              {currentLayout === key && (
                <span className="ms-bdg" style={{ marginLeft: 8, background: "var(--ms-accent-dim)", color: "var(--ms-accent-txt)" }}>Active</span>
              )}
            </div>
            <div style={{ fontSize: 11, color: "var(--ms-text3)", marginTop: 4 }}>{desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
