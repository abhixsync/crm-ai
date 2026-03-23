import { requireSession, getTenantContext } from "@/lib/server/auth-guard";
import { getPlanGuard } from "@/lib/subscription/plan-guard";
import { getPlatformCurrency } from "@/lib/subscription/subscription-service";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/subscription/summary
 * Returns the current tenant's plan info + live usage for the billing UI and upgrade banners.
 */
export async function GET(request) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  const { tenantId } = getTenantContext(auth.session, request);

  const guard = await getPlanGuard(tenantId);

  // Fetch subscription + invoice history for full billing page
  const subscription = tenantId
    ? await prisma.tenantSubscription.findUnique({
        where: { tenantId },
        include: {
          planDef: true,
          invoices: { orderBy: { createdAt: "desc" }, take: 20 },
        },
      })
    : null;

  const [allPlans, currency] = await Promise.all([
    prisma.planDefinition.findMany({
      where: { isPublic: true, isActive: true },
      orderBy: { sortOrder: "asc" },
    }),
    getPlatformCurrency(),
  ]);

  return Response.json({
    summary: guard.toClientSummary(),
    subscription,
    plans: allPlans,
    currency,
  });
}
