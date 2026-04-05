"use client";

import { useEffect, useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { InlineLoader } from "@/components/ui/loader";
import { Modal } from "@/components/ui/modal";
import { DataTable, formatDataTableDate } from "@/components/data-table";

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
    ? tenants.find((tenant) => tenant.id === editingTenantId)
    : null;

  const adminOptionsMap = new Map();
  users.forEach((user) => {
    adminOptionsMap.set(user.id, user);
  });
  if (editingTenant && Array.isArray(editingTenant.users)) {
    editingTenant.users.forEach((user) => {
      if (!adminOptionsMap.has(user.id)) {
        adminOptionsMap.set(user.id, user);
      }
    });
  }
  const adminOptions = Array.from(adminOptionsMap.values());

  useEffect(() => {
    loadTenants();
  }, []);

  async function loadTenants() {
    setLoading(true);
    try {
      const [tenantsResponse, usersResponse] = await Promise.all([
        fetch("/api/admin/tenants", { cache: "no-store" }),
        fetch("/api/admin/user-management/users", { cache: "no-store" }),
      ]);

      const data = await tenantsResponse.json();
      const usersData = await usersResponse.json();

      if (!tenantsResponse.ok) {
        throw new Error(data.error || "Unable to load tenants.");
      }

      if (!usersResponse.ok) {
        throw new Error(usersData.error || "Unable to load users.");
      }

      setTenants(Array.isArray(data.tenants) ? data.tenants : []);
      setUsers(Array.isArray(usersData.users) ? usersData.users.filter((user) => user.role === "ADMIN") : []);
    } catch (error) {
      toast.error(error?.message || "Unable to load tenants.");
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
    const currentAdminId = Array.isArray(tenant.users) && tenant.users.length > 0
      ? tenant.users[0].id
      : "";
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
    if (saving) {
      return;
    }

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
    if (saving) {
      return;
    }

    setSlugConfirmOpen(false);
    setSlugConfirmInput("");
    setSlugConfirmTarget(null);
  }

  async function saveTenantFromDialog(options = {}) {
    const { skipSlugConfirmation = false } = options;

    if (!String(form.name || "").trim()) {
      toast.error("Tenant name is required.");
      return;
    }

    const { currentSlug, nextSlug, isSlugChange } = getSlugChangeContext();

    if (isSlugChange && !skipSlugConfirmation) {
      setSlugConfirmTarget({ currentSlug, nextSlug });
      setSlugConfirmInput("");
      setSlugConfirmOpen(true);
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: form.name,
        slug: form.slug,
        isActive: Boolean(form.isActive),
      };

      if (isSlugChange) {
        payload.confirmSlugChange = true;
      }

      if (form.existingAdminUserId === CREATE_NEW_ADMIN_OPTION) {
        if (!String(form.adminEmail || "").trim()) {
          toast.error("Admin email is required when creating a new admin.");
          setSaving(false);
          return;
        }
        payload.adminEmail = form.adminEmail;
        payload.adminName = form.adminName;
        payload.adminPassword = form.adminPassword;
      } else if (String(form.existingAdminUserId || "").trim()) {
        payload.existingAdminUserId = form.existingAdminUserId;
      }

      const response = await fetch(editingTenantId ? `/api/admin/tenants/${editingTenantId}` : "/api/admin/tenants", {
        method: editingTenantId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Unable to create tenant.");
      }

      toast.success(editingTenantId ? "Tenant updated." : "Tenant created.");
      closeSlugConfirmDialog();
      closeDialog();
      await loadTenants();
    } catch (error) {
      toast.error(error?.message || "Unable to save tenant.");
    } finally {
      setSaving(false);
    }
  }

  async function confirmSlugChangeAndSave() {
    const expectedSlug = String(slugConfirmTarget?.nextSlug || "");

    if (!expectedSlug) {
      toast.error("Unable to confirm slug change.");
      return;
    }

    if (slugConfirmInput !== expectedSlug) {
      toast.error("Slug change canceled. Confirmation text did not match.");
      return;
    }

    setSlugConfirmOpen(false);
    await saveTenantFromDialog({ skipSlugConfirmation: true });
  }

  const showCreateAdminFields = form.existingAdminUserId === CREATE_NEW_ADMIN_OPTION;

  const columns = [
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => row.original.name,
      },
      {
        accessorKey: "slug",
        header: "Slug",
      },
      {
        accessorKey: "isActive",
        header: "Active",
        cell: ({ row }) => (row.original.isActive ? "Yes" : "No"),
      },
      {
        id: "admins",
        header: "Admins",
        enableSorting: false,
        cell: ({ row }) => {
          const tenant = row.original;
          if (!Array.isArray(tenant.users) || tenant.users.length === 0) {
            return <span className="text-xs text-muted-foreground">No assigned admin</span>;
          }

          return (
            <div className="space-y-1">
              {tenant.users.map((admin) => (
                <p key={admin.id} className="text-xs text-muted-foreground">
                  {(admin.name || "Unnamed")} ({admin.email}){admin.isActive ? "" : " • inactive"}
                </p>
              ))}
            </div>
          );
        },
      },
      {
        id: "users",
        header: "Users",
        cell: ({ row }) => row.original?._count?.users ?? 0,
      },
      {
        id: "customers",
        header: "Customers",
        cell: ({ row }) => row.original?._count?.customers ?? 0,
      },
      {
        accessorKey: "createdAt",
        header: "Created",
        cell: ({ row }) => formatDataTableDate(row.original.createdAt),
      },
      {
        id: "actions",
        header: "Actions",
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => {
          const tenant = row.original;
          return (
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" className="h-8 px-2 sm:px-3" onClick={() => openEditDialog(tenant)}>
                <Pencil className="h-3.5 w-3.5 sm:mr-1" />
                <span className="hidden sm:inline">Edit</span>
              </Button>
              <Button
                variant={tenant.isActive ? "destructive" : "secondary"}
                className="h-8 px-2 sm:px-3"
                onClick={() => toggleTenantActive(tenant)}
                loading={saving}
                loadingText={tenant.isActive ? "Deactivating..." : "Activating..."}
                disabled={saving}
              >
                {tenant.isActive ? "Deactivate" : "Activate"}
              </Button>
            </div>
          );
        },
      },
    ];

  async function toggleTenantActive(tenant) {
    setSaving(true);
    try {
      const response = await fetch(`/api/admin/tenants/${tenant.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !tenant.isActive }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Unable to update tenant status.");
      }

      toast.success(`Tenant ${tenant.isActive ? "deactivated" : "activated"}.`);
      await loadTenants();
    } catch (error) {
      toast.error(error?.message || "Unable to update tenant status.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle>Tenants</CardTitle>
              <CardDescription>Current tenant list with user and customer counts.</CardDescription>
            </div>
            <Button onClick={openCreateDialog}>
              <Plus className="mr-2 h-4 w-4" />
              Add Tenant
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? <InlineLoader label="Loading tenants..." className="mb-3" /> : null}
          <DataTable
            columns={columns}
            data={tenants}
            isLoading={loading}
            emptyMessage="No tenants found."
            enableGlobalFilter
            enableColumnFilters={false}
          />
        </CardContent>
      </Card>

      <Modal
        open={dialogOpen}
        onClose={closeDialog}
        title={editingTenantId ? "Edit Tenant" : "Add Tenant"}
        description="Use this form for tenant details and optional admin assignment."
        maxWidthClass="max-w-5xl"
      >
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">Tenant Name</span>
              <Input
                value={form.name}
                placeholder="Acme Finance"
                onChange={(event) => {
                  const name = event.target.value;
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
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">Subdomain</span>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Input
                  value={form.slug}
                  placeholder="acme-finance"
                  maxLength={63}
                  onChange={(event) => {
                    const raw = event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "");
                    setForm((prev) => ({ ...prev, slug: raw, _slugManuallySet: true }));
                  }}
                />
                <span style={{ color: "var(--ms-text3, #888)", fontSize: 12, whiteSpace: "nowrap" }}>
                  .{process.env.NEXT_PUBLIC_APP_DOMAIN || "wrenforge.com"}
                </span>
              </div>
              {form.name && !form.slug && (
                <div style={{ fontSize: 11, color: "var(--ms-text3, #888)", marginTop: 2 }}>
                  Will be auto-generated from name
                </div>
              )}
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">Active</span>
              <select
                className="h-9 w-full rounded-md border border-slate-300/90 bg-white px-3 text-sm text-slate-900"
                value={form.isActive ? "yes" : "no"}
                onChange={(event) => updateField("isActive", event.target.value === "yes")}
              >
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </label>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">Admin (optional)</span>
              <select
                className="h-9 w-full rounded-md border border-slate-300/90 bg-white px-3 text-sm text-slate-900"
                value={form.existingAdminUserId || ""}
                onChange={(event) => updateField("existingAdminUserId", event.target.value)}
              >
                <option value="">None</option>
                <option value={CREATE_NEW_ADMIN_OPTION}>Create New</option>
                {adminOptions.map((user) => (
                  <option key={user.id} value={user.id}>
                    {(user.name || "Unnamed")} ({user.email})
                  </option>
                ))}
              </select>
            </label>
          </div>

          {showCreateAdminFields ? (
            <div className="grid gap-3 md:grid-cols-3">
              <label className="space-y-2">
                <span className="text-sm font-medium text-slate-700">Admin Email</span>
                <Input
                  type="email"
                  value={form.adminEmail}
                  placeholder="admin@tenant.local"
                  onChange={(event) => updateField("adminEmail", event.target.value)}
                />
              </label>
              <label className="space-y-2">
                <span className="text-sm font-medium text-slate-700">Admin Name</span>
                <Input
                  value={form.adminName}
                  placeholder="Tenant Admin"
                  onChange={(event) => updateField("adminName", event.target.value)}
                />
              </label>
              <label className="space-y-2">
                <span className="text-sm font-medium text-slate-700">Admin Password</span>
                <Input
                  type="password"
                  value={form.adminPassword}
                  placeholder="Admin@123"
                  onChange={(event) => updateField("adminPassword", event.target.value)}
                />
              </label>
            </div>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={closeDialog} disabled={saving}>Cancel</Button>
            <Button
              onClick={saveTenantFromDialog}
              loading={saving}
              loadingText="Saving..."
              disabled={saving}
            >
              {editingTenantId ? "Save Changes" : "Create Tenant"}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={slugConfirmOpen}
        onClose={closeSlugConfirmDialog}
        title="Confirm Slug Change"
        description="Changing a tenant slug can impact routing and integration links."
        maxWidthClass="max-w-lg"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            You are changing this tenant slug from <strong>{slugConfirmTarget?.currentSlug || "(empty)"}</strong> to{" "}
            <strong>{slugConfirmTarget?.nextSlug || "(empty)"}</strong>.
          </p>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">
              Type <strong>{slugConfirmTarget?.nextSlug || "the new slug"}</strong> to confirm
            </label>
            <Input
              value={slugConfirmInput}
              onChange={(event) => setSlugConfirmInput(event.target.value)}
              placeholder={slugConfirmTarget?.nextSlug || "new-slug"}
              disabled={saving}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={closeSlugConfirmDialog} disabled={saving}>
              Cancel
            </Button>
            <Button
              onClick={confirmSlugChangeAndSave}
              loading={saving}
              loadingText="Saving..."
              disabled={saving}
            >
              Confirm Change
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
