"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Modal } from "@/components/ui/modal";

const EMPTY_FORM = {
  name: "",
  slug: "",
  _slugManuallySet: false,
  isActive: true,
  existingAdminUserId: "",
  adminEmail: "",
  adminName: "",
  adminPassword: "",
};

const CREATE_NEW_ADMIN_OPTION = "__create_new_admin__";

function normalizeSlug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function ActiveBadge({ active }) {
  return (
    <span style={{
      background: active ? "rgba(29,233,168,.14)" : "rgba(242,88,88,.14)",
      color: active ? "#1DE9A8" : "#fca5a5",
      padding: "2px 10px",
      borderRadius: 99,
      fontSize: 11,
      fontWeight: 600,
      letterSpacing: 0.3,
    }}>
      {active ? "Active" : "Inactive"}
    </span>
  );
}

export function TenantsAdminClient() {
  const [tenants, setTenants] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTenantId, setEditingTenantId] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [slugConfirmOpen, setSlugConfirmOpen] = useState(false);
  const [slugConfirmInput, setSlugConfirmInput] = useState("");
  const [slugConfirmTarget, setSlugConfirmTarget] = useState(null);

  const editingTenant = editingTenantId
    ? tenants.find((t) => t.id === editingTenantId)
    : null;

  const adminOptionsMap = new Map();
  users.forEach((u) => adminOptionsMap.set(u.id, u));
  if (editingTenant && Array.isArray(editingTenant.users)) {
    editingTenant.users.forEach((u) => { if (!adminOptionsMap.has(u.id)) adminOptionsMap.set(u.id, u); });
  }
  const adminOptions = Array.from(adminOptionsMap.values());

  useEffect(() => { loadTenants(); }, []);

  async function loadTenants() {
    setLoading(true);
    try {
      const [tRes, uRes] = await Promise.all([
        fetch("/api/admin/tenants", { cache: "no-store" }),
        fetch("/api/admin/user-management/users", { cache: "no-store" }),
      ]);
      const tData = await tRes.json();
      const uData = await uRes.json();
      if (!tRes.ok) throw new Error(tData.error || "Unable to load tenants.");
      if (!uRes.ok) throw new Error(uData.error || "Unable to load users.");
      setTenants(Array.isArray(tData.tenants) ? tData.tenants : []);
      setUsers(Array.isArray(uData.users) ? uData.users.filter((u) => u.role === "ADMIN") : []);
    } catch (err) {
      toast.error(err?.message || "Unable to load tenants.");
    } finally {
      setLoading(false);
    }
  }

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function openCreateDialog() {
    setEditingTenantId("");
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  function openEditDialog(tenant) {
    setEditingTenantId(tenant.id);
    const currentAdminId = Array.isArray(tenant.users) && tenant.users.length > 0 ? tenant.users[0].id : "";
    setForm({
      name: tenant.name || "",
      slug: tenant.slug || "",
      _slugManuallySet: true,
      isActive: Boolean(tenant.isActive),
      existingAdminUserId: currentAdminId,
      adminEmail: "",
      adminName: tenant.name ? `${tenant.name} Admin` : "",
      adminPassword: "",
    });
    setDialogOpen(true);
  }

  function closeDialog() {
    if (saving) return;
    closeSlugConfirmDialog();
    setDialogOpen(false);
    setEditingTenantId("");
    setForm(EMPTY_FORM);
  }

  function getSlugChangeContext() {
    const currentSlug = normalizeSlug(editingTenant?.slug || "");
    const nextSlug = normalizeSlug(form.slug || form.name);
    const isSlugChange = Boolean(editingTenantId && nextSlug && nextSlug !== currentSlug);
    return { currentSlug, nextSlug, isSlugChange };
  }

  function closeSlugConfirmDialog() {
    if (saving) return;
    setSlugConfirmOpen(false);
    setSlugConfirmInput("");
    setSlugConfirmTarget(null);
  }

  async function saveTenantFromDialog(options = {}) {
    const { skipSlugConfirmation = false } = options;
    if (!String(form.name || "").trim()) { toast.error("Tenant name is required."); return; }

    const { currentSlug, nextSlug, isSlugChange } = getSlugChangeContext();
    if (isSlugChange && !skipSlugConfirmation) {
      setSlugConfirmTarget({ currentSlug, nextSlug });
      setSlugConfirmInput("");
      setSlugConfirmOpen(true);
      return;
    }

    setSaving(true);
    try {
      const payload = { name: form.name, slug: form.slug, isActive: Boolean(form.isActive) };
      if (isSlugChange) payload.confirmSlugChange = true;

      if (form.existingAdminUserId === CREATE_NEW_ADMIN_OPTION) {
        if (!String(form.adminEmail || "").trim()) { toast.error("Admin email is required when creating a new admin."); setSaving(false); return; }
        payload.adminEmail = form.adminEmail;
        payload.adminName = form.adminName;
        payload.adminPassword = form.adminPassword;
      } else if (String(form.existingAdminUserId || "").trim()) {
        payload.existingAdminUserId = form.existingAdminUserId;
      }

      const res = await fetch(
        editingTenantId ? `/api/admin/tenants/${editingTenantId}` : "/api/admin/tenants",
        { method: editingTenantId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unable to save tenant.");
      toast.success(editingTenantId ? "Tenant updated." : "Tenant created.");
      closeSlugConfirmDialog();
      closeDialog();
      await loadTenants();
    } catch (err) {
      toast.error(err?.message || "Unable to save tenant.");
    } finally {
      setSaving(false);
    }
  }

  async function confirmSlugChangeAndSave() {
    const expectedSlug = String(slugConfirmTarget?.nextSlug || "");
    if (!expectedSlug) { toast.error("Unable to confirm slug change."); return; }
    if (slugConfirmInput !== expectedSlug) { toast.error("Slug change canceled. Confirmation text did not match."); return; }
    setSlugConfirmOpen(false);
    await saveTenantFromDialog({ skipSlugConfirmation: true });
  }

  async function toggleTenantActive(tenant) {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/tenants/${tenant.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !tenant.isActive }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unable to update tenant.");
      toast.success(`Tenant ${tenant.isActive ? "deactivated" : "activated"}.`);
      await loadTenants();
    } catch (err) {
      toast.error(err?.message || "Unable to update tenant status.");
    } finally {
      setSaving(false);
    }
  }

  const showCreateAdminFields = form.existingAdminUserId === CREATE_NEW_ADMIN_OPTION;
  const appDomain = process.env.NEXT_PUBLIC_APP_DOMAIN || "wrenforge.com";

  return (
    <>
      {/* Tenants table card */}
      <div className="ms-card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid var(--ms-border)" }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 16, color: "var(--ms-text)" }}>Tenants</div>
            <div style={{ fontSize: 13, color: "var(--ms-text3)", marginTop: 2 }}>Manage tenants, admins, and their status.</div>
          </div>
          <button className="ms-btn ms-btn-primary" onClick={openCreateDialog} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" style={{ width: 15, height: 15 }}>
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add Tenant
          </button>
        </div>

        {loading ? (
          <div style={{ padding: 32, textAlign: "center", color: "var(--ms-text3)", fontSize: 13 }}>Loading tenants...</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="ms-tbl" style={{ width: "100%", minWidth: 700 }}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Slug</th>
                  <th>Status</th>
                  <th>Admins</th>
                  <th>Users</th>
                  <th>Customers</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {tenants.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: "center", color: "var(--ms-text3)", padding: "32px 0" }}>
                      No tenants found.
                    </td>
                  </tr>
                ) : tenants.map((tenant) => (
                  <tr key={tenant.id}>
                    <td style={{ fontWeight: 500, color: "var(--ms-text)" }}>{tenant.name}</td>
                    <td>
                      <span style={{ fontFamily: "monospace", fontSize: 12, color: "var(--ms-text2)", background: "var(--ms-bg2)", padding: "2px 7px", borderRadius: 4 }}>
                        {tenant.slug}
                      </span>
                    </td>
                    <td><ActiveBadge active={tenant.isActive} /></td>
                    <td>
                      {Array.isArray(tenant.users) && tenant.users.length > 0 ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                          {tenant.users.map((u) => (
                            <div key={u.id} style={{ fontSize: 12, color: "var(--ms-text2)" }}>
                              {u.name || "Unnamed"} · {u.email}{!u.isActive && " · inactive"}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span style={{ fontSize: 12, color: "var(--ms-text3)" }}>None</span>
                      )}
                    </td>
                    <td style={{ color: "var(--ms-text2)" }}>{tenant._count?.users ?? 0}</td>
                    <td style={{ color: "var(--ms-text2)" }}>{tenant._count?.customers ?? 0}</td>
                    <td style={{ fontSize: 12, color: "var(--ms-text3)" }}>
                      {new Date(tenant.createdAt).toLocaleDateString()}
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          className="ms-btn"
                          style={{ fontSize: 12, padding: "4px 12px" }}
                          onClick={() => openEditDialog(tenant)}
                        >
                          Edit
                        </button>
                        <button
                          className="ms-btn"
                          style={{
                            fontSize: 12,
                            padding: "4px 12px",
                            color: tenant.isActive ? "#fca5a5" : "#1DE9A8",
                            borderColor: tenant.isActive ? "rgba(242,88,88,.3)" : "rgba(29,233,168,.3)",
                          }}
                          onClick={() => toggleTenantActive(tenant)}
                          disabled={saving}
                        >
                          {tenant.isActive ? "Deactivate" : "Activate"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create / Edit modal */}
      <Modal
        open={dialogOpen}
        onClose={closeDialog}
        title={editingTenantId ? "Edit Tenant" : "Add Tenant"}
        description="Configure tenant details and optional admin assignment."
        maxWidthClass="max-w-3xl"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Row 1: name, slug, active */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 160px", gap: 12 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span className="ms-field-label">Tenant Name</span>
              <input
                className="ms-input"
                value={form.name}
                placeholder="Acme Finance"
                onChange={(e) => {
                  const name = e.target.value;
                  setForm((prev) => ({
                    ...prev,
                    name,
                    slug: prev._slugManuallySet
                      ? prev.slug
                      : name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50),
                  }));
                }}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span className="ms-field-label">Subdomain</span>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  className="ms-input"
                  value={form.slug}
                  placeholder="acme-finance"
                  maxLength={63}
                  style={{ flex: 1, minWidth: 0 }}
                  onChange={(e) => {
                    const raw = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "");
                    setForm((prev) => ({ ...prev, slug: raw, _slugManuallySet: true }));
                  }}
                />
                <span style={{ fontSize: 12, color: "var(--ms-text3)", whiteSpace: "nowrap" }}>.{appDomain}</span>
              </div>
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span className="ms-field-label">Active</span>
              <select
                className="ms-input"
                value={form.isActive ? "yes" : "no"}
                onChange={(e) => updateField("isActive", e.target.value === "yes")}
              >
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </label>
          </div>

          {/* Row 2: admin select */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span className="ms-field-label">Admin (optional)</span>
              <select
                className="ms-input"
                value={form.existingAdminUserId || ""}
                onChange={(e) => updateField("existingAdminUserId", e.target.value)}
              >
                <option value="">None</option>
                <option value={CREATE_NEW_ADMIN_OPTION}>— Create New Admin —</option>
                {adminOptions.map((u) => (
                  <option key={u.id} value={u.id}>{u.name || "Unnamed"} ({u.email})</option>
                ))}
              </select>
            </label>
          </div>

          {/* Row 3: new admin fields (conditional) */}
          {showCreateAdminFields && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, padding: "12px 16px", background: "var(--ms-bg2)", borderRadius: 8, border: "1px solid var(--ms-border)" }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span className="ms-field-label">Admin Email</span>
                <input
                  className="ms-input"
                  type="email"
                  value={form.adminEmail}
                  placeholder="admin@tenant.local"
                  onChange={(e) => updateField("adminEmail", e.target.value)}
                />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span className="ms-field-label">Admin Name</span>
                <input
                  className="ms-input"
                  value={form.adminName}
                  placeholder="Tenant Admin"
                  onChange={(e) => updateField("adminName", e.target.value)}
                />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span className="ms-field-label">Admin Password</span>
                <input
                  className="ms-input"
                  type="password"
                  value={form.adminPassword}
                  placeholder="Admin@123"
                  onChange={(e) => updateField("adminPassword", e.target.value)}
                />
              </label>
            </div>
          )}

          {/* Actions */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 4 }}>
            <button className="ms-btn" onClick={closeDialog} disabled={saving}>Cancel</button>
            <button className="ms-btn ms-btn-primary" onClick={() => saveTenantFromDialog()} disabled={saving}>
              {saving ? "Saving..." : (editingTenantId ? "Save Changes" : "Create Tenant")}
            </button>
          </div>
        </div>
      </Modal>

      {/* Slug change confirmation modal */}
      <Modal
        open={slugConfirmOpen}
        onClose={closeSlugConfirmDialog}
        title="Confirm Slug Change"
        description="Changing a tenant slug affects routing and integration URLs."
        maxWidthClass="max-w-md"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <p style={{ fontSize: 13, color: "var(--ms-text2)", lineHeight: 1.6 }}>
            Slug changing from{" "}
            <strong style={{ color: "var(--ms-text)", fontFamily: "monospace" }}>{slugConfirmTarget?.currentSlug || "(empty)"}</strong>
            {" "}to{" "}
            <strong style={{ color: "var(--ms-accent)", fontFamily: "monospace" }}>{slugConfirmTarget?.nextSlug || "(empty)"}</strong>.
          </p>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span className="ms-field-label">
              Type <strong>{slugConfirmTarget?.nextSlug || "the new slug"}</strong> to confirm
            </span>
            <input
              className="ms-input"
              value={slugConfirmInput}
              onChange={(e) => setSlugConfirmInput(e.target.value)}
              placeholder={slugConfirmTarget?.nextSlug || "new-slug"}
              disabled={saving}
            />
          </label>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button className="ms-btn" onClick={closeSlugConfirmDialog} disabled={saving}>Cancel</button>
            <button className="ms-btn ms-btn-primary" onClick={confirmSlugChangeAndSave} disabled={saving}>
              {saving ? "Saving..." : "Confirm Change"}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
