import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { CustomerStatus } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DashboardClient } from "@/components/crm/dashboard-client";

const PAGE_SIZE = 10;

function isDatabaseUnavailable(error) {
  const code = error?.code;
  const message = String(error?.message || "");
  return code === "P1001" || message.includes("Can't reach database server");
}

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login");
  }

  let totalCustomers = 0;
  let interestedCustomers = 0;
  let followUps = 0;
  let totalCalls = 0;
  let customers = [];
  const tenantId = session.user.tenantId || null;
  const tenantFilter = tenantId ? { tenantId } : {};

  try {
    [totalCustomers, interestedCustomers, followUps, totalCalls, customers] = await Promise.all([
      prisma.customer.count({ where: { ...tenantFilter, archivedAt: null } }),
      prisma.customer.count({ where: { ...tenantFilter, status: CustomerStatus.INTERESTED, archivedAt: null } }),
      prisma.customer.count({ where: { ...tenantFilter, status: CustomerStatus.FOLLOW_UP, archivedAt: null } }),
      prisma.callLog.count({ where: { ...tenantFilter } }),
      prisma.customer.findMany({
        where: { ...tenantFilter, archivedAt: null },
        include: {
          calls: {
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
        orderBy: { createdAt: "desc" },
        take: PAGE_SIZE,
      }),
    ]);
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      console.warn("[dashboard] Database unavailable; rendering empty dashboard state.");
    } else {
      console.warn("[dashboard] Failed to load initial dashboard data.", error);
    }
  }

  const totalPages = Math.max(1, Math.ceil(totalCustomers / PAGE_SIZE));

  return (
    <DashboardClient
      user={session.user}
      initialMetrics={{ totalCustomers, interestedCustomers, followUps, totalCalls }}
      initialCustomers={customers}
      initialPagination={{ page: 1, pageSize: PAGE_SIZE, total: totalCustomers, totalPages }}
    />
  );
}