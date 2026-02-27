import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { TenantsAdminClient } from "@/components/admin/tenants-admin-client";

export default async function TenantsAdminPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login");
  }

  if (session.user.role !== "SUPER_ADMIN") {
    redirect("/dashboard");
  }

  return (
    <main className="mx-auto max-w-7xl space-y-8 px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Tenant Management</h1>
          <p className="mt-1 text-sm text-slate-600">
            Create and manage tenants with optional first-admin assignment.
          </p>
        </div>
      </div>

      <TenantsAdminClient />
    </main>
  );
}
