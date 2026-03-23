import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getTenantContext } from "@/lib/server/auth-guard";
import { ModernFollowUpsView } from "@/components/modern/follow-ups-view";

export default async function FollowUpsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  const { tenantId, isSuperAdmin } = getTenantContext(session);
  const filter = isSuperAdmin ? {} : { tenantId };

  const tasks = await prisma.followUpTask.findMany({
    where: { ...filter, status: { not: "CANCELLED" } },
    include: {
      customer: { select: { id: true, firstName: true, lastName: true, phone: true } },
      assignedTo: { select: { id: true, name: true } },
    },
    orderBy: [{ dueDate: "asc" }, { priority: "desc" }],
    take: 200,
  });

  return <ModernFollowUpsView user={session.user} initialTasks={JSON.parse(JSON.stringify(tasks))} />;
}
