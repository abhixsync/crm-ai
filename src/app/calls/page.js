import { getServerSession } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getTenantContext } from "@/lib/server/auth-guard";
import { CallsAiCallPanel } from "@/components/calls/calls-ai-call-panel";
import { CallsHistoryTable } from "@/components/calls/calls-history-table";
import { ModernCallLogsView } from "@/components/modern/call-logs-view";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { resolveTenantTheme } from "@/modules/theme/theme.service";

function formatCustomerName(customer) {
  if (!customer) return "Unknown";
  return `${customer.firstName || ""} ${customer.lastName || ""}`.trim() || "Unknown";
}

export default async function CallsPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login");
  }

  const tenant = getTenantContext(session);

  const callLogs = await prisma.callLog.findMany({
    where: {
      tenantId: tenant.tenantId,
      customer: {
        archivedAt: null,
      },
    },
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
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const customers = await prisma.customer.findMany({
    where: {
      tenantId: tenant.tenantId,
      archivedAt: null,
      phone: { not: "" },
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      phone: true,
      status: true,
    },
    orderBy: {
      updatedAt: "desc",
    },
    take: 100,
  });

  const callCustomers = customers.map((customer) => ({
    id: customer.id,
    name: formatCustomerName(customer),
    phone: customer.phone,
    status: customer.status,
  }));

  // Resolve UI layout
  let uiLayout = "modern";
  try {
    const theme = await resolveTenantTheme(tenant.tenantId);
    uiLayout = theme.uiLayout || "modern";
  } catch {
    // fall back to modern
  }

  if (uiLayout === "modern") {
    return <ModernCallLogsView callLogs={callLogs} />;
  }

  return (
    <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <nav aria-label="Breadcrumb" className="mb-1 text-sm text-slate-500">
            <Link href="/dashboard" className="hover:text-slate-800">
              Home
            </Link>
            <span className="px-1">→</span>
            <span className="text-slate-700">AI Calls</span>
          </nav>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">AI Call</h1>
          <p className="mt-1 text-sm text-slate-600">AI call logs, transcript, outcome, and next steps.</p>
        </div>
      </div>

      <CallsAiCallPanel customers={callCustomers} role={session.user.role} />

      <Card>
        <CardHeader>
          <CardTitle>Recent Calls</CardTitle>
          <CardDescription>Showing latest 100 calls.</CardDescription>
        </CardHeader>
        <CardContent>
          <CallsHistoryTable callLogs={callLogs} />
        </CardContent>
      </Card>
    </main>
  );
}