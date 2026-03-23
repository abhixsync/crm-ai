import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getTenantContext } from "@/lib/server/auth-guard";
import { ModernTeamsView } from "@/components/modern/teams-view";

export default async function TeamsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  const { tenantId, isSuperAdmin } = getTenantContext(session);
  const filter = isSuperAdmin ? {} : { tenantId };

  const [teams, users] = await Promise.all([
    prisma.team.findMany({
      where: filter,
      include: {
        lead: { select: { id: true, name: true } },
        members: { include: { user: { select: { id: true, name: true, role: true } } } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.user.findMany({
      where: { ...filter, isSuspended: false },
      select: { id: true, name: true, role: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <ModernTeamsView
      user={session.user}
      initialTeams={JSON.parse(JSON.stringify(teams))}
      availableUsers={JSON.parse(JSON.stringify(users))}
    />
  );
}
