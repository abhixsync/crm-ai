import { getTenantContext, hasRole, requireSession } from "@/lib/server/auth-guard";
import {
  createUser,
  listUsers,
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
    const users = await listUsers(tenant.isSuperAdmin ? undefined : tenant.tenantId);
    return Response.json({ users });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      console.warn("[api/admin/user-management/users] Database unavailable; returning degraded response.");
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
    const user = await createUser(payload, auth.session.user.id, tenant.tenantId);
    return Response.json({ user }, { status: 201 });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      console.warn("[api/admin/user-management/users] Database unavailable on create.");
      return databaseUnavailableResponse();
    }

    return Response.json({ error: error?.message || "Unable to create user." }, { status: 400 });
  }
}
