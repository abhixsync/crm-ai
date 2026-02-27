import bcrypt from "bcryptjs";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hasRole, requireSession } from "@/lib/server/auth-guard";
import { databaseUnavailableResponse, isDatabaseUnavailable } from "@/lib/server/database-error";

function normalizeSlug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function ensureAdminForTenant(payload, tenantId) {
  const existingAdminUserId = String(payload?.existingAdminUserId || "").trim();
  const adminEmail = String(payload?.adminEmail || "").trim().toLowerCase();
  const adminName = String(payload?.adminName || "").trim() || "Tenant Admin";
  const adminPassword = String(payload?.adminPassword || "").trim();

  if (existingAdminUserId) {
    const existingUser = await prisma.user.findUnique({ where: { id: existingAdminUserId } });
    if (!existingUser) {
      throw new Error("existingAdminUserId not found.");
    }

    if (existingUser.role === UserRole.SUPER_ADMIN) {
      throw new Error("SUPER_ADMIN cannot be assigned to a tenant.");
    }

    return prisma.user.update({
      where: { id: existingAdminUserId },
      data: {
        tenantId,
        role: UserRole.ADMIN,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        tenantId: true,
      },
    });
  }

  if (!adminEmail) {
    return null;
  }

  const userByEmail = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (userByEmail) {
    if (userByEmail.role === UserRole.SUPER_ADMIN) {
      throw new Error("SUPER_ADMIN cannot be assigned to a tenant.");
    }

    return prisma.user.update({
      where: { id: userByEmail.id },
      data: {
        tenantId,
        role: UserRole.ADMIN,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        tenantId: true,
      },
    });
  }

  if (!adminPassword || adminPassword.length < 6) {
    throw new Error("adminPassword (min 6 chars) is required when creating a new admin user.");
  }

  const passwordHash = await bcrypt.hash(adminPassword, 10);

  return prisma.user.create({
    data: {
      name: adminName,
      email: adminEmail,
      passwordHash,
      role: UserRole.ADMIN,
      tenantId,
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      tenantId: true,
    },
  });
}

export async function PATCH(request, { params }) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  if (!hasRole(auth.session, ["SUPER_ADMIN"])) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const routeParams = await params;
    const tenantId = String(routeParams?.tenantId || "").trim();
    if (!tenantId) {
      return Response.json({ error: "Tenant ID is required." }, { status: 400 });
    }

    const payload = await request.json();
    const existing = await prisma.tenant.findUnique({ where: { id: tenantId } });

    if (!existing) {
      return Response.json({ error: "Tenant not found." }, { status: 404 });
    }

    const nextName =
      payload?.name !== undefined ? String(payload.name || "").trim() : existing.name;
    const nextSlug =
      payload?.slug !== undefined
        ? normalizeSlug(payload.slug)
        : existing.slug;

    if (!nextName) {
      return Response.json({ error: "Tenant name is required." }, { status: 400 });
    }

    if (!nextSlug) {
      return Response.json({ error: "Tenant slug is required." }, { status: 400 });
    }

    if (nextSlug !== existing.slug) {
      const bySlug = await prisma.tenant.findUnique({ where: { slug: nextSlug } });
      if (bySlug && bySlug.id !== tenantId) {
        return Response.json({ error: "Tenant slug already exists." }, { status: 400 });
      }
    }

    const tenant = await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        name: nextName,
        slug: nextSlug,
        isActive:
          payload?.isActive !== undefined
            ? Boolean(payload.isActive)
            : existing.isActive,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const hasAdminAssignmentPayload =
      String(payload?.existingAdminUserId || "").trim() ||
      String(payload?.adminEmail || "").trim();

    let adminUser = null;
    if (hasAdminAssignmentPayload) {
      adminUser = await ensureAdminForTenant(payload, tenantId);
    }

    return Response.json({ tenant, adminUser });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      console.warn("[api/admin/tenants/:tenantId] Database unavailable on patch.");
      return databaseUnavailableResponse();
    }

    return Response.json({ error: error?.message || "Unable to update tenant." }, { status: 400 });
  }
}
