import { prisma } from "@/lib/prisma";

function parseFinancial(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}
import { getTenantContext, requireSession, hasRole } from "@/lib/server/auth-guard";
import { applyCustomerTransition } from "@/lib/journey/transition-service";
import { isTerminalState } from "@/lib/journey/constants";
import { databaseUnavailableResponse, isDatabaseUnavailable } from "@/lib/server/database-error";
import { invalidateCache } from "@/lib/cache/api-cache";
import { publishEvent } from "@/lib/events/event-publisher";

export async function PATCH(request, { params }) {
  const auth = await requireSession();

  if (auth.error) return auth.error;

  if (!hasRole(auth.session, ["ADMIN", "SALES"])) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const resolvedParams = await params;
  const customerId = resolvedParams?.customerId;

  if (!customerId) {
    return Response.json({ error: "customerId is required" }, { status: 400 });
  }

  try {
    const tenant = getTenantContext(auth.session, request);
    const tenantId = tenant.tenantId;
    if (!tenantId) {
      return Response.json({ error: "Tenant context required." }, { status: 400 });
    }

    const body = await request.json();
    const existing = await prisma.customer.findFirst({ where: { id: customerId, tenantId } });

    if (!existing || existing.archivedAt) {
      return Response.json({ error: "Customer not found" }, { status: 404 });
    }

    const data = {};

    if (body.firstName !== undefined) data.firstName = body.firstName;
    if (body.lastName !== undefined) data.lastName = body.lastName || null;
    if (body.phone !== undefined) data.phone = String(body.phone);
    if (body.email !== undefined) data.email = body.email || null;
    if (body.city !== undefined) data.city = body.city || null;
    if (body.state !== undefined) data.state = body.state || null;
    if (body.source !== undefined) data.source = body.source || null;
    if (body.loanType !== undefined) data.loanType = body.loanType || null;
    if (body.loanAmount !== undefined) data.loanAmount = parseFinancial(body.loanAmount);
    if (body.monthlyIncome !== undefined) data.monthlyIncome = parseFinancial(body.monthlyIncome);
    const requestedStatus = body.status !== undefined ? body.status : undefined;
    if (body.notes !== undefined) data.notes = body.notes || null;

    if (requestedStatus && requestedStatus !== existing.status && isTerminalState(existing.status)) {
      return Response.json(
        {
          error: `${existing.status} cannot be changed to ${requestedStatus}.`,
          code: "INVALID_STATUS_TRANSITION",
          fromStatus: existing.status,
          toStatus: requestedStatus,
        },
        { status: 409 }
      );
    }

    data.lastContactedAt = new Date();

    const updatedCustomer = await prisma.customer.update({
      where: { id: customerId },
      data,
    });

    let customer = updatedCustomer;

    if (requestedStatus && requestedStatus !== existing.status) {
      const transitionResult = await applyCustomerTransition({
        customerId,
        toStatus: requestedStatus,
        reason: "Manual status update from customer edit",
        source: "MANUAL",
        metadata: {
          lastContactedAt: new Date(),
        },
        idempotencyScope: {
          route: "customers/[customerId]",
          requestedStatus,
        },
        tenantId,
      });

      if (transitionResult?.skipped && transitionResult?.reason === "terminal_state") {
        return Response.json(
          {
            error: `${existing.status} cannot be changed to ${requestedStatus}.`,
            code: "INVALID_STATUS_TRANSITION",
            fromStatus: existing.status,
            toStatus: requestedStatus,
          },
          { status: 409 }
        );
      }

      if (transitionResult?.customer) {
        customer = transitionResult.customer;
      }
    }

    invalidateCache(`metrics:${tenantId}:0`, `metrics:${tenantId}:1`).catch(() => {});
    publishEvent(tenantId, { type: "metrics:update" }).catch(() => {});
    return Response.json({ customer });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      console.warn("[api/customers/[customerId]] Database unavailable during update.");
      return databaseUnavailableResponse();
    }

    throw error;
  }
}

export async function DELETE(request, { params }) {
  const auth = await requireSession();

  if (auth.error) return auth.error;

  if (!hasRole(auth.session, ["ADMIN", "SALES"])) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const resolvedParams = await params;
  const customerId = resolvedParams?.customerId;

  if (!customerId) {
    return Response.json({ error: "customerId is required" }, { status: 400 });
  }

  try {
    const tenant = getTenantContext(auth.session, request);
    const tenantId = tenant.tenantId;
    if (!tenantId) {
      return Response.json({ error: "Tenant context required." }, { status: 400 });
    }

    const result = await prisma.customer.updateMany({
      where: { id: customerId, tenantId },
      data: {
        archivedAt: new Date(),
        status: "DO_NOT_CALL",
      },
    });

    if (result.count === 0) {
      return Response.json({ error: "Customer not found" }, { status: 404 });
    }

    invalidateCache(`metrics:${tenantId}:0`, `metrics:${tenantId}:1`).catch(() => {});
    publishEvent(tenantId, { type: "metrics:update" }).catch(() => {});
    return Response.json({ success: true });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      console.warn("[api/customers/[customerId]] Database unavailable during delete/archive.");
      return databaseUnavailableResponse();
    }

    throw error;
  }
}