import { CallStatus, CustomerStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hasRole, requireSession } from "@/lib/server/auth-guard";
import { applyCustomerTransition } from "@/lib/journey/transition-service";
import { databaseUnavailableResponse, isDatabaseUnavailable } from "@/lib/server/database-error";

export async function POST(request) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  if (!hasRole(auth.session, ["ADMIN", "SALES"])) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const customerId = body.customerId;

  if (!customerId) {
    return Response.json({ error: "customerId is required" }, { status: 400 });
  }

  try {
    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer || customer.archivedAt) {
      return Response.json({ error: "Customer not found" }, { status: 404 });
    }

    const activeProvider = await prisma.telephonyProviderConfig.findFirst({
      where: { enabled: true },
      orderBy: [{ isActive: "desc" }, { priority: "asc" }, { name: "asc" }],
    });

    const callLog = await prisma.callLog.create({
      data: {
        customerId,
        status: CallStatus.INITIATED,
        mode: "MANUAL",
        startedAt: new Date(),
        telephonyProviderUsed: activeProvider?.name || null,
        telephonyProviderType: activeProvider?.type || null,
        summary: "Manual Web Call started from dashboard softphone.",
        attemptNumber: (customer.retryCount || 0) + 1,
      },
    });

    await applyCustomerTransition({
      customerId,
      toStatus: CustomerStatus.CALLING,
      reason: "Manual web call started",
      source: "MANUAL",
      metadata: {
        inActiveCall: true,
        lastContactedAt: new Date(),
      },
      idempotencyScope: {
        mode: "manual",
        stage: "start",
        callLogId: callLog.id,
      },
    });

    return Response.json({
      callLog,
      customer: {
        id: customer.id,
        firstName: customer.firstName,
        lastName: customer.lastName,
        phone: customer.phone,
      },
    });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      console.warn("[api/calls/manual/start] Database unavailable; returning degraded response.");
      return databaseUnavailableResponse();
    }

    throw error;
  }
}
