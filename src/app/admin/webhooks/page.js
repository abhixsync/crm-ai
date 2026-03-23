import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getTenantContext } from "@/lib/server/auth-guard";
import { ModernWebhooksView } from "@/components/modern/webhooks-view";

export default async function WebhooksPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  const { tenantId, isSuperAdmin } = getTenantContext(session);
  const filter = isSuperAdmin ? {} : { tenantId };

  const webhooks = await prisma.webhookConfig.findMany({
    where: filter,
    include: {
      logs: {
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { id: true, event: true, success: true, statusCode: true, createdAt: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return <ModernWebhooksView user={session.user} initialWebhooks={JSON.parse(JSON.stringify(webhooks))} />;
}
