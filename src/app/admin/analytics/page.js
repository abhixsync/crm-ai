import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getTenantContext } from "@/lib/server/auth-guard";
import { ModernAnalyticsView } from "@/components/modern/analytics-view";

export default async function AnalyticsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  const { tenantId, isSuperAdmin } = getTenantContext(session);
  const filter = isSuperAdmin ? {} : { tenantId };

  const [totalCustomers, totalCalls, conversions, statusBreakdown, recentSnapshots] = await Promise.all([
    prisma.customer.count({ where: { ...filter, archivedAt: null } }),
    prisma.callLog.count({ where: filter }),
    prisma.customer.count({ where: { ...filter, status: "CONVERTED", archivedAt: null } }),
    prisma.customer.groupBy({ by: ["status"], where: { ...filter, archivedAt: null }, _count: { id: true } }),
    tenantId
      ? prisma.analyticsSnapshot.findMany({ where: { tenantId }, orderBy: { date: "desc" }, take: 30 })
      : Promise.resolve([]),
  ]);

  return (
    <ModernAnalyticsView
      user={session.user}
      metrics={{ totalCustomers, totalCalls, conversions }}
      statusBreakdown={statusBreakdown}
      recentSnapshots={JSON.parse(JSON.stringify(recentSnapshots))}
    />
  );
}
