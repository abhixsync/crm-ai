import { getTenantContext, hasRole, requireSession } from "@/lib/server/auth-guard";
import {
  createRoleDefinition,
  listRoleDefinitions,
} from "@/lib/users/user-service";
import { databaseUnavailableResponse, isDatabaseUnavailable } from "@/lib/server/database-error";

export async function GET() {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  if (!hasRole(auth.session, ["SUPER_ADMIN"])) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const tenant = getTenantContext(auth.session);
    const roles = await listRoleDefinitions(tenant.tenantId);
    return Response.json({ roles });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      console.warn("[api/admin/user-management/roles] Database unavailable; returning degraded response.");
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
    const tenant = getTenantContext(auth.session);
    const payload = await request.json();
    const role = await createRoleDefinition(payload, auth.session.user.id, tenant.tenantId);
    return Response.json({ role }, { status: 201 });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      console.warn("[api/admin/user-management/roles] Database unavailable on create.");
      return databaseUnavailableResponse();
    }

    return Response.json({ error: error?.message || "Unable to create role." }, { status: 400 });
  }
}
