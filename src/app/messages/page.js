import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getTenantContext } from "@/lib/server/auth-guard";
import { ModernMessagesView } from "@/components/modern/messages-view";

export default async function MessagesPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  const { tenantId, isSuperAdmin } = getTenantContext(session);
  const filter = isSuperAdmin ? {} : { tenantId };

  const messages = await prisma.messageLog.findMany({
    where: filter,
    include: {
      customer: { select: { id: true, firstName: true, lastName: true, phone: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return <ModernMessagesView user={session.user} initialMessages={JSON.parse(JSON.stringify(messages))} />;
}
