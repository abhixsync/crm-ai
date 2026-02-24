import { AiProviderType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSession, hasRole } from "@/lib/server/auth-guard";

function parseOptionalString(value) {
  const text = String(value || "").trim();
  return text || null;
}

function normalizeType(value) {
  const type = String(value || "").trim().toUpperCase();
  return AiProviderType[type] || null;
}

async function requireAdminSession() {
  const auth = await requireSession();

  if (auth.error) return auth;

  if (!hasRole(auth.session, ["SUPER_ADMIN"])) {
    return { error: Response.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return auth;
}

export async function GET() {
  const auth = await requireAdminSession();
  if (auth.error) return auth.error;

  const providers = await prisma.aiProviderConfig.findMany({
    orderBy: [{ isActive: "desc" }, { priority: "asc" }, { name: "asc" }],
  });

  return Response.json({ providers });
}

export async function POST(request) {
  const auth = await requireAdminSession();
  if (auth.error) return auth.error;

  const body = await request.json();

  const name = String(body.name || "").trim();
  const type = normalizeType(body.type);

  if (!name || !type) {
    return Response.json({ error: "name and valid type are required" }, { status: 400 });
  }

  const priority = Number.isFinite(Number(body.priority)) ? Number(body.priority) : 100;
  const timeoutMs = Number.isFinite(Number(body.timeoutMs)) ? Number(body.timeoutMs) : 12000;
  const makeActive = Boolean(body.isActive);

  const created = await prisma.$transaction(async (tx) => {
    if (makeActive) {
      await tx.aiProviderConfig.updateMany({ data: { isActive: false } });
    }

    return tx.aiProviderConfig.create({
      data: {
        name,
        type,
        endpoint: parseOptionalString(body.endpoint),
        apiKey: parseOptionalString(body.apiKey),
        model: parseOptionalString(body.model),
        priority,
        timeoutMs,
        enabled: body.enabled === undefined ? true : Boolean(body.enabled),
        isActive: makeActive,
        metadata: body.metadata || null,
      },
    });
  });

  return Response.json({ provider: created }, { status: 201 });
}
