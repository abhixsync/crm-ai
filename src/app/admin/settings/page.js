import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { SettingsTabs } from "@/components/admin/settings-tabs";

export default async function AdminSettingsPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login");
  }

  const role = session.user.role;
  if (!role || !["ADMIN", "SUPER_ADMIN"].includes(role)) {
    redirect("/dashboard");
  }

  return (
    <main className="mx-auto max-w-7xl space-y-8 px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Settings</h1>
          <p className="mt-1 text-sm text-slate-600">Manage your account settings and customize your CRM theme.</p>
        </div>
      </div>

      <SettingsTabs />
    </main>
  );
}
