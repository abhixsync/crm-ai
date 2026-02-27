import { getTenantContext, hasRole, requireSession } from "@/lib/server/auth-guard";
import { deleteRoleDefinition, updateRoleDefinition } from "@/lib/users/user-service";
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
    const roleId = String(routeParams?.roleId || "").trim();
    if (!roleId) {
      return Response.json({ error: "Role ID is required." }, { status: 400 });
    }

    const payload = await request.json();
    const role = await updateRoleDefinition(roleId, payload, auth.session.user.id, tenant.tenantId);
    return Response.json({ role });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      console.warn("[api/admin/user-management/roles/:roleId] Database unavailable on update.");
      return databaseUnavailableResponse();
    }

    return Response.json({ error: error?.message || "Unable to update role." }, { status: 400 });
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
    const roleId = String(routeParams?.roleId || "").trim();
    if (!roleId) {
      return Response.json({ error: "Role ID is required." }, { status: 400 });
    }

    const result = await deleteRoleDefinition(roleId, auth.session.user.id, tenant.tenantId);
    return Response.json(result);
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      console.warn("[api/admin/user-management/roles/:roleId] Database unavailable on delete.");
      return databaseUnavailableResponse();
    }

    return Response.json({ error: error?.message || "Unable to delete role." }, { status: 400 });
  }
}
