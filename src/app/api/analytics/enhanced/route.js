import { requireSession, getTenantContext, hasRole } from "@/lib/server/auth-guard";
import { prisma } from "@/lib/prisma";
import { getCached } from "@/lib/cache/api-cache";

const VALID_RANGES = [7, 30, 90];

function resolveRange(raw) {
  const n = Number(raw);
  if (!n || Number.isNaN(n)) return 30;
  return VALID_RANGES.reduce((prev, curr) =>
    Math.abs(curr - n) < Math.abs(prev - n) ? curr : prev
  );
}

export async function GET(request) {
  try {
    const auth = await requireSession();
    if (auth.error) return auth.error;
    if (!hasRole(auth.session, ["ADMIN", "SALES"])) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
    const { tenantId } = getTenantContext(auth.session);
    if (!tenantId) {
      return Response.json({ error: "Tenant context required" }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const range = resolveRange(searchParams.get("range"));

    const result = await getCached(`analytics:${tenantId}:${range}`, 120, async () => {
      const since = new Date(Date.now() - range * 24 * 60 * 60 * 1000);

      // Fetch campaigns in range first (needed for job counts and interested counts)
      const campaigns = await prisma.campaign.findMany({
        where: { tenantId, createdAt: { gte: since } },
        select: { id: true, name: true, status: true },
        orderBy: { createdAt: "desc" },
        take: 10,
      });
      const campaignIds = campaigns.map((c) => c.id);

      const [
        totalCustomers,
        newCustomers,
        totalCalls,
        callsInRange,
        conversions,
        interested,
        statusBreakdown,
        jobCounts,
        callsByAgent,
        dailySnapshots,
      ] = await Promise.all([
        // 1. totalCustomers
        prisma.customer.count({
          where: { tenantId, archivedAt: null },
        }),
        // 2. newCustomers
        prisma.customer.count({
          where: { tenantId, archivedAt: null, createdAt: { gte: since } },
        }),
        // 3. totalCalls
        prisma.callLog.count({
          where: { tenantId },
        }),
        // 4. callsInRange
        prisma.callLog.count({
          where: { tenantId, createdAt: { gte: since } },
        }),
        // 5. conversions
        prisma.customer.count({
          where: { tenantId, status: "CONVERTED", archivedAt: null },
        }),
        // 6. interested
        prisma.customer.count({
          where: { tenantId, status: "INTERESTED", archivedAt: null },
        }),
        // 7. statusBreakdown
        prisma.customer.groupBy({
          by: ["status"],
          where: { tenantId, archivedAt: null },
          _count: true,
        }),
        // 8. jobCounts per campaign (status breakdown)
        campaignIds.length > 0
          ? prisma.campaignJob.groupBy({
              by: ["campaignId", "status"],
              where: { campaignId: { in: campaignIds } },
              _count: true,
            })
          : Promise.resolve([]),
        // 9. callsByAgent
        prisma.callLog.groupBy({
          by: ["userId"],
          where: { tenantId, createdAt: { gte: since }, userId: { not: null } },
          _count: true,
          orderBy: { _count: { userId: "desc" } },
          take: 10,
        }),
        // 10. dailySnapshots
        prisma.analyticsSnapshot.findMany({
          where: { tenantId, date: { gte: since } },
          orderBy: { date: "asc" },
          take: 90,
          select: { date: true, totalCustomers: true },
        }),
      ]);

      // Interested counts per campaign — single raw SQL instead of N+1
      const interestedMap = {};
      if (campaignIds.length > 0) {
        const interestedRows = await prisma.$queryRaw`
          SELECT cj."campaignId"::text AS "campaignId", COUNT(DISTINCT c.id)::int AS count
          FROM "CampaignJob" cj
          JOIN "Customer" c ON cj."customerId" = c.id
          WHERE cj."campaignId" = ANY(${campaignIds})
            AND c.status = 'INTERESTED'
            AND c."tenantId" = ${tenantId}
            AND c."archivedAt" IS NULL
          GROUP BY cj."campaignId"
        `;
        for (const row of interestedRows) {
          interestedMap[row.campaignId] = row.count;
        }
      }

      // Build campaignStats
      const jobCountMap = {};
      for (const row of jobCounts) {
        if (!jobCountMap[row.campaignId]) {
          jobCountMap[row.campaignId] = { total: 0, completed: 0, failed: 0 };
        }
        jobCountMap[row.campaignId].total += row._count;
        if (row.status === "COMPLETED") jobCountMap[row.campaignId].completed += row._count;
        if (row.status === "FAILED") jobCountMap[row.campaignId].failed += row._count;
      }

      const campaignStats = campaigns.map((c) => {
        const counts = jobCountMap[c.id] || { total: 0, completed: 0, failed: 0 };
        const interestedForCampaign = interestedMap[c.id] || 0;
        const conversionRate =
          counts.total > 0
            ? (((counts.completed + interestedForCampaign) / counts.total) * 100).toFixed(1)
            : "0.0";
        return {
          id: c.id,
          name: c.name,
          status: c.status,
          totalCalls: counts.total,
          completed: counts.completed,
          failed: counts.failed,
          interested: interestedForCampaign,
          conversionRate,
        };
      });

      // Build agentLeaderboard
      const userIds = callsByAgent.map((r) => r.userId).filter(Boolean);
      const users =
        userIds.length > 0
          ? await prisma.user.findMany({
              where: { id: { in: userIds } },
              select: { id: true, name: true },
            })
          : [];

      const userMap = Object.fromEntries(users.map((u) => [u.id, u.name]));

      const agentLeaderboard = callsByAgent.map((r) => ({
        userId: r.userId,
        name: userMap[r.userId] || null,
        totalCalls: r._count,
        interested: 0,
      }));

      // callSuccessRate
      const callSuccessRate =
        totalCalls > 0
          ? (((conversions + interested) / totalCalls) * 100).toFixed(1)
          : "0.0";

      return {
        range,
        since: since.toISOString(),
        metrics: {
          totalCustomers,
          newCustomers,
          totalCalls,
          callsInRange,
          conversions,
          interested,
          callSuccessRate,
        },
        statusBreakdown: statusBreakdown.map((row) => ({
          status: row.status,
          _count: row._count._all,
        })),
        campaignStats,
        agentLeaderboard,
        dailySnapshots: dailySnapshots.map((s) => ({
          date: s.date instanceof Date ? s.date.toISOString().slice(0, 10) : s.date,
          totalCustomers: s.totalCustomers,
        })),
      };
    });

    return Response.json(result);
  } catch (err) {
    console.error("[analytics/enhanced]", err);
    return Response.json({ error: "Service unavailable" }, { status: 503 });
  }
}
