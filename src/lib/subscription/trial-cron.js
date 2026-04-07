/**
 * Trial & Subscription expiry cron.
 *
 * Run this daily via the Next.js cron route or an external scheduler.
 * Checks for expired trials / past-due subscriptions and downgrades them.
 *
 * Invoked from: POST /api/cron/subscription-expiry  (secured with CRON_SECRET)
 */

import { prisma } from "@/lib/prisma";
import { downgradeToFree } from "./subscription-service";
import { sendEmail, buildTrialExpiryWarningEmail, buildRenewalReminderEmail } from "@/lib/email/mailer";
import { resolveTenantTheme } from "@/modules/theme/theme.service";

// ─── TRIAL WARNING EMAILS ────────────────────────────────

const WARNING_DAYS = [7, 3, 1];

async function sendTrialWarnings() {
  const now = new Date();
  let sent = 0;

  for (const daysLeft of WARNING_DAYS) {
    // Window: subscriptions expiring within [daysLeft - 0.5, daysLeft + 0.5] days
    const windowStart = new Date(now.getTime() + (daysLeft - 0.5) * 24 * 60 * 60 * 1000);
    const windowEnd   = new Date(now.getTime() + (daysLeft + 0.5) * 24 * 60 * 60 * 1000);

    const subs = await prisma.tenantSubscription.findMany({
      where: { status: "TRIALING", trialEndsAt: { gte: windowStart, lt: windowEnd } },
      select: { tenantId: true, trialEndsAt: true },
    });

    for (const sub of subs) {
      const owner = await prisma.user.findFirst({
        where: { tenantId: sub.tenantId, isPrimaryOwner: true },
        select: { email: true, name: true },
      });
      if (!owner?.email) continue;

      const theme = await resolveTenantTheme(sub.tenantId).catch(() => null);
      const emailCtx = {
        brandName:    theme?.emailFromName || theme?.brandName || null,
        primaryColor: theme?.primaryColor || null,
        fromName:     theme?.emailFromName || theme?.brandName || null,
      };
      const warning = buildTrialExpiryWarningEmail(
        owner.name || "there",
        sub.trialEndsAt,
        daysLeft,
        emailCtx
      );
      await sendEmail({ to: owner.email, ...warning, fromName: warning.fromName }).catch(() => {});
      sent++;
    }
  }

  return { sent };
}

/**
 * Move TRIALING subscriptions whose trialEndsAt has passed to EXPIRED + FREE.
 */
async function expireTrials() {
  const expired = await prisma.tenantSubscription.findMany({
    where: {
      status: "TRIALING",
      trialEndsAt: { lt: new Date() },
    },
    select: { tenantId: true },
  });

  const results = await Promise.allSettled(
    expired.map(({ tenantId }) => downgradeToFree(tenantId))
  );

  const failures = results.filter((r) => r.status === "rejected");
  if (failures.length) {
    console.error(`[trial-cron] ${failures.length} downgrade(s) failed:`, failures);
  }

  return { expired: expired.length, failed: failures.length };
}

/**
 * Move ACTIVE subscriptions whose billing period has ended + no grace period
 * into PAST_DUE, then after grace period ends → EXPIRED + FREE.
 */
async function expirePastDue() {
  const now = new Date();

  // Past-due: period ended, no grace period yet set
  const pastDue = await prisma.tenantSubscription.findMany({
    where: {
      status: "ACTIVE",
      currentPeriodEnd: { lt: now },
      gracePeriodEndsAt: null,
    },
    select: { id: true, tenantId: true },
  });

  for (const sub of pastDue) {
    await prisma.tenantSubscription.update({
      where: { id: sub.id },
      data: { status: "PAST_DUE" },
    });
  }

  // Hard-lock: grace period ended
  const hardLock = await prisma.tenantSubscription.findMany({
    where: {
      status: { in: ["PAST_DUE", "CANCELLED", "EXPIRED"] },
      gracePeriodEndsAt: { lt: now },
    },
    select: { tenantId: true },
  });

  const results = await Promise.allSettled(
    hardLock.map(({ tenantId }) => downgradeToFree(tenantId))
  );

  const failures = results.filter((r) => r.status === "rejected");
  return { pastDue: pastDue.length, hardLocked: hardLock.length, failed: failures.length };
}

async function sendRenewalReminders() {
  const now = new Date();
  // Window: subscriptions renewing in 6.5–7.5 days
  const windowStart = new Date(now.getTime() + 6.5 * 24 * 60 * 60 * 1000);
  const windowEnd   = new Date(now.getTime() + 7.5 * 24 * 60 * 60 * 1000);

  const subs = await prisma.tenantSubscription.findMany({
    where: {
      status: "ACTIVE",
      plan: { not: "FREE" },
      currentPeriodEnd: { gte: windowStart, lt: windowEnd },
    },
    select: { tenantId: true, plan: true, currentPeriodEnd: true, billingCycle: true },
  });

  let sent = 0;
  for (const sub of subs) {
    const owner = await prisma.user.findFirst({
      where: { tenantId: sub.tenantId, isPrimaryOwner: true },
      select: { email: true, name: true },
    });
    if (!owner?.email) continue;

    // Get price from plan definition
    const planDef = await prisma.planDefinition.findFirst({ where: { plan: sub.plan } });
    const currency = await import("./subscription-service").then(m => m.getPlatformCurrency()).catch(() => "INR");
    const amount = currency === "INR" ? planDef?.priceInrMonthly : planDef?.priceUsdMonthly;

    const theme = await resolveTenantTheme(sub.tenantId).catch(() => null);
    const emailCtx = {
      brandName:    theme?.emailFromName || theme?.brandName || null,
      primaryColor: theme?.primaryColor || null,
      fromName:     theme?.emailFromName || theme?.brandName || null,
    };
    const email = buildRenewalReminderEmail(
      owner.name || "there",
      sub.plan,
      sub.currentPeriodEnd,
      amount,
      currency,
      emailCtx
    );
    await sendEmail({ to: owner.email, ...email, fromName: email.fromName }).catch(() => {});
    sent++;
  }
  return { sent };
}

export async function runSubscriptionExpiryCron() {
  console.log("[trial-cron] Starting subscription expiry check…");

  const [trialResult, pastDueResult, warningResult, renewalResult] = await Promise.all([
    expireTrials(),
    expirePastDue(),
    sendTrialWarnings(),
    sendRenewalReminders(),
  ]);

  console.log("[trial-cron] Trials expired:", trialResult);
  console.log("[trial-cron] Past-due processed:", pastDueResult);
  console.log("[trial-cron] Warning emails sent:", warningResult);
  console.log("[trial-cron] Renewal reminders sent:", renewalResult);

  return { trials: trialResult, pastDue: pastDueResult, warnings: warningResult, renewals: renewalResult };
}
