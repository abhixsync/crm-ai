import { CampaignJobStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hasRole, requireSession } from "@/lib/server/auth-guard";

export async function GET(request) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  if (!hasRole(auth.session, ["SUPER_ADMIN"])) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const status = String(searchParams.get("status") || "").toUpperCase();
  const customerId = String(searchParams.get("customerId") || "").trim();
  const page = Math.max(1, Number(searchParams.get("page") || 1));
  const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize") || 25)));

  const where = {
    ...(status && CampaignJobStatus[status] ? { status } : {}),
    ...(customerId ? { customerId } : {}),
  };

  const [total, jobs] = await Promise.all([
    prisma.campaignJob.count({ where }),
    prisma.campaignJob.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        customer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            status: true,
          },
        },
      },
    }),
  ]);

  return Response.json({
    jobs,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  });
}
