import { getTenantContext, hasRole, requireSession } from "@/lib/server/auth-guard";
import { prisma } from "@/lib/prisma";

export async function POST(request) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  if (!hasRole(auth.session, ["ADMIN", "SUPER_ADMIN"])) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { customerId } = await request.json();
  if (!customerId) {
    return Response.json({ error: "customerId is required" }, { status: 400 });
  }

  const tenant = getTenantContext(auth.session, request);

  const result = await prisma.customer.updateMany({
    where: {
      id: customerId,
      ...(tenant.isSuperAdmin ? {} : { tenantId: tenant.tenantId }),
    },
    data: { inActiveCall: false },
  });

  if (result.count === 0) {
    return Response.json({ error: "Customer not found" }, { status: 404 });
  }

  return Response.json({ ok: true, message: "Active call lock released." });
}
