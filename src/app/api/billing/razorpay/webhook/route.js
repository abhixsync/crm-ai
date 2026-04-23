import { NextResponse } from "next/server";
import { verifyRazorpayWebhook } from "@/lib/billing/razorpay";
import { upgradePlan, cancelSubscription } from "@/lib/subscription/subscription-service";
import { prisma } from "@/lib/prisma";
import { sendEmail, buildPaymentConfirmationEmail, buildPaymentFailureEmail, buildCreditPurchaseEmail, buildPlanUpgradeEmail } from "@/lib/email/mailer";
import { grantPurchaseCredits } from "@/lib/credits/credit-service";
import { resolveTenantTheme } from "@/modules/theme/theme.service";
import { createNotification } from "@/lib/notifications/notification-service";
import { invalidatePlanGuardCache } from "@/lib/subscription/plan-guard";

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

        const purchaseType = subscriptionEntity?.notes?.purchaseType;

        if (purchaseType === "credit_pack") {
          const packId = subscriptionEntity?.notes?.packId;
          await grantPurchaseCredits(
            tenantId,
            packId,
            rzpSubId || subscriptionEntity?.id,
            "RAZORPAY",
            { inr: paymentEntity?.amount ? paymentEntity.amount / 100 : null }
          );
          // Send credit purchase confirmation (non-blocking)
          (async () => {
            try {
              const owner = await prisma.user.findFirst({ where: { tenantId, isPrimaryOwner: true }, select: { email: true, name: true } });
              if (!owner?.email) return;
              const theme = await resolveTenantTheme(tenantId).catch(() => null);
              const emailCtx = { brandName: theme?.emailFromName || theme?.brandName || null, primaryColor: theme?.primaryColor || null, fromName: theme?.emailFromName || theme?.brandName || null };
              const pack = await prisma.creditPack.findUnique({ where: { id: packId } });
              const balance = await import("@/lib/credits/credit-service").then(m => m.getCreditBalance(tenantId));
              const totalCredits = (pack?.credits || 0) + (pack?.bonusCredits || 0);
              const email = buildCreditPurchaseEmail(owner.name || "there", pack?.name || "Credit Pack", totalCredits, balance?.available || 0, null, paymentEntity?.amount ? paymentEntity.amount / 100 : null, "INR", emailCtx);
              await sendEmail({ to: owner.email, ...email, fromName: email.fromName });
            } catch {}
          })();
          break;
        }

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

        // Send plan upgrade confirmation (non-blocking)
        (async () => {
          try {
            const owner = await prisma.user.findFirst({ where: { tenantId, isPrimaryOwner: true }, select: { email: true, name: true } });
            if (!owner?.email) return;
            const sub = await prisma.tenantSubscription.findUnique({ where: { tenantId }, select: { plan: true } });
            const theme = await resolveTenantTheme(tenantId).catch(() => null);
            const emailCtx = { brandName: theme?.emailFromName || theme?.brandName || null, primaryColor: theme?.primaryColor || null, fromName: theme?.emailFromName || theme?.brandName || null };
            const email = buildPlanUpgradeEmail(owner.name || "there", null, sub?.plan || "PRO", emailCtx);
            await sendEmail({ to: owner.email, ...email, fromName: email.fromName });
          } catch {}
        })();
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

        // Record invoice — skip on retry (externalInvoiceId dedup)
        const existingInvoice = paymentEntity?.id
          ? await prisma.subscriptionInvoice.findFirst({ where: { externalInvoiceId: paymentEntity.id } })
          : null;
        if (!existingInvoice) await prisma.subscriptionInvoice.create({
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
          .then(async (owner) => {
            if (!owner?.email) return;
            const theme = await resolveTenantTheme(sub.tenantId).catch(() => null);
            const emailCtx = {
              brandName:    theme?.emailFromName || theme?.brandName || null,
              primaryColor: theme?.primaryColor || null,
              fromName:     theme?.emailFromName || theme?.brandName || null,
            };
            const confirmation = buildPaymentConfirmationEmail(owner.name || "there", {
              amountPaid: amount / 100, currency: "INR", plan: sub.plan, createdAt: paidAt,
            }, emailCtx);
            return sendEmail({ to: owner.email, ...confirmation, fromName: confirmation.fromName });
          }).catch(() => {});
        break;
      }

      case "subscription.cancelled":
        if (tenantId) {
          await cancelSubscription(tenantId, "razorpay_subscription_cancelled");
          invalidatePlanGuardCache(tenantId);
        }
        break;

      case "subscription.halted":
        if (sub) {
          await prisma.tenantSubscription.update({
            where: { id: sub.id },
            data: { status: "PAST_DUE" },
          });
          invalidatePlanGuardCache(sub.tenantId);
          createNotification(sub.tenantId, {
            type: "SYSTEM",
            title: "Payment failed",
            body: "Your subscription payment could not be processed. Please update your payment method.",
            link: "/admin/billing",
          }).catch(() => {});
          // Send payment failure email (non-blocking)
          prisma.user.findFirst({ where: { tenantId: sub.tenantId, isPrimaryOwner: true }, select: { email: true, name: true } })
            .then(async (owner) => {
              if (!owner?.email) return;
              const theme = await resolveTenantTheme(sub.tenantId).catch(() => null);
              const emailCtx = { brandName: theme?.emailFromName || theme?.brandName || null, primaryColor: theme?.primaryColor || null, fromName: theme?.emailFromName || theme?.brandName || null };
              const email = buildPaymentFailureEmail(owner.name || "there", { amountDue: (paymentEntity?.amount || 0) / 100, currency: "INR" }, emailCtx);
              return sendEmail({ to: owner.email, ...email, fromName: email.fromName });
            }).catch(() => {});
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
