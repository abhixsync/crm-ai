import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { AiProvidersAdminClient } from "@/components/admin/ai-providers-admin-client";
import { TelephonyProvidersAdminClient } from "@/components/admin/telephony-providers-admin-client";

export default async function ProvidersPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login");
  }

  if (!["ADMIN", "SUPER_ADMIN"].includes(session.user.role)) {
    redirect("/dashboard");
  }

  const [initialAiProviders, initialTelephonyProviders] = await Promise.all([
    prisma.aiProviderConfig.findMany({
      orderBy: [{ isActive: "desc" }, { priority: "asc" }, { name: "asc" }],
    }),
    prisma.telephonyProviderConfig.findMany({
      orderBy: [{ isActive: "desc" }, { priority: "asc" }, { name: "asc" }],
    }),
  ]);

  return (
    <main className="mx-auto max-w-7xl space-y-8 px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Providers</h1>
          <p className="mt-1 text-sm text-slate-600">
            Manage AI and telephony providers from a single admin page.
          </p>
        </div>
        <Link href="/dashboard">
          <Button variant="secondary">Back to Dashboard</Button>
        </Link>
      </div>

      <section className="space-y-4 rounded-xl border border-slate-200/70 bg-white/70 p-4 shadow-sm backdrop-blur-sm sm:p-5">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">AI Providers</h2>
          <p className="mt-1 text-sm text-slate-600">Configure primary and fallback AI engines.</p>
        </div>
        <AiProvidersAdminClient initialProviders={initialAiProviders} embedded />
      </section>

      <section className="space-y-4 rounded-xl border border-slate-200/70 bg-white/70 p-4 shadow-sm backdrop-blur-sm sm:p-5">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Telephony Providers</h2>
          <p className="mt-1 text-sm text-slate-600">Manage outbound call providers and routing preference.</p>
        </div>
        <TelephonyProvidersAdminClient initialProviders={initialTelephonyProviders} embedded />
      </section>
    </main>
  );
}