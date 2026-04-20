import { requireSession } from "@/lib/server/auth-guard";
import { getPlanGuard } from "@/lib/subscription/plan-guard";

/**
 * GET /api/subscription/features
 * Returns the feature flags for the current tenant's plan.
 * Used by the nav shell to lock/unlock feature-gated nav items.
 * SUPER_ADMIN always has all features — callers should skip this endpoint for them.
 */
export async function GET() {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  const tenantId = auth.session.user.tenantId ?? null;
  const guard = await getPlanGuard(tenantId);

  return Response.json({ features: guard.features, plan: guard.plan });
}
