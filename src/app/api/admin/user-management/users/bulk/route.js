import { getTenantContext, hasRole, requireSession } from "@/lib/server/auth-guard";
import { bulkCreateUsers } from "@/lib/users/user-service";
import { databaseUnavailableResponse, isDatabaseUnavailable } from "@/lib/server/database-error";

export async function POST(request) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  if (!hasRole(auth.session, ["ADMIN", "SUPER_ADMIN"])) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const tenant = getTenantContext(auth.session);
    const payload = await request.json();
    const rows = Array.isArray(payload?.rows) ? payload.rows : [];
    const result = await bulkCreateUsers(rows, auth.session.user.id, tenant.tenantId);
    return Response.json(result);
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      console.warn("[api/admin/user-management/users/bulk] Database unavailable.");
      return databaseUnavailableResponse();
    }

    return Response.json({ error: error?.message || "Unable to process bulk users." }, { status: 400 });
  }
}
