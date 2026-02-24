import { CustomerStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSession, hasRole } from "@/lib/server/auth-guard";

export async function GET() {
  const auth = await requireSession();

  if (auth.error) return auth.error;

  if (!hasRole(auth.session, ["ADMIN", "SALES"])) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const [totalCustomers, interestedCustomers, followUps, totalCalls] = await Promise.all([
    prisma.customer.count({ where: { archivedAt: null } }),
    prisma.customer.count({ where: { status: CustomerStatus.INTERESTED, archivedAt: null } }),
    prisma.customer.count({ where: { status: CustomerStatus.FOLLOW_UP, archivedAt: null } }),
    prisma.callLog.count(),
  ]);

  return Response.json({
    metrics: {
      totalCustomers,
      interestedCustomers,
      followUps,
      totalCalls,
    },
  });
}