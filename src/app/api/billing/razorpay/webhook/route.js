import { NextResponse } from "next/server";
import { verifyRazorpayWebhook } from "@/lib/billing/razorpay";
import { upgradePlan, cancelSubscription } from "@/lib/subscription/subscription-service";
import { prisma } from "@/lib/prisma";
import { sendEmail, buildPaymentConfirmationEmail } from "@/lib/email/mailer";

/**
 * POST /api/billing/razorpay/webhook
 *
 * Events handled:
 *  - subscription.activated  → upgrade plan
 *  - subscription.charged    → record invoice + extend period
 *  - subscription.cancelled  → cancel
 *  - subscription.halted     → mark past_due
 */
export async function POST(req) {
  const rawBody   = await req.text();
  const signature = req.headers.get("x-razorpay-signature");

  try {
    verifyRazorpayWebhook(rawBody, signature);
  } catch (err) {
    console.error("[razorpay/webhook] signature verification failed:", err.message);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const event      = payload.event;
  const subscriptionEntity = payload.payload?.subscription?.entity;
  const paymentEntity      = payload.payload?.payment?.entity;

  try {
    // Find tenant by Razorpay subscription ID
    const rzpSubId = subscriptionEntity?.id;
    const sub = rzpSubId
      ? await prisma.tenantSubscription.findFirst({ where: { razorpaySubscriptionId: rzpSubId } })
      : null;

    // Also try notes.tenantId from Razorpay subscription
    const tenantId = sub?.tenantId ?? subscriptionEntity?.notes?.tenantId ?? null;

    switch (event) {
      case "subscription.activated": {
        if (!tenantId) break;

        const plan = await resolvePlanFromRazorpaySubscription(subscriptionEntity);
        await upgradePlan(tenantId, {
          plan,
          billingCycle:           "MONTHLY",
          billingProvider:        "RAZORPAY",
          razorpayCustomerId:     subscriptionEntity?.customer_id,
          razorpaySubscriptionId: rzpSubId,
        });

        // Ensure subscription ID is saved
        await prisma.tenantSubscription.updateMany({
          where: { tenantId },
          data: { razorpaySubscriptionId: rzpSubId },
        });
        break;
      }

      case "subscription.charged": {
        if (!sub) break;
        const amount  = paymentEntity?.amount ?? 0;
        const paidAt  = paymentEntity?.created_at ? new Date(paymentEntity.created_at * 1000) : new Date();

        // Extend period (Razorpay cycles monthly)
        const nextPeriodEnd = new Date(paidAt.getTime() + 31 * 24 * 60 * 60 * 1000);
        await prisma.tenantSubscription.update({
          where: { id: sub.id },
          data: {
            status:             "ACTIVE",
            currentPeriodStart: paidAt,
            currentPeriodEnd:   nextPeriodEnd,
            gracePeriodEndsAt:  null,
          },
        });

        await prisma.subscriptionInvoice.create({
          data: {
            subscriptionId:    sub.id,
            tenantId:          sub.tenantId,
            amountInr:         amount / 100,
            currency:          "INR",
            status:            "PAID",
            billingProvider:   "RAZORPAY",
            externalInvoiceId: paymentEntity?.id,
            paidAt,
          },
        });

        // Send payment confirmation email (non-blocking)
        prisma.user.findFirst({ where: { tenantId: sub.tenantId, isPrimaryOwner: true }, select: { email: true, name: true } })
          .then((owner) => {
            if (!owner?.email) return;
            const { subject, html, text } = buildPaymentConfirmationEmail(owner.name || "there", {
              amountPaid: amount, currency: "INR", plan: sub.plan, createdAt: paidAt,
            });
            return sendEmail({ to: owner.email, subject, html, text });
          }).catch(() => {});
        break;
      }

      case "subscription.cancelled":
        if (tenantId) await cancelSubscription(tenantId, "razorpay_subscription_cancelled");
        break;

      case "subscription.halted":
        if (sub) {
          await prisma.tenantSubscription.update({
            where: { id: sub.id },
            data: { status: "PAST_DUE" },
          });
        }
        break;
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("[razorpay/webhook] handler error:", err);
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }
}

// ─── HELPERS ────────────────────────────────────────────

async function resolvePlanFromRazorpaySubscription(subscriptionEntity) {
  const plans = ["MAX", "PRO", "PLUS"];
  const cycles = ["MONTHLY", "ANNUAL"];
  const planId = subscriptionEntity?.plan_id;
  if (!planId) return "PRO";

  for (const plan of plans) {
    for (const cycle of cycles) {
      if (process.env[`RAZORPAY_PLAN_${plan}_${cycle}`] === planId) return plan;
    }
  }
  return "PRO";
}
