import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ModernCustomersView } from "@/components/modern/customers-view";
import { canUserDeleteAllCustomers } from "@/lib/customers/delete-all-permissions";
import { resolveTenantTheme } from "@/modules/theme/theme.service";

const PAGE_SIZE = 10;

export default async function CustomersPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login");
  }

  // In classic layout, customers are part of the dashboard
  let uiLayout = "modern";
  const tenantId = session.user.tenantId || null;
  try {
    const theme = await resolveTenantTheme(tenantId);
    uiLayout = theme.uiLayout || "modern";
  } catch {
    // fall back to modern
  }

  if (uiLayout !== "modern") {
    redirect("/dashboard?view=customers");
  }

  // SUPER_ADMIN must pick a tenant context — don't return unscoped data
  if (!tenantId) {
    const totalPages = 1;
    return (
      <ModernCustomersView
        user={session.user}
        canDeleteAllCustomers={false}
        initialTenantName="CRM"
        initialMetrics={{ totalCustomers: 0, interestedCustomers: 0, followUps: 0, totalCalls: 0 }}
        initialCustomers={[]}
        initialPagination={{ page: 1, pageSize: PAGE_SIZE, total: 0, totalPages }}
      />
    );
  }

  const tenantFilter = { tenantId };
  const canDeleteAllCustomers = canUserDeleteAllCustomers(session.user.role);

  let totalCustomers = 0;
  let interestedCustomers = 0;
  let followUps = 0;
  let totalCalls = 0;
  let customers = [];
  let initialTenantName = "CRM";

  try {
    const [total, interested, followUpCount, calls, customerRows, tenant] = await Promise.all([
      prisma.customer.count({ where: { ...tenantFilter, archivedAt: null } }),
      prisma.customer.count({ where: { ...tenantFilter, status: "INTERESTED", archivedAt: null } }),
      prisma.customer.count({ where: { ...tenantFilter, status: "FOLLOW_UP", archivedAt: null } }),
      prisma.callLog.count({ where: { ...tenantFilter } }),
      prisma.customer.findMany({
        where: { ...tenantFilter, archivedAt: null },
        include: {
          calls: {
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
        orderBy: { createdAt: "desc" },
        take: PAGE_SIZE,
      }),
      tenantId
        ? prisma.tenant.findUnique({
            where: { id: tenantId },
            select: { crmName: true, name: true },
          })
        : Promise.resolve(null),
    ]);

    totalCustomers = total;
    interestedCustomers = interested;
    followUps = followUpCount;
    totalCalls = calls;
    // Prisma Decimal fields can't be passed to Client Components — convert to plain numbers
    customers = customerRows.map(c => ({
      ...c,
      loanAmount: c.loanAmount != null ? Number(c.loanAmount) : null,
      monthlyIncome: c.monthlyIncome != null ? Number(c.monthlyIncome) : null,
    }));
    initialTenantName = tenant?.crmName || tenant?.name || "CRM";
  } catch (error) {
    console.warn("[customers] Failed to load initial data.", error);
  }

  const totalPages = Math.max(1, Math.ceil(totalCustomers / PAGE_SIZE));

  return (
    <ModernCustomersView
      user={session.user}
      canDeleteAllCustomers={canDeleteAllCustomers}
      initialTenantName={initialTenantName}
      initialMetrics={{ totalCustomers, interestedCustomers, followUps, totalCalls }}
      initialCustomers={customers}
      initialPagination={{ page: 1, pageSize: PAGE_SIZE, total: totalCustomers, totalPages }}
    />
  );
}
