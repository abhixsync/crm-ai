import { prisma } from "@/lib/prisma";
import { requireSession, hasRole } from "@/lib/server/auth-guard";
import { isDatabaseUnavailable, databaseUnavailableResponse } from "@/lib/server/database-error";
import { DEFAULT_SYSTEM_PROMPT } from "@/lib/ai/system-prompt";

async function requireSuperAdmin() {
  const auth = await requireSession();
  if (auth.error) return auth;

  if (!hasRole(auth.session, ["SUPER_ADMIN"])) {
    return { error: Response.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return auth;
}

/**
 * GET — Fetch the active system prompt (or default).
 */
export async function GET() {
  const auth = await requireSuperAdmin();
  if (auth.error) return auth.error;

  try {
    const row = await prisma.aiSystemPrompt.findFirst({
      where: { isActive: true },
      orderBy: { updatedAt: "desc" },
    });

    return Response.json({
      prompt: row || {
        id: null,
        key: "default",
        label: "Default System Prompt",
        prompt: DEFAULT_SYSTEM_PROMPT,
        isActive: true,
        createdAt: null,
        updatedAt: null,
      },
    });
  } catch (error) {
    if (isDatabaseUnavailable(error)) return databaseUnavailableResponse();
    throw error;
  }
}

/**
 * PUT — Create or update the active system prompt.
 */
export async function PUT(request) {
  const auth = await requireSuperAdmin();
  if (auth.error) return auth.error;

  const body = await request.json();
  const promptText = String(body.prompt || "").trim();
  const label = String(body.label || "Default System Prompt").trim();

  if (!promptText) {
    return Response.json({ error: "Prompt text is required." }, { status: 400 });
  }

  if (promptText.length > 50000) {
    return Response.json({ error: "Prompt text must be under 50,000 characters." }, { status: 400 });
  }

  try {
    const existing = await prisma.aiSystemPrompt.findFirst({
      where: { isActive: true },
      orderBy: { updatedAt: "desc" },
    });

    let row;
    if (existing) {
      row = await prisma.aiSystemPrompt.update({
        where: { id: existing.id },
        data: { prompt: promptText, label },
      });
    } else {
      row = await prisma.aiSystemPrompt.create({
        data: {
          key: "default",
          label,
          prompt: promptText,
          isActive: true,
        },
      });
    }

    return Response.json({ prompt: row });
  } catch (error) {
    if (isDatabaseUnavailable(error)) return databaseUnavailableResponse();
    throw error;
  }
}

/**
 * POST — Reset prompt to default.
 */
export async function POST(request) {
  const auth = await requireSuperAdmin();
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({}));

  if (body.action !== "reset") {
    return Response.json({ error: "Invalid action. Use {\"action\":\"reset\"}." }, { status: 400 });
  }

  try {
    const existing = await prisma.aiSystemPrompt.findFirst({
      where: { isActive: true },
      orderBy: { updatedAt: "desc" },
    });

    let row;
    if (existing) {
      row = await prisma.aiSystemPrompt.update({
        where: { id: existing.id },
        data: { prompt: DEFAULT_SYSTEM_PROMPT, label: "Default System Prompt" },
      });
    } else {
      row = await prisma.aiSystemPrompt.create({
        data: {
          key: "default",
          label: "Default System Prompt",
          prompt: DEFAULT_SYSTEM_PROMPT,
          isActive: true,
        },
      });
    }

    return Response.json({ prompt: row });
  } catch (error) {
    if (isDatabaseUnavailable(error)) return databaseUnavailableResponse();
    throw error;
  }
}
