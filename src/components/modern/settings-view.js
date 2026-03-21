"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { toast } from "sonner";

const TABS = [
  { key: "profile", label: "My Profile" },
  { key: "account", label: "Organization" },
  { key: "theme", label: "Theme" },
  { key: "loan", label: "Loan Assistant" },
  { key: "ui-settings", label: "UI Settings", superAdminOnly: true },
];

export function ModernSettingsView({ initialRole, initialLayout }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const activeTab = searchParams.get("type") || "profile";
  const isSuperAdmin = (session?.user?.role || initialRole) === "SUPER_ADMIN";

  const [tenant, setTenant] = useState(null);
  const [users, setUsers] = useState([]);
  const [automation, setAutomation] = useState(null);
  const [saving, setSaving] = useState(false);
  const [currentLayout, setCurrentLayout] = useState(initialLayout || "modern");

  const fetchData = useCallback(async () => {
    try {
      const [settingsRes, usersRes, autoRes] = await Promise.all([
        fetch("/api/admin/settings"),
        fetch("/api/admin/user-management/users"),
        fetch("/api/automation/toggle"),
      ]);

      if (settingsRes.ok) {
        const data = await settingsRes.json();
        setTenant(data.settings || data);
      }
      if (usersRes.ok) {
        const data = await usersRes.json();
        setUsers(data.users || []);
      }
      if (autoRes.ok) {
        const data = await autoRes.json();
        setAutomation(data);
      }
    } catch {
      // silently fail
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  function switchTab(type) {
    router.push(`/admin/settings?type=${type}`);
  }

  const saveTenant = useCallback(async (field, value) => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      if (res.ok) {
        toast.success("Setting saved");
        setTenant((prev) => prev ? { ...prev, [field]: value } : prev);
      } else {
        toast.error("Failed to save setting");
      }
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  }, []);

  const ROLE_STYLE = {
    SUPER_ADMIN: { bg: "rgba(242,88,88,.15)", color: "var(--ms-red, #f25858)" },
    ADMIN: { bg: "rgba(245,166,35,.15)", color: "var(--ms-amber, #f5a623)" },
    SALES: { bg: "rgba(79,156,249,.15)", color: "var(--ms-blue, #4f9cf9)" },
  };

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Tabs */}
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

      {/* Tab content */}
      {activeTab === "profile" && (
        <div className="ms-card" style={{ padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ms-text)", marginBottom: 16 }}>My Profile</div>
          <div className="ms-field">
            <div className="ms-field-lbl">Name</div>
            <input className="ms-field-inp" readOnly value={session?.user?.name || ""} />
          </div>
          <div className="ms-field">
            <div className="ms-field-lbl">Email</div>
            <input className="ms-field-inp" readOnly value={session?.user?.email || ""} />
          </div>
          <div className="ms-field">
            <div className="ms-field-lbl">Role</div>
            <input className="ms-field-inp" readOnly value={session?.user?.role || ""} />
          </div>
        </div>
      )}

      {activeTab === "account" && tenant && (
        <div className="ms-settings-grid">
          <div className="ms-card" style={{ padding: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ms-text)", marginBottom: 16 }}>Tenant settings</div>
            <TenantField label="Tenant name" field="name" value={tenant.name} onSave={saveTenant} disabled={saving} />
            <TenantField label="CRM display name" field="crmName" value={tenant.crmName} onSave={saveTenant} disabled={saving} />
            <TenantField label="AI agent name" field="aiAgentName" value={tenant.aiAgentName} onSave={saveTenant} disabled={saving} />
            <TenantField label="Human advisor name" field="humanAdvisorName" value={tenant.humanAdvisorName} onSave={saveTenant} disabled={saving} />
            <TenantField label="Callback phone" field="callbackPhone" value={tenant.callbackPhone} onSave={saveTenant} disabled={saving} />
            <TenantField label="Notification email" field="notificationEmail" value={tenant.notificationEmail} onSave={saveTenant} disabled={saving} />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {/* Users */}
            <div className="ms-card">
              <div className="ms-card-hd">
                <span className="ms-card-title">Users</span>
              </div>
              <div className="ms-tbl-wrap">
                <table className="ms-tbl">
                  <thead>
                    <tr><th>Name</th><th>Email</th><th>Role</th></tr>
                  </thead>
                  <tbody>
                    {users.length === 0 && (
                      <tr><td colSpan={3} style={{ textAlign: "center", color: "var(--ms-text3)" }}>No users found.</td></tr>
                    )}
                    {users.map((u) => {
                      const rs = ROLE_STYLE[u.role] || { bg: "var(--ms-bg3)", color: "var(--ms-text3)" };
                      return (
                        <tr key={u.id}>
                          <td style={{ fontWeight: 500 }}>{u.name}</td>
                          <td className="ms-mono">{u.email}</td>
                          <td><span className="ms-bdg" style={{ background: rs.bg, color: rs.color }}>{u.role}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Automation */}
            {automation && (
              <div className="ms-card" style={{ padding: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ms-text)", marginBottom: 14 }}>Automation</div>
                <div className="ms-auto-row">
                  <span className="ms-auto-lbl">Automation</span>
                  <span className={`ms-auto-val${automation.enabled ? " on" : ""}`}>
                    {automation.enabled ? "Enabled" : "Disabled"}
                  </span>
                </div>
                <div className="ms-auto-row">
                  <span className="ms-auto-lbl">Execution mode</span>
                  <span className="ms-auto-val">{automation.executionMode || "—"}</span>
                </div>
                <div className="ms-auto-row">
                  <span className="ms-auto-lbl">Max retries</span>
                  <span className="ms-auto-val">{automation.maxRetries ?? "—"}</span>
                </div>
                <div className="ms-auto-row">
                  <span className="ms-auto-lbl">Batch size</span>
                  <span className="ms-auto-val">{automation.batchSize ?? "—"}</span>
                </div>
                <div className="ms-auto-row">
                  <span className="ms-auto-lbl">Daily cap</span>
                  <span className="ms-auto-val">{automation.dailyCap ?? "—"}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "account" && !tenant && (
        <div className="ms-empty">Loading settings…</div>
      )}

      {activeTab === "theme" && (
        <div className="ms-card" style={{ padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ms-text)", marginBottom: 10 }}>Theme Settings</div>
          <p style={{ fontSize: 12, color: "var(--ms-text2)" }}>
            Theme customization is available in the classic settings view. Use the UI Settings to switch layouts.
          </p>
        </div>
      )}

      {activeTab === "loan" && (
        <div className="ms-card" style={{ padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ms-text)", marginBottom: 10 }}>Loan Assistant</div>
          <p style={{ fontSize: 12, color: "var(--ms-text2)" }}>
            Loan assistant configuration is available in the classic settings view.
          </p>
        </div>
      )}

      {activeTab === "ui-settings" && isSuperAdmin && (
        <UiSettingsPanel currentLayout={currentLayout} onLayoutChange={setCurrentLayout} />
      )}
    </div>
  );
}

function TenantField({ label, field, value, onSave, disabled }) {
  const [val, setVal] = useState(value || "");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setVal(value || "");
    setDirty(false);
  }, [value]);

  return (
    <div className="ms-field">
      <div className="ms-field-lbl">{label}</div>
      <div style={{ display: "flex", gap: 6 }}>
        <input
          className="ms-field-inp"
          value={val}
          onChange={(e) => { setVal(e.target.value); setDirty(true); }}
        />
        {dirty && (
          <button
            className="ms-btn ms-btn-pri"
            style={{ flexShrink: 0, padding: "6px 12px" }}
            onClick={() => { onSave(field, val); setDirty(false); }}
            disabled={disabled}
          >
            Save
          </button>
        )}
      </div>
    </div>
  );
}

function UiSettingsPanel({ currentLayout, onLayoutChange }) {
  const [saving, setSaving] = useState(false);

  const switchLayout = useCallback(async (layout) => {
    if (layout === currentLayout) return;
    // Instantly reflect the selection in the UI
    onLayoutChange(layout);
    setSaving(true);
    const toastId = toast.loading(`Applying ${layout} layout…`);
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
