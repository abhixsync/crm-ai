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

function validatePayload(payload) {
  const name = String(payload?.name || "").trim();
  const slug = normalizeSlug(payload?.slug || name);

  if (!name) {
    throw new Error("Tenant name is required.");
  }

  if (!slug) {
    throw new Error("Tenant slug is required.");
  }

  return { name, slug };
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

export async function GET() {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  if (!hasRole(auth.session, ["SUPER_ADMIN"])) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const tenants = await prisma.tenant.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        slug: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        users: {
          where: {
            role: UserRole.ADMIN,
          },
          orderBy: {
            createdAt: "asc",
          },
          select: {
            id: true,
            name: true,
            email: true,
            isActive: true,
          },
          take: 5,
        },
        _count: {
          select: {
            users: true,
            customers: true,
          },
        },
      },
    });

    return Response.json({ tenants });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      console.warn("[api/admin/tenants] Database unavailable on list.");
      return databaseUnavailableResponse();
    }

    throw error;
  }
}

export async function POST(request) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  if (!hasRole(auth.session, ["SUPER_ADMIN"])) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const payload = await request.json();
    const { name, slug } = validatePayload(payload);

    const existing = await prisma.tenant.findUnique({ where: { slug } });
    if (existing) {
      return Response.json({ error: "Tenant slug already exists." }, { status: 400 });
    }

    const tenant = await prisma.tenant.create({
      data: {
        name,
        slug,
        isActive: payload?.isActive !== false,
        metadata: payload?.metadata && typeof payload.metadata === "object" ? payload.metadata : null,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        isActive: true,
        createdAt: true,
      },
    });

    const adminUser = await ensureAdminForTenant(payload, tenant.id);

    return Response.json({ tenant, adminUser }, { status: 201 });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      console.warn("[api/admin/tenants] Database unavailable on create.");
      return databaseUnavailableResponse();
    }

    return Response.json({ error: error?.message || "Unable to create tenant." }, { status: 400 });
  }
}
