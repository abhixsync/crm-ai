import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getTenantContext, hasRole, requireSession } from "@/lib/server/auth-guard";
import { databaseUnavailableResponse, isDatabaseUnavailable } from "@/lib/server/database-error";

const VALID_STATUSES = [
  "NEW", "CALL_PENDING", "CALLING", "INTERESTED", "FOLLOW_UP",
  "NOT_INTERESTED", "DO_NOT_CALL", "CONVERTED", "CALL_FAILED", "RETRY_SCHEDULED",
];

const batchSchema = z.object({
  action: z.enum(["DELETE", "UPDATE_STATUS"]),
  customerIds: z.array(z.string().trim().min(1)).min(1).max(500),
  status: z.enum(VALID_STATUSES).optional(),
});

export async function POST(request) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  if (!hasRole(auth.session, ["ADMIN", "SUPER_ADMIN"])) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const tenant = getTenantContext(auth.session, request);
    const tenantId = tenant.tenantId;

    if (!tenantId) {
      return Response.json({ error: "Tenant context required." }, { status: 400 });
    }

    const body = await request.json();
    const parsed = batchSchema.parse(body);
    const customerIds = Array.from(new Set(parsed.customerIds));

    if (parsed.action === "DELETE") {
      const result = await prisma.customer.updateMany({
        where: {
          id: { in: customerIds },
          tenantId,
        },
        data: {
          archivedAt: new Date(),
          status: "DO_NOT_CALL",
        },
      });

      return Response.json({
        ok: true,
        action: "DELETE",
        count: result.count,
      });
    }

    if (parsed.action === "UPDATE_STATUS") {
      if (!parsed.status) {
        return Response.json({ error: "status is required for UPDATE_STATUS" }, { status: 400 });
      }
      const result = await prisma.customer.updateMany({
        where: { id: { in: customerIds }, tenantId, archivedAt: null },
        data: { status: parsed.status },
      });
      return Response.json({ ok: true, action: "UPDATE_STATUS", count: result.count });
    }

    return Response.json({ error: "Unsupported action." }, { status: 400 });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      console.warn("[api/customers/batch] Database unavailable.");
      return databaseUnavailableResponse();
    }

    if (error instanceof z.ZodError) {
      return Response.json({ error: "Invalid request.", details: error.flatten() }, { status: 400 });
    }

    return Response.json({ error: error?.message || "Unable to apply batch action." }, { status: 400 });
  }
}
