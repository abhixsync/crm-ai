import { requireSession, hasRole } from "@/lib/server/auth-guard";
import { getProviderFailoverOrder } from "@/lib/ai/provider-router";

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export async function POST(request) {
  const auth = await requireSession();

  if (auth.error) return auth.error;

  if (!hasRole(auth.session, ["ADMIN"])) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const providers = await getProviderFailoverOrder();

  if (!providers.length) {
    return Response.json({
      ok: false,
      dryRun: true,
      attempted: [],
      selected: null,
      message: "No enabled AI providers are available.",
    });
  }

  const requestedFailures = Number(body?.simulateFailures ?? 1);
  const maxFailures = Math.max(0, providers.length - 1);
  const simulateFailures = clamp(
    Number.isFinite(requestedFailures) ? requestedFailures : 1,
    0,
    maxFailures
  );

  const selected = providers[simulateFailures];
  const attempted = providers.slice(0, simulateFailures + 1).map((provider, index) => ({
    index,
    id: provider.id,
    name: provider.name,
    type: provider.type,
    simulatedFailure: index < simulateFailures,
  }));

  return Response.json({
    ok: true,
    dryRun: true,
    simulateFailures,
    totalProviders: providers.length,
    attempted,
    selected: selected
      ? {
          id: selected.id,
          name: selected.name,
          type: selected.type,
        }
      : null,
    message: `Dry-run complete. Fallback selected: ${selected?.name || "none"}.`,
  });
}
