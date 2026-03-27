/**
 * Plan Guard — per-request/per-tenant plan enforcement.
 *
 * Usage in API routes:
 *   const guard = await getPlanGuard(tenantId);
 *   await guard.assertCanAddCustomer();
 *   await guard.assertHasFeature("hasDealPipeline");
 *   await guard.assertCanAddUser();
 *
 * Returns 402 JSON responses for limit/feature violations.
 */

import { prisma } from "@/lib/prisma";

// ─── IN-PROCESS CACHE ────────────────────────────────────
// 5-minute TTL per tenant. Keeps hot paths fast without Redis dep.

const CACHE_TTL_MS = 5 * 60 * 1000;
const guardCache = new Map(); // tenantId → { guard, expiresAt }

function getCached(tenantId) {
  const entry = guardCache.get(tenantId);
  if (entry && entry.expiresAt > Date.now()) return entry.guard;
  guardCache.delete(tenantId);
  return null;
}

function setCache(tenantId, guard) {
  guardCache.set(tenantId, { guard, expiresAt: Date.now() + CACHE_TTL_MS });
}

export function invalidatePlanGuardCache(tenantId) {
  guardCache.delete(tenantId);
}

// ─── LIMIT ERRORS ────────────────────────────────────────

class PlanLimitError extends Error {
  constructor(message, feature = null) {
    super(message);
    this.name = "PlanLimitError";
    this.feature = feature;
    this.status = 402;
  }
}

export function isPlanLimitError(err) {
  return err instanceof PlanLimitError;
}

/** Call in catch blocks to return the right HTTP response */
export function planLimitResponse(err) {
  return Response.json(
    { error: err.message, code: "PLAN_LIMIT", feature: err.feature ?? null, upgrade: true },
    { status: 402 }
  );
}

// ─── LIVE USAGE COUNTS ───────────────────────────────────

async function getLiveUsage(tenantId, currentMonth) {
  const [customers, users, aiCallsUsed, leadsUploaded] = await Promise.all([
    prisma.customer.count({ where: { tenantId } }),
    prisma.user.count({ where: { tenantId, isSuspended: false } }),
    // Pull from UsageRecord for the current month
    prisma.usageRecord
      .findFirst({ where: { tenantId, month: currentMonth } })
      .then((r) => r?.aiCallsUsed ?? 0),
    prisma.usageRecord
      .findFirst({ where: { tenantId, month: currentMonth } })
      .then((r) => r?.leadsUploaded ?? 0),
  ]);
  return { customers, users, aiCallsUsed, leadsUploaded };
}

// ─── CORE GUARD BUILDER ──────────────────────────────────

async function buildGuard(tenantId) {
  const sub = await prisma.tenantSubscription.findUnique({
    where: { tenantId },
    include: { planDef: true },
  });

  // Fallback: no subscription → treat as FREE plan
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  let plan = "FREE";
  let status = "ACTIVE";
  let isTrialing = false;
  let daysLeft = 0;
  let isGrace = false;
  let limits = {
    maxUsers: 1, maxCustomers: 100, maxAiCallsPerMonth: 0,
    maxLeadUploadsPerMonth: 0, maxWebhooks: 0, maxCustomFields: 0,
    maxTeams: 0, maxStorageMb: 0,
  };
  let features = {};

  if (sub) {
    plan = sub.plan;
    status = sub.status;
    isTrialing = sub.status === "TRIALING";

    // Use planSnapshot if available (survives plan definition edits)
    const snap = sub.planSnapshot ?? sub.planDef ?? {};

    limits = {
      maxUsers:              snap.maxUsers              ?? 1,
      maxCustomers:          snap.maxCustomers          ?? 100,
      maxAiCallsPerMonth:    snap.maxAiCallsPerMonth    ?? 0,
      maxLeadUploadsPerMonth: snap.maxLeadUploadsPerMonth ?? 0,
      maxWebhooks:           snap.maxWebhooks           ?? 0,
      maxCustomFields:       snap.maxCustomFields       ?? 0,
      maxTeams:              snap.maxTeams              ?? 0,
      maxStorageMb:          snap.maxStorageMb          ?? 0,
    };

    features = {
      hasAiCalling:          snap.hasAiCalling          ?? false,
      hasAdvancedAnalytics:  snap.hasAdvancedAnalytics  ?? false,
      hasManualReview:       snap.hasManualReview       ?? false,
      hasDncRegistry:        snap.hasDncRegistry        ?? false,
      hasTeams:              snap.hasTeams              ?? false,
      hasMultiChannel:       snap.hasMultiChannel       ?? false,
      hasDealPipeline:       snap.hasDealPipeline       ?? false,
      hasIntentTraining:     snap.hasIntentTraining     ?? false,
      hasCustomAiPrompts:    snap.hasCustomAiPrompts    ?? false,
      hasCustomProviders:    snap.hasCustomProviders    ?? false,
      hasWhiteLabel:         snap.hasWhiteLabel         ?? false,
      hasApiAccess:          snap.hasApiAccess          ?? false,
      hasAiCallDemo:         snap.hasAiCallDemo         ?? false,
      hasDocuments:          snap.hasDocuments          ?? false,
      hasConversationMemory: snap.hasConversationMemory ?? false,
      hasWebhooks:           snap.hasWebhooks           ?? false,
      hasCustomFields:       snap.hasCustomFields       ?? false,
      hasCampaigns:          snap.hasCampaigns          ?? false,
    };

    // Days left: trial or billing period
    const endDate = isTrialing ? sub.trialEndsAt : sub.currentPeriodEnd;
    if (endDate) {
      daysLeft = Math.max(0, Math.ceil((endDate - now) / (1000 * 60 * 60 * 24)));
    }

    isGrace = sub.gracePeriodEndsAt != null && sub.gracePeriodEndsAt > now;

    // Expired / suspended → downgrade to FREE limits for enforcement
    if (status === "EXPIRED" || status === "CANCELLED" || status === "SUSPENDED") {
      if (!isGrace) {
        limits = { maxUsers: 1, maxCustomers: 100, maxAiCallsPerMonth: 0, maxLeadUploadsPerMonth: 0, maxWebhooks: 0, maxCustomFields: 0, maxTeams: 0, maxStorageMb: 0 };
        features = {};
      }
    }
  }

  const usage = await getLiveUsage(tenantId, currentMonth);

  // ─── ASSERT HELPERS ────────────────────────────────────

  function assertLimit(current, max, label) {
    if (max !== -1 && current >= max) {
      throw new PlanLimitError(
        `${label} limit reached (${current}/${max}). Upgrade your plan to add more.`,
        label
      );
    }
  }

  function assertFeature(featureKey) {
    if (!features[featureKey]) {
      const label = featureKey.replace(/^has/, "").replace(/([A-Z])/g, " $1").trim();
      throw new PlanLimitError(
        `${label} is not available on the ${plan} plan. Upgrade to unlock this feature.`,
        featureKey
      );
    }
  }

  return {
    plan,
    status,
    isTrialing,
    isGrace,
    daysLeft,
    limits,
    features,
    usage,

    assertCanAddCustomer()  { assertLimit(usage.customers,  limits.maxCustomers,          "customers"); },
    assertCanAddUser()      { assertLimit(usage.users,      limits.maxUsers,              "users"); },
    assertCanMakeAiCall()   { assertLimit(usage.aiCallsUsed, limits.maxAiCallsPerMonth,   "aiCalls"); },
    assertCanUploadLeads()  { assertLimit(usage.leadsUploaded, limits.maxLeadUploadsPerMonth, "leadUploads"); },
    assertHasFeature(key)   { assertFeature(key); },

    /** Returns a plain summary safe to send to clients */
    toClientSummary() {
      return { plan, status, isTrialing, isGrace, daysLeft, limits, usage };
    },
  };
}

// ─── PUBLIC API ──────────────────────────────────────────

export async function getPlanGuard(tenantId) {
  if (!tenantId) {
    // Super admin / no tenant — no limits apply
    return {
      plan: "MAX", status: "ACTIVE", isTrialing: false, isGrace: false, daysLeft: Infinity,
      limits: { maxUsers: -1, maxCustomers: -1, maxAiCallsPerMonth: -1, maxLeadUploadsPerMonth: -1, maxWebhooks: -1, maxCustomFields: -1, maxTeams: -1, maxStorageMb: -1 },
      features: { hasAiCalling: true, hasAdvancedAnalytics: true, hasManualReview: true, hasDncRegistry: true, hasTeams: true, hasMultiChannel: true, hasDealPipeline: true, hasIntentTraining: true, hasCustomAiPrompts: true, hasCustomProviders: true, hasWhiteLabel: true, hasApiAccess: true, hasAiCallDemo: true, hasDocuments: true, hasConversationMemory: true, hasWebhooks: true, hasCustomFields: true, hasCampaigns: true },
      usage: { customers: 0, users: 0, aiCallsUsed: 0, leadsUploaded: 0 },
      assertCanAddCustomer() {},
      assertCanAddUser() {},
      assertCanMakeAiCall() {},
      assertCanUploadLeads() {},
      assertHasFeature() {},
      toClientSummary() { return { plan: "MAX", status: "ACTIVE" }; },
    };
  }

  const cached = getCached(tenantId);
  if (cached) return cached;

  const guard = await buildGuard(tenantId);
  setCache(tenantId, guard);
  return guard;
}
