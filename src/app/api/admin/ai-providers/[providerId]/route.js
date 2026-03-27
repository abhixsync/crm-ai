import { AiProviderStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSession, hasRole } from "@/lib/server/auth-guard";
import { databaseUnavailableResponse, isDatabaseUnavailable } from "@/lib/server/database-error";

function parseOptionalString(value) {
  if (value === undefined) return undefined;
  const text = String(value || "").trim();
  return text || null;
}

async function requireAdminSession() {
  const auth = await requireSession();

  if (auth.error) return auth;

  if (!hasRole(auth.session, ["SUPER_ADMIN"])) {
    return { error: Response.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return auth;
}

export async function PATCH(request, { params }) {
  const auth = await requireAdminSession();
  if (auth.error) return auth.error;

  const { providerId } = await params;
  const body = await request.json();

  if (!providerId) {
    return Response.json({ error: "providerId is required" }, { status: 400 });
  }

  const updateData = {};

  if (body.name !== undefined) updateData.name = String(body.name || "").trim();
  if (body.endpoint !== undefined) updateData.endpoint = parseOptionalString(body.endpoint);
  if (body.apiKey !== undefined) updateData.apiKey = parseOptionalString(body.apiKey);
  if (body.model !== undefined) updateData.model = parseOptionalString(body.model);
  if (body.priority !== undefined) updateData.priority = Number(body.priority);
  if (body.timeoutMs !== undefined) updateData.timeoutMs = Number(body.timeoutMs);
  if (body.metadata !== undefined) updateData.metadata = body.metadata || null;

  if (body.status !== undefined) {
    const rawStatus = String(body.status).toUpperCase();
    updateData.status = AiProviderStatus[rawStatus] || AiProviderStatus.STANDBY;
  }

  const settingActive = updateData.status === AiProviderStatus.ACTIVE;

  try {
    let updated;

    if (settingActive) {
      try {
        const [, updatedProvider] = await prisma.$transaction([
          prisma.aiProviderConfig.updateMany({
            where: { status: AiProviderStatus.ACTIVE, id: { not: providerId } },
            data: { status: AiProviderStatus.STANDBY },
          }),
          prisma.aiProviderConfig.update({
            where: { id: providerId },
            data: updateData,
          }),
        ]);

        updated = updatedProvider;
      } catch (error) {
        // Fallback for pooled DB contention (e.g., Neon) where transaction start can timeout.
        if (error?.code === "P2028") {
          console.warn("[api/admin/ai-providers] P2028 transaction timeout — falling back to sequential updates. Brief inconsistency possible.");
          await prisma.aiProviderConfig.updateMany({
            where: { status: AiProviderStatus.ACTIVE, id: { not: providerId } },
            data: { status: AiProviderStatus.STANDBY },
          });
          updated = await prisma.aiProviderConfig.update({
            where: { id: providerId },
            data: updateData,
          });
        } else {
          throw error;
        }
      }
    } else {
      updated = await prisma.aiProviderConfig.update({
        where: { id: providerId },
        data: updateData,
      });
    }

    return Response.json({ provider: updated });
  } catch (error) {
    if (error?.code === "P2025") {
      return Response.json({ error: "Provider not found" }, { status: 404 });
    }

    if (isDatabaseUnavailable(error)) {
      console.warn("[api/admin/ai-providers/[providerId]] Database unavailable during update.");
      return databaseUnavailableResponse();
    }

    throw error;
  }
}

export async function DELETE(_request, { params }) {
  const auth = await requireAdminSession();
  if (auth.error) return auth.error;

  const { providerId } = await params;

  if (!providerId) {
    return Response.json({ error: "providerId is required" }, { status: 400 });
  }

  try {
    const target = await prisma.aiProviderConfig.findUnique({ where: { id: providerId } });

    if (!target) {
      return Response.json({ error: "Provider not found" }, { status: 404 });
    }

    await prisma.$transaction(async (tx) => {
      // Count inside the transaction to prevent race with concurrent deletes
      const remaining = await tx.aiProviderConfig.count();
      if (remaining <= 1) {
        throw Object.assign(new Error("At least one AI provider config must remain."), { code: "LAST_PROVIDER" });
      }

      await tx.aiProviderConfig.delete({ where: { id: providerId } });

      if (target.status === AiProviderStatus.ACTIVE) {
        const nextProvider = await tx.aiProviderConfig.findFirst({
          where: { status: AiProviderStatus.STANDBY },
          orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
        });

        if (nextProvider) {
          await tx.aiProviderConfig.update({
            where: { id: nextProvider.id },
            data: { status: AiProviderStatus.ACTIVE },
          });
        }
      }
    });

    return Response.json({ ok: true });
  } catch (error) {
    if (error?.code === "LAST_PROVIDER") {
      return Response.json({ error: error.message }, { status: 400 });
    }

    if (isDatabaseUnavailable(error)) {
      console.warn("[api/admin/ai-providers/[providerId]] Database unavailable during delete.");
      return databaseUnavailableResponse();
    }

    throw error;
  }
}
