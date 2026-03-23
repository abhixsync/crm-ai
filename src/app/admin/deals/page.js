import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getTenantContext } from "@/lib/server/auth-guard";
import { ModernDealsView } from "@/components/modern/deals-view";

export default async function DealsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  const { tenantId, isSuperAdmin } = getTenantContext(session);
  const filter = isSuperAdmin ? {} : { tenantId };

  const deals = await prisma.deal.findMany({
    where: filter,
    include: {
      customer: { select: { id: true, firstName: true, lastName: true, phone: true } },
      assignedTo: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return <ModernDealsView user={session.user} initialDeals={JSON.parse(JSON.stringify(deals))} />;
}
