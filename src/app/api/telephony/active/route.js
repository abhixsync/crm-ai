import { prisma } from "@/lib/prisma";
import { hasRole, requireSession } from "@/lib/server/auth-guard";
import { databaseUnavailableResponse, isDatabaseUnavailable } from "@/lib/server/database-error";

export async function GET() {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  if (!hasRole(auth.session, ["ADMIN", "SALES"])) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const providers = await prisma.telephonyProviderConfig.findMany({
      where: { enabled: true },
      orderBy: [{ isActive: "desc" }, { priority: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        type: true,
        isActive: true,
        enabled: true,
        priority: true,
      },
    });

    return Response.json({ provider: providers[0] || null, providers });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      console.warn("[api/telephony/active] Database unavailable; returning degraded response.");
      return databaseUnavailableResponse();
    }

    throw error;
  }
}
