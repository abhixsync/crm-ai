import { prisma } from "@/lib/prisma";
import { requireSession, hasRole } from "@/lib/server/auth-guard";
import { applyCustomerTransition } from "@/lib/journey/transition-service";

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

  const body = await request.json();
  const existing = await prisma.customer.findUnique({ where: { id: customerId } });

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
  if (body.loanAmount !== undefined) data.loanAmount = body.loanAmount ? Number(body.loanAmount) : null;
  if (body.monthlyIncome !== undefined) {
    data.monthlyIncome = body.monthlyIncome ? Number(body.monthlyIncome) : null;
  }
  const requestedStatus = body.status !== undefined ? body.status : undefined;
  if (body.notes !== undefined) data.notes = body.notes || null;

  data.lastContactedAt = new Date();

  const customer = await prisma.customer.update({
    where: { id: customerId },
    data,
  });

  if (requestedStatus && requestedStatus !== existing.status) {
    await applyCustomerTransition({
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
    });
  }

  return Response.json({ customer });
}

export async function DELETE(_request, { params }) {
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

  await prisma.customer.update({
    where: { id: customerId },
    data: {
      archivedAt: new Date(),
      status: "DO_NOT_CALL",
    },
  });

  return Response.json({ success: true });
}