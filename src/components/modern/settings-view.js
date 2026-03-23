"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";

const ROLE_STYLE = {
  SUPER_ADMIN: { bg: "rgba(242,88,88,.15)", color: "var(--ms-red, #f25858)" },
  ADMIN: { bg: "rgba(245,166,35,.15)", color: "var(--ms-amber, #f5a623)" },
  SALES: { bg: "rgba(79,156,249,.15)", color: "var(--ms-blue, #4f9cf9)" },
};

export function ModernSettingsView({ initialRole, initialLayout }) {
  const { data: session } = useSession();
  const [tenant, setTenant] = useState(null);
  const [users, setUsers] = useState([]);
  const [automation, setAutomation] = useState(null);
  const [saving, setSaving] = useState(false);

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

  useEffect(() => { fetchData(); }, [fetchData]);

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

  const user = session?.user;
  const rs = ROLE_STYLE[user?.role] || { bg: "var(--ms-bg3)", color: "var(--ms-text3)" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Profile + Organization — side by side */}
      <div className="ms-settings-grid">
        {/* Left: Profile card */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div className="ms-card" style={{ padding: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ms-text)", marginBottom: 16 }}>My Profile</div>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
              <div style={{
                width: 48, height: 48, borderRadius: 12, background: "var(--ms-accent)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 18, fontWeight: 700, color: "var(--ms-bg)", flexShrink: 0,
              }}>
                {(user?.name || "?")[0].toUpperCase()}
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ms-text)" }}>{user?.name || "—"}</div>
                <div style={{ fontSize: 12, color: "var(--ms-text3)" }}>{user?.email || "—"}</div>
              </div>
              <span className="ms-bdg" style={{ background: rs.bg, color: rs.color, marginLeft: "auto" }}>
                {user?.role || "—"}
              </span>
            </div>
            <div className="ms-field">
              <div className="ms-field-lbl">Name</div>
              <input className="ms-field-inp" readOnly value={user?.name || ""} />
            </div>
            <div className="ms-field">
              <div className="ms-field-lbl">Email</div>
              <input className="ms-field-inp" readOnly value={user?.email || ""} />
            </div>
          </div>

          {/* Users list */}
          <div className="ms-card">
            <div className="ms-card-hd">
              <span className="ms-card-title">Team Members</span>
              <span style={{ fontSize: 11, color: "var(--ms-text3)" }}>{users.length} users</span>
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
                    const urs = ROLE_STYLE[u.role] || { bg: "var(--ms-bg3)", color: "var(--ms-text3)" };
                    return (
                      <tr key={u.id}>
                        <td style={{ fontWeight: 500 }}>{u.name}</td>
                        <td className="ms-mono">{u.email}</td>
                        <td><span className="ms-bdg" style={{ background: urs.bg, color: urs.color }}>{u.role}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right: Organization settings + Automation */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {tenant ? (
            <div className="ms-card" style={{ padding: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ms-text)", marginBottom: 16 }}>Organization</div>
              <TenantField label="Tenant name" field="name" value={tenant.name} onSave={saveTenant} disabled={saving} />
              <TenantField label="CRM display name" field="crmName" value={tenant.crmName} onSave={saveTenant} disabled={saving} />
              <TenantField label="AI agent name" field="aiAgentName" value={tenant.aiAgentName} onSave={saveTenant} disabled={saving} />
              <TenantField label="Human advisor name" field="humanAdvisorName" value={tenant.humanAdvisorName} onSave={saveTenant} disabled={saving} />
              <TenantField label="Callback phone" field="callbackPhone" value={tenant.callbackPhone} onSave={saveTenant} disabled={saving} />
              <TenantField label="Notification email" field="notificationEmail" value={tenant.notificationEmail} onSave={saveTenant} disabled={saving} />
            </div>
          ) : (
            <div className="ms-card" style={{ padding: 20 }}>
              <div className="ms-empty">Loading organization settings…</div>
            </div>
          )}

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
