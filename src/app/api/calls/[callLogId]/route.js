import { prisma } from "@/lib/prisma";
import { getTenantContext, requireSession, hasRole } from "@/lib/server/auth-guard";
import { databaseUnavailableResponse, isDatabaseUnavailable } from "@/lib/server/database-error";

export async function GET(_request, { params }) {
  const auth = await requireSession();

  if (auth.error) return auth.error;

  if (!hasRole(auth.session, ["ADMIN", "SALES"])) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const resolvedParams = await params;
  const callLogId = resolvedParams?.callLogId;

  if (!callLogId) {
    return Response.json({ error: "callLogId is required" }, { status: 400 });
  }

  try {
    const tenant = getTenantContext(auth.session);
    const callLog = await prisma.callLog.findFirst({
      where: {
        id: callLogId,
        tenantId: tenant.tenantId,
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
    });

    if (!callLog) {
      return Response.json({ error: "Call log not found" }, { status: 404 });
    }

    return Response.json({ callLog });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      console.warn("[api/calls/[callLogId]] Database unavailable; returning degraded response.");
      return databaseUnavailableResponse();
    }

    throw error;
  }
}
