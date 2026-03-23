/**
 * Subscription Service — manages tenant subscription lifecycle.
 *
 * Covers:
 *  - createTrialSubscription  → called on new tenant registration
 *  - upgradePlan              → called after successful payment webhook
 *  - downgradeToFree          → called when trial/subscription expires
 *  - extendTrial              → superadmin action
 *  - getSubscriptionConfig    → reads global SubscriptionConfig table
 */

import { prisma } from "@/lib/prisma";
import { invalidatePlanGuardCache } from "./plan-guard";

// ─── CONFIG ──────────────────────────────────────────────

/** Read a key from SubscriptionConfig table, with a fallback default. */
export async function getSubscriptionConfig(key, defaultValue) {
  const row = await prisma.subscriptionConfig.findUnique({ where: { key } });
  return row != null ? row.value : defaultValue;
}

async function getTrialDays() {
  return Number(await getSubscriptionConfig("trial_days", 30));
}

async function getGracePeriodDays() {
  return Number(await getSubscriptionConfig("grace_period_days", 7));
}

// ─── PLAN SNAPSHOT ───────────────────────────────────────

async function buildPlanSnapshot(plan) {
  const planDef = await prisma.planDefinition.findUnique({ where: { plan } });
  if (!planDef) return null;
  return {
    maxUsers:              planDef.maxUsers,
    maxCustomers:          planDef.maxCustomers,
    maxAiCallsPerMonth:    planDef.maxAiCallsPerMonth,
    maxLeadUploadsPerMonth: planDef.maxLeadUploadsPerMonth,
    maxWebhooks:           planDef.maxWebhooks,
    maxCustomFields:       planDef.maxCustomFields,
    maxTeams:              planDef.maxTeams,
    maxStorageMb:          planDef.maxStorageMb,
    hasAiCalling:          planDef.hasAiCalling,
    hasAdvancedAnalytics:  planDef.hasAdvancedAnalytics,
    hasManualReview:       planDef.hasManualReview,
    hasDncRegistry:        planDef.hasDncRegistry,
    hasTeams:              planDef.hasTeams,
    hasMultiChannel:       planDef.hasMultiChannel,
    hasDealPipeline:       planDef.hasDealPipeline,
    hasIntentTraining:     planDef.hasIntentTraining,
    hasCustomAiPrompts:    planDef.hasCustomAiPrompts,
    hasCustomProviders:    planDef.hasCustomProviders,
    hasWhiteLabel:         planDef.hasWhiteLabel,
    hasApiAccess:          planDef.hasApiAccess,
    hasAiCallDemo:         planDef.hasAiCallDemo,
    hasDocuments:          planDef.hasDocuments,
    hasConversationMemory: planDef.hasConversationMemory,
    hasWebhooks:           planDef.hasWebhooks,
    hasCustomFields:       planDef.hasCustomFields,
    hasCampaigns:          planDef.hasCampaigns,
  };
}

// ─── CREATE TRIAL ────────────────────────────────────────

/**
 * Called during tenant registration.
 * Creates a TRIALING subscription on the PRO plan for `trialDays` days.
 * After trial expires, the cron job downgrades to FREE.
 */
export async function createTrialSubscription(tenantId) {
  const trialDays = await getTrialDays();
  const proPlan = await prisma.planDefinition.findUnique({ where: { plan: "PRO" } });

  const now = new Date();
  const trialEndsAt = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000);

  const planSnapshot = await buildPlanSnapshot("PRO");

  return prisma.tenantSubscription.create({
    data: {
      tenantId,
      plan: "PRO",
      status: "TRIALING",
      billingCycle: "MONTHLY",
      planDefinitionId: proPlan?.id ?? null,
      trialStartAt: now,
      trialEndsAt,
      planSnapshot,
    },
  });
}

// ─── UPGRADE PLAN ────────────────────────────────────────

export async function upgradePlan(tenantId, {
  plan,
  billingCycle = "MONTHLY",
  billingProvider,
  stripeCustomerId,
  stripeSubscriptionId,
  razorpayCustomerId,
  razorpaySubscriptionId,
  currentPeriodStart,
  currentPeriodEnd,
}) {
  const planDef = await prisma.planDefinition.findUnique({ where: { plan } });
  const planSnapshot = await buildPlanSnapshot(plan);

  const updated = await prisma.tenantSubscription.upsert({
    where: { tenantId },
    update: {
      plan,
      status: "ACTIVE",
      billingCycle,
      billingProvider: billingProvider ?? null,
      planDefinitionId: planDef?.id ?? null,
      stripeCustomerId:       stripeCustomerId       ?? undefined,
      stripeSubscriptionId:   stripeSubscriptionId   ?? undefined,
      razorpayCustomerId:     razorpayCustomerId     ?? undefined,
      razorpaySubscriptionId: razorpaySubscriptionId ?? undefined,
      currentPeriodStart: currentPeriodStart ?? new Date(),
      currentPeriodEnd:   currentPeriodEnd   ?? null,
      gracePeriodEndsAt: null,
      cancelledAt: null,
      cancelReason: null,
      planSnapshot,
    },
    create: {
      tenantId,
      plan,
      status: "ACTIVE",
      billingCycle,
      billingProvider: billingProvider ?? null,
      planDefinitionId: planDef?.id ?? null,
      stripeCustomerId:       stripeCustomerId       ?? null,
      stripeSubscriptionId:   stripeSubscriptionId   ?? null,
      razorpayCustomerId:     razorpayCustomerId     ?? null,
      razorpaySubscriptionId: razorpaySubscriptionId ?? null,
      currentPeriodStart: currentPeriodStart ?? new Date(),
      currentPeriodEnd:   currentPeriodEnd   ?? null,
      planSnapshot,
    },
  });

  // Re-activate any previously suspended non-primary users
  await prisma.user.updateMany({
    where: { tenantId, isSuspended: true, suspendedReason: "PLAN_DOWNGRADE" },
    data:  { isSuspended: false, suspendedAt: null, suspendedReason: null },
  });

  invalidatePlanGuardCache(tenantId);
  return updated;
}

// ─── DOWNGRADE TO FREE ───────────────────────────────────

/**
 * Downgrades a tenant to the FREE plan after trial/subscription expiry.
 *
 * Downgrade logic:
 *  - Primary owner stays active
 *  - Extra users → isSuspended=true, suspendedReason=PLAN_DOWNGRADE
 *  - Customer data fully preserved (read-only above FREE limit — enforced in plan-guard)
 *  - Active campaigns are paused
 *  - Grace period starts from gracePeriodEndsAt (configurable)
 */
export async function downgradeToFree(tenantId) {
  const graceDays = await getGracePeriodDays();
  const gracePeriodEndsAt = new Date(Date.now() + graceDays * 24 * 60 * 60 * 1000);
  const freePlanSnapshot = await buildPlanSnapshot("FREE");

  await prisma.$transaction(async (tx) => {
    // 1. Update subscription
    await tx.tenantSubscription.update({
      where: { tenantId },
      data: {
        plan: "FREE",
        status: "EXPIRED",
        gracePeriodEndsAt,
        planSnapshot: freePlanSnapshot,
        currentPeriodEnd: new Date(),
      },
    });

    // 2. Suspend all non-primary-owner users
    await tx.user.updateMany({
      where: { tenantId, isPrimaryOwner: false, isSuspended: false },
      data: {
        isSuspended: true,
        suspendedAt: new Date(),
        suspendedReason: "PLAN_DOWNGRADE",
      },
    });

    // 3. Pause any running campaigns
    await tx.campaign.updateMany({
      where: { tenantId, status: "RUNNING" },
      data: { status: "PAUSED" },
    });
  });

  invalidatePlanGuardCache(tenantId);
}

// ─── EXTEND TRIAL ────────────────────────────────────────

export async function extendTrial(tenantId, additionalDays) {
  const sub = await prisma.tenantSubscription.findUnique({ where: { tenantId } });
  if (!sub) throw new Error("No subscription found for tenant");

  const base = sub.trialEndsAt ?? new Date();
  const newTrialEndsAt = new Date(base.getTime() + additionalDays * 24 * 60 * 60 * 1000);

  const updated = await prisma.tenantSubscription.update({
    where: { tenantId },
    data: {
      trialEndsAt: newTrialEndsAt,
      status: "TRIALING",
      gracePeriodEndsAt: null,
    },
  });

  invalidatePlanGuardCache(tenantId);
  return updated;
}

// ─── CANCEL SUBSCRIPTION ────────────────────────────────

export async function cancelSubscription(tenantId, reason = "") {
  const graceDays = await getGracePeriodDays();
  const gracePeriodEndsAt = new Date(Date.now() + graceDays * 24 * 60 * 60 * 1000);

  const updated = await prisma.tenantSubscription.update({
    where: { tenantId },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
      cancelReason: reason,
      gracePeriodEndsAt,
    },
  });

  invalidatePlanGuardCache(tenantId);
  return updated;
}

// ─── INCREMENT USAGE ────────────────────────────────────

export async function incrementAiCallUsage(tenantId, subscriptionId) {
  const month = new Date().toISOString().slice(0, 7); // "YYYY-MM"
  await prisma.usageRecord.upsert({
    where: { subscriptionId_month: { subscriptionId, month } },
    update: { aiCallsUsed: { increment: 1 } },
    create: { tenantId, subscriptionId, month, aiCallsUsed: 1 },
  });
}

export async function incrementLeadUploadUsage(tenantId, subscriptionId, count = 1) {
  const month = new Date().toISOString().slice(0, 7);
  await prisma.usageRecord.upsert({
    where: { subscriptionId_month: { subscriptionId, month } },
    update: { leadsUploaded: { increment: count } },
    create: { tenantId, subscriptionId, month, leadsUploaded: count },
  });
}
