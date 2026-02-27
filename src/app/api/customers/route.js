import { prisma } from "@/lib/prisma";
import { getTenantContext, requireSession, hasRole } from "@/lib/server/auth-guard";
import { enqueueCustomerIfEligible } from "@/lib/journey/enqueue-service";
import { databaseUnavailableResponse, isDatabaseUnavailable } from "@/lib/server/database-error";

export async function GET(request) {
  const auth = await requireSession();

  if (auth.error) return auth.error;

  if (!hasRole(auth.session, ["ADMIN", "SALES"])) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const tenant = getTenantContext(auth.session);
  const tenantId = tenant.tenantId;

  if (!tenantId) {
    return Response.json({ error: "Tenant context required." }, { status: 400 });
  }

  const status = searchParams.get("status");
  const query = searchParams.get("q");
  const page = Number(searchParams.get("page") || 1);
  const pageSize = Number(searchParams.get("pageSize") || 10);

  const safePage = Number.isNaN(page) || page < 1 ? 1 : page;
  const safePageSize = Number.isNaN(pageSize) || pageSize < 1 ? 10 : Math.min(pageSize, 100);

  const where = {
    tenantId,
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

  try {
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
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      console.warn("[api/customers] Database unavailable; returning degraded response.");
      return databaseUnavailableResponse();
    }

    throw error;
  }
}

export async function POST(request) {
  const auth = await requireSession();

  if (auth.error) return auth.error;

  if (!hasRole(auth.session, ["ADMIN", "SALES"])) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const tenant = getTenantContext(auth.session);
  const tenantId = tenant.tenantId;
  if (!tenantId) {
    return Response.json({ error: "Tenant context required." }, { status: 400 });
  }

  const body = await request.json();

  if (!body.firstName || !body.phone) {
    return Response.json({ error: "firstName and phone are required" }, { status: 400 });
  }

  try {
    const existing = await prisma.customer.findFirst({ where: { tenantId, phone: String(body.phone) } });

    if (existing && !existing.archivedAt) {
      return Response.json({ error: "Unable to create customer. Phone may already exist." }, { status: 400 });
    }

    if (existing && existing.archivedAt) {
      const customer = await prisma.customer.update({
        where: { id: existing.id },
        data: {
          firstName: body.firstName,
          tenantId,
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

      try {
        await enqueueCustomerIfEligible(customer.id, "customer_reactivated");
      } catch {
      }

      return Response.json({ customer });
    }

    const customer = await prisma.customer.create({
      data: {
        tenantId,
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

    try {
      await enqueueCustomerIfEligible(customer.id, "customer_created");
    } catch {
    }

    return Response.json({ customer });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      console.warn("[api/customers] Database unavailable during create/update.");
      return databaseUnavailableResponse();
    }

    return Response.json({ error: "Unable to create customer. Phone may already exist." }, { status: 400 });
  }
}