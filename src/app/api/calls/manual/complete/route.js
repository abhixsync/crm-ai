import { CallStatus, CustomerStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getTenantContext, hasRole, requireSession } from "@/lib/server/auth-guard";
import { applyCustomerTransition } from "@/lib/journey/transition-service";
import { notifyAdvisorForCallLog } from "@/lib/notifications/advisor-notifier";
import { evaluateCrmEventDecision } from "@/lib/crm/event-triggers";
import { databaseUnavailableResponse, isDatabaseUnavailable } from "@/lib/server/database-error";

const dispositionMap = {
  interested: CustomerStatus.INTERESTED,
  not_interested: CustomerStatus.NOT_INTERESTED,
  follow_up: CustomerStatus.FOLLOW_UP,
  converted: CustomerStatus.CONVERTED,
  do_not_call: CustomerStatus.DO_NOT_CALL,
};

const dispositionIntentHintMap = {
  interested: "interested",
  not_interested: "not_interested",
  follow_up: "callback_requested",
  converted: "appointment",
  do_not_call: "not_interested",
};

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

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
    const tenant = getTenantContext(auth.session, request);
    const customer = await prisma.customer.findFirst({
      where: {
        id: customerId,
        ...(tenant.isSuperAdmin ? {} : { tenantId: tenant.tenantId }),
      },
      select: { id: true, tenantId: true },
    });

    if (!customer) {
      return Response.json({ error: "Customer not found" }, { status: 404 });
    }

    let existingCallLog = null;
    let crmDecision = null;

    if (callLogId) {
      existingCallLog = await prisma.callLog.findFirst({
        where: { id: callLogId, customerId, tenantId: customer.tenantId },
        select: { id: true, metadata: true },
      });

      const manualIntentHint = dispositionIntentHintMap[disposition] || disposition;
      crmDecision = evaluateCrmEventDecision({
        transcript: body.transcript || "",
        intent: manualIntentHint,
        summary: body.summary || `Manual call disposition selected: ${disposition}`,
        metadata: existingCallLog?.metadata,
      });
    }

    if (callLogId) {
      const metadata = isPlainObject(existingCallLog?.metadata) ? { ...existingCallLog.metadata } : {};
      if (crmDecision) {
        metadata.crmEventDecision = {
          ...crmDecision,
          source: "manual_complete",
          manualDisposition: disposition,
          evaluatedAt: new Date().toISOString(),
        };
      }

      await prisma.callLog.updateMany({
        where: { id: callLogId, customerId, tenantId: customer.tenantId },
        data: {
          status: CallStatus.COMPLETED,
          intent: disposition.toUpperCase(),
          intentClassification: disposition,
          summary: body.summary || `Manual call disposition selected: ${disposition}`,
          nextAction: body.nextAction || crmDecision?.recommendedNextAction || null,
          durationSecs: body.durationSecs ? Number(body.durationSecs) : null,
          recordingUrl: body.recordingUrl || null,
          transcript: body.transcript || null,
          metadata,
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

    const notification = callLogId
      ? await notifyAdvisorForCallLog(callLogId)
      : { ok: false, skipped: true, reason: "missing_call_log_id" };

    if (callLogId && !notification.ok && !notification.skipped) {
      console.warn("[api/calls/manual/complete] Advisor notification failed:", notification.reason);
    }

    return Response.json({ result, notification });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      console.warn("[api/calls/manual/complete] Database unavailable; returning degraded response.");
      return databaseUnavailableResponse();
    }

    throw error;
  }
}
