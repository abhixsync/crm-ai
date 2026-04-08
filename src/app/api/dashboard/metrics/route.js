import { CustomerStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getTenantContext, requireSession, hasRole } from "@/lib/server/auth-guard";
import { getCreditBalance } from "@/lib/credits/credit-service";
import { getCached } from "@/lib/cache/api-cache";

const PIPELINE_STATUSES = [
  "NEW", "CALL_PENDING", "CALLING", "INTERESTED", "FOLLOW_UP",
  "CONVERTED", "NOT_INTERESTED", "DO_NOT_CALL", "CALL_FAILED", "RETRY_SCHEDULED",
];

export async function GET(request) {
  const auth = await requireSession();

  if (auth.error) return auth.error;

  if (!hasRole(auth.session, ["ADMIN", "SALES"])) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const tenant = getTenantContext(auth.session, request);
    const tenantId = tenant.tenantId;
    if (!tenantId) {
      return Response.json({ error: "Tenant context required." }, { status: 400 });
    }

    const url = new URL(request.url);
    const includePipeline = url.searchParams.get("pipeline") === "1";

    // Include pipeline flag in key — pipeline and non-pipeline responses have different shapes
    const data = await getCached(`metrics:${tenantId}:${includePipeline ? '1' : '0'}`, 60, async () => {
      const baseQueries = [
        prisma.customer.count({ where: { tenantId, archivedAt: null } }),
        prisma.customer.count({ where: { tenantId, status: CustomerStatus.INTERESTED, archivedAt: null } }),
        prisma.customer.count({ where: { tenantId, status: CustomerStatus.FOLLOW_UP, archivedAt: null } }),
        prisma.callLog.count({ where: { tenantId } }),
        getCreditBalance(tenantId).catch(() => null),  // index 4 — now parallel
      ];

      if (includePipeline) {
        baseQueries.push(
          prisma.customer.groupBy({
            by: ["status"],
            where: { tenantId, archivedAt: null },
            _count: true,
          })
        );  // index 5 when pipeline=1
      }

      const results = await Promise.all(baseQueries);
      const [totalCustomers, interestedCustomers, followUps, totalCalls, creditBalance] = results;

      const response = {
        metrics: { totalCustomers, interestedCustomers, followUps, totalCalls },
        credits: creditBalance
          ? {
              available:            creditBalance.available,
              planCredits:          creditBalance.planCredits,
              purchasedCredits:     creditBalance.purchasedCredits,
              planCreditsAllocated: creditBalance.planCreditsAllocated,
              planResetNextAt:      creditBalance.planResetNextAt,
            }
          : null,
      };

      if (includePipeline && results[5]) {
        const pipelineMap = {};
        for (const s of PIPELINE_STATUSES) pipelineMap[s] = 0;
        for (const row of results[5]) pipelineMap[row.status] = row._count;
        response.pipeline = pipelineMap;
      }

      return response;
    });

    return Response.json(data);
  } catch (error) {
    console.warn("[api/dashboard/metrics] Failed to load metrics.", error);

    return Response.json(
      {
        metrics: {
          totalCustomers: 0,
          interestedCustomers: 0,
          followUps: 0,
          totalCalls: 0,
        },
        degraded: true,
        error: "Database unavailable",
      },
      { status: 503 }
    );
  }
}
