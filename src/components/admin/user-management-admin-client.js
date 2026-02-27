"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { RoleSelect } from "@/components/admin/role-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const EMPTY_USER_FORM = {
  name: "",
  email: "",
  password: "",
  roleKey: "",
  isActive: true,
  modules: "",
  permissions: "",
  featureToggles: "{}",
};

const EMPTY_ROLE_FORM = {
  key: "",
  name: "",
  description: "",
  baseRole: "SALES",
  modules: "",
  permissions: "",
  featureToggles: "{}",
  active: true,
};

const BULK_TEMPLATE = `name,email,roleKey,password,isActive,modules,permissions
John Sales,john.sales@crm.local,SALES,Pass@123,true,dashboard|customers|calls,customers:read|calls:trigger`;

function parseCsv(text) {
  return String(text || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function toCsv(values) {
  return Array.isArray(values) ? values.join(", ") : "";
}

function parseJsonObject(text) {
  const raw = String(text || "").trim();
  if (!raw) return {};

  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Feature toggles must be a JSON object.");
  }

  const normalized = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value !== "boolean") {
      throw new Error(`Feature toggle '${key}' must be true/false.`);
    }
    normalized[key] = value;
  }

  return normalized;
}

export function UserManagementAdminClient() {
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingUser, setSavingUser] = useState(false);
  const [savingRole, setSavingRole] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [selectedUserIds, setSelectedUserIds] = useState([]);
  const [showUserForm, setShowUserForm] = useState(false);
  const [showRoleForm, setShowRoleForm] = useState(false);
  const [userForm, setUserForm] = useState(EMPTY_USER_FORM);
  const [roleForm, setRoleForm] = useState(EMPTY_ROLE_FORM);
  const [bulkCsv, setBulkCsv] = useState(BULK_TEMPLATE);
  const [bulkRunning, setBulkRunning] = useState(false);
  const userDialogRef = useRef(null);
  const roleDialogRef = useRef(null);

  const selectedRole = useMemo(
    () => roles.find((role) => role.key === userForm.roleKey) || null,
    [roles, userForm.roleKey]
  );

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [usersRes, rolesRes, logsRes] = await Promise.all([
        fetch("/api/admin/user-management/users"),
        fetch("/api/admin/user-management/roles"),
        fetch("/api/admin/user-management/audit-logs?limit=30"),
      ]);

      const [usersData, rolesData, logsData] = await Promise.all([
        usersRes.json(),
        rolesRes.json(),
        logsRes.json(),
      ]);

      if (!usersRes.ok) throw new Error(usersData.error || "Unable to load users.");
      if (!rolesRes.ok) throw new Error(rolesData.error || "Unable to load roles.");
      if (!logsRes.ok) throw new Error(logsData.error || "Unable to load audit logs.");

      setUsers(Array.isArray(usersData.users) ? usersData.users : []);
      setRoles(Array.isArray(rolesData.roles) ? rolesData.roles : []);
      setLogs(Array.isArray(logsData.logs) ? logsData.logs : []);

      if (!userForm.roleKey && Array.isArray(rolesData.roles) && rolesData.roles.length > 0) {
        setUserForm((prev) => ({ ...prev, roleKey: rolesData.roles[0].key }));
      }
    } catch (error) {
      toast.error(error?.message || "Unable to load user management data.");
    } finally {
      setLoading(false);
    }
  }

  function updateUserForm(field, value) {
    setUserForm((current) => ({ ...current, [field]: value }));
  }

  function updateRoleForm(field, value) {
    setRoleForm((current) => ({ ...current, [field]: value }));
  }

  function validateUserForm() {
    if (!String(userForm.name || "").trim()) return "Name is required.";
    if (!String(userForm.email || "").trim()) return "Email is required.";
    if (!selectedUserId && String(userForm.password || "").length < 6) return "Password must be at least 6 characters.";
    if (!String(userForm.roleKey || "").trim()) return "Role is required.";
    return "";
  }

  async function createUser() {
    const validationError = validateUserForm();
    if (validationError) {
      toast.error(validationError);
      return;
    }

    setSavingUser(true);
    try {
      const response = await fetch("/api/admin/user-management/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: userForm.name,
          email: userForm.email,
          password: userForm.password,
          roleKey: userForm.roleKey,
          isActive: Boolean(userForm.isActive),
          modules: parseCsv(userForm.modules),
          permissions: parseCsv(userForm.permissions),
          featureToggles: parseJsonObject(userForm.featureToggles),
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to create user.");

      toast.success("User created.");
      setUserForm((prev) => ({ ...EMPTY_USER_FORM, roleKey: prev.roleKey || "" }));
      closeUserDialog();
      await loadAll();
    } catch (error) {
      toast.error(error?.message || "Unable to create user.");
    } finally {
      setSavingUser(false);
    }
  }

  async function updateSelectedUser() {
    if (!selectedUserId) {
      toast.error("Select a user first.");
      return;
    }

    const validationError = validateUserForm();
    if (validationError) {
      toast.error(validationError);
      return;
    }

    setSavingUser(true);
    try {
      const payload = {
        name: userForm.name,
        email: userForm.email,
        roleKey: userForm.roleKey,
        isActive: Boolean(userForm.isActive),
        modules: parseCsv(userForm.modules),
        permissions: parseCsv(userForm.permissions),
        featureToggles: parseJsonObject(userForm.featureToggles),
      };

      if (String(userForm.password || "").trim()) {
        payload.password = userForm.password;
      }

      const response = await fetch(`/api/admin/user-management/users/${selectedUserId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to update user.");

      toast.success("User updated.");
      closeUserDialog();
      await loadAll();
    } catch (error) {
      toast.error(error?.message || "Unable to update user.");
    } finally {
      setSavingUser(false);
    }
  }

  async function deleteUserById(userId) {
    if (!userId) {
      toast.error("User ID is missing.");
      return;
    }

    setSavingUser(true);
    try {
      const response = await fetch(`/api/admin/user-management/users/${userId}`, {
        method: "DELETE",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to delete user.");

      toast.success("User deleted.");
      if (selectedUserId === userId) {
        setSelectedUserId("");
        setShowUserForm(false);
      }
      await loadAll();
    } catch (error) {
      toast.error(error?.message || "Unable to delete user.");
    } finally {
      setSavingUser(false);
    }
  }

  function parseBulkCsv(text) {
    const lines = String(text || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length < 2) {
      throw new Error("Bulk CSV must include header + at least one data row.");
    }

    const header = lines[0].split(",").map((value) => value.trim());
    const requiredColumns = ["name", "email", "roleKey", "password"];

    for (const column of requiredColumns) {
      if (!header.includes(column)) {
        throw new Error(`Missing required column: ${column}`);
      }
    }

    const rows = [];
    for (let index = 1; index < lines.length; index += 1) {
      const values = lines[index].split(",");
      const row = {};

      for (let colIndex = 0; colIndex < header.length; colIndex += 1) {
        row[header[colIndex]] = String(values[colIndex] || "").trim();
      }

      rows.push({
        name: row.name,
        email: row.email,
        roleKey: row.roleKey,
        password: row.password,
        isActive: String(row.isActive || "true").toLowerCase() !== "false",
        modules: String(row.modules || "")
          .split("|")
          .map((value) => value.trim())
          .filter(Boolean),
        permissions: String(row.permissions || "")
          .split("|")
          .map((value) => value.trim())
          .filter(Boolean),
      });
    }

    return rows;
  }

  async function runBulkUpload() {
    setBulkRunning(true);
    try {
      const rows = parseBulkCsv(bulkCsv);
      const response = await fetch("/api/admin/user-management/users/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Unable to process bulk upload.");
      }

      toast.success(`Bulk upload done: ${data.successCount} success, ${data.failureCount} failed.`);
      await loadAll();
    } catch (error) {
      toast.error(error?.message || "Unable to process bulk upload.");
    } finally {
      setBulkRunning(false);
    }
  }

  function toggleUserSelection(userId) {
    setSelectedUserIds((current) => {
      if (current.includes(userId)) {
        return current.filter((value) => value !== userId);
      }

      return [...current, userId];
    });
  }

  function toggleSelectAllUsers() {
    if (selectedUserIds.length === users.length) {
      setSelectedUserIds([]);
      return;
    }

    setSelectedUserIds(users.map((user) => user.id));
  }

  async function runBatchAction(action) {
    if (selectedUserIds.length === 0) {
      toast.error("Select at least one user for batch action.");
      return;
    }

    setSavingUser(true);
    try {
      const response = await fetch("/api/admin/user-management/users/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, userIds: selectedUserIds }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Unable to run batch action.");
      }

      toast.success(`Batch ${action.toLowerCase()} applied to ${data.count} users.`);
      setSelectedUserIds([]);
      await loadAll();
    } catch (error) {
      toast.error(error?.message || "Unable to run batch action.");
    } finally {
      setSavingUser(false);
    }
  }

  async function createRole() {
    if (!roleForm.key.trim() || !roleForm.name.trim()) {
      toast.error("Role key and name are required.");
      return;
    }

    setSavingRole(true);
    try {
      const response = await fetch("/api/admin/user-management/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: roleForm.key,
          name: roleForm.name,
          description: roleForm.description,
          baseRole: roleForm.baseRole,
          modules: parseCsv(roleForm.modules),
          permissions: parseCsv(roleForm.permissions),
          featureToggles: parseJsonObject(roleForm.featureToggles),
          active: Boolean(roleForm.active),
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to create role.");

      toast.success("Role created.");
      setRoleForm(EMPTY_ROLE_FORM);
      closeRoleDialog();
      await loadAll();
    } catch (error) {
      toast.error(error?.message || "Unable to create role.");
    } finally {
      setSavingRole(false);
    }
  }

  async function updateSelectedRole() {
    if (!selectedRoleId) {
      toast.error("Select a role first.");
      return;
    }

    if (!roleForm.key.trim() || !roleForm.name.trim()) {
      toast.error("Role key and name are required.");
      return;
    }

    setSavingRole(true);
    try {
      const response = await fetch(`/api/admin/user-management/roles/${selectedRoleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: roleForm.key,
          name: roleForm.name,
          description: roleForm.description,
          baseRole: roleForm.baseRole,
          modules: parseCsv(roleForm.modules),
          permissions: parseCsv(roleForm.permissions),
          featureToggles: parseJsonObject(roleForm.featureToggles),
          active: Boolean(roleForm.active),
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to update role.");

      toast.success("Role updated.");
      closeRoleDialog();
      await loadAll();
    } catch (error) {
      toast.error(error?.message || "Unable to update role.");
    } finally {
      setSavingRole(false);
    }
  }

  async function deleteRoleById(roleId) {
    if (!roleId) {
      toast.error("Role ID is missing.");
      return;
    }

    setSavingRole(true);
    try {
      const response = await fetch(`/api/admin/user-management/roles/${roleId}`, {
        method: "DELETE",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to delete role.");

      toast.success("Role deleted.");
      if (selectedRoleId === roleId) {
        setSelectedRoleId("");
        setShowRoleForm(false);
        setRoleForm(EMPTY_ROLE_FORM);
      }
      await loadAll();
    } catch (error) {
      toast.error(error?.message || "Unable to delete role.");
    } finally {
      setSavingRole(false);
    }
  }

  function hydrateUserForm(user) {
    setSelectedUserId(user.id);
    setShowUserForm(true);
    setUserForm({
      name: user.name || "",
      email: user.email || "",
      password: "",
      roleKey: user.roleKey || user.role || "",
      isActive: Boolean(user.isActive),
      modules: toCsv(user?.metadata?.overrides?.modules || []),
      permissions: toCsv(user?.metadata?.overrides?.permissions || []),
      featureToggles: JSON.stringify(user?.metadata?.overrides?.featureToggles || {}, null, 2),
    });
  }

  function hydrateRoleForm(role) {
    setSelectedRoleId(role.id);
    setShowRoleForm(true);
    setRoleForm({
      key: role.key || "",
      name: role.name || "",
      description: role.description || "",
      baseRole: role.baseRole || "SALES",
      modules: toCsv(role.modules || []),
      permissions: toCsv(role.permissions || []),
      featureToggles: JSON.stringify(role.featureToggles || {}, null, 2),
      active: Boolean(role.active),
    });
  }

  function startCreateUser() {
    setSelectedUserId("");
    setShowUserForm(true);
    setUserForm((prev) => ({
      ...EMPTY_USER_FORM,
      roleKey: prev.roleKey || roles[0]?.key || "",
    }));
  }

  function startCreateRole() {
    setSelectedRoleId("");
    setShowRoleForm(true);
    setRoleForm(EMPTY_ROLE_FORM);
  }

  function closeUserDialog() {
    setShowUserForm(false);
    setSelectedUserId("");
  }

  function closeRoleDialog() {
    setShowRoleForm(false);
    setSelectedRoleId("");
  }

  useEffect(() => {
    if (!showUserForm && !showRoleForm) return;

    function onKeyDown(event) {
      if (event.key !== "Escape") return;

      if (showUserForm) {
        closeUserDialog();
        return;
      }

      if (showRoleForm) {
        closeRoleDialog();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showRoleForm, showUserForm]);

  useEffect(() => {
    if (!showUserForm && !showRoleForm) return;

    const activeElementBeforeOpen = document.activeElement;
    const dialogElement = showUserForm ? userDialogRef.current : roleDialogRef.current;
    if (!dialogElement) return;

    const getFocusableElements = () => {
      const selectors = [
        "a[href]",
        "button:not([disabled])",
        "textarea:not([disabled])",
        "input:not([disabled])",
        "select:not([disabled])",
        "[tabindex]:not([tabindex='-1'])",
      ].join(",");

      return Array.from(dialogElement.querySelectorAll(selectors)).filter(
        (element) => element.getAttribute("aria-hidden") !== "true"
      );
    };

    const focusableElements = getFocusableElements();
    if (focusableElements.length > 0) {
      focusableElements[0].focus();
    }

    function handleTabKey(event) {
      if (event.key !== "Tab") return;

      const elements = getFocusableElements();
      if (elements.length === 0) {
        event.preventDefault();
        return;
      }

      const firstElement = elements[0];
      const lastElement = elements[elements.length - 1];
      const activeElement = document.activeElement;

      if (event.shiftKey) {
        if (activeElement === firstElement || !dialogElement.contains(activeElement)) {
          event.preventDefault();
          lastElement.focus();
        }
        return;
      }

      if (activeElement === lastElement || !dialogElement.contains(activeElement)) {
        event.preventDefault();
        firstElement.focus();
      }
    }

    document.addEventListener("keydown", handleTabKey);
    return () => {
      document.removeEventListener("keydown", handleTabKey);
      if (activeElementBeforeOpen && typeof activeElementBeforeOpen.focus === "function") {
        activeElementBeforeOpen.focus();
      }
    };
  }, [showRoleForm, showUserForm]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>User Management</CardTitle>
              <CardDescription>
                Create, edit, and remove users with role-driven configuration and override controls.
              </CardDescription>
            </div>
            <Button onClick={startCreateUser}>
              <Plus className="mr-1 h-4 w-4" />
              Add User
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? <p className="text-sm text-slate-600">Loading users...</p> : null}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <input
                    type="checkbox"
                    checked={users.length > 0 && selectedUserIds.length === users.length}
                    onChange={toggleSelectAllUsers}
                  />
                </TableHead>
                <TableHead className="min-w-[180px]">Name</TableHead>
                <TableHead className="min-w-[220px]">Email</TableHead>
                <TableHead className="min-w-[140px]">Role</TableHead>
                <TableHead className="min-w-[100px]">Active</TableHead>
                <TableHead className="min-w-[180px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!loading && users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6}>No users found.</TableCell>
                </TableRow>
              ) : null}
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <input
                      type="checkbox"
                      checked={selectedUserIds.includes(user.id)}
                      onChange={() => toggleUserSelection(user.id)}
                    />
                  </TableCell>
                  <TableCell>{user.name}</TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>{user.roleKey || user.role}</TableCell>
                  <TableCell>{user.isActive ? "Yes" : "No"}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        className="h-8 px-2 sm:px-3"
                        variant="secondary"
                        onClick={() => hydrateUserForm(user)}
                        aria-label="Edit"
                        title="Edit"
                      >
                        <Pencil className="h-3.5 w-3.5 sm:mr-1" />
                        <span className="hidden sm:inline">Edit</span>
                      </Button>
                      <Button
                        className="h-8 px-2 sm:px-3"
                        variant="destructive"
                        onClick={() => deleteUserById(user.id)}
                        disabled={savingUser}
                        aria-label="Delete"
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5 sm:mr-1" />
                        <span className="hidden sm:inline">Delete</span>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => runBatchAction("ACTIVATE")} disabled={savingUser || selectedUserIds.length === 0}>Activate Selected</Button>
            <Button variant="secondary" onClick={() => runBatchAction("DEACTIVATE")} disabled={savingUser || selectedUserIds.length === 0}>Deactivate Selected</Button>
            <Button variant="destructive" onClick={() => runBatchAction("DELETE")} disabled={savingUser || selectedUserIds.length === 0}>Delete Selected</Button>
          </div>
        </CardContent>
      </Card>

      <Modal
        open={showUserForm}
        onClose={closeUserDialog}
        title={selectedUserId ? "Edit User" : "Add User"}
        description={selectedUserId ? "Update existing user details and access." : "Create a new user with role and access overrides."}
        ariaLabel="User dialog"
        dialogRef={userDialogRef}
      >
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                <label className="space-y-2">
                  <span className="text-sm font-medium text-slate-700">Name</span>
                  <Input value={userForm.name} onChange={(event) => updateUserForm("name", event.target.value)} />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-medium text-slate-700">Email</span>
                  <Input type="email" value={userForm.email} onChange={(event) => updateUserForm("email", event.target.value)} />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-medium text-slate-700">Password {selectedUserId ? "(optional)" : ""}</span>
                  <Input type="password" value={userForm.password} onChange={(event) => updateUserForm("password", event.target.value)} />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-medium text-slate-700">Role</span>
                  <RoleSelect
                    roles={roles.filter((role) => role.active)}
                    value={userForm.roleKey}
                    onChange={(event) => updateUserForm("roleKey", event.target.value)}
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-medium text-slate-700">Active</span>
                  <select
                    className="h-9 w-full rounded-md border border-slate-300/90 bg-white px-3 text-sm text-slate-900"
                    value={userForm.isActive ? "yes" : "no"}
                    onChange={(event) => updateUserForm("isActive", event.target.value === "yes")}
                  >
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </label>
              </div>

              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm font-medium text-slate-700">Permission Overrides (CSV)</span>
                  <Input
                    value={userForm.permissions}
                    placeholder="customers:read, customers:write"
                    onChange={(event) => updateUserForm("permissions", event.target.value)}
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-medium text-slate-700">Module Overrides (CSV)</span>
                  <Input
                    value={userForm.modules}
                    placeholder="dashboard, automation"
                    onChange={(event) => updateUserForm("modules", event.target.value)}
                  />
                </label>
              </div>

              <label className="mt-3 block space-y-2">
                <span className="text-sm font-medium text-slate-700">Feature Toggle Overrides (JSON)</span>
                <textarea
                  className="min-h-[90px] w-full rounded-md border border-slate-300/90 bg-white p-3 text-sm text-slate-900"
                  value={userForm.featureToggles}
                  onChange={(event) => updateUserForm("featureToggles", event.target.value)}
                  placeholder='{"canBulkUserActions": true}'
                />
              </label>

              {selectedRole ? (
                <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                  <p><span className="font-semibold">Role Template:</span> {selectedRole.name} ({selectedRole.key})</p>
                  <p className="mt-1"><span className="font-semibold">Base Role:</span> {selectedRole.baseRole}</p>
                  <p className="mt-1"><span className="font-semibold">Modules:</span> {toCsv(selectedRole.modules || []) || "-"}</p>
                  <p className="mt-1"><span className="font-semibold">Permissions:</span> {toCsv(selectedRole.permissions || []) || "-"}</p>
                  <p className="mt-1"><span className="font-semibold">Feature Toggles:</span> {JSON.stringify(selectedRole.featureToggles || {})}</p>
                </div>
              ) : null}

              <div className="mt-4 flex flex-wrap gap-2">
                {selectedUserId ? (
                  <Button onClick={updateSelectedUser} disabled={savingUser}>{savingUser ? "Saving..." : "Update User"}</Button>
                ) : (
                  <Button onClick={createUser} disabled={savingUser}>{savingUser ? "Saving..." : "Create User"}</Button>
                )}
                <Button variant="secondary" onClick={closeUserDialog}>Cancel</Button>
              </div>

              {!selectedUserId ? (
                <div className="mt-6 rounded-md border border-slate-200 p-4">
                  <h4 className="text-sm font-semibold text-slate-800">Bulk User Upload</h4>
                  <p className="mt-1 text-xs text-slate-600">
                    Upload users in CSV format. Use comma as column separator and pipe | inside modules/permissions.
                  </p>
                  <textarea
                    className="mt-3 min-h-[180px] w-full rounded-md border border-slate-300/90 bg-white p-3 text-sm text-slate-900"
                    value={bulkCsv}
                    onChange={(event) => setBulkCsv(event.target.value)}
                  />
                  <div className="mt-3 flex gap-2">
                    <Button onClick={runBulkUpload} disabled={bulkRunning}>{bulkRunning ? "Uploading..." : "Run Bulk Upload"}</Button>
                  </div>
                </div>
              ) : null}
      </Modal>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Role Definitions</CardTitle>
              <CardDescription>
                Define custom roles with module and permission templates for future expansion.
              </CardDescription>
            </div>
            <Button onClick={startCreateRole}>
              <Plus className="mr-1 h-4 w-4" />
              Add Role
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[180px]">Name</TableHead>
                <TableHead className="min-w-[120px]">Key</TableHead>
                <TableHead className="min-w-[140px]">Base Role</TableHead>
                <TableHead className="min-w-[100px]">System</TableHead>
                <TableHead className="min-w-[100px]">Active</TableHead>
                <TableHead className="min-w-[180px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {roles.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6}>No roles found.</TableCell>
                </TableRow>
              ) : null}
              {roles.map((role) => (
                <TableRow key={role.id}>
                  <TableCell>{role.name}</TableCell>
                  <TableCell>{role.key}</TableCell>
                  <TableCell>{role.baseRole}</TableCell>
                  <TableCell>{role.isSystem ? "Yes" : "No"}</TableCell>
                  <TableCell>{role.active ? "Yes" : "No"}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        className="h-8 px-2 sm:px-3"
                        variant="secondary"
                        onClick={() => hydrateRoleForm(role)}
                        disabled={role.isSystem}
                        aria-label="Edit"
                        title={role.isSystem ? "System roles cannot be edited" : "Edit"}
                      >
                        <Pencil className="h-3.5 w-3.5 sm:mr-1" />
                        <span className="hidden sm:inline">Edit</span>
                      </Button>
                      <Button
                        className="h-8 px-2 sm:px-3"
                        variant="destructive"
                        onClick={() => deleteRoleById(role.id)}
                        disabled={savingRole || role.isSystem}
                        aria-label="Delete"
                        title={role.isSystem ? "System roles cannot be deleted" : "Delete"}
                      >
                        <Trash2 className="h-3.5 w-3.5 sm:mr-1" />
                        <span className="hidden sm:inline">Delete</span>
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
        open={showRoleForm}
        onClose={closeRoleDialog}
        title={selectedRoleId ? "Edit Role" : "Add Role"}
        description={selectedRoleId ? "Update role template details and permissions." : "Create a new role template for user access."}
        ariaLabel="Role dialog"
        dialogRef={roleDialogRef}
      >
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                <label className="space-y-2">
                  <span className="text-sm font-medium text-slate-700">Role Key</span>
                  <Input value={roleForm.key} onChange={(event) => updateRoleForm("key", event.target.value)} placeholder="TEAM_LEAD" />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-medium text-slate-700">Role Name</span>
                  <Input value={roleForm.name} onChange={(event) => updateRoleForm("name", event.target.value)} placeholder="Team Lead" />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-medium text-slate-700">Base Role</span>
                  <select
                    className="h-9 w-full rounded-md border border-slate-300/90 bg-white px-3 text-sm text-slate-900"
                    value={roleForm.baseRole}
                    onChange={(event) => updateRoleForm("baseRole", event.target.value)}
                  >
                    <option value="SALES">SALES</option>
                    <option value="ADMIN">ADMIN</option>
                    <option value="SUPER_ADMIN">SUPER_ADMIN</option>
                  </select>
                </label>
              </div>

              <label className="mt-3 block space-y-2">
                <span className="text-sm font-medium text-slate-700">Description</span>
                <Input value={roleForm.description} onChange={(event) => updateRoleForm("description", event.target.value)} />
              </label>

              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm font-medium text-slate-700">Permissions (CSV)</span>
                  <Input value={roleForm.permissions} onChange={(event) => updateRoleForm("permissions", event.target.value)} />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-medium text-slate-700">Modules (CSV)</span>
                  <Input value={roleForm.modules} onChange={(event) => updateRoleForm("modules", event.target.value)} />
                </label>
              </div>

              <label className="mt-3 block space-y-2">
                <span className="text-sm font-medium text-slate-700">Feature Toggles (JSON)</span>
                <textarea
                  className="min-h-[90px] w-full rounded-md border border-slate-300/90 bg-white p-3 text-sm text-slate-900"
                  value={roleForm.featureToggles}
                  onChange={(event) => updateRoleForm("featureToggles", event.target.value)}
                  placeholder='{"canManageRoles": false}'
                />
              </label>

              <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={roleForm.active}
                  onChange={(event) => updateRoleForm("active", event.target.checked)}
                />
                Active
              </label>

              <div className="mt-4 flex gap-2">
                {selectedRoleId ? (
                  <Button onClick={updateSelectedRole} disabled={savingRole}>{savingRole ? "Saving..." : "Update Role"}</Button>
                ) : (
                  <Button onClick={createRole} disabled={savingRole}>{savingRole ? "Saving..." : "Create Role"}</Button>
                )}
                <Button variant="secondary" onClick={closeRoleDialog}>Cancel</Button>
              </div>
      </Modal>

      <Card>
        <CardHeader>
          <CardTitle>Audit Trail</CardTitle>
          <CardDescription>
            Key super-admin actions for user and role changes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700">Time</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700">Action</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700">Actor</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700">Target</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td className="whitespace-nowrap px-3 py-2 text-slate-700">{new Date(log.createdAt).toLocaleString()}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-slate-700">{log.action}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-slate-700">{log.actor?.name || log.actor?.email || "System"}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-slate-700">{log.targetUser?.email || "-"}</td>
                    <td className="px-3 py-2 text-slate-700">
                      <pre className="max-w-[420px] whitespace-pre-wrap text-[11px]">{JSON.stringify(log.metadata || {}, null, 2)}</pre>
                    </td>
                  </tr>
                ))}
                {logs.length === 0 ? (
                  <tr>
                    <td className="px-3 py-4 text-sm text-slate-500" colSpan={5}>No audit entries yet.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
