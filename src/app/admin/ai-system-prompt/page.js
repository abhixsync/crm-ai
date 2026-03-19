import { getServerSession } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  DEFAULT_SYSTEM_PROMPT,
  GLOBAL_SYSTEM_PROMPT_KEY,
  getSystemPromptKeyForTenant,
} from "@/lib/ai/system-prompt";
import { AiSystemPromptEditor } from "@/components/admin/ai-system-prompt-editor";

export default async function AiSystemPromptPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login");
  }

  if (!["SUPER_ADMIN", "ADMIN"].includes(session.user.role)) {
    redirect("/dashboard");
  }

  const tenantId = session.user.role === "SUPER_ADMIN" ? null : session.user.tenantId || null;
  if (session.user.role === "ADMIN" && !tenantId) {
    redirect("/dashboard");
  }

  const promptKey = getSystemPromptKeyForTenant(tenantId);

  const adminBackHref = session.user.role === "SUPER_ADMIN"
    ? "/admin/providers"
    : "/admin/settings?type=profile";
  const adminBackLabel = session.user.role === "SUPER_ADMIN" ? "Providers" : "Admin";
  const promptScopeDescription = session.user.role === "SUPER_ADMIN"
    ? "global default"
    : "your tenant";

  let initialPrompt = null;
  try {
    initialPrompt = await prisma.aiSystemPrompt.findFirst({
      where: { key: promptKey, isActive: true },
      orderBy: { updatedAt: "desc" },
    });

    if (!initialPrompt && session.user.role !== "SUPER_ADMIN") {
      initialPrompt = await prisma.aiSystemPrompt.findFirst({
        where: { key: GLOBAL_SYSTEM_PROMPT_KEY, isActive: true },
        orderBy: { updatedAt: "desc" },
      });
    }
  } catch {
    // DB might not have the table yet; use default
  }

  const promptData = initialPrompt || {
    id: null,
    key: promptKey,
    label: "Default System Prompt",
    prompt: DEFAULT_SYSTEM_PROMPT,
    isActive: true,
    createdAt: null,
    updatedAt: null,
  };

  const initialScope = {
    key: promptKey,
    tenantId,
    isSuperAdmin: session.user.role === "SUPER_ADMIN",
    inheritedFromGlobal: session.user.role !== "SUPER_ADMIN" && (!initialPrompt || initialPrompt.key === GLOBAL_SYSTEM_PROMPT_KEY),
  };

  return (
    <main className="mx-auto max-w-7xl space-y-8 px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <nav aria-label="Breadcrumb" className="mb-1 text-sm text-slate-500">
            <Link href="/dashboard" className="hover:text-slate-800">
              Home
            </Link>
            <span className="px-1">→</span>
            <Link href={adminBackHref} className="hover:text-slate-800">
              {adminBackLabel}
            </Link>
            <span className="px-1">→</span>
            <span className="text-slate-700">AI System Prompt</span>
          </nav>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">AI System Prompt</h1>
          <p className="mt-1 text-sm text-slate-600">
            Edit the {promptScopeDescription} system prompt used by all AI providers (OpenAI, Claude, Groq).
            Changes apply immediately to new calls in this scope. The last 50 conversation turns per customer
            are automatically appended at runtime.
          </p>
        </div>
      </div>

      <AiSystemPromptEditor initialPrompt={promptData} initialScope={initialScope} />
    </main>
  );
}
