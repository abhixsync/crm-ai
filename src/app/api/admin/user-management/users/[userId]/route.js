import { getTenantContext, hasRole, requireSession } from "@/lib/server/auth-guard";
import { deleteUser, updateUser } from "@/lib/users/user-service";
import { databaseUnavailableResponse, isDatabaseUnavailable } from "@/lib/server/database-error";
import { UserRole } from "@prisma/client";

export async function PATCH(request, { params }) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  if (!hasRole(auth.session, ["ADMIN", "SUPER_ADMIN"])) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const tenant = getTenantContext(auth.session);
    const routeParams = await params;
    const userId = String(routeParams?.userId || "").trim();
    if (!userId) {
      return Response.json({ error: "User ID is required." }, { status: 400 });
    }

    const payload = await request.json();

    // Fetch the target user to check role
    const { prisma } = await import("@/lib/prisma");
    const targetUser = await prisma.user.findFirst({
      where: { id: userId, tenantId: tenant.tenantId },
    });
    if (!targetUser) {
      return Response.json({ error: "User not found." }, { status: 404 });
    }

    if (!tenant.isSuperAdmin && auth.session.user.role === "ADMIN") {
      const isSelf = userId === auth.session.user.id;
      const isSales = targetUser.role === UserRole.SALES;
      if (!isSelf && !isSales) {
        return Response.json({ error: "Admins can edit only their own user or SALES users." }, { status: 403 });
      }
    }

    if (!tenant.isSuperAdmin && String(payload?.roleKey || "").trim().toUpperCase() === "SUPER_ADMIN") {
      return Response.json({ error: "SUPER_ADMIN role assignment is not allowed." }, { status: 400 });
    }

    const user = await updateUser(userId, payload, auth.session.user.id, tenant.isSuperAdmin ? undefined : tenant.tenantId);
    return Response.json({ user });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      console.warn("[api/admin/user-management/users/:userId] Database unavailable on update.");
      return databaseUnavailableResponse();
    }

    return Response.json({ error: error?.message || "Unable to update user." }, { status: 400 });
  }
}

export async function DELETE(_request, { params }) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  if (!hasRole(auth.session, ["ADMIN", "SUPER_ADMIN"])) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const tenant = getTenantContext(auth.session);
    const routeParams = await params;
    const userId = String(routeParams?.userId || "").trim();
    if (!userId) {
      return Response.json({ error: "User ID is required." }, { status: 400 });
    }

    // Fetch the target user to check role
    const { prisma } = await import("@/lib/prisma");
    const targetUser = await prisma.user.findFirst({
      where: { id: userId, tenantId: tenant.tenantId },
    });
    if (!targetUser) {
      return Response.json({ error: "User not found." }, { status: 404 });
    }

    if (!tenant.isSuperAdmin && auth.session.user.role === "ADMIN") {
      if (targetUser.role !== UserRole.SALES) {
        return Response.json({ error: "Admins can delete only SALES users." }, { status: 403 });
      }
    }

    const result = await deleteUser(userId, auth.session.user.id, tenant.isSuperAdmin ? undefined : tenant.tenantId);
    return Response.json(result);
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      console.warn("[api/admin/user-management/users/:userId] Database unavailable on delete.");
      return databaseUnavailableResponse();
    }

    return Response.json({ error: error?.message || "Unable to delete user." }, { status: 400 });
  }
}
