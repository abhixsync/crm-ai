import { prisma } from "@/lib/prisma";
import { requireSession, hasRole, getTenantContext } from "@/lib/server/auth-guard";
import { isDatabaseUnavailable, databaseUnavailableResponse } from "@/lib/server/database-error";

const VALID_INTENT_TYPES = ["INTERESTED", "NOT_INTERESTED", "CALLBACK", "DO_NOT_CALL", "MORE_INFO"];

export async function GET(request) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  if (!hasRole(auth.session, ["ADMIN", "SUPER_ADMIN"])) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { tenantId } = getTenantContext(auth.session, request);
  if (!tenantId) {
    return Response.json({ error: "Tenant context required" }, { status: 400 });
  }

  try {
    const intents = await prisma.intentTrainingPhrase.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
    });

    return Response.json({ intents });
  } catch (error) {
    if (isDatabaseUnavailable(error)) return databaseUnavailableResponse();
    throw error;
  }
}

export async function POST(request) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  if (!hasRole(auth.session, ["ADMIN", "SUPER_ADMIN"])) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { tenantId } = getTenantContext(auth.session, request);
  if (!tenantId) {
    return Response.json({ error: "Tenant context required" }, { status: 400 });
  }

  try {
    const body = await request.json();
    const phrase = String(body.phrase || "").trim();
    const intentType = String(body.intentType || "").trim().toUpperCase();
    const language = String(body.language || "hinglish").trim().toLowerCase();

    if (!phrase) {
      return Response.json({ error: "Phrase is required" }, { status: 400 });
    }

    if (phrase.length > 500) {
      return Response.json({ error: "Phrase must be under 500 characters" }, { status: 400 });
    }

    if (!VALID_INTENT_TYPES.includes(intentType)) {
      return Response.json(
        { error: `Invalid intent type. Must be one of: ${VALID_INTENT_TYPES.join(", ")}` },
        { status: 400 }
      );
    }

    const intent = await prisma.intentTrainingPhrase.create({
      data: {
        tenantId,
        phrase,
        intentType,
        language,
        source: "manual",
      },
    });

    return Response.json({ intent }, { status: 201 });
  } catch (error) {
    if (isDatabaseUnavailable(error)) return databaseUnavailableResponse();
    throw error;
  }
}
