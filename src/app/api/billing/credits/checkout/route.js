import { NextResponse } from "next/server";
import { requireSession, getTenantContext, hasRole } from "@/lib/server/auth-guard";
import { prisma } from "@/lib/prisma";
import { getSubscriptionConfig } from "@/lib/subscription/subscription-service";
import Stripe from "stripe";

export async function POST(req) {
  const auth = await requireSession();
  if (auth.error) return auth.error;
  if (!hasRole(auth.session, ["ADMIN"])) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { packId } = await req.json();
  if (!packId) return NextResponse.json({ error: "packId required" }, { status: 400 });

  const { tenantId } = getTenantContext(auth.session, req);

  const pack = await prisma.creditPack.findUnique({ where: { id: packId } });
  if (!pack || !pack.isActive) {
    return NextResponse.json({ error: "Pack not found or inactive" }, { status: 404 });
  }

  const stripeEnabled = await getSubscriptionConfig("stripe_enabled", false);
  if (!stripeEnabled || !process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 400 });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const baseUrl = process.env.APP_BASE_URL || process.env.NEXTAUTH_URL;

  const session = await stripe.checkout.sessions.create({
    mode: pack.isRecurring ? "subscription" : "payment",
    line_items: [{
      price_data: {
        currency: "usd",
        unit_amount: Math.round(Number(pack.priceUsd) * 100),
        product_data: { name: `${pack.name} — ${pack.credits} AI Credits` },
        ...(pack.isRecurring ? { recurring: { interval: "month" } } : {}),
      },
      quantity: 1,
    }],
    metadata: {
      purchaseType: "credit_pack",
      tenantId,
      packId: pack.id,
    },
    success_url: `${baseUrl}/admin/billing?credit_success=1`,
    cancel_url:  `${baseUrl}/admin/billing?credit_cancelled=1`,
  });

  return NextResponse.json({ url: session.url });
}
