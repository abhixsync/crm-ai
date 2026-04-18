import { getTenantContext, hasRole, requireSession } from "@/lib/server/auth-guard";
import {
  createUser,
  listUsers,
} from "@/lib/users/user-service";
import { databaseUnavailableResponse, isDatabaseUnavailable } from "@/lib/server/database-error";
import { getPlanGuard, isPlanLimitError, planLimitResponse } from "@/lib/subscription/plan-guard";

export async function GET(request) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  if (!hasRole(auth.session, ["ADMIN", "SUPER_ADMIN"])) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const tenant = getTenantContext(auth.session, request);
    const users = await listUsers(tenant.tenantId || undefined);
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

  if (!hasRole(auth.session, ["ADMIN", "SUPER_ADMIN"])) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const tenant = getTenantContext(auth.session, request);
    const payload = await request.json();

    if (!tenant.isSuperAdmin && String(payload?.roleKey || "").trim().toUpperCase() === "SUPER_ADMIN") {
      return Response.json({ error: "SUPER_ADMIN role assignment is not allowed." }, { status: 400 });
    }

    if (!tenant.isSuperAdmin) {
      const guard = await getPlanGuard(tenant.tenantId);
      guard.assertCanAddUser();
    }

    const user = await createUser(payload, auth.session.user.id, tenant.tenantId);
    return Response.json({ user }, { status: 201 });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      console.warn("[api/admin/user-management/users] Database unavailable on create.");
      return databaseUnavailableResponse();
    }

    if (isPlanLimitError(error)) return planLimitResponse(error);
    return Response.json({ error: error?.message || "Unable to create user." }, { status: 400 });
  }
}
