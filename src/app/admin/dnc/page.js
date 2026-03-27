import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getTenantContext } from "@/lib/server/auth-guard";
import { ModernDncView } from "@/components/modern/dnc-view";

export default async function DncPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  const { tenantId, isSuperAdmin } = getTenantContext(session);
  const filter = isSuperAdmin ? {} : { tenantId };

  const entries = await prisma.dncRegistry.findMany({
    where: filter,
    include: { addedBy: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  return <ModernDncView user={session.user} initialEntries={JSON.parse(JSON.stringify(entries))} />;
}
