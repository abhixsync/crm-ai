import { prisma } from "@/lib/prisma";
import { requireSession, hasRole } from "@/lib/server/auth-guard";

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
  if (body.apiKey !== undefined) updateData.apiKey = parseOptionalString(body.apiKey);
  if (body.priority !== undefined) updateData.priority = Number(body.priority);
  if (body.enabled !== undefined) updateData.enabled = Boolean(body.enabled);
  if (body.timeoutMs !== undefined) updateData.timeoutMs = Number(body.timeoutMs);
  if (body.metadata !== undefined) updateData.metadata = body.metadata || null;

  const makeActive = body.isActive === true;

  const updated = await prisma.$transaction(async (tx) => {
    if (makeActive) {
      await tx.telephonyProviderConfig.updateMany({ data: { isActive: false } });
    }

    return tx.telephonyProviderConfig.update({
      where: { id: providerId },
      data: {
        ...updateData,
        ...(body.isActive !== undefined ? { isActive: Boolean(body.isActive) } : {}),
      },
    });
  });

  return Response.json({ provider: updated });
}

export async function DELETE(_request, { params }) {
  const auth = await requireAdminSession();
  if (auth.error) return auth.error;

  const { providerId } = await params;

  if (!providerId) {
    return Response.json({ error: "providerId is required" }, { status: 400 });
  }

  const total = await prisma.telephonyProviderConfig.count();
  if (total <= 1) {
    return Response.json({ error: "At least one telephony provider config must remain." }, { status: 400 });
  }

  const target = await prisma.telephonyProviderConfig.findUnique({ where: { id: providerId } });

  if (!target) {
    return Response.json({ error: "Provider not found" }, { status: 404 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.telephonyProviderConfig.delete({ where: { id: providerId } });

    if (target.isActive) {
      const nextProvider = await tx.telephonyProviderConfig.findFirst({
        where: { enabled: true },
        orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
      });

      if (nextProvider) {
        await tx.telephonyProviderConfig.update({
          where: { id: nextProvider.id },
          data: { isActive: true },
        });
      }
    }
  });

  return Response.json({ ok: true });
}
