import { NextResponse } from "next/server";
import { constructStripeEvent } from "@/lib/billing/stripe";
import { upgradePlan, cancelSubscription } from "@/lib/subscription/subscription-service";
import { prisma } from "@/lib/prisma";
import { sendEmail, buildPaymentConfirmationEmail } from "@/lib/email/mailer";
import { grantPurchaseCredits } from "@/lib/credits/credit-service";

/**
 * POST /api/billing/stripe/webhook
 *
 * Events handled:
 *  - checkout.session.completed  → upgrade plan
 *  - customer.subscription.updated
 *  - invoice.paid                → record invoice + extend period
 *  - invoice.payment_failed      → mark past_due
 *  - customer.subscription.deleted → cancel
 */
export async function POST(req) {
  const rawBody  = await req.text();
  const signature = req.headers.get("stripe-signature");

  let event;
  try {
    event = constructStripeEvent(rawBody, signature);
  } catch (err) {
    console.error("[stripe/webhook] signature verification failed:", err.message);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {

      case "checkout.session.completed": {
        const session = event.data.object;
        const purchaseType = session.metadata?.purchaseType;

        if (purchaseType === "credit_pack") {
          const tenantId = session.metadata?.tenantId || session.client_reference_id;
          const packId = session.metadata?.packId;
          await grantPurchaseCredits(
            tenantId,
            packId,
            session.payment_intent || session.id,
            "STRIPE",
            { usd: session.amount_total ? session.amount_total / 100 : null }
          );
          break;
        }

        const tenantId = session.metadata?.tenantId || session.client_reference_id;
        if (!tenantId || session.mode !== "subscription") break;

        // Retrieve the subscription to get billing period
        // (session.subscription is the Stripe subscription ID)
        const stripeSubId = session.subscription;

        await upgradePlan(tenantId, {
          plan: await resolvePlanFromStripeSubscription(stripeSubId),
          billingCycle: "MONTHLY",
          billingProvider: "STRIPE",
          stripeCustomerId:    session.customer,
          stripeSubscriptionId: stripeSubId,
        });
        break;
      }

      case "invoice.paid": {
        const invoice = event.data.object;
        const sub     = await prisma.tenantSubscription.findFirst({
          where: { stripeSubscriptionId: invoice.subscription },
        });
        if (!sub) break;

        // Extend billing period
        await prisma.tenantSubscription.update({
          where: { id: sub.id },
          data: {
            status: "ACTIVE",
            currentPeriodStart: new Date(invoice.period_start * 1000),
            currentPeriodEnd:   new Date(invoice.period_end   * 1000),
            gracePeriodEndsAt:  null,
          },
        });

        // Record invoice
        await prisma.subscriptionInvoice.create({
          data: {
            subscriptionId:    sub.id,
            tenantId:          sub.tenantId,
            amountUsd:         invoice.amount_paid / 100,
            currency:          "USD",
            status:            "PAID",
            billingProvider:   "STRIPE",
            externalInvoiceId: invoice.id,
            paidAt:            new Date(),
            invoiceUrl:        invoice.hosted_invoice_url,
          },
        });

        // Send payment confirmation email (non-blocking)
        prisma.user.findFirst({ where: { tenantId: sub.tenantId, isPrimaryOwner: true }, select: { email: true, name: true } })
          .then((owner) => {
            if (!owner?.email) return;
            const { subject, html, text } = buildPaymentConfirmationEmail(owner.name || "there", {
              amountPaid: invoice.amount_paid, currency: "USD", plan: sub.plan, createdAt: new Date(),
            });
            return sendEmail({ to: owner.email, subject, html, text });
          }).catch(() => {});
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object;
        const sub     = await prisma.tenantSubscription.findFirst({
          where: { stripeSubscriptionId: invoice.subscription },
        });
        if (sub) {
          await prisma.tenantSubscription.update({
            where: { id: sub.id },
            data: { status: "PAST_DUE" },
          });
        }
        break;
      }

      case "customer.subscription.deleted": {
        const stripeSub = event.data.object;
        const sub = await prisma.tenantSubscription.findFirst({
          where: { stripeSubscriptionId: stripeSub.id },
        });
        if (sub) {
          await cancelSubscription(sub.tenantId, "stripe_subscription_deleted");
        }
        break;
      }

      case "customer.subscription.updated": {
        const stripeSub = event.data.object;
        const sub       = await prisma.tenantSubscription.findFirst({
          where: { stripeSubscriptionId: stripeSub.id },
        });
        if (sub && stripeSub.status === "active") {
          await prisma.tenantSubscription.update({
            where: { id: sub.id },
            data: {
              status:             "ACTIVE",
              currentPeriodStart: new Date(stripeSub.current_period_start * 1000),
              currentPeriodEnd:   new Date(stripeSub.current_period_end   * 1000),
            },
          });
        }
        break;
      }
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("[stripe/webhook] handler error:", err);
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }
}

// ─── HELPERS ────────────────────────────────────────────

async function resolvePlanFromStripeSubscription(stripeSubId) {
  // Map from env vars: STRIPE_PLAN_<plan>_<cycle>=price_xxx
  // For now default to PRO if we can't resolve
  const plans = ["MAX", "PRO", "PLUS"];
  const cycles = ["MONTHLY", "ANNUAL"];
  for (const plan of plans) {
    for (const cycle of cycles) {
      const envKey = `STRIPE_PRICE_${plan}_${cycle}`;
      if (process.env[envKey]) return plan;
    }
  }
  return "PRO";
}
