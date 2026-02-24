import { prisma } from "@/lib/prisma";
import { hasRole, requireSession } from "@/lib/server/auth-guard";

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

  const [transitions, callAttempts, customer] = await Promise.all([
    prisma.customerTransition.findMany({
      where: { customerId },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
    prisma.callLog.findMany({
      where: { customerId },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
    prisma.customer.findUnique({
      where: { id: customerId },
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
}
