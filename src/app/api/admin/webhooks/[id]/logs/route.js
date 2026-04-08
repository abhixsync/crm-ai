import { prisma } from "@/lib/prisma";
import { requireSession, hasRole, getTenantContext } from "@/lib/server/auth-guard";

export async function GET(request, { params }) {
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

  const { searchParams } = new URL(request.url);
  const limit = Math.min(Number(searchParams.get("limit") || 20), 100);

  const logs = await prisma.webhookLog.findMany({
    where: { webhookId: id, tenantId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true, event: true, success: true, statusCode: true,
      response: true, attemptCount: true, createdAt: true,
    },
  });

  return Response.json({ logs });
}
