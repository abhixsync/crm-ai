import { prisma } from "@/lib/prisma";
import { getTenantContext, requireSession, hasRole } from "@/lib/server/auth-guard";
import { databaseUnavailableResponse, isDatabaseUnavailable } from "@/lib/server/database-error";

export async function GET(request) {
  const auth = await requireSession();

  if (auth.error) return auth.error;

  if (!hasRole(auth.session, ["ADMIN", "SALES"])) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const customerId = searchParams.get("customerId");
  const limit = Number(searchParams.get("limit") || 15);
  const safeLimit = Number.isNaN(limit) || limit < 1 ? 15 : Math.min(limit, 50);

  try {
    const tenant = getTenantContext(auth.session);
    const callLogs = await prisma.callLog.findMany({
      where: {
        tenantId: tenant.tenantId,
        ...(customerId ? { customerId } : {}),
        customer: {
          archivedAt: null,
        },
      },
      include: {
        customer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: safeLimit,
    });

    return Response.json({ callLogs });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      console.warn("[api/calls/history] Database unavailable; returning degraded response.");
      return databaseUnavailableResponse();
    }

    throw error;
  }
}
