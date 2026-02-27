import { prisma } from "@/lib/prisma";
import { getTenantContext, hasRole, requireSession } from "@/lib/server/auth-guard";
import { databaseUnavailableResponse, isDatabaseUnavailable } from "@/lib/server/database-error";

export async function GET(_request, { params }) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  if (!hasRole(auth.session, ["ADMIN", "SUPER_ADMIN", "SALES"])) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const resolved = await params;
  const customerId = resolved?.customerId;

  if (!customerId) {
    return Response.json({ error: "customerId is required" }, { status: 400 });
  }

  try {
    const tenant = getTenantContext(auth.session);
    const tenantId = tenant.tenantId;
    if (!tenantId) {
      return Response.json({ error: "Tenant context required." }, { status: 400 });
    }

    const [transitions, callAttempts, customer] = await Promise.all([
      prisma.customerTransition.findMany({
        where: { customerId, customer: { tenantId } },
        orderBy: { createdAt: "desc" },
        take: 500,
      }),
      prisma.callLog.findMany({
        where: { customerId, tenantId },
        orderBy: { createdAt: "desc" },
        take: 500,
      }),
      prisma.customer.findFirst({
        where: { id: customerId, tenantId },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          status: true,
          retryCount: true,
          maxRetries: true,
          manualReview: true,
          inActiveCall: true,
        },
      }),
    ]);

    return Response.json({ customer, transitions, callAttempts });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      console.warn("[api/customers/[customerId]/audit] Database unavailable; returning degraded response.");
      return databaseUnavailableResponse();
    }

    throw error;
  }
}
