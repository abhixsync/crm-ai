import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { UserManagementAdminClient } from "@/components/admin/user-management-admin-client";

export default async function UserManagementPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login");
  }

  if (!session.user.role || !["ADMIN", "SUPER_ADMIN"].includes(session.user.role)) {
    redirect("/dashboard");
  }

  let tenantLabel = null;
  if (session.user.role === "ADMIN" && session.user.tenantId) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: session.user.tenantId },
      select: { name: true },
    });

    tenantLabel = tenant?.name || "Assigned Tenant";
  }

  return (
    <main className="mx-auto max-w-7xl space-y-8 px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">User Management</h1>
          <p className="mt-1 text-sm text-slate-600">
            Manage users, role templates, permissions, and module access.
          </p>
          {tenantLabel ? (
            <p className="mt-2 text-xs font-medium text-slate-600">Current Tenant: {tenantLabel}</p>
          ) : null}
        </div>
      </div>

      <UserManagementAdminClient />
    </main>
  );
}
