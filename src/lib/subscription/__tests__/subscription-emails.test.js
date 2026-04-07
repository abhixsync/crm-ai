import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks (declared before any imports that transitively use them) ──────────

vi.mock("@/lib/prisma", () => ({
  prisma: {
    subscriptionConfig: { findUnique: vi.fn() },
    planDefinition:     { findUnique: vi.fn(), findFirst: vi.fn() },
    tenantSubscription: { update: vi.fn(), upsert: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() },
    tenantCreditBalance: { updateMany: vi.fn(), upsert: vi.fn() },
    user:     { findFirst: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
    tenant:   { findUnique: vi.fn() },
    campaign: { updateMany: vi.fn() },
    $transaction: vi.fn((opsOrFn) => {
      if (typeof opsOrFn === "function") {
        const tx = {
          tenantSubscription:  { update: vi.fn() },
          user:                { updateMany: vi.fn() },
          campaign:            { updateMany: vi.fn() },
        };
        return opsOrFn(tx);
      }
      return Promise.all(opsOrFn);
    }),
  },
}));

vi.mock("@/lib/email/mailer", () => ({
  sendEmail:                  vi.fn(async () => ({ ok: true })),
  buildPlanDowngradeEmail:    vi.fn(() => ({ subject: "s", html: "h", text: "t", fromName: null })),
  buildAccountSuspendEmail:   vi.fn(() => ({ subject: "s", html: "h", text: "t", fromName: null })),
  buildRenewalReminderEmail:  vi.fn(() => ({ subject: "s", html: "h", text: "t", fromName: null })),
  buildTrialExpiryWarningEmail: vi.fn(() => ({ subject: "s", html: "h", text: "t", fromName: null })),
}));

vi.mock("@/modules/theme/theme.service", () => ({
  resolveTenantTheme: vi.fn(async () => null),
}));

vi.mock("@/lib/subscription/plan-guard", () => ({
  invalidatePlanGuardCache: vi.fn(),
}));

vi.mock("@/lib/credits/credit-service", () => ({
  initializeCreditBalance: vi.fn(),
}));

// Import after mocks are set up
import { prisma } from "@/lib/prisma";
import {
  sendEmail,
  buildPlanDowngradeEmail,
  buildAccountSuspendEmail,
  buildRenewalReminderEmail,
} from "@/lib/email/mailer";
import { downgradeToFree } from "@/lib/subscription/subscription-service";
import { runSubscriptionExpiryCron } from "@/lib/subscription/trial-cron";

const TENANT = "tenant_email_test";

// Helper to drain all microtasks + fire-and-forget async IIFEs
function flushAsync() {
  return new Promise((resolve) => setTimeout(resolve, 50));
}

function makeFreePlanDef(overrides = {}) {
  return {
    id: "free-plan-id",
    plan: "FREE",
    maxUsers: 1,
    maxCustomers: 100,
    maxAiCallsPerMonth: 0,
    maxLeadUploadsPerMonth: 0,
    maxWebhooks: 0,
    maxCustomFields: 0,
    maxTeams: 0,
    maxStorageMb: 100,
    creditsPerMonth: 0,
    hasAiCalling: false,
    hasAdvancedAnalytics: false,
    hasManualReview: false,
    hasDncRegistry: false,
    hasTeams: false,
    hasMultiChannel: false,
    hasDealPipeline: false,
    hasIntentTraining: false,
    hasCustomAiPrompts: false,
    hasCustomProviders: false,
    hasWhiteLabel: false,
    hasApiAccess: false,
    hasAiCallDemo: false,
    hasDocuments: false,
    hasConversationMemory: false,
    hasWebhooks: false,
    hasCustomFields: false,
    hasCampaigns: false,
    priceInrMonthly: 0,
    priceUsdMonthly: 0,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();

  // Re-bind $transaction after clearAllMocks wipes the implementation
  prisma.$transaction.mockImplementation((opsOrFn) => {
    if (typeof opsOrFn === "function") {
      const tx = {
        tenantSubscription:  { update: vi.fn() },
        user:                { updateMany: vi.fn() },
        campaign:            { updateMany: vi.fn() },
      };
      return opsOrFn(tx);
    }
    return Promise.all(opsOrFn);
  });

  // subscriptionConfig — return defaults
  prisma.subscriptionConfig.findUnique.mockResolvedValue(null);

  // planDefinition — FREE plan by default
  const freePlan = makeFreePlanDef();
  prisma.planDefinition.findUnique.mockResolvedValue(freePlan);
  prisma.planDefinition.findFirst.mockResolvedValue(freePlan);

  // tenantCreditBalance.updateMany — success
  prisma.tenantCreditBalance.updateMany.mockResolvedValue({ count: 1 });
});

// ─── downgradeToFree — email behaviour ──────────────────────────────────────

describe("downgradeToFree — owner downgrade email", () => {
  it("calls buildPlanDowngradeEmail with owner name, 'Pro', and emailCtx", async () => {
    prisma.user.findFirst.mockResolvedValue({ email: "owner@test.com", name: "Alice" });
    prisma.user.findMany.mockResolvedValue([]);
    prisma.tenant.findUnique.mockResolvedValue({ name: "Acme Corp" });

    await downgradeToFree(TENANT);
    await flushAsync();

    expect(buildPlanDowngradeEmail).toHaveBeenCalledOnce();
    const [ownerName, planLabel, emailCtx] = buildPlanDowngradeEmail.mock.calls[0];
    expect(ownerName).toBe("Alice");
    expect(planLabel).toBe("Pro");
    expect(emailCtx).toMatchObject({
      brandName:    null,
      primaryColor: null,
      fromName:     null,
    });
  });

  it("calls sendEmail with owner address when owner email is present", async () => {
    prisma.user.findFirst.mockResolvedValue({ email: "owner@test.com", name: "Alice" });
    prisma.user.findMany.mockResolvedValue([]);
    prisma.tenant.findUnique.mockResolvedValue({ name: "Acme" });

    await downgradeToFree(TENANT);
    await flushAsync();

    const toAddresses = sendEmail.mock.calls.map((c) => c[0].to);
    expect(toAddresses).toContain("owner@test.com");
  });

  it("does NOT call sendEmail when no owner email is found", async () => {
    // findFirst returns user without email
    prisma.user.findFirst.mockResolvedValue({ email: null, name: "Ghost" });
    prisma.user.findMany.mockResolvedValue([]);

    await downgradeToFree(TENANT);
    await flushAsync();

    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("does NOT call sendEmail when owner user row is missing", async () => {
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.findMany.mockResolvedValue([]);

    await downgradeToFree(TENANT);
    await flushAsync();

    expect(sendEmail).not.toHaveBeenCalled();
  });
});

describe("downgradeToFree — suspended user emails", () => {
  it("calls buildAccountSuspendEmail for each suspended user", async () => {
    // Owner email path returns null so we isolate to the suspended-user path
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.findMany.mockResolvedValue([
      { email: "bob@test.com",   name: "Bob"   },
      { email: "carol@test.com", name: "Carol" },
    ]);
    prisma.tenant.findUnique.mockResolvedValue({ name: "Acme" });

    await downgradeToFree(TENANT);
    await flushAsync();

    expect(buildAccountSuspendEmail).toHaveBeenCalledTimes(2);
    const firstCallName = buildAccountSuspendEmail.mock.calls[0][0];
    const secondCallName = buildAccountSuspendEmail.mock.calls[1][0];
    expect([firstCallName, secondCallName].sort()).toEqual(["Bob", "Carol"]);
  });

  it("sends email to each suspended user individually", async () => {
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.findMany.mockResolvedValue([
      { email: "bob@test.com",   name: "Bob"   },
      { email: "carol@test.com", name: "Carol" },
    ]);
    prisma.tenant.findUnique.mockResolvedValue({ name: "Acme" });

    await downgradeToFree(TENANT);
    await flushAsync();

    const toAddresses = sendEmail.mock.calls.map((c) => c[0].to);
    expect(toAddresses).toContain("bob@test.com");
    expect(toAddresses).toContain("carol@test.com");
  });

  it("still emails second user when first sendEmail call throws", async () => {
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.findMany.mockResolvedValue([
      { email: "bad@test.com",  name: "Bad"   },
      { email: "good@test.com", name: "Good"  },
    ]);
    prisma.tenant.findUnique.mockResolvedValue({ name: "Acme" });

    // First call throws, second succeeds
    sendEmail
      .mockRejectedValueOnce(new Error("SMTP failure"))
      .mockResolvedValueOnce({ ok: true });

    await downgradeToFree(TENANT);
    await flushAsync();

    // Both calls were attempted
    expect(sendEmail).toHaveBeenCalledTimes(2);
    const toAddresses = sendEmail.mock.calls.map((c) => c[0].to);
    expect(toAddresses).toContain("good@test.com");
  });

  it("skips a suspended user entry that has no email address", async () => {
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.findMany.mockResolvedValue([
      { email: null,            name: "NoEmail" },
      { email: "real@test.com", name: "Real"    },
    ]);
    prisma.tenant.findUnique.mockResolvedValue({ name: "Acme" });

    await downgradeToFree(TENANT);
    await flushAsync();

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0][0].to).toBe("real@test.com");
  });
});

// ─── sendRenewalReminders (via runSubscriptionExpiryCron) ─────────────────────

describe("sendRenewalReminders (via runSubscriptionExpiryCron)", () => {
  // Silence console output from the cron function
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});

    // expireTrials — return nothing to expire
    prisma.tenantSubscription.findMany.mockResolvedValue([]);
    // user.findFirst — owner lookup inside trial-warning + renewal loops
    prisma.user.findFirst.mockResolvedValue({ email: "owner@acme.com", name: "Alice" });
  });

  function makeSub(overrides = {}) {
    const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    return {
      tenantId:        "tenant-renewal",
      plan:            "PRO",
      currentPeriodEnd: sevenDaysFromNow,
      billingCycle:    "MONTHLY",
      ...overrides,
    };
  }

  it("sends renewal reminder for ACTIVE paid-plan sub within the 6.5–7.5 day window", async () => {
    // findMany is called 4 times inside runSubscriptionExpiryCron:
    //   1. expireTrials  (TRIALING, trialEndsAt<now)
    //   2. expirePastDue (ACTIVE, currentPeriodEnd<now, gracePeriodEndsAt=null)
    //   3. expirePastDue (PAST_DUE|CANCELLED|EXPIRED, gracePeriodEndsAt<now)
    //   4. sendTrialWarnings — 3 calls (one per WARNING_DAYS entry)
    //   5. sendRenewalReminders (ACTIVE, not FREE)
    // We resolve all findMany to [] except the last (renewal) call.
    let callCount = 0;
    prisma.tenantSubscription.findMany.mockImplementation(() => {
      callCount++;
      // 5th call is the renewal query (after 4 expiry/warning queries for 3 warning days + 1 past-due)
      // Actually: expireTrials=1, expirePastDue=2, sendTrialWarnings=3 (7d)+3(3d)+3(1d) = counts 1-6,
      // renewal=7. Use a flag instead.
      return Promise.resolve([]);
    });

    const renewalSub = makeSub();
    // Override with a specific implementation that returns renewal sub on the right call
    prisma.tenantSubscription.findMany.mockImplementation(async (args) => {
      // Detect the renewal query by its where clause shape
      if (args?.where?.plan?.not === "FREE" && args?.where?.status === "ACTIVE") {
        return [renewalSub];
      }
      return [];
    });

    prisma.planDefinition.findFirst.mockResolvedValue(makeFreePlanDef({ plan: "PRO", priceInrMonthly: 2900, priceUsdMonthly: 29 }));

    const result = await runSubscriptionExpiryCron();

    expect(result.renewals.sent).toBe(1);
    expect(buildRenewalReminderEmail).toHaveBeenCalledOnce();
  });

  it("does NOT send renewal reminder for FREE plan sub", async () => {
    prisma.tenantSubscription.findMany.mockImplementation(async (args) => {
      if (args?.where?.plan?.not === "FREE" && args?.where?.status === "ACTIVE") {
        // Return empty — no paid plans in window
        return [];
      }
      return [];
    });

    const result = await runSubscriptionExpiryCron();

    expect(result.renewals.sent).toBe(0);
    expect(buildRenewalReminderEmail).not.toHaveBeenCalled();
  });

  it("does NOT send for sub with currentPeriodEnd outside the 6.5–7.5 day window", async () => {
    // The query itself filters by window — returning [] simulates no match
    prisma.tenantSubscription.findMany.mockImplementation(async (args) => {
      if (args?.where?.plan?.not === "FREE") {
        return []; // DB filtered them out — outside window
      }
      return [];
    });

    const result = await runSubscriptionExpiryCron();

    expect(result.renewals.sent).toBe(0);
  });

  it("calls buildRenewalReminderEmail with plan, date, amount, and currency", async () => {
    const renewalDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    prisma.tenantSubscription.findMany.mockImplementation(async (args) => {
      if (args?.where?.plan?.not === "FREE" && args?.where?.status === "ACTIVE") {
        return [{ tenantId: "t1", plan: "PLUS", currentPeriodEnd: renewalDate, billingCycle: "MONTHLY" }];
      }
      return [];
    });

    prisma.planDefinition.findFirst.mockResolvedValue(
      makeFreePlanDef({ plan: "PLUS", priceInrMonthly: 900, priceUsdMonthly: 9 })
    );
    // subscriptionConfig returns "INR" as currency default
    prisma.subscriptionConfig.findUnique.mockResolvedValue(null);

    await runSubscriptionExpiryCron();

    expect(buildRenewalReminderEmail).toHaveBeenCalledOnce();
    const [, plan, date, amount, currency] = buildRenewalReminderEmail.mock.calls[0];
    expect(plan).toBe("PLUS");
    expect(date).toEqual(renewalDate);
    // currency defaults to "INR" (config not found → falls back)
    expect(currency).toBe("INR");
    // amount is INR price
    expect(amount).toBe(900);
  });

  it("does NOT send renewal when owner email is missing", async () => {
    const renewalDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    prisma.tenantSubscription.findMany.mockImplementation(async (args) => {
      if (args?.where?.plan?.not === "FREE" && args?.where?.status === "ACTIVE") {
        return [{ tenantId: "t-no-owner", plan: "PRO", currentPeriodEnd: renewalDate, billingCycle: "MONTHLY" }];
      }
      return [];
    });
    prisma.user.findFirst.mockResolvedValue(null);

    const result = await runSubscriptionExpiryCron();

    expect(result.renewals.sent).toBe(0);
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
