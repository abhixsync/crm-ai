import { requireSession, hasRole } from "@/lib/server/auth-guard";
import { prisma } from "@/lib/prisma";
import { upgradePlan, downgradeToFree, extendTrial } from "@/lib/subscription/subscription-service";
import { getSubscriptionConfig } from "@/lib/subscription/subscription-service";
import { invalidatePlanGuardCache } from "@/lib/subscription/plan-guard";

/**
 * GET /api/admin/subscription?tenantId=...
 * List all subscriptions (superadmin) or single tenant subscription.
 */
export async function GET(request) {
  const auth = await requireSession();
  if (auth.error) return auth.error;
  if (!hasRole(auth.session, ["SUPER_ADMIN"])) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const tenantId = searchParams.get("tenantId");

  if (tenantId) {
    const sub = await prisma.tenantSubscription.findUnique({
      where: { tenantId },
      include: { planDef: true, invoices: { orderBy: { createdAt: "desc" }, take: 10 } },
    });
    return Response.json({ subscription: sub });
  }

  const [subscriptions, config] = await Promise.all([
    prisma.tenantSubscription.findMany({
      include: { tenant: { select: { id: true, name: true, slug: true } }, planDef: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.subscriptionConfig.findMany(),
  ]);

  return Response.json({ subscriptions, config });
}

/**
 * PATCH /api/admin/subscription
 * Body: { tenantId, action: "override_plan"|"extend_trial"|"cancel"|"downgrade" }
 */
export async function PATCH(request) {
  const auth = await requireSession();
  if (auth.error) return auth.error;
  if (!hasRole(auth.session, ["SUPER_ADMIN"])) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { tenantId, action } = body;

  if (!tenantId || !action) {
    return Response.json({ error: "tenantId and action are required." }, { status: 400 });
  }

  try {
    switch (action) {
      case "override_plan": {
        const { plan, billingCycle = "MONTHLY" } = body;
        if (!plan) return Response.json({ error: "plan required." }, { status: 400 });
        await upgradePlan(tenantId, { plan, billingCycle });
        break;
      }
      case "extend_trial": {
        const days = Number(body.days || 30);
        await extendTrial(tenantId, days);
        break;
      }
      case "downgrade":
        await downgradeToFree(tenantId);
        break;
      default:
        return Response.json({ error: "Unknown action." }, { status: 400 });
    }

    invalidatePlanGuardCache(tenantId);
    return Response.json({ ok: true });
  } catch (err) {
    console.error("[/api/admin/subscription]", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}

/**
 * PUT /api/admin/subscription/config
 * Updates global SubscriptionConfig keys.
 */
export async function PUT(request) {
  const auth = await requireSession();
  if (auth.error) return auth.error;
  if (!hasRole(auth.session, ["SUPER_ADMIN"])) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();

  const ALLOWED_KEYS = ["trial_days", "grace_period_days", "stripe_enabled", "razorpay_enabled", "currency"];

  const updates = Object.entries(body)
    .filter(([k]) => ALLOWED_KEYS.includes(k))
    .map(([key, value]) =>
      prisma.subscriptionConfig.upsert({
        where:  { key },
        update: { value },
        create: { key, value },
      })
    );

  await Promise.all(updates);
  return Response.json({ ok: true });
}
