import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { UserManagementAdminClient } from "@/components/admin/user-management-admin-client";

export default async function UserManagementPage() {
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
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">User Management</h1>
          <p className="mt-1 text-sm text-slate-600">
            Super-admin module for users, role templates, permissions, module access, and audit tracking.
          </p>
        </div>
        <div className="flex gap-2">
          {/* <Link href="/admin/automation">
            <Button variant="secondary">Automation</Button>
          </Link> */}
          <Link href="/dashboard">
            <Button variant="secondary">Back to Dashboard</Button>
          </Link>
        </div>
      </div>

      <UserManagementAdminClient />
    </main>
  );
}
