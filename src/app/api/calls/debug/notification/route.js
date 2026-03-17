import { prisma } from "@/lib/prisma";
import { getTenantContext, hasRole, requireSession } from "@/lib/server/auth-guard";
import { databaseUnavailableResponse, isDatabaseUnavailable } from "@/lib/server/database-error";

function safeMetadata(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export async function GET(request) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  if (!hasRole(auth.session, ["ADMIN", "SALES"])) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const callLogId = String(searchParams.get("callLogId") || "").trim();

  if (!callLogId) {
    return Response.json({ error: "callLogId is required" }, { status: 400 });
  }

  try {
    const tenant = getTenantContext(auth.session);

    const callLog = await prisma.callLog.findFirst({
      where: {
        id: callLogId,
        ...(tenant.isSuperAdmin ? {} : { tenantId: tenant.tenantId }),
      },
      select: {
        id: true,
        tenantId: true,
        customerId: true,
        providerCallId: true,
        mode: true,
        status: true,
        summary: true,
        transcript: true,
        intent: true,
        intentClassification: true,
        nextAction: true,
        startedAt: true,
        endedAt: true,
        updatedAt: true,
        metadata: true,
        customer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            assignedTo: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
      },
    });

    if (!callLog) {
      return Response.json({ error: "Call log not found" }, { status: 404 });
    }

    const metadata = safeMetadata(callLog.metadata);
    const notificationHistory = Array.isArray(metadata.advisorNotificationHistory)
      ? metadata.advisorNotificationHistory
      : [];

    return Response.json({
      ok: true,
      debug: {
        callLog: {
          id: callLog.id,
          tenantId: callLog.tenantId,
          customerId: callLog.customerId,
          providerCallId: callLog.providerCallId,
          mode: callLog.mode,
          status: callLog.status,
          intent: callLog.intent,
          intentClassification: callLog.intentClassification,
          hasSummary: Boolean(String(callLog.summary || "").trim()),
          hasTranscript: Boolean(String(callLog.transcript || "").trim()),
          transcriptLength: String(callLog.transcript || "").length,
          nextAction: callLog.nextAction,
          startedAt: callLog.startedAt,
          endedAt: callLog.endedAt,
          updatedAt: callLog.updatedAt,
        },
        customer: {
          id: callLog.customer?.id || null,
          name: `${String(callLog.customer?.firstName || "").trim()} ${String(callLog.customer?.lastName || "").trim()}`.trim() || null,
          phone: callLog.customer?.phone || null,
          assignedAdvisor: callLog.customer?.assignedTo || null,
        },
        notification: {
          last: metadata.advisorNotificationLast || null,
          historyCount: notificationHistory.length,
          history: notificationHistory,
        },
      },
    });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      console.warn("[api/calls/debug/notification] Database unavailable; returning degraded response.");
      return databaseUnavailableResponse();
    }

    throw error;
  }
}
