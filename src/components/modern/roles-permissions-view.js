"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";

/* ── helpers ── */
function parseCsv(text) {
  return String(text || "").split(",").map((v) => v.trim()).filter(Boolean);
}
function toCsv(arr) {
  return Array.isArray(arr) ? arr.join(", ") : "";
}
function parseJsonObject(text) {
  const raw = String(text || "").trim();
  if (!raw) return {};
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Must be a JSON object.");
  for (const [k, v] of Object.entries(parsed)) {
    if (typeof v !== "boolean") throw new Error(`'${k}' must be true/false.`);
  }
  return parsed;
}
function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

const EMPTY_USER = { name: "", email: "", password: "", roleKey: "", isActive: true, modules: "", permissions: "", featureToggles: "{}" };
const EMPTY_ROLE = { key: "", name: "", description: "", baseRole: "SALES", modules: "", permissions: "", featureToggles: "{}", active: true };

const ROLE_BADGE = {
  SUPER_ADMIN: { bg: "rgba(242,88,88,.15)", color: "var(--ms-red, #f25858)" },
  ADMIN: { bg: "rgba(245,166,35,.15)", color: "var(--ms-amber, #f5a623)" },
  SALES: { bg: "rgba(79,156,249,.15)", color: "var(--ms-blue, #4f9cf9)" },
};

/* ── Modal shell ── */
function Overlay({ open, onClose, title, children }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const h = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 50,
      display: "flex", alignItems: "center", justifyContent: "center",
      background: "rgba(0,0,0,.55)", padding: 16,
    }}>
      <div ref={ref} onClick={(e) => e.stopPropagation()} className="ms-card" style={{
        width: "100%", maxWidth: 680, maxHeight: "90vh", overflowY: "auto", padding: 24,
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ms-text)" }}>{title}</div>
          <button className="ms-btn" onClick={onClose} style={{ padding: "4px 10px", fontSize: 12 }}>Close</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div className="ms-field-lbl">{label}</div>
      {children}
    </div>
  );
}

/* ── Main ── */
export function ModernRolesPermissionsView({ user }) {
  const { data: session } = useSession();
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingRole, setSavingRole] = useState(false);

  const [showUser, setShowUser] = useState(false);
  const [showRole, setShowRole] = useState(false);
  const [editUserId, setEditUserId] = useState("");
  const [editRoleId, setEditRoleId] = useState("");
  const [uf, setUf] = useState(EMPTY_USER);
  const [rf, setRf] = useState(EMPTY_ROLE);
  const [selectedIds, setSelectedIds] = useState([]);
  const [tab, setTab] = useState("users");
  const bulkRef = useRef(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [uRes, rRes, lRes] = await Promise.all([
        fetch("/api/admin/user-management/users"),
        fetch("/api/admin/user-management/roles"),
        fetch("/api/admin/user-management/audit-logs?limit=30"),
      ]);
      const [uData, rData, lData] = await Promise.all([uRes.json(), rRes.json(), lRes.json()]);
      setUsers(Array.isArray(uData.users) ? uData.users : []);
      setRoles(Array.isArray(rData.roles) ? rData.roles : []);
      setLogs(Array.isArray(lData.logs) ? lData.logs : []);
    } catch (err) {
      toast.error(err?.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  /* ── user CRUD ── */
  function openCreateUser() {
    setEditUserId("");
    setUf({ ...EMPTY_USER, roleKey: roles.filter((r) => r.active)[0]?.key || "" });
    setShowUser(true);
  }
  function openEditUser(u) {
    setEditUserId(u.id);
    setUf({
      name: u.name || "", email: u.email || "", password: "",
      roleKey: u.roleKey || u.role || "", isActive: Boolean(u.isActive),
      modules: toCsv(u?.metadata?.overrides?.modules || []),
      permissions: toCsv(u?.metadata?.overrides?.permissions || []),
      featureToggles: JSON.stringify(u?.metadata?.overrides?.featureToggles || {}, null, 2),
    });
    setShowUser(true);
  }

  async function saveUser() {
    if (!uf.name.trim() || !uf.email.trim() || (!editUserId && uf.password.length < 6) || !uf.roleKey) {
      toast.error("Fill all required fields (password min 6 chars for new users)");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: uf.name, email: uf.email, roleKey: uf.roleKey, isActive: uf.isActive,
        modules: parseCsv(uf.modules), permissions: parseCsv(uf.permissions),
        featureToggles: parseJsonObject(uf.featureToggles),
      };
      if (uf.password.trim()) payload.password = uf.password;

      const url = editUserId ? `/api/admin/user-management/users/${editUserId}` : "/api/admin/user-management/users";
      const res = await fetch(url, {
        method: editUserId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success(editUserId ? "User updated" : "User created");
      setShowUser(false);
      loadAll();
    } catch (err) { toast.error(err?.message || "Failed"); }
    finally { setSaving(false); }
  }

  async function deleteUser(id) {
    if (!confirm("Delete this user?")) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/user-management/users/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success("User deleted");
      loadAll();
    } catch (err) { toast.error(err?.message || "Failed"); }
    finally { setSaving(false); }
  }

  async function batchAction(action) {
    if (selectedIds.length === 0) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/user-management/users/batch", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, userIds: selectedIds }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success(`${action} applied to ${data.count} users`);
      setSelectedIds([]);
      loadAll();
    } catch (err) { toast.error(err?.message || "Failed"); }
    finally { setSaving(false); }
  }

  async function bulkUpload(file) {
    setSaving(true);
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" }).map((r) => {
        const n = {};
        for (const [k, v] of Object.entries(r)) n[k.trim().toLowerCase()] = String(v ?? "").trim();
        return {
          name: n.name, email: n.email, roleKey: n.rolekey || n.role, password: n.password,
          isActive: n.isactive !== "false",
          modules: String(n.modules || "").split(/[|,]/).map((s) => s.trim()).filter(Boolean),
          permissions: String(n.permissions || "").split(/[|,]/).map((s) => s.trim()).filter(Boolean),
        };
      });
      const res = await fetch("/api/admin/user-management/users/bulk", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success(`Bulk: ${data.successCount} created, ${data.failureCount} failed`);
      loadAll();
    } catch (err) { toast.error(err?.message || "Bulk upload failed"); }
    finally { setSaving(false); }
  }

  /* ── role CRUD ── */
  function openCreateRole() {
    setEditRoleId("");
    setRf(EMPTY_ROLE);
    setShowRole(true);
  }
  function openEditRole(r) {
    setEditRoleId(r.id);
    setRf({
      key: r.key || "", name: r.name || "", description: r.description || "",
      baseRole: r.baseRole || "SALES",
      modules: toCsv(r.modules || []), permissions: toCsv(r.permissions || []),
      featureToggles: JSON.stringify(r.featureToggles || {}, null, 2),
      active: Boolean(r.active),
    });
    setShowRole(true);
  }

  async function saveRole() {
    if (!rf.key.trim() || !rf.name.trim()) { toast.error("Key and name required"); return; }
    setSavingRole(true);
    try {
      const payload = {
        key: rf.key, name: rf.name, description: rf.description, baseRole: rf.baseRole,
        modules: parseCsv(rf.modules), permissions: parseCsv(rf.permissions),
        featureToggles: parseJsonObject(rf.featureToggles), active: rf.active,
      };
      const url = editRoleId ? `/api/admin/user-management/roles/${editRoleId}` : "/api/admin/user-management/roles";
      const res = await fetch(url, {
        method: editRoleId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success(editRoleId ? "Role updated" : "Role created");
      setShowRole(false);
      loadAll();
    } catch (err) { toast.error(err?.message || "Failed"); }
    finally { setSavingRole(false); }
  }

  async function deleteRole(id) {
    if (!confirm("Delete this role?")) return;
    setSavingRole(true);
    try {
      const res = await fetch(`/api/admin/user-management/roles/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success("Role deleted");
      loadAll();
    } catch (err) { toast.error(err?.message || "Failed"); }
    finally { setSavingRole(false); }
  }

  /* ── render ── */
  if (loading) return <div className="ms-empty">Loading...</div>;

  const allSelected = users.length > 0 && selectedIds.length === users.length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* Tabs */}
      <div className="ms-pill-tabs">
        {[
          { key: "users", label: "Users" },
          { key: "roles", label: "Roles" },
          { key: "audit", label: "Audit Trail" },
        ].map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`ms-pill-tab${tab === t.key ? " active" : ""}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Users tab ── */}
      {tab === "users" && (
        <>
          <div className="ms-card">
            <div className="ms-card-hd">
              <span className="ms-card-title">Users ({users.length})</span>
              <div style={{ display: "flex", gap: 6 }}>
                <input ref={bulkRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }}
                  onChange={(e) => { if (e.target.files?.[0]) bulkUpload(e.target.files[0]); e.target.value = ""; }}
                />
                <button className="ms-btn" onClick={() => bulkRef.current?.click()} disabled={saving} style={{ fontSize: 11 }}>
                  Bulk Upload
                </button>
                <button className="ms-btn ms-btn-pri" onClick={openCreateUser} style={{ fontSize: 11 }}>
                  + Add User
                </button>
              </div>
            </div>
            <div className="ms-tbl-wrap">
              <table className="ms-tbl">
                <thead>
                  <tr>
                    <th style={{ width: 32 }}>
                      <input type="checkbox" checked={allSelected} onChange={() => setSelectedIds(allSelected ? [] : users.map((u) => u.id))} />
                    </th>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Active</th>
                    <th style={{ width: 120 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.length === 0 && (
                    <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--ms-text3)" }}>No users found.</td></tr>
                  )}
                  {users.map((u) => {
                    const role = u.roleKey || u.role || "";
                    const rs = ROLE_BADGE[role.toUpperCase()] || { bg: "var(--ms-bg3)", color: "var(--ms-text3)" };
                    return (
                      <tr key={u.id}>
                        <td><input type="checkbox" checked={selectedIds.includes(u.id)} onChange={() => setSelectedIds((p) => p.includes(u.id) ? p.filter((x) => x !== u.id) : [...p, u.id])} /></td>
                        <td style={{ fontWeight: 500 }}>{u.name}</td>
                        <td className="ms-mono">{u.email}</td>
                        <td><span className="ms-bdg" style={{ background: rs.bg, color: rs.color }}>{role}</span></td>
                        <td>
                          <span className="ms-bdg" style={{
                            background: u.isActive ? "rgba(29,233,168,.14)" : "rgba(242,88,88,.14)",
                            color: u.isActive ? "#6ee7b7" : "#fca5a5",
                          }}>
                            {u.isActive ? "Yes" : "No"}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: "flex", gap: 4 }}>
                            <button className="ms-btn" onClick={() => openEditUser(u)} style={{ padding: "3px 8px", fontSize: 10 }}>Edit</button>
                            <button className="ms-btn" onClick={() => deleteUser(u.id)} disabled={saving}
                              style={{ padding: "3px 8px", fontSize: 10, color: "var(--ms-red, #f25858)" }}>
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Batch actions */}
          {selectedIds.length > 0 && (
            <div className="ms-card" style={{ padding: "10px 20px", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 12, color: "var(--ms-text2)" }}>{selectedIds.length} selected</span>
              <button className="ms-btn" onClick={() => batchAction("ACTIVATE")} disabled={saving} style={{ fontSize: 11 }}>Activate</button>
              <button className="ms-btn" onClick={() => batchAction("DEACTIVATE")} disabled={saving} style={{ fontSize: 11 }}>Deactivate</button>
              <button className="ms-btn" onClick={() => batchAction("DELETE")} disabled={saving} style={{ fontSize: 11, color: "var(--ms-red)" }}>Delete</button>
            </div>
          )}
        </>
      )}

      {/* ── Roles tab ── */}
      {tab === "roles" && (
        <div className="ms-card">
          <div className="ms-card-hd">
            <span className="ms-card-title">Roles ({roles.length})</span>
            <button className="ms-btn ms-btn-pri" onClick={openCreateRole} style={{ fontSize: 11 }}>+ Add Role</button>
          </div>
          <div className="ms-tbl-wrap">
            <table className="ms-tbl">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Key</th>
                  <th>Base Role</th>
                  <th>System</th>
                  <th>Active</th>
                  <th style={{ width: 120 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {roles.length === 0 && (
                  <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--ms-text3)" }}>No roles found.</td></tr>
                )}
                {roles.map((r) => {
                  const rs = ROLE_BADGE[r.baseRole?.toUpperCase()] || { bg: "var(--ms-bg3)", color: "var(--ms-text3)" };
                  return (
                    <tr key={r.id}>
                      <td style={{ fontWeight: 500 }}>{r.name}</td>
                      <td className="ms-mono">{r.key}</td>
                      <td><span className="ms-bdg" style={{ background: rs.bg, color: rs.color }}>{r.baseRole}</span></td>
                      <td>{r.isSystem ? "Yes" : "No"}</td>
                      <td>
                        <span className="ms-bdg" style={{
                          background: r.active ? "rgba(29,233,168,.14)" : "rgba(242,88,88,.14)",
                          color: r.active ? "#6ee7b7" : "#fca5a5",
                        }}>
                          {r.active ? "Yes" : "No"}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 4 }}>
                          <button className="ms-btn" onClick={() => openEditRole(r)} disabled={r.isSystem}
                            style={{ padding: "3px 8px", fontSize: 10, opacity: r.isSystem ? 0.4 : 1 }}>Edit</button>
                          <button className="ms-btn" onClick={() => deleteRole(r.id)} disabled={savingRole || r.isSystem}
                            style={{ padding: "3px 8px", fontSize: 10, color: "var(--ms-red, #f25858)", opacity: r.isSystem ? 0.4 : 1 }}>
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Audit tab ── */}
      {tab === "audit" && (
        <div className="ms-card">
          <div className="ms-card-hd">
            <span className="ms-card-title">Audit Trail</span>
          </div>
          <div className="ms-tbl-wrap">
            <table className="ms-tbl">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Action</th>
                  <th>Actor</th>
                  <th>Target</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 && (
                  <tr><td colSpan={5} style={{ textAlign: "center", color: "var(--ms-text3)" }}>No audit entries.</td></tr>
                )}
                {logs.map((l, i) => (
                  <tr key={l.id || i}>
                    <td style={{ whiteSpace: "nowrap" }}>{fmtDate(l.createdAt)}</td>
                    <td><span className="ms-bdg" style={{ background: "rgba(79,156,249,.14)", color: "#93c5fd" }}>{l.action}</span></td>
                    <td>{l.actor?.name || l.actor?.email || "System"}</td>
                    <td>{l.targetUser?.email || "—"}</td>
                    <td>
                      <pre style={{ fontSize: 10, color: "var(--ms-text3)", whiteSpace: "pre-wrap", maxWidth: 300, margin: 0 }}>
                        {JSON.stringify(l.metadata || {}, null, 2)}
                      </pre>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── User modal ── */}
      <Overlay open={showUser} onClose={() => setShowUser(false)} title={editUserId ? "Edit User" : "Add User"}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Name">
            <input className="ms-field-inp" value={uf.name} onChange={(e) => setUf((p) => ({ ...p, name: e.target.value }))} />
          </Field>
          <Field label="Email">
            <input className="ms-field-inp" type="email" value={uf.email} onChange={(e) => setUf((p) => ({ ...p, email: e.target.value }))} />
          </Field>
          <Field label={editUserId ? "Password (optional)" : "Password"}>
            <input className="ms-field-inp" type="password" value={uf.password} onChange={(e) => setUf((p) => ({ ...p, password: e.target.value }))} />
          </Field>
          <Field label="Role">
            <select className="ms-field-inp" value={uf.roleKey} onChange={(e) => setUf((p) => ({ ...p, roleKey: e.target.value }))}>
              <option value="">Select role...</option>
              {roles.filter((r) => r.active).map((r) => (
                <option key={r.key} value={r.key}>{r.name} ({r.key})</option>
              ))}
            </select>
          </Field>
          <Field label="Active">
            <select className="ms-field-inp" value={uf.isActive ? "yes" : "no"} onChange={(e) => setUf((p) => ({ ...p, isActive: e.target.value === "yes" }))}>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </Field>
        </div>

        <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Permission Overrides (CSV)">
            <input className="ms-field-inp" value={uf.permissions} placeholder="customers:read, customers:write"
              onChange={(e) => setUf((p) => ({ ...p, permissions: e.target.value }))} />
          </Field>
          <Field label="Module Overrides (CSV)">
            <input className="ms-field-inp" value={uf.modules} placeholder="dashboard, automation"
              onChange={(e) => setUf((p) => ({ ...p, modules: e.target.value }))} />
          </Field>
        </div>

        <div style={{ marginTop: 14 }}>
          <Field label="Feature Toggle Overrides (JSON)">
            <textarea className="ms-field-inp" value={uf.featureToggles} rows={3}
              style={{ fontFamily: "var(--font-geist-mono, monospace)", fontSize: 12, resize: "vertical" }}
              onChange={(e) => setUf((p) => ({ ...p, featureToggles: e.target.value }))}
              placeholder='{"canBulkUserActions": true}' />
          </Field>
        </div>

        <div style={{ marginTop: 20, display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button className="ms-btn" onClick={() => setShowUser(false)} style={{ fontSize: 12 }}>Cancel</button>
          <button className="ms-btn ms-btn-pri" onClick={saveUser} disabled={saving} style={{ fontSize: 12, padding: "8px 20px" }}>
            {saving ? "Saving..." : editUserId ? "Update User" : "Create User"}
          </button>
        </div>
      </Overlay>

      {/* ── Role modal ── */}
      <Overlay open={showRole} onClose={() => setShowRole(false)} title={editRoleId ? "Edit Role" : "Add Role"}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <Field label="Role Key">
            <input className="ms-field-inp" value={rf.key} placeholder="TEAM_LEAD"
              onChange={(e) => setRf((p) => ({ ...p, key: e.target.value }))} />
          </Field>
          <Field label="Role Name">
            <input className="ms-field-inp" value={rf.name} placeholder="Team Lead"
              onChange={(e) => setRf((p) => ({ ...p, name: e.target.value }))} />
          </Field>
          <Field label="Base Role">
            <select className="ms-field-inp" value={rf.baseRole} onChange={(e) => setRf((p) => ({ ...p, baseRole: e.target.value }))}>
              <option value="SALES">SALES</option>
              <option value="ADMIN">ADMIN</option>
              <option value="SUPER_ADMIN">SUPER_ADMIN</option>
            </select>
          </Field>
        </div>

        <div style={{ marginTop: 14 }}>
          <Field label="Description">
            <input className="ms-field-inp" value={rf.description} onChange={(e) => setRf((p) => ({ ...p, description: e.target.value }))} />
          </Field>
        </div>

        <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Permissions (CSV)">
            <input className="ms-field-inp" value={rf.permissions} onChange={(e) => setRf((p) => ({ ...p, permissions: e.target.value }))} />
          </Field>
          <Field label="Modules (CSV)">
            <input className="ms-field-inp" value={rf.modules} onChange={(e) => setRf((p) => ({ ...p, modules: e.target.value }))} />
          </Field>
        </div>

        <div style={{ marginTop: 14 }}>
          <Field label="Feature Toggles (JSON)">
            <textarea className="ms-field-inp" value={rf.featureToggles} rows={3}
              style={{ fontFamily: "var(--font-geist-mono, monospace)", fontSize: 12, resize: "vertical" }}
              onChange={(e) => setRf((p) => ({ ...p, featureToggles: e.target.value }))}
              placeholder='{"canManageRoles": false}' />
          </Field>
        </div>

        <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 8 }}>
          <input type="checkbox" checked={rf.active} onChange={(e) => setRf((p) => ({ ...p, active: e.target.checked }))}
            style={{ accentColor: "var(--ms-accent)" }} />
          <span style={{ fontSize: 12, color: "var(--ms-text2)" }}>Active</span>
        </div>

        <div style={{ marginTop: 20, display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button className="ms-btn" onClick={() => setShowRole(false)} style={{ fontSize: 12 }}>Cancel</button>
          <button className="ms-btn ms-btn-pri" onClick={saveRole} disabled={savingRole} style={{ fontSize: 12, padding: "8px 20px" }}>
            {savingRole ? "Saving..." : editRoleId ? "Update Role" : "Create Role"}
          </button>
        </div>
      </Overlay>
    </div>
  );
}
