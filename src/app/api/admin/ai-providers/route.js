import { AiProviderType, AiProviderStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSession, hasRole } from "@/lib/server/auth-guard";
import { databaseUnavailableResponse, isDatabaseUnavailable } from "@/lib/server/database-error";

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

  try {
    const providers = await prisma.aiProviderConfig.findMany({
      orderBy: [{ priority: "asc" }, { name: "asc" }],
    });

    return Response.json({ providers });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      console.warn("[api/admin/ai-providers] Database unavailable; returning degraded response.");
      return databaseUnavailableResponse();
    }

    throw error;
  }
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
  const rawStatus = String(body.status || "STANDBY").toUpperCase();
  const status = AiProviderStatus[rawStatus] || AiProviderStatus.STANDBY;

  try {
    const created = await prisma.$transaction(async (tx) => {
      if (status === AiProviderStatus.ACTIVE) {
        await tx.aiProviderConfig.updateMany({
          where: { status: AiProviderStatus.ACTIVE },
          data: { status: AiProviderStatus.STANDBY },
        });
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
          status,
          metadata: body.metadata || null,
        },
      });
    });

    return Response.json({ provider: created }, { status: 201 });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      console.warn("[api/admin/ai-providers] Database unavailable during create.");
      return databaseUnavailableResponse();
    }

    throw error;
  }
}
