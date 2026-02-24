import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/server/auth-guard";

export async function DELETE() {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  if (auth.session.user.role !== "SUPER_ADMIN") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const [callResult, followUpResult, customerResult] = await prisma.$transaction([
    prisma.callLog.deleteMany({}),
    prisma.followUpTask.deleteMany({}),
    prisma.customer.deleteMany({}),
  ]);

  return Response.json({
    message: "All customer data deleted.",
    deleted: {
      calls: callResult.count,
      followUps: followUpResult.count,
      customers: customerResult.count,
    },
  });
}
