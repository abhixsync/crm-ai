import { prisma } from "@/lib/prisma";
import { requireSession, hasRole } from "@/lib/server/auth-guard";

export async function GET(_request, { params }) {
  const auth = await requireSession();

  if (auth.error) return auth.error;

  if (!hasRole(auth.session, ["ADMIN", "SALES"])) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const resolvedParams = await params;
  const callLogId = resolvedParams?.callLogId;

  if (!callLogId) {
    return Response.json({ error: "callLogId is required" }, { status: 400 });
  }

  const callLog = await prisma.callLog.findUnique({
    where: { id: callLogId },
    include: {
      customer: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phone: true,
        },
      },
    },
  });

  if (!callLog) {
    return Response.json({ error: "Call log not found" }, { status: 404 });
  }

  return Response.json({ callLog });
}
