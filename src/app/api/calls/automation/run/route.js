import { hasRole, requireSession, getTenantContext } from "@/lib/server/auth-guard";
import { runAutomationBatch } from "@/lib/journey/automation-runner";
import { databaseUnavailableResponse, isDatabaseUnavailable } from "@/lib/server/database-error";

export async function POST() {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  if (!hasRole(auth.session, ["ADMIN", "SUPER_ADMIN"])) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const tenant = getTenantContext(auth.session);

  try {
    const result = await runAutomationBatch(tenant.isSuperAdmin ? undefined : tenant.tenantId);

    if (!result.ok) {
      return Response.json({ error: result.error }, { status: result.status });
    }

    return Response.json(result.data);
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      console.warn("[api/calls/automation/run] Database unavailable; returning degraded response.");
      return databaseUnavailableResponse();
    }

    throw error;
  }
}
