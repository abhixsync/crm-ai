import { CallStatus, CustomerStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getTenantContext, hasRole, requireSession } from "@/lib/server/auth-guard";
import { applyCustomerTransition } from "@/lib/journey/transition-service";
import { databaseUnavailableResponse, isDatabaseUnavailable } from "@/lib/server/database-error";

const dispositionMap = {
  interested: CustomerStatus.INTERESTED,
  not_interested: CustomerStatus.NOT_INTERESTED,
  follow_up: CustomerStatus.FOLLOW_UP,
  converted: CustomerStatus.CONVERTED,
  do_not_call: CustomerStatus.DO_NOT_CALL,
};

export async function POST(request) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  if (!hasRole(auth.session, ["ADMIN", "SALES"])) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const customerId = body.customerId;
  const disposition = String(body.disposition || "").toLowerCase();
  const callLogId = body.callLogId;

  if (!customerId || !disposition) {
    return Response.json({ error: "customerId and disposition are required" }, { status: 400 });
  }

  const nextStatus = dispositionMap[disposition];

  if (!nextStatus) {
    return Response.json({ error: "Invalid disposition" }, { status: 400 });
  }

  try {
    const tenant = getTenantContext(auth.session);
    const customer = await prisma.customer.findFirst({
      where: {
        id: customerId,
        tenantId: tenant.tenantId,
      },
      select: { id: true, tenantId: true },
    });

    if (!customer) {
      return Response.json({ error: "Customer not found" }, { status: 404 });
    }

    if (callLogId) {
      await prisma.callLog.updateMany({
        where: { id: callLogId, customerId, tenantId: customer.tenantId },
        data: {
          status: CallStatus.COMPLETED,
          intent: disposition.toUpperCase(),
          intentClassification: disposition,
          summary: body.summary || `Manual call disposition selected: ${disposition}`,
          nextAction: body.nextAction || null,
          durationSecs: body.durationSecs ? Number(body.durationSecs) : null,
          recordingUrl: body.recordingUrl || null,
          transcript: body.transcript || null,
          endedAt: new Date(),
        },
      });
    }

    const result = await applyCustomerTransition({
      customerId,
      toStatus: nextStatus,
      reason: `Manual disposition: ${disposition}`,
      source: "MANUAL",
      metadata: {
        inActiveCall: false,
        lastContactedAt: new Date(),
        aiSummary: body.summary || undefined,
        aiIntent: disposition,
      },
      idempotencyScope: {
        mode: "manual",
        stage: "complete",
        callLogId,
        disposition,
      },
      tenantId: customer.tenantId,
    });

    return Response.json({ result });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      console.warn("[api/calls/manual/complete] Database unavailable; returning degraded response.");
      return databaseUnavailableResponse();
    }

    throw error;
  }
}
