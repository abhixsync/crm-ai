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
  const body = await request.json();
  const { logId } = body;

  if (!logId) return Response.json({ error: "logId required" }, { status: 400 });

  const [webhook, originalLog] = await Promise.all([
    prisma.webhookConfig.findFirst({ where: { id, tenantId } }),
    prisma.webhookLog.findFirst({ where: { id: logId, webhookId: id, tenantId } }),
  ]);

  if (!webhook) return Response.json({ error: "Webhook not found" }, { status: 404 });
  if (!originalLog) return Response.json({ error: "Log entry not found" }, { status: 404 });

  const event = originalLog.event;
  const payload = originalLog.payload?.payload ?? originalLog.payload;

  const log = await deliverWebhook(webhook, event, payload);

  return Response.json({ log });
}
