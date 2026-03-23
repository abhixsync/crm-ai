import { requireSession, getTenantContext } from "@/lib/server/auth-guard";
import { getSubscriptionConfig, getPlatformCurrency } from "@/lib/subscription/subscription-service";
import { createCheckoutSession, getStripePriceId } from "@/lib/billing/stripe";
import { createSubscription, getRazorpayPlanId } from "@/lib/billing/razorpay";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/billing/checkout
 * Body: { plan: "PLUS"|"PRO"|"MAX", billingCycle: "MONTHLY"|"ANNUAL", provider: "stripe"|"razorpay" }
 *
 * Returns: { url } for Stripe redirect, or { subscriptionId, razorpayKeyId, customerId } for Razorpay.
 */
export async function POST(request) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  const { tenantId } = getTenantContext(auth.session, request);
  if (!tenantId) return Response.json({ error: "Tenant context required." }, { status: 400 });

  const body = await request.json();
  const plan         = String(body.plan         || "").toUpperCase();
  const billingCycle = String(body.billingCycle || "MONTHLY").toUpperCase();

  // Derive provider from platform currency setting
  const currency = await getPlatformCurrency();
  const provider = currency === "USD" ? "stripe" : "razorpay";

  if (!["PLUS", "PRO", "MAX"].includes(plan)) {
    return Response.json({ error: "Invalid plan." }, { status: 400 });
  }

  // Check if the derived provider is enabled
  const stripeEnabled    = await getSubscriptionConfig("stripe_enabled",    false);
  const razorpayEnabled  = await getSubscriptionConfig("razorpay_enabled",  false);

  if (provider === "stripe" && !stripeEnabled) {
    return Response.json({ error: "Stripe payments are not enabled. Enable it in Subscription Config." }, { status: 400 });
  }
  if (provider === "razorpay" && !razorpayEnabled) {
    return Response.json({ error: "Razorpay payments are not enabled. Enable it in Subscription Config." }, { status: 400 });
  }

  // Fetch current subscription for existing billing IDs
  const sub = await prisma.tenantSubscription.findUnique({ where: { tenantId } });
  const user = await prisma.user.findFirst({ where: { tenantId, isPrimaryOwner: true } });

  try {
    if (provider === "stripe") {
      const priceId = getStripePriceId(plan, billingCycle);
      if (!priceId) {
        return Response.json({ error: `Stripe price not configured for ${plan} ${billingCycle}.` }, { status: 400 });
      }

      const session = await createCheckoutSession({
        tenantId,
        customerEmail:    user?.email,
        stripeCustomerId: sub?.stripeCustomerId ?? null,
        stripePriceId:    priceId,
      });

      return Response.json({ url: session.url });
    }

    if (provider === "razorpay") {
      const planId = getRazorpayPlanId(plan, billingCycle);
      if (!planId) {
        return Response.json({ error: `Razorpay plan not configured for ${plan} ${billingCycle}.` }, { status: 400 });
      }

      const totalCount = billingCycle === "ANNUAL" ? 12 : 120;
      const tenant     = await prisma.tenant.findUnique({ where: { id: tenantId } });

      const { subscription: rzpSub, customerId } = await createSubscription({
        tenantId,
        razorpayPlanId: planId,
        totalCount,
        customerEmail: user?.email,
        customerName:  user?.name,
        customerPhone: undefined, // phone not on User model
      });

      // Persist Razorpay IDs so the webhook can look up the tenant
      await prisma.tenantSubscription.upsert({
        where:  { tenantId },
        update: {
          ...(customerId ? { razorpayCustomerId: customerId } : {}),
          razorpaySubscriptionId: rzpSub.id,
        },
        create: {
          tenantId,
          plan: "FREE",
          ...(customerId ? { razorpayCustomerId: customerId } : {}),
          razorpaySubscriptionId: rzpSub.id,
        },
      });

      return Response.json({
        subscriptionId: rzpSub.id,
        razorpayKeyId:  process.env.RAZORPAY_KEY_ID,
        customerId,
      });
    }

    return Response.json({ error: "Unknown provider." }, { status: 400 });
  } catch (err) {
    console.error("[/api/billing/checkout]", err);
    return Response.json({ error: err.message || "Checkout failed." }, { status: 500 });
  }
}
