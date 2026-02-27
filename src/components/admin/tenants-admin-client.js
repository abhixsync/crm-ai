"use client";

import { useEffect, useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const EMPTY_FORM = {
  name: "",
  slug: "",
  isActive: true,
  existingAdminUserId: "",
  adminEmail: "",
  adminName: "",
  adminPassword: "",
};

const CREATE_NEW_ADMIN_OPTION = "__create_new_admin__";

export function TenantsAdminClient() {
  const [tenants, setTenants] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTenantId, setEditingTenantId] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);

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
    setDialogOpen(false);
    setEditingTenantId("");
    setForm(EMPTY_FORM);
  }

  async function saveTenantFromDialog() {
    if (!String(form.name || "").trim()) {
      toast.error("Tenant name is required.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: form.name,
        slug: form.slug,
        isActive: Boolean(form.isActive),
      };

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
      closeDialog();
      await loadTenants();
    } catch (error) {
      toast.error(error?.message || "Unable to save tenant.");
    } finally {
      setSaving(false);
    }
  }

  const showCreateAdminFields = form.existingAdminUserId === CREATE_NEW_ADMIN_OPTION;

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
          {loading ? <p className="text-sm text-slate-600">Loading tenants...</p> : null}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[200px]">Name</TableHead>
                <TableHead className="min-w-[180px]">Slug</TableHead>
                <TableHead className="min-w-[100px]">Active</TableHead>
                <TableHead className="min-w-[220px]">Admins</TableHead>
                <TableHead className="min-w-[100px]">Users</TableHead>
                <TableHead className="min-w-[120px]">Customers</TableHead>
                <TableHead className="min-w-[180px]">Created</TableHead>
                <TableHead className="min-w-[180px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!loading && tenants.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8}>No tenants found.</TableCell>
                </TableRow>
              ) : null}
              {tenants.map((tenant) => (
                <TableRow key={tenant.id}>
                  <TableCell>{tenant.name}</TableCell>
                  <TableCell>{tenant.slug}</TableCell>
                  <TableCell>{tenant.isActive ? "Yes" : "No"}</TableCell>
                  <TableCell>
                    {Array.isArray(tenant.users) && tenant.users.length > 0 ? (
                      <div className="space-y-1">
                        {tenant.users.map((admin) => (
                          <p key={admin.id} className="text-xs text-slate-700">
                            {(admin.name || "Unnamed")} ({admin.email}){admin.isActive ? "" : " • inactive"}
                          </p>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-500">No assigned admin</span>
                    )}
                  </TableCell>
                  <TableCell>{tenant?._count?.users ?? 0}</TableCell>
                  <TableCell>{tenant?._count?.customers ?? 0}</TableCell>
                  <TableCell>{tenant.createdAt ? new Date(tenant.createdAt).toLocaleString() : "-"}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="secondary" className="h-8 px-2 sm:px-3" onClick={() => openEditDialog(tenant)}>
                        <Pencil className="h-3.5 w-3.5 sm:mr-1" />
                        <span className="hidden sm:inline">Edit</span>
                      </Button>
                      <Button
                        variant={tenant.isActive ? "destructive" : "secondary"}
                        className="h-8 px-2 sm:px-3"
                        onClick={() => toggleTenantActive(tenant)}
                        disabled={saving}
                      >
                        {tenant.isActive ? "Deactivate" : "Activate"}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
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
                onChange={(event) => updateField("name", event.target.value)}
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">Tenant Slug (optional)</span>
              <Input
                value={form.slug}
                placeholder="acme-finance"
                onChange={(event) => updateField("slug", event.target.value)}
              />
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
            <Button onClick={saveTenantFromDialog} disabled={saving}>
              {saving ? "Saving..." : editingTenantId ? "Save Changes" : "Create Tenant"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
