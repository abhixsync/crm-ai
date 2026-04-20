import { prisma } from "@/lib/prisma";
import { requireSession, hasRole, getTenantContext } from "@/lib/server/auth-guard";
import { isDatabaseUnavailable, databaseUnavailableResponse } from "@/lib/server/database-error";
import { getPlanGuard, isPlanLimitError, planLimitResponse } from "@/lib/subscription/plan-guard";

export async function DELETE(request, { params }) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  if (!hasRole(auth.session, ["ADMIN", "SUPER_ADMIN"])) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { tenantId } = getTenantContext(auth.session, request);
  if (!tenantId) {
    return Response.json({ error: "Tenant context required" }, { status: 400 });
  }

  try {
    const guard = await getPlanGuard(tenantId);
    guard.assertHasFeature("hasIntentTraining");
  } catch (err) {
    if (isPlanLimitError(err)) return planLimitResponse(err);
    throw err;
  }

  const { id } = await params;

  try {
    // Verify the phrase belongs to this tenant
    const existing = await prisma.intentTrainingPhrase.findFirst({
      where: { id, tenantId },
    });

    if (!existing) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.intentTrainingPhrase.delete({
      where: { id },
    });

    return Response.json({ ok: true });
  } catch (error) {
    if (isDatabaseUnavailable(error)) return databaseUnavailableResponse();
    throw error;
  }
}
