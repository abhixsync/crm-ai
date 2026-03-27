import { prisma } from "@/lib/prisma";
import { requireSession, hasRole } from "@/lib/server/auth-guard";
import { runProviderConnectivityCheck } from "@/lib/ai/connection-check";
import { databaseUnavailableResponse, isDatabaseUnavailable } from "@/lib/server/database-error";

const STATUS_ORDER = { ACTIVE: 0, STANDBY: 1, DISABLED: 2 };

function sortProviders(providers) {
  return [...providers].sort((left, right) => {
    const statusDiff = (STATUS_ORDER[left.status] ?? 1) - (STATUS_ORDER[right.status] ?? 1);
    if (statusDiff !== 0) return statusDiff;
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
      const providers = await prisma.aiProviderConfig.findMany({
        orderBy: [{ priority: "asc" }, { name: "asc" }],
      });

      const orderedProviders = sortProviders(providers);
      const results = [];

      for (const provider of orderedProviders) {
        const result = await runProviderConnectivityCheck(provider);
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
        console.warn("[api/admin/ai-providers/test-connection] Database unavailable for test-all.");
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
    const provider = await prisma.aiProviderConfig.findUnique({
      where: { id: providerId },
    });

    if (!provider) {
      return Response.json({ ok: false, error: "Provider not found." }, { status: 404 });
    }

    const result = await runProviderConnectivityCheck(provider);
    return Response.json(result, { status: result.ok ? 200 : 422 });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      console.warn("[api/admin/ai-providers/test-connection] Database unavailable for single-provider test.");
      return databaseUnavailableResponse();
    }

    throw error;
  }
}
