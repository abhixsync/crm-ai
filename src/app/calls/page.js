import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getTenantContext } from "@/lib/server/auth-guard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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
  const tenantFilter = tenant.isSuperAdmin ? {} : { tenantId: tenant.tenantId };

  const callLogs = await prisma.callLog.findMany({
    where: {
      ...tenantFilter,
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

  return (
    <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Calls History</h1>
          <p className="mt-1 text-sm text-slate-600">AI call logs, transcript, outcome, and next steps.</p>
        </div>
        <Link href="/dashboard">
          <Button variant="secondary">Back to Dashboard</Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Calls</CardTitle>
          <CardDescription>Showing latest 100 calls.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[200px]">Customer</TableHead>
                  <TableHead className="min-w-[120px]">Status</TableHead>
                  <TableHead className="min-w-[260px]">Summary</TableHead>
                  <TableHead className="min-w-[160px]">Intent</TableHead>
                  <TableHead className="min-w-[220px]">Next Action</TableHead>
                  <TableHead className="min-w-[220px]">Transcript</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {callLogs.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6}>No call logs available yet.</TableCell>
                  </TableRow>
                )}

                {callLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell>
                      <div className="font-medium text-slate-800">{formatCustomerName(log.customer)}</div>
                      <div className="text-xs text-slate-500">{log.customer?.phone || ""}</div>
                    </TableCell>
                    <TableCell>{log.status}</TableCell>
                    <TableCell>{log.summary || "-"}</TableCell>
                    <TableCell>{log.intent || "-"}</TableCell>
                    <TableCell>{log.nextAction || "-"}</TableCell>
                    <TableCell>
                      {log.transcript ? (
                        <details className="max-w-[360px]">
                          <summary className="cursor-pointer text-slate-700 underline underline-offset-2">View transcript</summary>
                          <pre className="mt-2 max-h-52 overflow-auto whitespace-pre-wrap rounded-md bg-slate-50 p-2 text-xs text-slate-700">
                            {log.transcript}
                          </pre>
                        </details>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}