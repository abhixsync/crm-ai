import { NextResponse } from "next/server";
import { requireSession, getTenantContext, hasRole } from "@/lib/server/auth-guard";
import { prisma } from "@/lib/prisma";

export async function POST(req) {
  const auth = await requireSession();
  if (auth.error) return auth.error;
  if (!hasRole(auth.session, ["ADMIN"])) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { purchaseId } = await req.json();
  const { tenantId } = getTenantContext(auth.session, req);

  const purchase = await prisma.creditPackPurchase.findFirst({
    where: { id: purchaseId, tenantId, status: "ACTIVE_RECURRING" },
  });

  if (!purchase) {
    return NextResponse.json({ error: "Active recurring purchase not found" }, { status: 404 });
  }

  if (purchase.stripeSubscriptionId && process.env.STRIPE_SECRET_KEY) {
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    await stripe.subscriptions.cancel(purchase.stripeSubscriptionId).catch(() => {});
  }

  await prisma.creditPackPurchase.update({
    where: { id: purchaseId },
    data: { status: "CANCELLED" },
  });

  return NextResponse.json({ success: true });
}
