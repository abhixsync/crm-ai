import { prisma } from "@/lib/prisma";
import { requireSession, hasRole, getTenantContext } from "@/lib/server/auth-guard";
import { isDatabaseUnavailable, databaseUnavailableResponse } from "@/lib/server/database-error";
import {
  applyLanguageRulesToPrompt,
  DEFAULT_SYSTEM_PROMPT,
  GLOBAL_SYSTEM_PROMPT_KEY,
  getTenantSettings,
  getSystemPromptKeyForTenant,
} from "@/lib/ai/system-prompt";

function resolvePromptScope(session) {
  const tenant = getTenantContext(session);
  const tenantId = tenant.isSuperAdmin ? null : tenant.tenantId;

  return {
    tenantId,
    isSuperAdmin: tenant.isSuperAdmin,
    promptKey: getSystemPromptKeyForTenant(tenantId),
  };
}

async function findPromptByKey(promptKey) {
  return prisma.aiSystemPrompt.findFirst({
    where: { key: promptKey, isActive: true },
    orderBy: { updatedAt: "desc" },
  });
}

async function resolvePromptRowForScope(scope) {
  const scopedRow = await findPromptByKey(scope.promptKey);
  if (scopedRow) {
    return { row: scopedRow, inheritedFromGlobal: false };
  }

  if (!scope.isSuperAdmin) {
    const globalRow = await findPromptByKey(GLOBAL_SYSTEM_PROMPT_KEY);
    if (globalRow) {
      return { row: globalRow, inheritedFromGlobal: true };
    }
  }

  return { row: null, inheritedFromGlobal: false };
}

async function buildEditorPromptText({ scope, row }) {
  const { language } = await getTenantSettings(scope.tenantId);
  return applyLanguageRulesToPrompt(row?.prompt || DEFAULT_SYSTEM_PROMPT, language);
}

async function requirePromptManager() {
  const auth = await requireSession();
  if (auth.error) return auth;

  if (!hasRole(auth.session, ["SUPER_ADMIN", "ADMIN"])) {
    return { error: Response.json({ error: "Forbidden" }, { status: 403 }) };
  }

  try {
    const scope = resolvePromptScope(auth.session);
    return { session: auth.session, scope };
  } catch (error) {
    return {
      error: Response.json(
        { error: error?.message || "Unable to resolve tenant prompt scope." },
        { status: 400 }
      ),
    };
  }

}

/**
 * GET — Fetch the active system prompt (or default).
 */
export async function GET() {
  const auth = await requirePromptManager();
  if (auth.error) return auth.error;

  try {
    const { row, inheritedFromGlobal } = await resolvePromptRowForScope(auth.scope);
    const editorPromptText = await buildEditorPromptText({ scope: auth.scope, row });
    const promptPayload = row
      ? { ...row, prompt: editorPromptText }
      : {
          id: null,
          key: auth.scope.promptKey,
          label: "Default System Prompt",
          prompt: editorPromptText,
          isActive: true,
          createdAt: null,
          updatedAt: null,
        };

    return Response.json({
      prompt: promptPayload,
      scope: {
        key: auth.scope.promptKey,
        tenantId: auth.scope.tenantId,
        isSuperAdmin: auth.scope.isSuperAdmin,
        inheritedFromGlobal,
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
  const auth = await requirePromptManager();
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
    const existing = await prisma.aiSystemPrompt.findUnique({
      where: { key: auth.scope.promptKey },
    });

    let row;
    if (existing) {
      row = await prisma.aiSystemPrompt.update({
        where: { key: auth.scope.promptKey },
        data: { prompt: promptText, label },
      });
    } else {
      row = await prisma.aiSystemPrompt.create({
        data: {
          key: auth.scope.promptKey,
          label,
          prompt: promptText,
          isActive: true,
        },
      });
    }

    const editorPromptText = await buildEditorPromptText({ scope: auth.scope, row });

    return Response.json({
      prompt: {
        ...row,
        prompt: editorPromptText,
      },
      scope: {
        key: auth.scope.promptKey,
        tenantId: auth.scope.tenantId,
        isSuperAdmin: auth.scope.isSuperAdmin,
        inheritedFromGlobal: false,
      },
    });
  } catch (error) {
    if (isDatabaseUnavailable(error)) return databaseUnavailableResponse();
    throw error;
  }
}

/**
 * POST — Reset prompt to default.
 */
export async function POST(request) {
  const auth = await requirePromptManager();
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({}));

  if (body.action !== "reset") {
    return Response.json({ error: "Invalid action. Use {\"action\":\"reset\"}." }, { status: 400 });
  }

  try {
    if (auth.scope.isSuperAdmin) {
      const existing = await prisma.aiSystemPrompt.findUnique({
        where: { key: GLOBAL_SYSTEM_PROMPT_KEY },
      });

      let row;
      if (existing) {
        row = await prisma.aiSystemPrompt.update({
          where: { key: GLOBAL_SYSTEM_PROMPT_KEY },
          data: { prompt: DEFAULT_SYSTEM_PROMPT, label: "Default System Prompt" },
        });
      } else {
        row = await prisma.aiSystemPrompt.create({
          data: {
            key: GLOBAL_SYSTEM_PROMPT_KEY,
            label: "Default System Prompt",
            prompt: DEFAULT_SYSTEM_PROMPT,
            isActive: true,
          },
        });
      }

      const editorPromptText = await buildEditorPromptText({ scope: auth.scope, row });

      return Response.json({
        prompt: {
          ...row,
          prompt: editorPromptText,
        },
        scope: {
          key: auth.scope.promptKey,
          tenantId: auth.scope.tenantId,
          isSuperAdmin: auth.scope.isSuperAdmin,
          inheritedFromGlobal: false,
        },
      });
    }

    await prisma.aiSystemPrompt.deleteMany({
      where: { key: auth.scope.promptKey },
    });

    const { row, inheritedFromGlobal } = await resolvePromptRowForScope(auth.scope);
    const editorPromptText = await buildEditorPromptText({ scope: auth.scope, row });
    const promptPayload = row
      ? { ...row, prompt: editorPromptText }
      : {
          id: null,
          key: auth.scope.promptKey,
          label: "Default System Prompt",
          prompt: editorPromptText,
          isActive: true,
          createdAt: null,
          updatedAt: null,
        };

    return Response.json({
      prompt: promptPayload,
      scope: {
        key: auth.scope.promptKey,
        tenantId: auth.scope.tenantId,
        isSuperAdmin: auth.scope.isSuperAdmin,
        inheritedFromGlobal,
      },
    });
  } catch (error) {
    if (isDatabaseUnavailable(error)) return databaseUnavailableResponse();
    throw error;
  }
}
