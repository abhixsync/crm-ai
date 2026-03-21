import { getServerSession } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { SettingsTabs } from "@/components/admin/settings-tabs";
import { ModernSettingsView } from "@/components/modern/settings-view";
import { resolveTenantTheme } from "@/modules/theme/theme.service";

export default async function AdminSettingsPage({ searchParams }) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login");
  }

  const role = session.user.role;
  if (!role || !["ADMIN", "SUPER_ADMIN"].includes(role)) {
    redirect("/dashboard");
  }

  const resolvedSearchParams = (await searchParams) || {};

  const rawTypeParam = Array.isArray(resolvedSearchParams?.type)
    ? resolvedSearchParams.type[0]
    : resolvedSearchParams?.type;
  const normalizedTypeParam = String(rawTypeParam || "").trim().toLowerCase();

  if (!normalizedTypeParam) {
    redirect("/admin/settings?type=profile");
  }

  // Resolve UI layout
  let uiLayout = "modern";
  try {
    const theme = await resolveTenantTheme(session.user.tenantId);
    uiLayout = theme.uiLayout || "modern";
  } catch {
    // fall back to modern
  }

  if (uiLayout === "modern") {
    return <ModernSettingsView initialRole={role} initialLayout={uiLayout} />;
  }

  return (
    <main className="mx-auto max-w-7xl space-y-8 px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <nav aria-label="Breadcrumb" className="mb-1 text-sm text-slate-500">
            <Link href="/dashboard" className="hover:text-slate-800">
              Home
            </Link>
            <span className="px-1">→</span>
            <span className="text-slate-700">Settings</span>
          </nav>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Settings</h1>
          <p className="mt-1 text-sm text-slate-600">Manage your account settings and customize your CRM theme.</p>
        </div>
      </div>

      <SettingsTabs initialRole={role} initialLayout={uiLayout} />
    </main>
  );
}
