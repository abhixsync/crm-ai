import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock("@/lib/prisma", () => ({
  prisma: {
    tenantCreditBalance: {
      findUnique:  vi.fn(),
      create:      vi.fn(),
      update:      vi.fn(),
      updateMany:  vi.fn(),
    },
    callLog: {
      update:   vi.fn(),
      findMany: vi.fn(),
    },
    creditTransaction: {
      findUnique: vi.fn(),
      create:     vi.fn(),
      count:      vi.fn(),
      findMany:   vi.fn(),
    },
    creditPackPurchase: {
      create:   vi.fn(),
      findMany: vi.fn(),
      update:   vi.fn(),
    },
    creditPack:         { findUnique: vi.fn() },
    tenantSubscription: { findUnique: vi.fn() },
    planDefinition:     { findFirst: vi.fn() },
    user:               { findFirst: vi.fn() },
    campaign:           { updateMany: vi.fn() },
    $transaction: vi.fn((opsOrFn) => {
      if (typeof opsOrFn === "function") {
        const tx = {
          $executeRaw:         prisma.$executeRaw,
          callLog:             prisma.callLog,
          creditTransaction:   prisma.creditTransaction,
          tenantCreditBalance: prisma.tenantCreditBalance,
        };
        return opsOrFn(tx);
      }
      return Promise.all(opsOrFn);
    }),
    $executeRaw: vi.fn(),
  },
}));

vi.mock("@/lib/subscription/subscription-service", () => ({
  getSubscriptionConfig: vi.fn(async (key, def) => def),
}));

vi.mock("@/lib/email/mailer", () => ({
  sendEmail:                    vi.fn(async () => ({ ok: true })),
  buildCreditLowWarningEmail:   vi.fn(() => ({ subject: "s", html: "h", text: "t", fromName: null })),
  buildCreditExpiringSoonEmail: vi.fn(() => ({ subject: "s", html: "h", text: "t", fromName: null })),
}));

vi.mock("@/modules/theme/theme.service", () => ({
  resolveTenantTheme: vi.fn(async () => null),
}));

// Import after mocks
import { prisma } from "@/lib/prisma";
import {
  sendEmail,
  buildCreditLowWarningEmail,
  buildCreditExpiringSoonEmail,
} from "@/lib/email/mailer";
import {
  settleCredits,
  expirePurchasedCredits,
  refundReserve,
} from "@/lib/credits/credit-service";

const TENANT  = "tenant_warn_1";
const CALL_ID = "call_warn_1";

function makeBalance(overrides = {}) {
  return {
    tenantId:                TENANT,
    planCredits:             500,
    purchasedCredits:        0,
    reservedCredits:         20,
    planCreditsAllocated:    500,
    planCreditsUsedThisMonth: 0,
    planResetNextAt:         new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    ...overrides,
  };
}

// Drain microtasks + fire-and-forget async IIFEs
function flushAsync() {
  return new Promise((resolve) => setTimeout(resolve, 50));
}

beforeEach(() => {
  vi.clearAllMocks();

  prisma.$executeRaw.mockResolvedValue(1);

  prisma.$transaction.mockImplementation((opsOrFn) => {
    if (typeof opsOrFn === "function") {
      const tx = {
        $executeRaw:         prisma.$executeRaw,
        callLog:             prisma.callLog,
        creditTransaction:   prisma.creditTransaction,
        tenantCreditBalance: prisma.tenantCreditBalance,
      };
      return opsOrFn(tx);
    }
    return Promise.all(opsOrFn);
  });

  // Default happy-path mocks for settle
  prisma.creditTransaction.findUnique.mockResolvedValue(null);
  prisma.tenantCreditBalance.findUnique.mockResolvedValue(makeBalance());
  prisma.tenantCreditBalance.update.mockResolvedValue({});
  prisma.callLog.update.mockResolvedValue({});
  prisma.creditTransaction.create.mockResolvedValue({});
  prisma.campaign.updateMany.mockResolvedValue({ count: 0 });
  prisma.user.findFirst.mockResolvedValue({ email: "owner@test.com", name: "Alice" });
});

// ─── checkLowCreditWarnings (via settleCredits) ───────────────────────────────

describe("checkLowCreditWarnings — campaign pause at 0%", () => {
  it("pauses RUNNING campaigns when available balance reaches 0", async () => {
    // After settle: planCredits=0, purchasedCredits=0, reservedCredits=0 → available=0
    // balanceAfter in settle = planCredits - deductFromPlan + (purchased - deductFromPurchased)
    //   - (reserved - reserveAmount)
    // With planCredits=4, actual=4 (2-sec call: initFee=2 + ceil(2/60)*1=3, but with 0-sec → 2+0=2)
    // Use a balance where after settlement balanceAfter == 0:
    //   planCredits=4, purchased=0, reserved=20, actual=4 (120 sec = 2+2=4)
    //   balanceAfter = 4-4 + 0 - (20-20) = 0
    prisma.tenantCreditBalance.findUnique
      // First call in settleCredits
      .mockResolvedValueOnce(makeBalance({ planCredits: 4, purchasedCredits: 0, reservedCredits: 20 }))
      // Second call inside checkLowCreditWarnings
      .mockResolvedValueOnce(makeBalance({ planCredits: 0, purchasedCredits: 0, reservedCredits: 0, planCreditsAllocated: 500 }));

    await settleCredits(TENANT, CALL_ID, 120);
    await flushAsync();

    expect(prisma.campaign.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: TENANT, status: "RUNNING" }),
        data:  expect.objectContaining({ status: "PAUSED" }),
      })
    );
  });

  it("does NOT pause campaigns when balance is above 0%", async () => {
    // After settle with planCredits=500: balanceAfter = 500-4+0-(20-20) = 496 (>> 0)
    prisma.tenantCreditBalance.findUnique
      .mockResolvedValueOnce(makeBalance({ planCredits: 500, purchasedCredits: 0, reservedCredits: 20 }))
      .mockResolvedValueOnce(makeBalance({ planCredits: 496, purchasedCredits: 0, reservedCredits: 0, planCreditsAllocated: 500 }));

    await settleCredits(TENANT, CALL_ID, 120);
    await flushAsync();

    expect(prisma.campaign.updateMany).not.toHaveBeenCalled();
  });
});

describe("checkLowCreditWarnings — low-credit warning email", () => {
  it("sends buildCreditLowWarningEmail when balance pct is at or below 20%", async () => {
    // planCreditsAllocated=500, available after settle ≈ 80 → pct=16% (<= 20%)
    prisma.tenantCreditBalance.findUnique
      .mockResolvedValueOnce(makeBalance({ planCredits: 100, purchasedCredits: 0, reservedCredits: 20 }))
      .mockResolvedValueOnce(makeBalance({ planCredits: 80, purchasedCredits: 0, reservedCredits: 0, planCreditsAllocated: 500 }));

    await settleCredits(TENANT, CALL_ID, 120);
    await flushAsync();

    expect(buildCreditLowWarningEmail).toHaveBeenCalledOnce();
    expect(sendEmail).toHaveBeenCalledOnce();
  });

  it("does NOT send warning email when balance pct is above 20%", async () => {
    // planCreditsAllocated=500, available=250 → pct=50% (> 20%)
    prisma.tenantCreditBalance.findUnique
      .mockResolvedValueOnce(makeBalance({ planCredits: 270, purchasedCredits: 0, reservedCredits: 20 }))
      .mockResolvedValueOnce(makeBalance({ planCredits: 250, purchasedCredits: 0, reservedCredits: 0, planCreditsAllocated: 500 }));

    await settleCredits(TENANT, CALL_ID, 120);
    await flushAsync();

    expect(buildCreditLowWarningEmail).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("passes warnPct=5 to email builder when pct is at or below second threshold", async () => {
    // settle: actual=4 (120s), planCredits=25, reserved=20
    //   balanceAfter = 25-4 + 0 - (20-20) = 21
    //   pct = 21/500 = 4.2% ≤ warnPct2=5 → threshold should be 5
    prisma.tenantCreditBalance.findUnique
      .mockResolvedValueOnce(makeBalance({ planCredits: 25, purchasedCredits: 0, reservedCredits: 20 }))
      .mockResolvedValueOnce(makeBalance({ planCredits: 21, purchasedCredits: 0, reservedCredits: 0, planCreditsAllocated: 500 }));

    await settleCredits(TENANT, CALL_ID, 120);
    await flushAsync();

    expect(buildCreditLowWarningEmail).toHaveBeenCalledOnce();
    // 4th argument is the threshold — should be warnPct2=5 (config default)
    const threshold = buildCreditLowWarningEmail.mock.calls[0][3];
    expect(threshold).toBe(5);
  });

  it("passes warnPct=20 to email builder when pct is between 5% and 20%", async () => {
    // pct = 50/500 = 10% (≤ 20 but > 5 → use warnPct=20)
    prisma.tenantCreditBalance.findUnique
      .mockResolvedValueOnce(makeBalance({ planCredits: 70, purchasedCredits: 0, reservedCredits: 20 }))
      .mockResolvedValueOnce(makeBalance({ planCredits: 50, purchasedCredits: 0, reservedCredits: 0, planCreditsAllocated: 500 }));

    await settleCredits(TENANT, CALL_ID, 120);
    await flushAsync();

    expect(buildCreditLowWarningEmail).toHaveBeenCalledOnce();
    const threshold = buildCreditLowWarningEmail.mock.calls[0][3];
    expect(threshold).toBe(20);
  });

  it("does NOT send warning email when planCreditsAllocated is 0 (prevents div-by-zero)", async () => {
    prisma.tenantCreditBalance.findUnique
      .mockResolvedValueOnce(makeBalance({ planCredits: 0, purchasedCredits: 0, reservedCredits: 20 }))
      .mockResolvedValueOnce(makeBalance({ planCredits: 0, purchasedCredits: 0, reservedCredits: 0, planCreditsAllocated: 0 }));

    await settleCredits(TENANT, CALL_ID, 120);
    await flushAsync();

    expect(buildCreditLowWarningEmail).not.toHaveBeenCalled();
  });
});

// ─── expirePurchasedCredits — expiring-soon emails ────────────────────────────

describe("expirePurchasedCredits — expiry-soon email", () => {
  function makePurchase(overrides = {}) {
    return {
      id:               "pack-purchase-1",
      tenantId:         TENANT,
      creditsAtPurchase: 200,
      expiresAt:        new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 days from now
      status:           "COMPLETED",
      pack:             { name: "Starter Pack" },
      ...overrides,
    };
  }

  it("sends buildCreditExpiringSoonEmail for purchases expiring within 7 days", async () => {
    prisma.creditPackPurchase.findMany
      .mockResolvedValueOnce([])             // expired query (expiresAt <= now)
      .mockResolvedValueOnce([makePurchase()]); // expiring-soon query

    prisma.creditTransaction.findUnique.mockResolvedValue(null);
    prisma.creditTransaction.create.mockResolvedValue({ id: "dedup-tx" });

    await expirePurchasedCredits(TENANT);
    await flushAsync();

    expect(buildCreditExpiringSoonEmail).toHaveBeenCalledOnce();
    expect(sendEmail).toHaveBeenCalledOnce();
  });

  it("does NOT send for already-expired purchases (they are handled by the expiry path)", async () => {
    const expiredPurchase = makePurchase({ expiresAt: new Date(Date.now() - 1000), status: "COMPLETED" });

    // expired query finds it; expiring-soon query finds nothing
    prisma.creditPackPurchase.findMany
      .mockResolvedValueOnce([expiredPurchase])
      .mockResolvedValueOnce([]);

    prisma.creditTransaction.findUnique.mockResolvedValue(null);
    prisma.creditTransaction.create.mockResolvedValue({});
    prisma.tenantCreditBalance.findUnique.mockResolvedValue(
      makeBalance({ planCredits: 500, purchasedCredits: 200 })
    );
    prisma.tenantCreditBalance.update.mockResolvedValue({});
    prisma.creditPackPurchase.update.mockResolvedValue({});

    await expirePurchasedCredits(TENANT);
    await flushAsync();

    expect(buildCreditExpiringSoonEmail).not.toHaveBeenCalled();
  });

  it("does NOT send twice for same purchase on same day (dedup marker exists)", async () => {
    prisma.creditPackPurchase.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([makePurchase()]);

    // Dedup transaction already exists
    prisma.creditTransaction.findUnique.mockResolvedValue({ id: "already-warned" });

    await expirePurchasedCredits(TENANT);
    await flushAsync();

    expect(buildCreditExpiringSoonEmail).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("creates dedup ADJUSTMENT transaction BEFORE sending email", async () => {
    const callOrder = [];

    prisma.creditPackPurchase.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([makePurchase()]);

    prisma.creditTransaction.findUnique.mockResolvedValue(null);

    prisma.creditTransaction.create.mockImplementation(async (args) => {
      callOrder.push(`create:${args.data.type}`);
      return { id: "dedup-tx", ...args.data };
    });

    sendEmail.mockImplementation(async () => {
      callOrder.push("sendEmail");
      return { ok: true };
    });

    await expirePurchasedCredits(TENANT);
    await flushAsync();

    const createIdx = callOrder.indexOf("create:ADJUSTMENT");
    const emailIdx  = callOrder.indexOf("sendEmail");

    expect(createIdx).toBeGreaterThanOrEqual(0);
    expect(emailIdx).toBeGreaterThanOrEqual(0);
    expect(createIdx).toBeLessThan(emailIdx);
  });

  it("does NOT send email when creditTransaction.create fails (claimed=null guard)", async () => {
    prisma.creditPackPurchase.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([makePurchase()]);

    prisma.creditTransaction.findUnique.mockResolvedValue(null);
    // create throws (unique constraint) → .catch(() => null) → claimed=null → skip
    prisma.creditTransaction.create.mockRejectedValue(new Error("unique constraint"));

    await expirePurchasedCredits(TENANT);
    await flushAsync();

    expect(sendEmail).not.toHaveBeenCalled();
  });
});

// ─── refundReserve — double-refund guard ─────────────────────────────────────

describe("refundReserve — double-refund idempotency guards", () => {
  it("is a no-op when refund idempotency key refund-{callLogId} already exists", async () => {
    // First findUnique call checks for `refund-${callLogId}`
    prisma.creditTransaction.findUnique.mockResolvedValueOnce({ id: "already-refunded" });

    await refundReserve(TENANT, CALL_ID);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("is a no-op when settle key settle-{callLogId} already exists", async () => {
    // First call (refund check) → null, second call (settle check) → exists
    prisma.creditTransaction.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "already-settled" });

    await refundReserve(TENANT, CALL_ID);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("does NOT call $transaction if already refunded", async () => {
    prisma.creditTransaction.findUnique.mockResolvedValueOnce({ id: "existing-refund" });

    await refundReserve(TENANT, CALL_ID);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.tenantCreditBalance.update).not.toHaveBeenCalled();
  });

  it("does NOT call $transaction if already settled", async () => {
    prisma.creditTransaction.findUnique
      .mockResolvedValueOnce(null)                    // refund key absent
      .mockResolvedValueOnce({ id: "settled-tx" });   // settle key present

    await refundReserve(TENANT, CALL_ID);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("successfully executes refund when neither refund nor settle key exists", async () => {
    // Both idempotency checks return null
    prisma.creditTransaction.findUnique
      .mockResolvedValueOnce(null)   // refund key absent
      .mockResolvedValueOnce(null);  // settle key absent

    prisma.tenantCreditBalance.findUnique.mockResolvedValue(
      makeBalance({ planCredits: 500, purchasedCredits: 0, reservedCredits: 20 })
    );
    prisma.tenantCreditBalance.update.mockResolvedValue({});
    prisma.callLog.update.mockResolvedValue({});
    prisma.creditTransaction.create.mockResolvedValue({});

    await refundReserve(TENANT, CALL_ID);

    expect(prisma.$transaction).toHaveBeenCalledOnce();

    const createArg = prisma.creditTransaction.create.mock.calls[0][0];
    expect(createArg.data.type).toBe("REFUND");
    expect(createArg.data.idempotencyKey).toBe(`refund-${CALL_ID}`);
  });

  it("uses correct idempotency key format refund-{callLogId}", async () => {
    prisma.creditTransaction.findUnique.mockResolvedValue(null);
    prisma.tenantCreditBalance.findUnique.mockResolvedValue(makeBalance({ reservedCredits: 20 }));
    prisma.tenantCreditBalance.update.mockResolvedValue({});
    prisma.callLog.update.mockResolvedValue({});
    prisma.creditTransaction.create.mockResolvedValue({});

    const customCallId = "custom-call-999";
    await refundReserve(TENANT, customCallId);

    const createArg = prisma.creditTransaction.create.mock.calls[0][0];
    expect(createArg.data.idempotencyKey).toBe(`refund-${customCallId}`);
  });

  it("checks idempotency keys in correct order: refund key first, then settle key", async () => {
    const keyChecks = [];
    prisma.creditTransaction.findUnique.mockImplementation(async (args) => {
      keyChecks.push(args.where.idempotencyKey);
      return null;
    });
    prisma.tenantCreditBalance.findUnique.mockResolvedValue(makeBalance({ reservedCredits: 20 }));
    prisma.tenantCreditBalance.update.mockResolvedValue({});
    prisma.callLog.update.mockResolvedValue({});
    prisma.creditTransaction.create.mockResolvedValue({});

    await refundReserve(TENANT, CALL_ID);

    expect(keyChecks[0]).toBe(`refund-${CALL_ID}`);
    expect(keyChecks[1]).toBe(`settle-${CALL_ID}`);
  });
});
