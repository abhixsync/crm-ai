import { getTenantContext, hasRole, requireSession } from "@/lib/server/auth-guard";
import { deleteRoleDefinition, updateRoleDefinition } from "@/lib/users/user-service";
import { databaseUnavailableResponse, isDatabaseUnavailable } from "@/lib/server/database-error";

export async function PATCH(request, { params }) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  if (!hasRole(auth.session, ["ADMIN", "SUPER_ADMIN"])) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const tenant = getTenantContext(auth.session, request);
    const routeParams = await params;
    const roleId = String(routeParams?.roleId || "").trim();
    if (!roleId) {
      return Response.json({ error: "Role ID is required." }, { status: 400 });
    }

    const payload = await request.json();

    if (!tenant.isSuperAdmin && String(payload?.baseRole || "").trim().toUpperCase() === "SUPER_ADMIN") {
      return Response.json({ error: "Cannot assign SUPER_ADMIN base role." }, { status: 400 });
    }

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

export async function DELETE(request, { params }) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  if (!hasRole(auth.session, ["ADMIN", "SUPER_ADMIN"])) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const tenant = getTenantContext(auth.session, request);
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
