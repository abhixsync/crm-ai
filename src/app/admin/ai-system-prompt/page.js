import { getServerSession } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DEFAULT_SYSTEM_PROMPT } from "@/lib/ai/system-prompt";
import { AiSystemPromptEditor } from "@/components/admin/ai-system-prompt-editor";

export default async function AiSystemPromptPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login");
  }

  if (session.user.role !== "SUPER_ADMIN") {
    redirect("/dashboard");
  }

  let initialPrompt = null;
  try {
    initialPrompt = await prisma.aiSystemPrompt.findFirst({
      where: { isActive: true },
      orderBy: { updatedAt: "desc" },
    });
  } catch {
    // DB might not have the table yet; use default
  }

  const promptData = initialPrompt || {
    id: null,
    key: "default",
    label: "Default System Prompt",
    prompt: DEFAULT_SYSTEM_PROMPT,
    isActive: true,
    createdAt: null,
    updatedAt: null,
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
            <Link href="/admin/providers" className="hover:text-slate-800">
              Providers
            </Link>
            <span className="px-1">→</span>
            <span className="text-slate-700">AI System Prompt</span>
          </nav>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">AI System Prompt</h1>
          <p className="mt-1 text-sm text-slate-600">
            Edit the shared system prompt used by all AI providers (OpenAI, Claude, Groq).
            Changes apply immediately to new calls. The last 50 conversation turns per customer are
            automatically appended at runtime.
          </p>
        </div>
      </div>

      <AiSystemPromptEditor initialPrompt={promptData} />
    </main>
  );
}
