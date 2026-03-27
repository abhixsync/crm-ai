import { getServerSession } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { AutomationSettingsAdminClient } from "@/components/admin/automation-settings-admin-client";
import { ModernCampaignsView } from "@/components/modern/campaigns-view";
import { resolveTenantTheme } from "@/modules/theme/theme.service";

export default async function AutomationAdminPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login");
  }

  if (!["ADMIN", "SUPER_ADMIN"].includes(session.user.role)) {
    redirect("/dashboard");
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
    return <ModernCampaignsView />;
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
            <span className="text-slate-700">Automation Controls</span>
          </nav>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Automation Controls</h1>
          <p className="mt-1 text-sm text-slate-600">
            Super Admin panel for AI campaign retry, limits, batch, and working-hour controls.
          </p>
        </div>
      </div>

      <AutomationSettingsAdminClient />
    </main>
  );
}
