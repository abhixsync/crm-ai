import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { GlobalAppearancePage } from "@/modules/admin/global-appearance/GlobalAppearancePage";

export default async function AdminGlobalAppearancePage() {
  const session = await getServerSession(authOptions as any) as any;

  if (!session?.user) {
    redirect("/login");
  }

  const role = session.user.role;
  if (!role || role !== "SUPER_ADMIN") {
    redirect("/dashboard");
  }

  return (
    <main className="mx-auto max-w-7xl space-y-8 px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Global Appearance</h1>
          <p className="mt-1 text-sm text-slate-600">
            Manage platform-wide theme defaults and branding that apply to all tenants.
          </p>
        </div>
      </div>

      <GlobalAppearancePage />
    </main>
  );
}