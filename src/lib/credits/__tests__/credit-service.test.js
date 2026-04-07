import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock prisma — must be declared before imports that use it
vi.mock("@/lib/prisma", () => ({
  prisma: {
    tenantCreditBalance: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    callLog: {
      update: vi.fn(),
      findMany: vi.fn(),
    },
    creditTransaction: {
      findUnique: vi.fn(),
      create: vi.fn(),
      count: vi.fn(),
      findMany: vi.fn(),
    },
    creditPackPurchase: {
      create: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    creditPack: { findUnique: vi.fn() },
    tenantSubscription: { findUnique: vi.fn() },
    planDefinition: { findFirst: vi.fn() },
    campaign: { updateMany: vi.fn() },
    $transaction: vi.fn((opsOrFn) => {
      if (typeof opsOrFn === "function") {
        // Interactive transaction — call the function with a mock tx that
        // delegates to the same prisma mocks so assertions still work
        const tx = {
          $executeRaw: prisma.$executeRaw,
          callLog: prisma.callLog,
          creditTransaction: prisma.creditTransaction,
          tenantCreditBalance: prisma.tenantCreditBalance,
        };
        return opsOrFn(tx);
      }
      // Batch form — resolve each operation promise
      return Promise.all(opsOrFn);
    }),
    $executeRaw: vi.fn(),
  },
}));

// Mock subscription service — always return the default value
vi.mock("@/lib/subscription/subscription-service", () => ({
  getSubscriptionConfig: vi.fn(async (key, def) => def),
}));

import { prisma } from "@/lib/prisma";
import {
  getCreditBalance,
  reserveCredits,
  settleCredits,
  refundReserve,
  grantMonthlyCredits,
} from "@/lib/credits/credit-service";

const TENANT = "tenant_test_1";
const CALL_ID = "call_test_1";

function makeBalance(overrides = {}) {
  return {
    tenantId: TENANT,
    planCredits: 500,
    purchasedCredits: 0,
    reservedCredits: 0,
    planCreditsAllocated: 500,
    planCreditsUsedThisMonth: 0,
    planResetNextAt: new Date(Date.now() - 1000), // overdue — triggers grant
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();

  // Default executeRaw: 1 row affected (success)
  prisma.$executeRaw.mockResolvedValue(1);

  // Re-bind $transaction after clearAllMocks wipes the implementation
  prisma.$transaction.mockImplementation((opsOrFn) => {
    if (typeof opsOrFn === "function") {
      const tx = {
        $executeRaw: prisma.$executeRaw,
        callLog: prisma.callLog,
        creditTransaction: prisma.creditTransaction,
        tenantCreditBalance: prisma.tenantCreditBalance,
      };
      return opsOrFn(tx);
    }
    return Promise.all(opsOrFn);
  });
});

// ─── getCreditBalance ────────────────────────────────────

describe("getCreditBalance", () => {
  it("returns null when no balance row exists", async () => {
    prisma.tenantCreditBalance.findUnique.mockResolvedValue(null);
    expect(await getCreditBalance(TENANT)).toBeNull();
  });

  it("computes available correctly", async () => {
    prisma.tenantCreditBalance.findUnique.mockResolvedValue(
      makeBalance({ planCredits: 500, purchasedCredits: 100, reservedCredits: 20 })
    );
    const result = await getCreditBalance(TENANT);
    expect(result.available).toBe(580); // 500 + 100 - 20
  });
});

// ─── reserveCredits ──────────────────────────────────────

describe("reserveCredits", () => {
  it("throws 402 NO_CREDIT_BALANCE when no balance row", async () => {
    prisma.tenantCreditBalance.findUnique.mockResolvedValue(null);
    await expect(reserveCredits(TENANT, CALL_ID)).rejects.toMatchObject({
      status: 402,
      code: "NO_CREDIT_BALANCE",
    });
  });

  it("throws 402 INSUFFICIENT_CREDITS when available < reserveAmount", async () => {
    prisma.tenantCreditBalance.findUnique.mockResolvedValue(
      makeBalance({ planCredits: 10, purchasedCredits: 0, reservedCredits: 0 })
    );
    await expect(reserveCredits(TENANT, CALL_ID)).rejects.toMatchObject({
      status: 402,
      code: "INSUFFICIENT_CREDITS",
    });
  });

  it("throws 402 INSUFFICIENT_CREDITS when atomic update affects 0 rows (race condition)", async () => {
    prisma.tenantCreditBalance.findUnique.mockResolvedValue(makeBalance());
    // Simulate concurrent depletion: raw SQL finds no qualifying row
    prisma.$executeRaw.mockResolvedValue(0);
    await expect(reserveCredits(TENANT, CALL_ID)).rejects.toMatchObject({
      status: 402,
      code: "INSUFFICIENT_CREDITS",
    });
  });

  it("updates CallLog and logs RESERVE transaction on success", async () => {
    prisma.tenantCreditBalance.findUnique.mockResolvedValue(makeBalance());
    prisma.$executeRaw.mockResolvedValue(1);
    prisma.callLog.update.mockResolvedValue({});
    prisma.creditTransaction.create.mockResolvedValue({});

    await reserveCredits(TENANT, CALL_ID);

    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(prisma.callLog.update).toHaveBeenCalledOnce();
    expect(prisma.creditTransaction.create).toHaveBeenCalledOnce();
    expect(prisma.creditTransaction.create.mock.calls[0][0].data.type).toBe("RESERVE");
  });
});

// ─── settleCredits ───────────────────────────────────────

describe("settleCredits", () => {
  it("is a no-op when idempotency key already exists", async () => {
    prisma.creditTransaction.findUnique.mockResolvedValue({ id: "existing" });
    await settleCredits(TENANT, CALL_ID, 120);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("charges initFee + ceil(duration/60) * perMinute", async () => {
    // Config defaults: initFee=2, perMinute=1 → 2-min call = 2 + ceil(120/60)*1 = 4
    prisma.creditTransaction.findUnique.mockResolvedValue(null);
    prisma.tenantCreditBalance.findUnique.mockResolvedValue(makeBalance());
    prisma.tenantCreditBalance.update.mockResolvedValue({});
    prisma.callLog.update.mockResolvedValue({});
    prisma.creditTransaction.create.mockResolvedValue({});

    await settleCredits(TENANT, CALL_ID, 120);

    expect(prisma.$transaction).toHaveBeenCalledOnce();
    // creditTransaction.create receives amount=-4
    const createArg = prisma.creditTransaction.create.mock.calls[0][0];
    expect(createArg.data.amount).toBe(-4);
    expect(createArg.data.type).toBe("SETTLE");
  });

  it("deducts from plan first, remainder from purchased", async () => {
    // 1 plan credit, 100 purchased; actual=4 → deductFromPlan=1, deductFromPurchased=3
    prisma.creditTransaction.findUnique.mockResolvedValue(null);
    prisma.tenantCreditBalance.findUnique.mockResolvedValue(
      makeBalance({ planCredits: 1, purchasedCredits: 100, reservedCredits: 20 })
    );
    prisma.tenantCreditBalance.update.mockResolvedValue({});
    prisma.callLog.update.mockResolvedValue({});
    prisma.creditTransaction.create.mockResolvedValue({});

    await settleCredits(TENANT, CALL_ID, 120); // actual = 2 + 2 = 4

    const updateArg = prisma.tenantCreditBalance.update.mock.calls[0][0];
    expect(updateArg.data.planCredits.decrement).toBe(1);
    expect(updateArg.data.purchasedCredits.decrement).toBe(3);
  });
});

// ─── refundReserve ───────────────────────────────────────

describe("refundReserve", () => {
  it("is a no-op when a SETTLE idempotency key already exists", async () => {
    // refundReserve checks for `settle-${callLogId}` (avoids double-release if settled)
    prisma.creditTransaction.findUnique.mockResolvedValue({ id: "existing" });
    await refundReserve(TENANT, CALL_ID);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("releases reserve and logs REFUND with creditsCharged=0", async () => {
    prisma.creditTransaction.findUnique.mockResolvedValue(null);
    prisma.tenantCreditBalance.findUnique.mockResolvedValue(
      makeBalance({ reservedCredits: 20 })
    );
    prisma.tenantCreditBalance.update.mockResolvedValue({});
    prisma.callLog.update.mockResolvedValue({});
    prisma.creditTransaction.create.mockResolvedValue({});

    await refundReserve(TENANT, CALL_ID);

    expect(prisma.$transaction).toHaveBeenCalledOnce();

    const balanceUpdateArg = prisma.tenantCreditBalance.update.mock.calls[0][0];
    expect(balanceUpdateArg.data.reservedCredits.decrement).toBe(20);

    const callLogUpdateArg = prisma.callLog.update.mock.calls[0][0];
    expect(callLogUpdateArg.data.creditsCharged).toBe(0);

    const createArg = prisma.creditTransaction.create.mock.calls[0][0];
    expect(createArg.data.type).toBe("REFUND");
  });
});

// ─── grantMonthlyCredits ─────────────────────────────────

describe("grantMonthlyCredits", () => {
  it("is a no-op when idempotency key already exists", async () => {
    prisma.creditTransaction.findUnique.mockResolvedValue({ id: "existing" });
    await grantMonthlyCredits(TENANT);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("is a no-op when planResetNextAt is in the future", async () => {
    prisma.creditTransaction.findUnique.mockResolvedValue(null);
    prisma.tenantCreditBalance.findUnique.mockResolvedValue(
      makeBalance({ planResetNextAt: new Date(Date.now() + 999_999) })
    );
    await grantMonthlyCredits(TENANT);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
