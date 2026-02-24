import { prisma } from "@/lib/prisma";
import { requireSession, hasRole } from "@/lib/server/auth-guard";

export async function GET(request) {
  const auth = await requireSession();

  if (auth.error) return auth.error;

  if (!hasRole(auth.session, ["ADMIN", "SALES"])) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const query = searchParams.get("q");
  const page = Number(searchParams.get("page") || 1);
  const pageSize = Number(searchParams.get("pageSize") || 10);

  const safePage = Number.isNaN(page) || page < 1 ? 1 : page;
  const safePageSize = Number.isNaN(pageSize) || pageSize < 1 ? 10 : Math.min(pageSize, 100);

  const where = {
    archivedAt: null,
    ...(status ? { status } : {}),
    ...(query
      ? {
          OR: [
            { firstName: { contains: query, mode: "insensitive" } },
            { lastName: { contains: query, mode: "insensitive" } },
            { phone: { contains: query } },
            { email: { contains: query, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const total = await prisma.customer.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / safePageSize));
  const currentPage = Math.min(safePage, totalPages);

  const customers = await prisma.customer.findMany({
    where,
    include: {
      calls: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
    orderBy: { createdAt: "desc" },
    skip: (currentPage - 1) * safePageSize,
    take: safePageSize,
  });

  return Response.json({
    customers,
    pagination: {
      page: currentPage,
      pageSize: safePageSize,
      total,
      totalPages,
    },
  });
}

export async function POST(request) {
  const auth = await requireSession();

  if (auth.error) return auth.error;

  if (!hasRole(auth.session, ["ADMIN", "SALES"])) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();

  if (!body.firstName || !body.phone) {
    return Response.json({ error: "firstName and phone are required" }, { status: 400 });
  }

  try {
    const existing = await prisma.customer.findUnique({ where: { phone: String(body.phone) } });

    if (existing && !existing.archivedAt) {
      return Response.json({ error: "Unable to create customer. Phone may already exist." }, { status: 400 });
    }

    if (existing && existing.archivedAt) {
      const customer = await prisma.customer.update({
        where: { id: existing.id },
        data: {
          firstName: body.firstName,
          lastName: body.lastName || null,
          phone: String(body.phone),
          email: body.email || null,
          city: body.city || null,
          state: body.state || null,
          source: body.source || "Manual Entry",
          loanType: body.loanType || null,
          loanAmount: body.loanAmount ? Number(body.loanAmount) : null,
          monthlyIncome: body.monthlyIncome ? Number(body.monthlyIncome) : null,
          status: body.status || "NEW",
          notes: body.notes || null,
          archivedAt: null,
        },
      });

      return Response.json({ customer });
    }

    const customer = await prisma.customer.create({
      data: {
        firstName: body.firstName,
        lastName: body.lastName || null,
        phone: String(body.phone),
        email: body.email || null,
        city: body.city || null,
        state: body.state || null,
        source: body.source || "Manual Entry",
        loanType: body.loanType || null,
        loanAmount: body.loanAmount ? Number(body.loanAmount) : null,
        monthlyIncome: body.monthlyIncome ? Number(body.monthlyIncome) : null,
        status: body.status || "NEW",
        notes: body.notes || null,
      },
    });

    return Response.json({ customer });
  } catch {
    return Response.json({ error: "Unable to create customer. Phone may already exist." }, { status: 400 });
  }
}