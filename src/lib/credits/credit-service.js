import { prisma } from "@/lib/prisma";
import { getSubscriptionConfig } from "@/lib/subscription/subscription-service";

// ─── BALANCE ────────────────────────────────────────────

export async function initializeCreditBalance(tenantId, planCredits, planResetNextAt = null) {
  return prisma.tenantCreditBalance.create({
    data: {
      tenantId,
      planCredits,
      planCreditsAllocated: planCredits,
      planResetNextAt,
    },
  });
}

export async function getCreditBalance(tenantId) {
  const balance = await prisma.tenantCreditBalance.findUnique({ where: { tenantId } });
  if (!balance) return null;
  return {
    ...balance,
    available: balance.planCredits + balance.purchasedCredits - balance.reservedCredits,
  };
}

// ─── RESERVE ────────────────────────────────────────────

export async function reserveCredits(tenantId, callLogId) {
  const reserveAmount = Number(await getSubscriptionConfig("credit_reserve_amount", 20));

  // Pre-flight check — fast fail before touching DB
  const balance = await prisma.tenantCreditBalance.findUnique({ where: { tenantId } });
  if (!balance) {
    const err = new Error("No credit balance found");
    err.status = 402;
    err.code = "NO_CREDIT_BALANCE";
    err.available = 0;
    err.required = reserveAmount;
    throw err;
  }

  const available = balance.planCredits + balance.purchasedCredits - balance.reservedCredits;
  if (available < reserveAmount) {
    const err = new Error("Insufficient credits");
    err.status = 402;
    err.code = "INSUFFICIENT_CREDITS";
    err.available = available;
    err.required = reserveAmount;
    throw err;
  }

  // Atomic reserve — single UPDATE WHERE; zero rows = race condition
  const affected = await prisma.$executeRaw`
    UPDATE "TenantCreditBalance"
    SET "reservedCredits" = "reservedCredits" + ${reserveAmount},
        "updatedAt" = NOW()
    WHERE "tenantId" = ${tenantId}
      AND ("planCredits" + "purchasedCredits" - "reservedCredits") >= ${reserveAmount}
  `;

  if (affected === 0) {
    const err = new Error("Insufficient credits");
    err.status = 402;
    err.code = "INSUFFICIENT_CREDITS";
    err.available = 0;
    err.required = reserveAmount;
    throw err;
  }

  await prisma.$transaction([
    prisma.callLog.update({
      where: { id: callLogId },
      data: { creditsReserved: reserveAmount, reservedAt: new Date() },
    }),
    prisma.creditTransaction.create({
      data: {
        tenantId,
        type: "RESERVE",
        amount: -reserveAmount,
        sourcePool: "PLAN",
        balanceAfter: available - reserveAmount,
        callLogId,
        idempotencyKey: `reserve-${callLogId}`,
      },
    }),
  ]);
}

// ─── SETTLE ─────────────────────────────────────────────

export async function settleCredits(tenantId, callLogId, durationSecs) {
  // Idempotency — webhook retries are no-ops
  const existing = await prisma.creditTransaction.findUnique({
    where: { idempotencyKey: `settle-${callLogId}` },
  });
  if (existing) return;

  const [initFee, perMinute, reserveAmount] = await Promise.all([
    getSubscriptionConfig("credit_init_fee", 2).then(Number),
    getSubscriptionConfig("credit_per_minute", 1).then(Number),
    getSubscriptionConfig("credit_reserve_amount", 20).then(Number),
  ]);

  const actual = initFee + Math.ceil(durationSecs / 60) * perMinute;

  const balance = await prisma.tenantCreditBalance.findUnique({ where: { tenantId } });
  if (!balance) return;

  // Deduct plan credits first, remainder from purchased
  const deductFromPlan = Math.min(balance.planCredits, actual);
  const deductFromPurchased = actual - deductFromPlan;
  const sourcePool = deductFromPurchased > 0 ? "PURCHASED" : "PLAN";
  const balanceAfter =
    balance.planCredits - deductFromPlan +
    (balance.purchasedCredits - deductFromPurchased) -
    (balance.reservedCredits - reserveAmount);

  await prisma.$transaction([
    prisma.tenantCreditBalance.update({
      where: { tenantId },
      data: {
        reservedCredits:          { decrement: reserveAmount },
        planCredits:              { decrement: deductFromPlan },
        purchasedCredits:         { decrement: deductFromPurchased },
        planCreditsUsedThisMonth: { increment: deductFromPlan },
      },
    }),
    prisma.callLog.update({
      where: { id: callLogId },
      data: { creditsCharged: actual },
    }),
    prisma.creditTransaction.create({
      data: {
        tenantId,
        type: "SETTLE",
        amount: -actual,
        sourcePool,
        balanceAfter,
        callLogId,
        idempotencyKey: `settle-${callLogId}`,
      },
    }),
  ]);

  // Async warning check — non-blocking
  checkLowCreditWarnings(tenantId, balanceAfter).catch(() => {});
}

// ─── REFUND ─────────────────────────────────────────────

export async function refundReserve(tenantId, callLogId) {
  const existing = await prisma.creditTransaction.findUnique({
    where: { idempotencyKey: `settle-${callLogId}` },
  });
  if (existing) return;

  const reserveAmount = Number(await getSubscriptionConfig("credit_reserve_amount", 20));
  const balance = await prisma.tenantCreditBalance.findUnique({ where: { tenantId } });
  if (!balance) return;

  const balanceAfter =
    balance.planCredits + balance.purchasedCredits - balance.reservedCredits + reserveAmount;

  await prisma.$transaction([
    prisma.tenantCreditBalance.update({
      where: { tenantId },
      data: { reservedCredits: { decrement: reserveAmount } },
    }),
    prisma.callLog.update({
      where: { id: callLogId },
      data: { creditsCharged: 0 },
    }),
    prisma.creditTransaction.create({
      data: {
        tenantId,
        type: "REFUND",
        amount: reserveAmount,
        sourcePool: "PLAN",
        balanceAfter,
        callLogId,
        idempotencyKey: `settle-${callLogId}`,
      },
    }),
  ]);
}

// ─── MONTHLY GRANT ───────────────────────────────────────

export async function grantMonthlyCredits(tenantId) {
  const now = new Date();
  const month = now.toISOString().slice(0, 7); // "2026-04"
  const idempotencyKey = `monthly-${tenantId}-${month}`;

  const existing = await prisma.creditTransaction.findUnique({ where: { idempotencyKey } });
  if (existing) return;

  const balance = await prisma.tenantCreditBalance.findUnique({ where: { tenantId } });
  if (!balance) return;
  if (!balance.planResetNextAt || balance.planResetNextAt > now) return;

  const subscription = await prisma.tenantSubscription.findUnique({ where: { tenantId } });
  const planDef = subscription
    ? await prisma.planDefinition.findFirst({ where: { plan: subscription.plan } })
    : null;
  const newCredits = planDef?.creditsPerMonth ?? 0;

  const nextReset = new Date(balance.planResetNextAt.getTime() + 30 * 24 * 60 * 60 * 1000);

  await prisma.$transaction([
    prisma.tenantCreditBalance.update({
      where: { tenantId },
      data: {
        planCredits:              newCredits,
        planCreditsAllocated:     newCredits,
        planCreditsUsedThisMonth: 0,
        planResetAt:              now,
        planResetNextAt:          nextReset,
      },
    }),
    prisma.creditTransaction.create({
      data: {
        tenantId,
        type: "MONTHLY_GRANT",
        amount: newCredits,
        sourcePool: "PLAN",
        balanceAfter: newCredits + balance.purchasedCredits,
        idempotencyKey,
      },
    }),
  ]);

  await expirePurchasedCredits(tenantId);
}

// ─── PURCHASE GRANT ──────────────────────────────────────

export async function grantPurchaseCredits(tenantId, packId, providerTxId, billingProvider, amounts = {}) {
  const idempotencyKey = `purchase-${providerTxId}`;

  const existing = await prisma.creditTransaction.findUnique({ where: { idempotencyKey } });
  if (existing) return;

  const pack = await prisma.creditPack.findUnique({ where: { id: packId } });
  if (!pack) throw new Error(`CreditPack ${packId} not found`);

  const totalCredits = pack.credits + pack.bonusCredits;
  const expiryDays = Number(await getSubscriptionConfig("credit_purchased_expiry_days", 365));
  const expiresAt = expiryDays > 0 ? new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000) : null;

  const balance = await prisma.tenantCreditBalance.findUnique({ where: { tenantId } });
  const balanceAfter = (balance?.planCredits ?? 0) + (balance?.purchasedCredits ?? 0) - (balance?.reservedCredits ?? 0) + totalCredits;

  await prisma.$transaction([
    prisma.creditPackPurchase.create({
      data: {
        tenantId,
        packId,
        creditsAtPurchase: totalCredits,
        priceAtPurchase: pack.priceInr,
        amountInr: amounts.inr ?? null,
        amountUsd: amounts.usd ?? null,
        billingProvider,
        providerTxId,
        status: "COMPLETED",
        isRecurring: pack.isRecurring,
        expiresAt,
      },
    }),
    prisma.tenantCreditBalance.update({
      where: { tenantId },
      data: { purchasedCredits: { increment: totalCredits } },
    }),
    prisma.creditTransaction.create({
      data: {
        tenantId,
        type: "PURCHASE",
        amount: totalCredits,
        sourcePool: "PURCHASED",
        balanceAfter,
        idempotencyKey,
      },
    }),
  ]);
}

// ─── STALE RESERVE RELEASE (cron) ────────────────────────

export async function releaseStaleReserves() {
  const timeoutHours = Number(await getSubscriptionConfig("credit_reserve_timeout_hours", 2));
  const cutoff = new Date(Date.now() - timeoutHours * 60 * 60 * 1000);

  const staleLogs = await prisma.callLog.findMany({
    where: {
      creditsReserved: { gt: 0 },
      creditsCharged: null,
      reservedAt: { lt: cutoff },
    },
    select: { id: true, tenantId: true },
  });

  for (const log of staleLogs) {
    // Settle with durationSecs=0 → charges init fee only
    await settleCredits(log.tenantId, log.id, 0).catch(() => {});
  }
}

// ─── EXPIRY (cron) ───────────────────────────────────────

export async function expirePurchasedCredits(tenantId = null) {
  const now = new Date();
  const where = {
    expiresAt: { lte: now },
    status: { in: ["COMPLETED", "ACTIVE_RECURRING"] },
    ...(tenantId ? { tenantId } : {}),
  };

  const expired = await prisma.creditPackPurchase.findMany({ where });

  for (const purchase of expired) {
    const balance = await prisma.tenantCreditBalance.findUnique({ where: { tenantId: purchase.tenantId } });
    if (!balance) continue;

    const idempotencyKey = `expire-${purchase.id}`;
    const existing = await prisma.creditTransaction.findUnique({ where: { idempotencyKey } });
    if (existing) continue;

    // Deduct only what's available (credits may already have been spent)
    const deduct = Math.min(purchase.creditsAtPurchase, balance.purchasedCredits);
    const balanceAfter = balance.planCredits + balance.purchasedCredits - deduct - balance.reservedCredits;

    await prisma.$transaction([
      prisma.tenantCreditBalance.update({
        where: { tenantId: purchase.tenantId },
        data: { purchasedCredits: { decrement: deduct } },
      }),
      prisma.creditPackPurchase.update({
        where: { id: purchase.id },
        data: { status: "CANCELLED" },
      }),
      prisma.creditTransaction.create({
        data: {
          tenantId: purchase.tenantId,
          type: "EXPIRE",
          amount: -deduct,
          sourcePool: "PURCHASED",
          balanceAfter,
          packPurchaseId: purchase.id,
          idempotencyKey,
        },
      }),
    ]);
  }
}

// ─── ADMIN ADJUSTMENT ────────────────────────────────────

export async function adjustCredits(tenantId, amount, reason) {
  const balance = await prisma.tenantCreditBalance.findUnique({ where: { tenantId } });
  if (!balance) throw new Error("No credit balance found");

  const idempotencyKey = `adjust-${tenantId}-${Date.now()}`;
  const isGrant = amount > 0;
  const balanceAfter =
    balance.planCredits + balance.purchasedCredits - balance.reservedCredits + amount;

  await prisma.$transaction([
    prisma.tenantCreditBalance.update({
      where: { tenantId },
      data: isGrant
        ? { purchasedCredits: { increment: amount } }
        : { purchasedCredits: { decrement: Math.abs(amount) } },
    }),
    prisma.creditTransaction.create({
      data: {
        tenantId,
        type: "ADJUSTMENT",
        amount,
        sourcePool: "PURCHASED",
        balanceAfter,
        idempotencyKey,
        description: reason,
      },
    }),
  ]);
}

// ─── TRANSACTION HISTORY ─────────────────────────────────

export async function getCreditTransactions(tenantId, { page = 1, limit = 20, type } = {}) {
  const skip = (page - 1) * limit;
  const where = { tenantId, ...(type ? { type } : {}) };

  const [transactions, total] = await Promise.all([
    prisma.creditTransaction.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.creditTransaction.count({ where }),
  ]);

  return { transactions, total, page, pages: Math.ceil(total / limit) };
}

// ─── INTERNAL: WARNING CHECK ─────────────────────────────

async function checkLowCreditWarnings(tenantId, currentAvailable) {
  const balance = await prisma.tenantCreditBalance.findUnique({ where: { tenantId } });
  if (!balance || balance.planCreditsAllocated === 0) return;

  const [warnPct, warnPct2] = await Promise.all([
    getSubscriptionConfig("credit_low_warning_pct", 20).then(Number),
    getSubscriptionConfig("credit_low_warning_pct_2", 5).then(Number),
  ]);

  const pct = (currentAvailable / balance.planCreditsAllocated) * 100;

  if (pct <= 0) {
    // Pause all active campaigns for this tenant
    await prisma.campaign.updateMany({
      where: { tenantId, status: "ACTIVE" },
      data: {
        status: "PAUSED",
        metadata: { pauseReason: "INSUFFICIENT_CREDITS" },
      },
    });
  }
  // In-app notifications and emails are handled by the UI polling /api/credits/balance
  // Low-credit email sending can be added here in a future iteration
}
