import { prisma } from "@/lib/prisma";
import { requireSession, hasRole, getTenantContext } from "@/lib/server/auth-guard";
import { deliverWebhook } from "@/lib/webhooks/webhook-delivery";

export async function POST(request, { params }) {
  const auth = await requireSession();
  if (auth.error) return auth.error;
  if (!hasRole(auth.session, ["ADMIN", "SUPER_ADMIN"])) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const tenant = getTenantContext(auth.session, request);
  const tenantId = tenant.tenantId;
  const { id } = await params;

  const webhook = await prisma.webhookConfig.findFirst({ where: { id, tenantId } });
  if (!webhook) return Response.json({ error: "Not found" }, { status: 404 });

  const log = await deliverWebhook(webhook, "webhook.test", {
    message: "This is a test delivery from CRM AI.",
    webhookId: webhook.id,
    webhookName: webhook.name,
  });

  return Response.json({ log });
}
