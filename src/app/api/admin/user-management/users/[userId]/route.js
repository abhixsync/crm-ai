import { getTenantContext, hasRole, requireSession } from "@/lib/server/auth-guard";
import { deleteUser, updateUser } from "@/lib/users/user-service";
import { databaseUnavailableResponse, isDatabaseUnavailable } from "@/lib/server/database-error";

export async function PATCH(request, { params }) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  if (!hasRole(auth.session, ["SUPER_ADMIN"])) {
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

  if (!hasRole(auth.session, ["SUPER_ADMIN"])) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const tenant = getTenantContext(auth.session);
    const routeParams = await params;
    const userId = String(routeParams?.userId || "").trim();
    if (!userId) {
      return Response.json({ error: "User ID is required." }, { status: 400 });
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
