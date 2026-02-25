import { prisma } from "@/lib/prisma";
import { requireSession, hasRole } from "@/lib/server/auth-guard";
import { runTelephonyConnectivityCheck } from "@/lib/telephony/connection-check";
import { databaseUnavailableResponse, isDatabaseUnavailable } from "@/lib/server/database-error";

function sortProviders(providers) {
  return [...providers].sort((left, right) => {
    if (left.isActive !== right.isActive) return left.isActive ? -1 : 1;
    if (left.priority !== right.priority) return left.priority - right.priority;
    return left.name.localeCompare(right.name);
  });
}

export async function POST(request) {
  const auth = await requireSession();

  if (auth.error) return auth.error;

  if (!hasRole(auth.session, ["SUPER_ADMIN"])) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const testAll = Boolean(body?.testAll);

  if (testAll) {
    try {
      const providers = await prisma.telephonyProviderConfig.findMany({
        orderBy: [{ isActive: "desc" }, { priority: "asc" }, { name: "asc" }],
      });

      const ordered = sortProviders(providers);
      const results = [];

      for (const provider of ordered) {
        const result = await runTelephonyConnectivityCheck(provider);
        results.push(result);
      }

      const successCount = results.filter((result) => result.ok).length;
      const failedCount = results.length - successCount;

      return Response.json({
        ok: failedCount === 0,
        mode: "all",
        totalProviders: results.length,
        successCount,
        failedCount,
        results,
      });
    } catch (error) {
      if (isDatabaseUnavailable(error)) {
        console.warn("[api/admin/telephony-providers/test-connection] Database unavailable for test-all.");
        return databaseUnavailableResponse();
      }

      throw error;
    }
  }

  const providerId = String(body?.providerId || "").trim();

  if (!providerId) {
    return Response.json({ ok: false, error: "providerId is required." }, { status: 400 });
  }

  try {
    const provider = await prisma.telephonyProviderConfig.findUnique({
      where: { id: providerId },
    });

    if (!provider) {
      return Response.json({ ok: false, error: "Provider not found." }, { status: 404 });
    }

    const result = await runTelephonyConnectivityCheck(provider);
    return Response.json(result, { status: result.ok ? 200 : 422 });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      console.warn("[api/admin/telephony-providers/test-connection] Database unavailable for single-provider test.");
      return databaseUnavailableResponse();
    }

    throw error;
  }
}
