"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { Mail, Pencil, Plus, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { DataTable, formatDataTableDate } from "@/components/data-table";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { RoleSelect } from "@/components/admin/role-select";
import { InlineLoader } from "@/components/ui/loader";

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
  const { data: session } = useSession();
  const currentUserId = session?.user?.id || "";
  const currentRole = session?.user?.role || "";
  const isAdminOnly = currentRole === "ADMIN";

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
  const [userCreationMode, setUserCreationMode] = useState("manual");
  const [userForm, setUserForm] = useState(EMPTY_USER_FORM);
  const [roleForm, setRoleForm] = useState(EMPTY_ROLE_FORM);
  const [bulkRunning, setBulkRunning] = useState(false);
  const userDialogRef = useRef(null);
  const roleDialogRef = useRef(null);

  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("SALES");
  const [sendingInvite, setSendingInvite] = useState(false);

  const selectedRole = useMemo(
    () => roles.find((role) => role.key === userForm.roleKey) || null,
    [roles, userForm.roleKey]
  );

  const roleOptionsForUserForm = useMemo(() => {
    const base = roles.filter((role) => role.active);
    if (!isAdminOnly) {
      return base;
    }

    return base.filter((role) => String(role.key || "").toUpperCase() !== "SUPER_ADMIN");
  }, [isAdminOnly, roles]);

  const visibleUsers = useMemo(() => users, [users]);

  const loadAll = useCallback(async () => {
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

      const nextRoles = Array.isArray(rolesData.roles) ? rolesData.roles : [];
      const allowedRoles = isAdminOnly
        ? nextRoles.filter((role) => String(role.key || "").toUpperCase() !== "SUPER_ADMIN")
        : nextRoles;

      if (allowedRoles.length > 0) {
        setUserForm((prev) => (prev.roleKey ? prev : { ...prev, roleKey: allowedRoles[0].key }));
      }
    } catch (error) {
      toast.error(error?.message || "Unable to load user management data.");
    } finally {
      setLoading(false);
    }
  }, [isAdminOnly]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

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
        body: JSON.stringify(
          isAdminOnly
            ? {
                name: userForm.name,
                email: userForm.email,
                password: userForm.password,
                roleKey: userForm.roleKey,
                isActive: Boolean(userForm.isActive),
              }
            : {
                name: userForm.name,
                email: userForm.email,
                password: userForm.password,
                roleKey: userForm.roleKey,
                isActive: Boolean(userForm.isActive),
                modules: parseCsv(userForm.modules),
                permissions: parseCsv(userForm.permissions),
                featureToggles: parseJsonObject(userForm.featureToggles),
              }
        ),
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
        ...(isAdminOnly
          ? {}
          : {
              modules: parseCsv(userForm.modules),
              permissions: parseCsv(userForm.permissions),
              featureToggles: parseJsonObject(userForm.featureToggles),
            }),
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

  function splitList(value) {
    return String(value || "")
      .split(/[|,]/)
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  async function parseBulkFile(file) {
    const XLSX = await import("xlsx");
    const bytes = await file.arrayBuffer();
    const workbook = XLSX.read(bytes, { type: "array" });
    const firstSheet = workbook.SheetNames[0];

    if (!firstSheet) {
      throw new Error("No worksheet found in uploaded file.");
    }

    const worksheet = workbook.Sheets[firstSheet];
    const rawRows = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

    if (!Array.isArray(rawRows) || rawRows.length === 0) {
      throw new Error("Uploaded file is empty.");
    }

    const rows = rawRows.map((rawRow) => {
      const normalized = {};
      for (const [key, value] of Object.entries(rawRow || {})) {
        normalized[String(key || "").trim().toLowerCase()] = String(value ?? "").trim();
      }

      return {
        name: normalized.name,
        email: normalized.email,
        roleKey: normalized.rolekey || normalized.role,
        password: normalized.password,
        isActive: String(normalized.isactive || "true").toLowerCase() !== "false",
        modules: splitList(normalized.modules),
        permissions: splitList(normalized.permissions),
      };
    });

    const invalidRowIndex = rows.findIndex(
      (row) => !String(row.name || "").trim() || !String(row.email || "").trim() || !String(row.roleKey || "").trim() || !String(row.password || "").trim()
    );

    if (invalidRowIndex !== -1) {
      throw new Error(`Invalid or incomplete data at row ${invalidRowIndex + 2}. Required columns: name, email, roleKey, password.`);
    }

    return rows;
  }

  async function runBulkUpload(file) {
    setBulkRunning(true);
    try {
      const rows = await parseBulkFile(file);
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

  async function onBulkUploadFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    await runBulkUpload(file);
    event.target.value = "";
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
    setUserCreationMode("manual");
    setUserForm((prev) => ({
      ...EMPTY_USER_FORM,
      roleKey: prev.roleKey || roleOptionsForUserForm[0]?.key || "",
    }));
  }

  function startCreateRole() {
    setSelectedRoleId("");
    setShowRoleForm(true);
    setRoleForm(EMPTY_ROLE_FORM);
  }

  function closeUserDialog() {
    setShowUserForm(false);
    setUserCreationMode("manual");
    setSelectedUserId("");
  }

  function closeRoleDialog() {
    setShowRoleForm(false);
    setSelectedRoleId("");
  }

  function closeInviteDialog() {
    setShowInviteForm(false);
    setInviteEmail("");
    setInviteRole("SALES");
  }

  async function sendInvite() {
    const email = String(inviteEmail || "").trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error("Please enter a valid email address.");
      return;
    }

    setSendingInvite(true);
    try {
      const response = await fetch("/api/admin/user-management/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role: inviteRole }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to send invite.");

      toast.success(`Invite sent to ${email}.`);
      closeInviteDialog();
    } catch (error) {
      toast.error(error?.message || "Unable to send invite.");
    } finally {
      setSendingInvite(false);
    }
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

  const userColumns = useMemo(
    () => [
      !isAdminOnly
        ? {
            id: "select",
            enableSorting: false,
            enableHiding: false,
            header: () => (
              <input
                type="checkbox"
                checked={visibleUsers.length > 0 && selectedUserIds.length === visibleUsers.length}
                onChange={toggleSelectAllUsers}
                aria-label="Select all users"
              />
            ),
            cell: ({ row }) => (
              <input
                type="checkbox"
                checked={selectedUserIds.includes(row.original.id)}
                onChange={() => toggleUserSelection(row.original.id)}
                aria-label="Select user"
              />
            ),
          }
        : null,
      {
        accessorKey: "name",
        header: "Name",
      },
      {
        accessorKey: "email",
        header: "Email",
      },
      {
        id: "role",
        header: "Role",
        cell: ({ row }) => row.original.roleKey || row.original.role,
      },
      {
        accessorKey: "isActive",
        header: "Active",
        cell: ({ row }) => (row.original.isActive ? "Yes" : "No"),
      },
      {
        id: "actions",
        header: "Actions",
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => {
          const user = row.original;
          return (
            <div className="flex flex-wrap gap-2">
              {!isAdminOnly || user.id === currentUserId || (isAdminOnly && String(user.roleKey || user.role || "").toUpperCase() === "SALES") ? (
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
              ) : null}
              {!isAdminOnly || (isAdminOnly && String(user.roleKey || user.role || "").toUpperCase() === "SALES") ? (
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
              ) : null}
            </div>
          );
        },
      },
    ].filter(Boolean),
    [
      currentUserId,
      isAdminOnly,
      savingUser,
      selectedUserIds,
      visibleUsers.length,
    ]
  );

  const roleColumns = useMemo(
    () => [
      { accessorKey: "name", header: "Name" },
      { accessorKey: "key", header: "Key" },
      { accessorKey: "baseRole", header: "Base Role" },
      {
        accessorKey: "isSystem",
        header: "System",
        cell: ({ row }) => (row.original.isSystem ? "Yes" : "No"),
      },
      {
        accessorKey: "active",
        header: "Active",
        cell: ({ row }) => (row.original.active ? "Yes" : "No"),
      },
      {
        id: "actions",
        header: "Actions",
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => {
          const role = row.original;
          return (
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
          );
        },
      },
    ],
    [savingRole]
  );

  const auditColumns = useMemo(
    () => [
      {
        accessorKey: "createdAt",
        header: "Time",
        cell: ({ row }) => formatDataTableDate(row.original.createdAt),
      },
      {
        accessorKey: "action",
        header: "Action",
      },
      {
        id: "actor",
        header: "Actor",
        cell: ({ row }) => row.original.actor?.name || row.original.actor?.email || "System",
      },
      {
        id: "target",
        header: "Target",
        cell: ({ row }) => row.original.targetUser?.email || "-",
      },
      {
        id: "details",
        header: "Details",
        enableSorting: false,
        cell: ({ row }) => (
          <pre className="max-w-[420px] whitespace-pre-wrap text-[11px] text-muted-foreground">
            {JSON.stringify(row.original.metadata || {}, null, 2)}
          </pre>
        ),
      },
    ],
    []
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Users</CardTitle>
              <CardDescription>
                Create, edit, and remove users with role-driven configuration and override controls.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => setShowInviteForm(true)}>
                <Mail className="mr-1 h-4 w-4" />
                Invite Member
              </Button>
              <Button onClick={startCreateUser}>
                <Plus className="mr-1 h-4 w-4" />
                Add User
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? <InlineLoader label="Loading users..." /> : null}

          <DataTable
            columns={userColumns}
            data={visibleUsers}
            isLoading={loading}
            emptyMessage="No users found."
            enableGlobalFilter
            enableColumnFilters={false}
          />

          {!isAdminOnly ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => runBatchAction("ACTIVATE")} disabled={savingUser || selectedUserIds.length === 0}>Activate Selected</Button>
              <Button variant="secondary" onClick={() => runBatchAction("DEACTIVATE")} disabled={savingUser || selectedUserIds.length === 0}>Deactivate Selected</Button>
              <Button variant="destructive" onClick={() => runBatchAction("DELETE")} disabled={savingUser || selectedUserIds.length === 0}>Delete Selected</Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {showUserForm ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 px-4 pt-[calc(env(safe-area-inset-top)+1rem)] pb-[calc(env(safe-area-inset-bottom)+1rem)] sm:items-center"
          onClick={closeUserDialog}
          role="dialog"
          aria-modal="true"
          aria-label="User dialog"
        >
          <div
            ref={userDialogRef}
            className="w-full max-w-4xl rounded-lg border border-slate-200 bg-white p-5 shadow-sm max-h-[90vh] overflow-y-auto"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h3 className="text-lg font-semibold text-foreground">{selectedUserId ? "Edit User" : "Add User"}</h3>
              <div className="flex flex-wrap gap-2">
                {!selectedUserId ? (
                  <>
                    {!isAdminOnly ? (
                      <>
                        <Button variant={userCreationMode === "manual" ? "default" : "secondary"} onClick={() => setUserCreationMode("manual")}>
                          Manual Entry
                        </Button>
                        <Button variant={userCreationMode === "upload" ? "default" : "secondary"} onClick={() => setUserCreationMode("upload")}>
                          Bulk Upload
                        </Button>
                      </>
                    ) : null}
                  </>
                ) : null}
                <Button variant="secondary" className="h-9 w-9 px-0" aria-label="Close dialog" title="Close" onClick={closeUserDialog}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {userCreationMode === "upload" && !selectedUserId && !isAdminOnly ? (
              <div>
                <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-muted-foreground">
                    Download sample file, fill in your user data, and upload it. Accepted formats: .xlsx, .xls, .csv.
                  </p>
                  <Link href="/samples/sample-users.xlsx" target="_blank" rel="noopener noreferrer">
                    <Button variant="secondary" className="w-fit">Download (sample-users.xlsx)</Button>
                  </Link>
                </div>
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted">
                  <Upload className="h-4 w-4" />
                  {bulkRunning ? "Uploading..." : "Select Excel File"}
                  <input
                    type="file"
                    className="hidden"
                    accept=".xlsx,.xls,.csv"
                    onChange={onBulkUploadFile}
                    disabled={bulkRunning}
                  />
                </label>
              </div>
            ) : (
              <>
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                  <label className="space-y-2">
                    <span className="text-sm font-medium text-muted-foreground">Name</span>
                    <Input value={userForm.name} onChange={(event) => updateUserForm("name", event.target.value)} />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-medium text-muted-foreground">Email</span>
                    <Input type="email" value={userForm.email} onChange={(event) => updateUserForm("email", event.target.value)} />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-medium text-muted-foreground">Password {selectedUserId ? "(optional)" : ""}</span>
                    <Input type="password" value={userForm.password} onChange={(event) => updateUserForm("password", event.target.value)} />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-medium text-muted-foreground">Role</span>
                    <RoleSelect
                      roles={roleOptionsForUserForm}
                      value={userForm.roleKey}
                      onChange={(event) => updateUserForm("roleKey", event.target.value)}
                    />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-medium text-muted-foreground">Active</span>
                    <select
                      className="h-9 w-full rounded-md border border-border bg-card px-3 text-sm text-foreground"
                      value={userForm.isActive ? "yes" : "no"}
                      onChange={(event) => updateUserForm("isActive", event.target.value === "yes")}
                    >
                      <option value="yes">Yes</option>
                      <option value="no">No</option>
                    </select>
                  </label>
                </div>

                {!isAdminOnly ? (
                  <>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <label className="space-y-2">
                        <span className="text-sm font-medium text-muted-foreground">Permission Overrides (CSV)</span>
                        <Input
                          value={userForm.permissions}
                          placeholder="customers:read, customers:write"
                          onChange={(event) => updateUserForm("permissions", event.target.value)}
                        />
                      </label>
                      <label className="space-y-2">
                        <span className="text-sm font-medium text-muted-foreground">Module Overrides (CSV)</span>
                        <Input
                          value={userForm.modules}
                          placeholder="dashboard, automation"
                          onChange={(event) => updateUserForm("modules", event.target.value)}
                        />
                      </label>
                    </div>

                    <label className="mt-3 block space-y-2">
                      <span className="text-sm font-medium text-muted-foreground">Feature Toggle Overrides (JSON)</span>
                      <textarea
                        className="min-h-[90px] w-full rounded-md border border-border bg-card p-3 text-sm text-foreground"
                        value={userForm.featureToggles}
                        onChange={(event) => updateUserForm("featureToggles", event.target.value)}
                        placeholder='{"canBulkUserActions": true}'
                      />
                    </label>

                    {selectedRole ? (
                      <div className="mt-3 rounded-md border border-border bg-muted p-3 text-xs text-muted-foreground">
                        <p><span className="font-semibold">Role Template:</span> {selectedRole.name} ({selectedRole.key})</p>
                        <p className="mt-1"><span className="font-semibold">Base Role:</span> {selectedRole.baseRole}</p>
                        <p className="mt-1"><span className="font-semibold">Modules:</span> {toCsv(selectedRole.modules || []) || "-"}</p>
                        <p className="mt-1"><span className="font-semibold">Permissions:</span> {toCsv(selectedRole.permissions || []) || "-"}</p>
                        <p className="mt-1"><span className="font-semibold">Feature Toggles:</span> {JSON.stringify(selectedRole.featureToggles || {})}</p>
                      </div>
                    ) : null}
                  </>
                ) : null}

                <div className="mt-4 flex flex-wrap gap-2">
                  {selectedUserId ? (
                    <Button
                      onClick={updateSelectedUser}
                      loading={savingUser}
                      loadingText="Saving..."
                      disabled={savingUser}
                    >
                      Update User
                    </Button>
                  ) : (
                    <Button
                      onClick={createUser}
                      loading={savingUser}
                      loadingText="Saving..."
                      disabled={savingUser}
                    >
                      Create User
                    </Button>
                  )}
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setUserForm((prev) => ({
                        ...EMPTY_USER_FORM,
                        roleKey: prev.roleKey || roleOptionsForUserForm[0]?.key || "",
                      }));
                    }}
                  >
                    Clear
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}

      {showInviteForm ? (
        <Modal
          open={showInviteForm}
          onClose={closeInviteDialog}
          title="Invite Team Member"
          description="Send an email invitation. The invitee will set their own password when they accept."
          ariaLabel="Invite member dialog"
        >
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">Email Address</span>
              <input
                className="h-9 w-full rounded-md border border-border bg-card px-3 text-sm text-foreground"
                type="email"
                placeholder="colleague@example.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                autoComplete="off"
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">Role</span>
              <select
                className="h-9 w-full rounded-md border border-border bg-card px-3 text-sm text-foreground"
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
              >
                <option value="SALES">Sales Agent</option>
                <option value="ADMIN">Administrator</option>
              </select>
            </label>
          </div>
          <div className="mt-4 flex gap-2">
            <Button onClick={sendInvite} loading={sendingInvite} loadingText="Sending…" disabled={sendingInvite}>
              Send Invite
            </Button>
            <Button variant="secondary" onClick={closeInviteDialog}>Cancel</Button>
          </div>
        </Modal>
      ) : null}

      {!isAdminOnly ? (
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Roles</CardTitle>
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
          {loading ? <InlineLoader label="Loading roles..." /> : null}

          <DataTable
            columns={roleColumns}
            data={roles}
            isLoading={loading}
            emptyMessage="No roles found."
            enableGlobalFilter
            enableColumnFilters={false}
          />

        </CardContent>
      </Card>
      ) : null}

      {!isAdminOnly ? (
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
                  <Button
                    onClick={updateSelectedRole}
                    loading={savingRole}
                    loadingText="Saving..."
                    disabled={savingRole}
                  >
                    Update Role
                  </Button>
                ) : (
                  <Button
                    onClick={createRole}
                    loading={savingRole}
                    loadingText="Saving..."
                    disabled={savingRole}
                  >
                    Create Role
                  </Button>
                )}
                <Button variant="secondary" onClick={closeRoleDialog}>Cancel</Button>
              </div>
      </Modal>
      ) : null}

      {!isAdminOnly ? (
      <Card>
        <CardHeader>
          <CardTitle>Audit Trail</CardTitle>
          <CardDescription>
            Key super-admin actions for user and role changes.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? <InlineLoader label="Loading audit trails..." /> : null}

          <DataTable
            columns={auditColumns}
            data={logs}
            isLoading={loading}
            emptyMessage="No audit entries yet."
            enableGlobalFilter
            enableColumnFilters={false}
          />
        </CardContent>
      </Card>
      ) : null}
    </div>
  );
}
