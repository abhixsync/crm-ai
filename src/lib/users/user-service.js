import bcrypt from "bcryptjs";
import { UserRole } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const SYSTEM_ROLE_DEFINITIONS = [
  {
    key: "SUPER_ADMIN",
    name: "Super Admin",
    description: "Full platform control",
    baseRole: UserRole.SUPER_ADMIN,
    modules: ["dashboard", "automation", "providers", "telephony", "user_management"],
    permissions: ["*"] ,
    featureToggles: { canBulkUserActions: true, canManageRoles: true },
  },
  {
    key: "ADMIN",
    name: "Admin",
    description: "Operational and configuration access",
    baseRole: UserRole.ADMIN,
    modules: ["dashboard", "automation", "providers", "telephony"],
    permissions: ["customers:read", "customers:write", "calls:manage", "automation:manage"],
    featureToggles: { canBulkUserActions: false, canManageRoles: false },
  },
  {
    key: "SALES",
    name: "Sales",
    description: "Lead and call workflow access",
    baseRole: UserRole.SALES,
    modules: ["dashboard", "customers", "calls"],
    permissions: ["customers:read", "customers:write", "calls:read", "calls:trigger"],
    featureToggles: { canBulkUserActions: false, canManageRoles: false },
  },
];

const roleDefinitionSchema = z.object({
  key: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .transform((value) => value.toUpperCase().replace(/[^A-Z0-9_]+/g, "_")),
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(500).optional().nullable(),
  baseRole: z.nativeEnum(UserRole),
  modules: z.array(z.string().trim().min(1)).default([]),
  permissions: z.array(z.string().trim().min(1)).default([]),
  featureToggles: z.record(z.boolean()).default({}),
  active: z.boolean().optional(),
});

const createUserSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  password: z.string().min(6).max(100),
  roleKey: z.string().trim().min(2).max(40),
  isActive: z.boolean().optional(),
  modules: z.array(z.string().trim().min(1)).default([]),
  permissions: z.array(z.string().trim().min(1)).default([]),
  featureToggles: z.record(z.boolean()).default({}),
});

const updateUserSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  email: z.string().trim().email().transform((value) => value.toLowerCase()).optional(),
  password: z.string().min(6).max(100).optional(),
  roleKey: z.string().trim().min(2).max(40).optional(),
  isActive: z.boolean().optional(),
  modules: z.array(z.string().trim().min(1)).optional(),
  permissions: z.array(z.string().trim().min(1)).optional(),
  featureToggles: z.record(z.boolean()).optional(),
});

const batchActionSchema = z.object({
  action: z.enum(["ACTIVATE", "DEACTIVATE", "DELETE"]),
  userIds: z.array(z.string().trim().min(1)).min(1),
});

const bulkUserRowSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  password: z.string().min(6).max(100),
  roleKey: z.string().trim().min(2).max(40),
  isActive: z.boolean().optional(),
  modules: z.array(z.string().trim().min(1)).default([]),
  permissions: z.array(z.string().trim().min(1)).default([]),
  featureToggles: z.record(z.boolean()).default({}),
});

function getSystemRoleByKey(key) {
  return SYSTEM_ROLE_DEFINITIONS.find((role) => role.key === key) || null;
}

function mergeUserMetadata(currentMetadata = {}, patch = {}) {
  const next = currentMetadata && typeof currentMetadata === "object" ? { ...currentMetadata } : {};
  const hasOverridePatch =
    patch.modules !== undefined || patch.permissions !== undefined || patch.featureToggles !== undefined;

  if (hasOverridePatch) {
    next.overrides = {
      modules: patch.modules ?? next?.overrides?.modules ?? [],
      permissions: patch.permissions ?? next?.overrides?.permissions ?? [],
      featureToggles: patch.featureToggles ?? next?.overrides?.featureToggles ?? {},
    };
  }

  return next;
}

async function writeAuditLog({ actorUserId, targetUserId, action, metadata }) {
  await prisma.userManagementAuditLog.create({
    data: {
      actorUserId: actorUserId || null,
      targetUserId: targetUserId || null,
      action,
      metadata: metadata || null,
    },
  });
}

export async function ensureSystemRoleDefinitions() {
  for (const role of SYSTEM_ROLE_DEFINITIONS) {
    await prisma.roleDefinition.upsert({
      where: { key: role.key },
      create: {
        ...role,
        isSystem: true,
        active: true,
      },
      update: {
        name: role.name,
        description: role.description,
        baseRole: role.baseRole,
        modules: role.modules,
        permissions: role.permissions,
        featureToggles: role.featureToggles,
        isSystem: true,
        active: true,
      },
    });
  }
}

async function resolveRoleAssignment(roleKey) {
  const normalizedKey = String(roleKey || "").trim().toUpperCase();

  const systemRole = getSystemRoleByKey(normalizedKey);
  if (systemRole) {
    return {
      role: systemRole.baseRole,
      customRoleId: null,
      resolvedRoleKey: normalizedKey,
    };
  }

  const customRole = await prisma.roleDefinition.findUnique({ where: { key: normalizedKey } });
  if (!customRole || !customRole.active) {
    throw new Error(`Invalid or inactive role: ${normalizedKey}`);
  }

  return {
    role: customRole.baseRole,
    customRoleId: customRole.id,
    resolvedRoleKey: customRole.key,
  };
}

export async function listRoleDefinitions() {
  await ensureSystemRoleDefinitions();

  return prisma.roleDefinition.findMany({
    orderBy: [{ isSystem: "desc" }, { name: "asc" }],
  });
}

export async function createRoleDefinition(input, actorUserId) {
  const parsed = roleDefinitionSchema.parse(input);

  if (getSystemRoleByKey(parsed.key)) {
    throw new Error("System role keys are reserved.");
  }

  const role = await prisma.roleDefinition.create({
    data: {
      ...parsed,
      isSystem: false,
      active: parsed.active ?? true,
    },
  });

  await writeAuditLog({
    actorUserId,
    action: "role.created",
    metadata: {
      roleId: role.id,
      roleKey: role.key,
    },
  });

  return role;
}

export async function updateRoleDefinition(roleId, input, actorUserId) {
  const existing = await prisma.roleDefinition.findUnique({ where: { id: roleId } });
  if (!existing) {
    throw new Error("Role not found.");
  }

  if (existing.isSystem) {
    throw new Error("System roles cannot be modified.");
  }

  const parsed = roleDefinitionSchema.partial().parse(input);

  if (parsed.key && getSystemRoleByKey(parsed.key)) {
    throw new Error("System role keys are reserved.");
  }

  const role = await prisma.roleDefinition.update({
    where: { id: roleId },
    data: parsed,
  });

  await writeAuditLog({
    actorUserId,
    action: "role.updated",
    metadata: {
      roleId: role.id,
      roleKey: role.key,
    },
  });

  return role;
}

export async function deleteRoleDefinition(roleId, actorUserId) {
  const existing = await prisma.roleDefinition.findUnique({ where: { id: roleId } });
  if (!existing) {
    throw new Error("Role not found.");
  }

  if (existing.isSystem) {
    throw new Error("System roles cannot be deleted.");
  }

  const assignedUsers = await prisma.user.count({ where: { customRoleId: roleId } });
  if (assignedUsers > 0) {
    throw new Error("Role is assigned to one or more users. Reassign users before deleting this role.");
  }

  await prisma.roleDefinition.delete({ where: { id: roleId } });

  await writeAuditLog({
    actorUserId,
    action: "role.deleted",
    metadata: {
      roleId: existing.id,
      roleKey: existing.key,
    },
  });

  return { ok: true };
}

export async function listUsers() {
  await ensureSystemRoleDefinitions();

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      customRoleId: true,
      isActive: true,
      metadata: true,
      createdAt: true,
      updatedAt: true,
      customRole: {
        select: {
          id: true,
          key: true,
          name: true,
          baseRole: true,
          active: true,
        },
      },
    },
  });

  return users.map((user) => ({
    ...user,
    roleKey: user.customRole?.key || user.role,
  }));
}

export async function createUser(input, actorUserId) {
  const parsed = createUserSchema.parse(input);
  const assignment = await resolveRoleAssignment(parsed.roleKey);

  const passwordHash = await bcrypt.hash(parsed.password, 10);

  const user = await prisma.user.create({
    data: {
      name: parsed.name,
      email: parsed.email,
      passwordHash,
      role: assignment.role,
      customRoleId: assignment.customRoleId,
      isActive: parsed.isActive ?? true,
      metadata: mergeUserMetadata({}, parsed),
    },
  });

  await writeAuditLog({
    actorUserId,
    targetUserId: user.id,
    action: "user.created",
    metadata: {
      roleKey: assignment.resolvedRoleKey,
      isActive: parsed.isActive ?? true,
    },
  });

  return user;
}

export async function updateUser(userId, input, actorUserId) {
  const parsed = updateUserSchema.parse(input);

  const existing = await prisma.user.findUnique({ where: { id: userId } });
  if (!existing) {
    throw new Error("User not found.");
  }

  const updateData = {};

  if (parsed.name !== undefined) updateData.name = parsed.name;
  if (parsed.email !== undefined) updateData.email = parsed.email;
  if (parsed.isActive !== undefined) updateData.isActive = parsed.isActive;

  if (parsed.password) {
    updateData.passwordHash = await bcrypt.hash(parsed.password, 10);
  }

  if (parsed.roleKey) {
    const assignment = await resolveRoleAssignment(parsed.roleKey);
    updateData.role = assignment.role;
    updateData.customRoleId = assignment.customRoleId;
  }

  updateData.metadata = mergeUserMetadata(existing.metadata, parsed);

  const user = await prisma.user.update({
    where: { id: userId },
    data: updateData,
  });

  await writeAuditLog({
    actorUserId,
    targetUserId: user.id,
    action: "user.updated",
    metadata: {
      updatedFields: Object.keys(updateData),
    },
  });

  return user;
}

export async function deleteUser(userId, actorUserId) {
  if (userId === actorUserId) {
    throw new Error("You cannot delete your own account.");
  }

  const existing = await prisma.user.findUnique({ where: { id: userId } });
  if (!existing) {
    throw new Error("User not found.");
  }

  await prisma.user.delete({ where: { id: userId } });

  await writeAuditLog({
    actorUserId,
    targetUserId: userId,
    action: "user.deleted",
    metadata: {
      email: existing.email,
      role: existing.role,
      customRoleId: existing.customRoleId,
    },
  });

  return { ok: true };
}

export async function listUserAuditLogs(limit = 50) {
  return prisma.userManagementAuditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: Math.min(200, Math.max(1, Number(limit) || 50)),
    include: {
      actor: {
        select: { id: true, name: true, email: true },
      },
      targetUser: {
        select: { id: true, name: true, email: true },
      },
    },
  });
}

export async function applyUserBatchAction(input, actorUserId) {
  const parsed = batchActionSchema.parse(input);
  const userIds = Array.from(new Set(parsed.userIds));

  if (parsed.action === "DELETE" && userIds.includes(actorUserId)) {
    throw new Error("You cannot delete your own account in batch action.");
  }

  if (parsed.action === "ACTIVATE") {
    const result = await prisma.user.updateMany({
      where: { id: { in: userIds } },
      data: { isActive: true },
    });

    await writeAuditLog({
      actorUserId,
      action: "user.batch.activate",
      metadata: { userIds, count: result.count },
    });

    return { ok: true, action: parsed.action, count: result.count };
  }

  if (parsed.action === "DEACTIVATE") {
    const result = await prisma.user.updateMany({
      where: { id: { in: userIds } },
      data: { isActive: false },
    });

    await writeAuditLog({
      actorUserId,
      action: "user.batch.deactivate",
      metadata: { userIds, count: result.count },
    });

    return { ok: true, action: parsed.action, count: result.count };
  }

  const result = await prisma.user.deleteMany({
    where: {
      AND: [{ id: { in: userIds } }, { id: { not: actorUserId } }],
    },
  });

  await writeAuditLog({
    actorUserId,
    action: "user.batch.delete",
    metadata: { userIds, count: result.count },
  });

  return { ok: true, action: parsed.action, count: result.count };
}

export async function bulkCreateUsers(rows, actorUserId) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("Bulk payload must include at least one row.");
  }

  const limitedRows = rows.slice(0, 500);
  const successes = [];
  const failures = [];

  for (let index = 0; index < limitedRows.length; index += 1) {
    const row = limitedRows[index];

    try {
      const parsed = bulkUserRowSchema.parse(row);
      const created = await createUser(parsed, actorUserId);
      successes.push({ row: index + 1, userId: created.id, email: created.email });
    } catch (error) {
      failures.push({ row: index + 1, email: row?.email || null, error: error?.message || "Invalid row" });
    }
  }

  await writeAuditLog({
    actorUserId,
    action: "user.bulk.create",
    metadata: {
      totalRows: limitedRows.length,
      successCount: successes.length,
      failureCount: failures.length,
    },
  });

  return {
    ok: true,
    totalRows: limitedRows.length,
    successCount: successes.length,
    failureCount: failures.length,
    successes,
    failures,
  };
}
