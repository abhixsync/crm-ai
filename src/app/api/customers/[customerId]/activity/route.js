import { prisma } from "@/lib/prisma";
import { getTenantContext, requireSession, hasRole } from "@/lib/server/auth-guard";

export async function GET(request, { params }) {
  const auth = await requireSession();
  if (auth.error) return auth.error;
  if (!hasRole(auth.session, ["ADMIN", "SALES"])) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const resolvedParams = await params;
  const customerId = resolvedParams?.customerId;
  const tenant = getTenantContext(auth.session, request);
  const tenantId = tenant.tenantId;
  if (!tenantId) return Response.json({ error: "Tenant context required." }, { status: 400 });

  const [activities, calls] = await Promise.all([
    prisma.customerActivity.findMany({
      where: { customerId, tenantId },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { actor: { select: { name: true } } },
    }),
    prisma.callLog.findMany({
      where: { customerId, tenantId },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, status: true, duration: true, createdAt: true, summary: true },
    }),
  ]);

  return Response.json({ activities, calls });
}
