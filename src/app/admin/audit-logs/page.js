import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getTenantContext } from "@/lib/server/auth-guard";
import { ModernAuditLogsView } from "@/components/modern/audit-logs-view";

export default async function AuditLogsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  const { tenantId, isSuperAdmin } = getTenantContext(session);
  const filter = isSuperAdmin ? {} : { tenantId };

  const logs = await prisma.userManagementAuditLog.findMany({
    where: filter,
    include: {
      actor:      { select: { id: true, name: true, role: true } },
      targetUser: { select: { id: true, name: true, role: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return <ModernAuditLogsView user={session.user} initialLogs={JSON.parse(JSON.stringify(logs))} />;
}
