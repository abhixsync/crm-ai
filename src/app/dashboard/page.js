import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { CustomerStatus } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DashboardClient } from "@/components/crm/dashboard-client";

const PAGE_SIZE = 10;

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login");
  }

  const [totalCustomers, interestedCustomers, followUps, totalCalls, customers] = await Promise.all([
    prisma.customer.count({ where: { archivedAt: null } }),
    prisma.customer.count({ where: { status: CustomerStatus.INTERESTED, archivedAt: null } }),
    prisma.customer.count({ where: { status: CustomerStatus.FOLLOW_UP, archivedAt: null } }),
    prisma.callLog.count(),
    prisma.customer.findMany({
      where: { archivedAt: null },
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