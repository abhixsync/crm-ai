---
title: AI Credits System Implementation Plan
date: 2026-04-07
tags:
  - plan
  - credits
  - billing
  - ai-calling
status: ready
---

# AI Credits System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the broken flat `maxAiCallsPerMonth` system with a reserve-and-settle AI credits system that meters usage by initiation fee + duration, supports credit pack purchases, and is fully configurable by SUPER_ADMIN.

**Architecture:** A `TenantCreditBalance` row per tenant is the fast-read source of truth; an append-only `CreditTransaction` log provides audit history. Credits are atomically reserved before a call and settled (or refunded) when the Twilio/Vonage status callback fires at the new `/api/calls/status` route.

**Tech Stack:** Next.js 16 App Router, Prisma 6 `$transaction()` + `$executeRaw` for atomic balance updates, Vitest for unit tests, ES modules throughout `src/`.

**Spec:** [[2026-04-07-ai-credits-design]]

---

## File Map

### New Files
| File | Responsibility |
|------|---------------|
| `src/lib/credits/credit-service.js` | All credit mutations — single source of truth |
| `src/lib/credits/__tests__/credit-service.test.js` | Unit tests for credit service |
| `src/app/api/calls/status/route.js` | Twilio/Vonage final status callback — settle or refund |
| `src/app/api/credits/balance/route.js` | ADMIN: get credit balance |
| `src/app/api/credits/transactions/route.js` | ADMIN: paginated transaction history |
| `src/app/api/credits/packs/route.js` | ADMIN: list active credit packs |
| `src/app/api/billing/credits/checkout/route.js` | ADMIN: Stripe/Razorpay checkout for pack |
| `src/app/api/billing/credits/cancel-recurring/route.js` | ADMIN: cancel recurring add-on |
| `src/app/api/admin/credit-packs/route.js` | SUPER_ADMIN: list + create packs |
| `src/app/api/admin/credit-packs/[id]/route.js` | SUPER_ADMIN: edit / deactivate pack |
| `src/app/api/admin/credits/adjust/route.js` | SUPER_ADMIN: manual credit adjustment |
| `src/app/api/admin/credits/[tenantId]/route.js` | SUPER_ADMIN: view any tenant balance |

### Modified Files
| File | Change |
|------|--------|
| `prisma/schema.prisma` | 3 new enums, 4 new models, existing model changes |
| `prisma/seed.js` | Credit config keys, plan `creditsPerMonth`, pack catalog |
| `src/lib/subscription/plan-guard.js` | Remove `assertCanMakeAiCall()` |
| `src/lib/subscription/subscription-service.js` | Call `initializeCreditBalance` + update balance on upgrade/downgrade |
| `src/app/api/calls/trigger/route.js` | Add `reserveCredits()` before telephony |
| `src/app/api/calls/demo/route.js` | Add `reserveCredits()` before telephony |
| `src/lib/journey/ai-campaign-service.js` | Add `reserveCredits()` in `stateToCalling()` |
| `src/app/api/cron/subscription-expiry/route.js` | Add stale reserves, expiry, monthly grant |
| `src/app/api/billing/stripe/webhook/route.js` | Route by `metadata.purchaseType` |
| `src/app/api/billing/razorpay/webhook/route.js` | Route by `metadata.purchaseType` |
| `src/app/api/dashboard/metrics/route.js` | Include credit summary |
| `src/components/shells/modern/modern-shell.js` | Add navbar credit widget |
| `src/components/modern/dashboard-view.js` | Add credits metrics tile |
| `src/components/modern/billing-view.js` | Add Credits section |

---

## Task 1: Schema — New Enums + New Models

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add three new enums after the existing enums**

```prisma
enum CreditTransactionType {
  MONTHLY_GRANT
  RESERVE
  SETTLE
  PURCHASE
  SUBSCRIPTION_GRANT
  EXPIRE
  ADJUSTMENT
  REFUND
}

enum CreditPool {
  PLAN
  PURCHASED
}

enum PurchaseStatus {
  PENDING
  COMPLETED
  FAILED
  ACTIVE_RECURRING
  RENEWAL_FAILED
  CANCELLED
  REFUNDED
}
```

- [ ] **Step 2: Add four new models before the closing of the schema**

```prisma
model TenantCreditBalance {
  id                       String    @id @default(cuid())
  tenantId                 String    @unique
  planCredits              Int       @default(0)
  purchasedCredits         Int       @default(0)
  reservedCredits          Int       @default(0)
  planCreditsAllocated     Int       @default(0)
  planCreditsUsedThisMonth Int       @default(0)
  planResetAt              DateTime?
  planResetNextAt          DateTime?
  createdAt                DateTime  @default(now())
  updatedAt                DateTime  @updatedAt

  tenant Tenant @relation(fields: [tenantId], references: [id])
}

model CreditTransaction {
  id               String                @id @default(cuid())
  tenantId         String
  type             CreditTransactionType
  amount           Int
  sourcePool       CreditPool
  balanceAfter     Int
  callLogId        String?
  packPurchaseId   String?
  idempotencyKey   String                @unique
  description      String?
  meta             Json?
  createdAt        DateTime              @default(now())

  tenant Tenant @relation(fields: [tenantId], references: [id])

  @@index([tenantId, createdAt])
  @@index([callLogId])
  @@index([tenantId, type])
}

model CreditPack {
  id             String    @id @default(cuid())
  name           String
  credits        Int
  bonusCredits   Int       @default(0)
  priceInr       Decimal
  priceUsd       Decimal
  isRecurring    Boolean   @default(false)
  billingCycle   BillingCycle?
  isActive       Boolean   @default(true)
  sortOrder      Int       @default(0)
  stripePriceId  String?
  razorpayPlanId String?
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  purchases CreditPackPurchase[]
}

model CreditPackPurchase {
  id                     String          @id @default(cuid())
  tenantId               String
  packId                 String
  creditsAtPurchase      Int
  priceAtPurchase        Decimal
  amountInr              Decimal?
  amountUsd              Decimal?
  billingProvider        BillingProvider
  providerTxId           String?
  stripeSubscriptionId   String?
  razorpaySubscriptionId String?
  status                 PurchaseStatus
  isRecurring            Boolean         @default(false)
  nextRenewalAt          DateTime?
  renewalCount           Int             @default(0)
  expiresAt              DateTime?
  createdAt              DateTime        @default(now())
  updatedAt              DateTime        @updatedAt

  tenant Tenant     @relation(fields: [tenantId], references: [id])
  pack   CreditPack @relation(fields: [packId], references: [id])

  @@index([tenantId, status])
  @@index([tenantId, createdAt])
  @@index([tenantId, expiresAt])
}
```

---

## Task 2: Schema — Existing Model Changes

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add `creditsPerMonth` to `PlanDefinition`**

Find the `PlanDefinition` model. Add after the last `max*` field:
```prisma
creditsPerMonth Int @default(0)
```

- [ ] **Step 2: Add three fields to `CallLog`**

Find the `CallLog` model. Add after `durationSecs`:
```prisma
creditsReserved Int?
creditsCharged  Int?
reservedAt      DateTime?
```

- [ ] **Step 3: Add back-relations to `Tenant`**

Find the `Tenant` model. Add with the other relations:
```prisma
creditBalance       TenantCreditBalance?
creditTransactions  CreditTransaction[]
creditPackPurchases CreditPackPurchase[]
```

- [ ] **Step 4: Generate and apply migration**

```bash
npm run db:migrate
```

Expected: migration created and applied, Prisma client regenerated.

- [ ] **Step 5: Verify TypeScript types updated**

```bash
npx tsc --noEmit
```

Expected: no errors on the new model fields.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add AI credits schema — 4 new models, 3 enums, existing model changes"
```

---

## Task 3: Seed — Credit Config + Plan Credits + Pack Catalog

**Files:**
- Modify: `prisma/seed.js`

- [ ] **Step 1: Add credit config keys to `seedSubscriptionConfig()`**

In `prisma/seed.js`, find the `configs` array in `seedSubscriptionConfig()`. Add these entries:
```js
{ key: "credit_init_fee",              value: 2 },
{ key: "credit_per_minute",            value: 1 },
{ key: "credit_reserve_amount",        value: 20 },
{ key: "credit_low_warning_pct",       value: 20 },
{ key: "credit_low_warning_pct_2",     value: 5 },
{ key: "credit_purchased_expiry_days", value: 365 },
{ key: "credit_reserve_timeout_hours", value: 2 },
```

- [ ] **Step 2: Add `creditsPerMonth` to each plan in `seedPlanDefinitions()`**

In each plan object in the `plans` array, add `creditsPerMonth` and set `maxAiCallsPerMonth: -1`:

```js
// FREE plan: add
creditsPerMonth: 0,
maxAiCallsPerMonth: -1,

// PLUS plan: add
creditsPerMonth: 100,
maxAiCallsPerMonth: -1,

// PRO plan: add
creditsPerMonth: 500,
maxAiCallsPerMonth: -1,

// MAX plan: add
creditsPerMonth: 2000,
maxAiCallsPerMonth: -1,
```

- [ ] **Step 3: Add `seedCreditPacks()` function**

Add this new function after `seedSubscriptionConfig()`:
```js
async function seedCreditPacks() {
  const packs = [
    { name: "Micro",        credits: 100,   bonusCredits: 0, priceInr: 49,   priceUsd: 0.60, isRecurring: false, sortOrder: 1 },
    { name: "Starter",      credits: 300,   bonusCredits: 0, priceInr: 149,  priceUsd: 2.00, isRecurring: false, sortOrder: 2 },
    { name: "Standard",     credits: 1000,  bonusCredits: 0, priceInr: 399,  priceUsd: 5.00, isRecurring: false, sortOrder: 3 },
    { name: "Pro Pack",     credits: 3000,  bonusCredits: 0, priceInr: 999,  priceUsd: 12.00, isRecurring: false, sortOrder: 4 },
    { name: "Power Pack",   credits: 10000, bonusCredits: 0, priceInr: 2999, priceUsd: 36.00, isRecurring: false, sortOrder: 5 },
    { name: "Basic Add-on",    credits: 500,  bonusCredits: 0, priceInr: 199,  priceUsd: 2.50,  isRecurring: true, billingCycle: "MONTHLY", sortOrder: 6 },
    { name: "Standard Add-on", credits: 2000, bonusCredits: 0, priceInr: 699,  priceUsd: 8.50,  isRecurring: true, billingCycle: "MONTHLY", sortOrder: 7 },
  ];

  for (const pack of packs) {
    const existing = await prisma.creditPack.findFirst({ where: { name: pack.name } });
    if (!existing) {
      await prisma.creditPack.create({ data: pack });
    }
  }
  console.log("✓ CreditPacks seeded");
}
```

- [ ] **Step 4: Call `seedCreditPacks()` in the main function**

Find the `main()` function and add `await seedCreditPacks();` after `seedSubscriptionConfig()`.

- [ ] **Step 5: Run seed**

```bash
npm run db:seed
```

Expected: `✓ SubscriptionConfig seeded`, `✓ CreditPacks seeded`, `✓ Plan definitions seeded`.

- [ ] **Step 6: Commit**

```bash
git add prisma/seed.js
git commit -m "feat: seed credit config keys, plan creditsPerMonth, and pack catalog"
```

---

## Task 4: Credit Service — Core Operations

**Files:**
- Create: `src/lib/credits/credit-service.js`

> [!important]
> All mutations use `prisma.$transaction()`. Config values are always read from `getSubscriptionConfig()` — never hardcoded. The `$executeRaw` reserve is the only raw SQL in this file.

- [ ] **Step 1: Create `src/lib/credits/credit-service.js`**

```js
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
```

- [ ] **Step 2: Verify file is syntactically valid**

```bash
npx tsc --noEmit
```

Expected: no errors related to `credit-service.js`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/credits/credit-service.js
git commit -m "feat: add credit service — reserve, settle, refund, grant, expiry, adjust"
```

---

## Task 5: Credit Service Tests

**Files:**
- Create: `src/lib/credits/__tests__/credit-service.test.js`

- [ ] **Step 1: Create test file**

```js
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock prisma
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
    $transaction: vi.fn((ops) => Promise.all(ops)),
    $executeRaw: vi.fn(),
  },
}));

// Mock subscription service config
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
    planResetNextAt: new Date(Date.now() - 1000), // overdue
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  prisma.$executeRaw.mockResolvedValue(1); // 1 row affected = success
});

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

describe("reserveCredits", () => {
  it("throws 402 INSUFFICIENT_CREDITS when balance is too low", async () => {
    prisma.tenantCreditBalance.findUnique.mockResolvedValue(
      makeBalance({ planCredits: 10, purchasedCredits: 0, reservedCredits: 0 })
    );
    await expect(reserveCredits(TENANT, CALL_ID)).rejects.toMatchObject({
      status: 402,
      code: "INSUFFICIENT_CREDITS",
    });
  });

  it("throws 402 NO_CREDIT_BALANCE when no balance row", async () => {
    prisma.tenantCreditBalance.findUnique.mockResolvedValue(null);
    await expect(reserveCredits(TENANT, CALL_ID)).rejects.toMatchObject({
      code: "NO_CREDIT_BALANCE",
    });
  });

  it("throws 402 when atomic update affects 0 rows (race condition)", async () => {
    prisma.tenantCreditBalance.findUnique.mockResolvedValue(makeBalance());
    prisma.$executeRaw.mockResolvedValue(0); // race condition — no rows updated
    await expect(reserveCredits(TENANT, CALL_ID)).rejects.toMatchObject({
      code: "INSUFFICIENT_CREDITS",
    });
  });

  it("updates CallLog and logs RESERVE transaction on success", async () => {
    prisma.tenantCreditBalance.findUnique.mockResolvedValue(makeBalance());
    prisma.$executeRaw.mockResolvedValue(1);
    prisma.$transaction.mockResolvedValue([{}, {}]);

    await reserveCredits(TENANT, CALL_ID);

    expect(prisma.$transaction).toHaveBeenCalledOnce();
    const [ops] = prisma.$transaction.mock.calls[0];
    // ops[0] = callLog.update, ops[1] = creditTransaction.create
    expect(ops).toHaveLength(2);
  });
});

describe("settleCredits", () => {
  it("is a no-op when idempotency key already exists", async () => {
    prisma.creditTransaction.findUnique.mockResolvedValue({ id: "existing" });
    await settleCredits(TENANT, CALL_ID, 120);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("charges init fee + ceil(duration/60) * perMinute", async () => {
    // config defaults: initFee=2, perMinute=1, reserveAmount=20
    prisma.creditTransaction.findUnique.mockResolvedValue(null);
    prisma.tenantCreditBalance.findUnique.mockResolvedValue(makeBalance());
    prisma.$transaction.mockResolvedValue([{}, {}, {}]);

    await settleCredits(TENANT, CALL_ID, 120); // 2-min call → 2 + ceil(120/60)*1 = 4

    const [ops] = prisma.$transaction.mock.calls[0];
    const txCreate = ops[2]; // creditTransaction.create
    // The amount should be -4
    expect(txCreate.data.amount).toBe(-4);
  });

  it("deducts from plan first, then purchased", async () => {
    prisma.creditTransaction.findUnique.mockResolvedValue(null);
    // Only 1 plan credit left, actual=4 → needs 3 from purchased
    prisma.tenantCreditBalance.findUnique.mockResolvedValue(
      makeBalance({ planCredits: 1, purchasedCredits: 100, reservedCredits: 20 })
    );
    prisma.$transaction.mockResolvedValue([{}, {}, {}]);

    await settleCredits(TENANT, CALL_ID, 120); // actual=4

    const [ops] = prisma.$transaction.mock.calls[0];
    const balanceUpdate = ops[0];
    expect(balanceUpdate.data.planCredits.decrement).toBe(1);
    expect(balanceUpdate.data.purchasedCredits.decrement).toBe(3);
  });
});

describe("refundReserve", () => {
  it("is a no-op when idempotency key already exists", async () => {
    prisma.creditTransaction.findUnique.mockResolvedValue({ id: "existing" });
    await refundReserve(TENANT, CALL_ID);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("releases reserve and logs REFUND with creditsCharged=0", async () => {
    prisma.creditTransaction.findUnique.mockResolvedValue(null);
    prisma.tenantCreditBalance.findUnique.mockResolvedValue(makeBalance({ reservedCredits: 20 }));
    prisma.$transaction.mockResolvedValue([{}, {}, {}]);

    await refundReserve(TENANT, CALL_ID);

    const [ops] = prisma.$transaction.mock.calls[0];
    expect(ops[0].data.reservedCredits.decrement).toBe(20);
    expect(ops[1].data.creditsCharged).toBe(0);
    expect(ops[2].data.type).toBe("REFUND");
  });
});

describe("grantMonthlyCredits", () => {
  it("is a no-op when idempotency key already exists", async () => {
    prisma.creditTransaction.findUnique.mockResolvedValue({ id: "existing" });
    await grantMonthlyCredits(TENANT);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("is a no-op when planResetNextAt is in the future", async () => {
    prisma.creditTransaction.findUnique.mockResolvedValue(null);
    prisma.tenantCreditBalance.findUnique.mockResolvedValue(
      makeBalance({ planResetNextAt: new Date(Date.now() + 999999) })
    );
    await grantMonthlyCredits(TENANT);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they pass**

```bash
npm test src/lib/credits/__tests__/credit-service.test.js
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/lib/credits/__tests__/credit-service.test.js
git commit -m "test: add unit tests for credit service core operations"
```

---

## Task 6: Plan Guard — Remove assertCanMakeAiCall

**Files:**
- Modify: `src/lib/subscription/plan-guard.js`

- [ ] **Step 1: Read the current `assertCanMakeAiCall` implementation**

Read `src/lib/subscription/plan-guard.js` and find `assertCanMakeAiCall()`.

- [ ] **Step 2: Remove `assertCanMakeAiCall()` and `incrementAiCallUsage()` calls from guard**

Delete the `assertCanMakeAiCall()` method from the returned guard object. Keep `assertHasFeature("hasAiCalling")` — that still blocks FREE plan.

> [!warning]
> Do NOT remove `assertHasFeature`. Only remove `assertCanMakeAiCall`. The feature gate keeps FREE plan blocked even after credits are gone.

- [ ] **Step 3: Run existing tests to confirm nothing breaks**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/subscription/plan-guard.js
git commit -m "feat: remove assertCanMakeAiCall from plan-guard — replaced by credit reserve check"
```

---

## Task 7: Subscription Service — Credit Balance Integration

**Files:**
- Modify: `src/lib/subscription/subscription-service.js`

- [ ] **Step 1: Import `initializeCreditBalance` and `grantMonthlyCredits` at top of file**

```js
import { initializeCreditBalance, grantMonthlyCredits } from "@/lib/credits/credit-service";
```

- [ ] **Step 2: In `createTrialSubscription()`, initialize credit balance after creating the subscription**

Find where `createTrialSubscription` creates the `TenantSubscription`. After that creation succeeds, add:

```js
// Initialize credit balance with PRO credits (trial plan)
const proPlan = await prisma.planDefinition.findFirst({ where: { plan: "PRO" } });
await initializeCreditBalance(tenantId, proPlan?.creditsPerMonth ?? 500, trialEndsAt);
```

- [ ] **Step 3: In `upgradePlan()`, update credit balance**

Find `upgradePlan()`. After the subscription is updated, add:

```js
// Grant new plan's credits immediately (no proration)
const newPlanDef = await prisma.planDefinition.findFirst({ where: { plan: data.plan } });
const newCredits = newPlanDef?.creditsPerMonth ?? 0;
const nextReset = data.currentPeriodEnd ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

await prisma.tenantCreditBalance.upsert({
  where: { tenantId },
  update: {
    planCredits: newCredits,
    planCreditsAllocated: newCredits,
    planCreditsUsedThisMonth: 0,
    planResetNextAt: nextReset,
  },
  create: {
    tenantId,
    planCredits: newCredits,
    planCreditsAllocated: newCredits,
    planResetNextAt: nextReset,
  },
});
```

- [ ] **Step 4: In `downgradeToFree()`, update plan credits but keep purchased credits**

Find `downgradeToFree()`. Add after the subscription update:

```js
// Downgrade plan credits — purchased credits are preserved
const freePlan = await prisma.planDefinition.findFirst({ where: { plan: "FREE" } });
await prisma.tenantCreditBalance.updateMany({
  where: { tenantId },
  data: {
    planCredits: freePlan?.creditsPerMonth ?? 0,
    planCreditsAllocated: freePlan?.creditsPerMonth ?? 0,
  },
});
```

- [ ] **Step 5: Run tests**

```bash
npm test
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/subscription/subscription-service.js
git commit -m "feat: integrate credit balance init/update into subscription lifecycle"
```

---

## Task 8: New Status Webhook Route — Settle / Refund

**Files:**
- Create: `src/app/api/calls/status/route.js`

> [!note]
> This route already exists as a referenced URL in `ai-campaign-service.js` (line 98) and `trigger/route.js` but has never been created. Twilio sends the final call status here (completed/failed/busy/no-answer).

- [ ] **Step 1: Create the route**

```js
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { settleCredits, refundReserve } from "@/lib/credits/credit-service";

/**
 * POST /api/calls/status
 *
 * Twilio/Vonage final call status callback.
 * Query params: callLogId, tenantId
 *
 * Handles credit settlement or refund based on call outcome.
 */
export async function POST(req) {
  const { searchParams } = new URL(req.url);
  const callLogId = searchParams.get("callLogId");
  const tenantId  = searchParams.get("tenantId");

  if (!callLogId || !tenantId) {
    return NextResponse.json({ error: "Missing callLogId or tenantId" }, { status: 400 });
  }

  let body;
  try {
    // Twilio sends form-encoded data
    const text = await req.text();
    body = Object.fromEntries(new URLSearchParams(text));
  } catch {
    body = {};
  }

  const callStatus   = (body.CallStatus || body.status || "").toLowerCase();
  const durationSecs = parseInt(body.CallDuration || body.duration || "0", 10);

  try {
    // Verify the callLog belongs to this tenant (security check)
    const callLog = await prisma.callLog.findFirst({
      where: { id: callLogId, tenantId },
      select: { id: true, creditsReserved: true },
    });

    if (!callLog) {
      return NextResponse.json({ received: true }); // silently ignore unknown calls
    }

    // Only process if credits were actually reserved
    if (!callLog.creditsReserved) {
      return NextResponse.json({ received: true });
    }

    if (callStatus === "completed") {
      await settleCredits(tenantId, callLogId, durationSecs);
    } else {
      // failed, busy, no-answer, canceled → full refund
      await refundReserve(tenantId, callLogId);
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("[calls/status] error:", err);
    return NextResponse.json({ received: true }); // always 200 to Twilio — prevent retries on our errors
  }
}
```

- [ ] **Step 2: Verify the URL is passed correctly from trigger route**

Read `src/app/api/calls/trigger/route.js`. Confirm the `statusCallbackUrl` is set to `${baseUrl}/api/calls/status?tenantId=${tenantId}&callLogId=${callLog.id}`. If `tenantId` and `callLogId` are not in the current URL, add them.

Look for how `statusCallbackUrl` is constructed and passed to `initiateTelephonyCallWithFailover`. Ensure it includes query params: `?tenantId=${tenantId}&callLogId=${callLog.id}`.

- [ ] **Step 3: Do the same for `ai-campaign-service.js` (line 98)**

The current line is:
```js
const statusCallbackUrl = isPublicHttpsUrl(baseUrl) ? `${baseUrl}/api/calls/status` : undefined;
```

Update it to include `tenantId` and `callLogId`:
```js
const statusCallbackUrl = isPublicHttpsUrl(baseUrl)
  ? `${baseUrl}/api/calls/status?tenantId=${state.customer.tenantId}&callLogId=${state.callLogId}`
  : undefined;
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/calls/status/route.js src/lib/journey/ai-campaign-service.js
git commit -m "feat: add /api/calls/status webhook — settles or refunds credits on call completion"
```

---

## Task 9: Call Trigger Route — Add reserveCredits

**Files:**
- Modify: `src/app/api/calls/trigger/route.js`

- [ ] **Step 1: Import credit service**

Add to imports at top of file:
```js
import { reserveCredits } from "@/lib/credits/credit-service";
```

- [ ] **Step 2: Read the existing route handler to find the correct insertion point**

Read `src/app/api/calls/trigger/route.js`. Find:
1. Where `assertHasFeature("hasAiCalling")` is called (keep this)
2. Where `assertCanMakeAiCall()` is called (this was removed from plan-guard, but remove any call to it here too)
3. Where the `CallLog` is created
4. Where `initiateTelephonyCallWithFailover` is called

- [ ] **Step 3: Add credit reserve after CallLog creation, before telephony**

After the CallLog is created (you have `callLog.id`), add:

```js
// Reserve credits — throws 402 if insufficient
try {
  await reserveCredits(tenantId, callLog.id);
} catch (err) {
  // Mark the CallLog as failed and return 402
  await prisma.callLog.update({
    where: { id: callLog.id },
    data: { status: "FAILED", errorReason: err.code ?? "INSUFFICIENT_CREDITS" },
  }).catch(() => {});

  return Response.json(
    { error: err.message, code: err.code, available: err.available, required: err.required },
    { status: 402 }
  );
}
```

- [ ] **Step 4: Ensure `statusCallbackUrl` includes tenantId and callLogId**

Find where `statusCallbackUrl` is built. Update it to:
```js
const statusCallbackUrl = isPublicHttpsUrl(baseUrl)
  ? `${baseUrl}/api/calls/status?tenantId=${tenantId}&callLogId=${callLog.id}`
  : undefined;
```

- [ ] **Step 5: In the error handler at the bottom of the route, add refund for reserved credits**

Find the `catch` block that sets `CallLog.status = FAILED`. Before or after that, add:
```js
import { refundReserve } from "@/lib/credits/credit-service";

// In catch block:
if (callLog?.id) {
  await refundReserve(tenantId, callLog.id).catch(() => {});
}
```

- [ ] **Step 6: Commit**

```bash
git add src/app/api/calls/trigger/route.js
git commit -m "feat: reserve credits in /api/calls/trigger before initiating telephony"
```

---

## Task 10: Call Demo Route — Add reserveCredits

**Files:**
- Modify: `src/app/api/calls/demo/route.js`

Same pattern as Task 9. Read the file, then:

- [ ] **Step 1: Import `reserveCredits` and `refundReserve`**

- [ ] **Step 2: Remove any `assertCanMakeAiCall()` call**

- [ ] **Step 3: After CallLog creation, add `reserveCredits(tenantId, callLog.id)` with same 402 handler**

- [ ] **Step 4: In the failure path, add `refundReserve(tenantId, callLog.id)`**

- [ ] **Step 5: Update `statusCallbackUrl` to include `tenantId` and `callLogId`**

- [ ] **Step 6: Commit**

```bash
git add src/app/api/calls/demo/route.js
git commit -m "feat: reserve credits in /api/calls/demo before initiating telephony"
```

---

## Task 11: Campaign Service — Add reserveCredits in stateToCalling

**Files:**
- Modify: `src/lib/journey/ai-campaign-service.js`

- [ ] **Step 1: Add import at top of file**

```js
import { reserveCredits } from "@/lib/credits/credit-service";
```

- [ ] **Step 2: In `stateToCalling()`, add reserve after CallLog creation (after line 77)**

After `return { ...state, callLogId: createdCall.id }` is about to be called, add:

```js
async function stateToCalling(state) {
  const createdCall = await prisma.callLog.create({ /* existing */ });

  await applyCustomerTransition({ /* existing */ });

  // Reserve credits — if insufficient, pause the campaign
  try {
    await reserveCredits(state.customer.tenantId, createdCall.id);
  } catch (err) {
    // Pause campaign to prevent continued attempts
    await prisma.campaign.updateMany({
      where: {
        tenantId: state.customer.tenantId,
        status: "ACTIVE",
      },
      data: {
        status: "PAUSED",
        metadata: { pauseReason: "INSUFFICIENT_CREDITS" },
      },
    }).catch(() => {});

    await prisma.callLog.update({
      where: { id: createdCall.id },
      data: { status: "FAILED", errorReason: "INSUFFICIENT_CREDITS" },
    }).catch(() => {});

    throw err; // propagate to LangGraph — halts execution
  }

  return { ...state, callLogId: createdCall.id };
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/journey/ai-campaign-service.js
git commit -m "feat: reserve credits in campaign stateToCalling — pauses campaign on insufficient credits"
```

---

## Task 12: Cron Route — Stale Reserves + Expiry + Monthly Grants

**Files:**
- Modify: `src/app/api/cron/subscription-expiry/route.js`

- [ ] **Step 1: Import credit service functions**

```js
import { releaseStaleReserves, expirePurchasedCredits, grantMonthlyCredits } from "@/lib/credits/credit-service";
```

- [ ] **Step 2: Add credit cron steps before the domain verification sweep**

Read the file and find where `runSubscriptionExpiryCron()` is called. After it completes, add:

```js
// 1. Release stale reserves (calls that never received a status webhook)
await releaseStaleReserves();

// 2. Run monthly credit grants for all tenants due for reset
const dueBalances = await prisma.tenantCreditBalance.findMany({
  where: { planResetNextAt: { lte: new Date() } },
  select: { tenantId: true },
});
for (const { tenantId } of dueBalances) {
  await grantMonthlyCredits(tenantId).catch((err) =>
    console.error(`[cron] monthly grant failed for ${tenantId}:`, err)
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/cron/subscription-expiry/route.js
git commit -m "feat: add credit cron steps — stale reserves, expiry, monthly grants"
```

---

## Task 13: Stripe Webhook — purchaseType Routing

**Files:**
- Modify: `src/app/api/billing/stripe/webhook/route.js`

- [ ] **Step 1: Import `grantPurchaseCredits`**

```js
import { grantPurchaseCredits } from "@/lib/credits/credit-service";
```

- [ ] **Step 2: In the `checkout.session.completed` handler, check `purchaseType`**

Find the block handling `checkout.session.completed`. Add a branch before the existing `upgradePlan()` call:

```js
case "checkout.session.completed": {
  const session = event.data.object;
  const tenantId = session.metadata?.tenantId || session.client_reference_id;
  const purchaseType = session.metadata?.purchaseType;

  if (purchaseType === "credit_pack") {
    // Credit pack purchase
    const packId = session.metadata?.packId;
    await grantPurchaseCredits(tenantId, packId, session.payment_intent || session.id, "STRIPE", {
      usd: session.amount_total ? session.amount_total / 100 : null,
    });
    break;
  }

  // Existing plan subscription flow
  // ... (existing upgradePlan call stays here)
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/billing/stripe/webhook/route.js
git commit -m "feat: route Stripe checkout.session by purchaseType — credit_pack grants credits"
```

---

## Task 14: Razorpay Webhook — purchaseType Routing

**Files:**
- Modify: `src/app/api/billing/razorpay/webhook/route.js`

Same pattern as Task 13:

- [ ] **Step 1: Import `grantPurchaseCredits`**

- [ ] **Step 2: In `subscription.activated` handler, check `notes.purchaseType`**

Razorpay passes metadata via `notes`. Check `subscriptionEntity?.notes?.purchaseType`:

```js
case "subscription.activated": {
  const purchaseType = subscriptionEntity?.notes?.purchaseType;

  if (purchaseType === "credit_pack") {
    const packId = subscriptionEntity?.notes?.packId;
    await grantPurchaseCredits(tenantId, packId, rzpSubId, "RAZORPAY", {
      inr: paymentEntity?.amount ? paymentEntity.amount / 100 : null,
    });
    break;
  }

  // Existing plan upgrade flow
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/billing/razorpay/webhook/route.js
git commit -m "feat: route Razorpay subscription.activated by purchaseType"
```

---

## Task 15: Credit API Endpoints — Balance, Transactions, Packs

**Files:**
- Create: `src/app/api/credits/balance/route.js`
- Create: `src/app/api/credits/transactions/route.js`
- Create: `src/app/api/credits/packs/route.js`

- [ ] **Step 1: Create balance endpoint**

```js
// src/app/api/credits/balance/route.js
import { NextResponse } from "next/server";
import { requireSession, getTenantContext, hasRole } from "@/lib/server/auth-guard";
import { getCreditBalance } from "@/lib/credits/credit-service";

export async function GET(req) {
  const auth = await requireSession();
  if (auth.error) return auth.error;
  if (!hasRole(auth.session, ["ADMIN", "SALES"])) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { tenantId } = getTenantContext(auth.session, req);
  const balance = await getCreditBalance(tenantId);

  if (!balance) {
    return NextResponse.json({ available: 0, planCredits: 0, purchasedCredits: 0, reservedCredits: 0 });
  }

  return NextResponse.json(balance);
}
```

- [ ] **Step 2: Create transactions endpoint**

```js
// src/app/api/credits/transactions/route.js
import { NextResponse } from "next/server";
import { requireSession, getTenantContext, hasRole } from "@/lib/server/auth-guard";
import { getCreditTransactions } from "@/lib/credits/credit-service";

export async function GET(req) {
  const auth = await requireSession();
  if (auth.error) return auth.error;
  if (!hasRole(auth.session, ["ADMIN", "SALES"])) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { tenantId } = getTenantContext(auth.session, req);
  const { searchParams } = new URL(req.url);
  const page  = parseInt(searchParams.get("page") || "1", 10);
  const limit = parseInt(searchParams.get("limit") || "20", 10);
  const type  = searchParams.get("type") || undefined;

  const result = await getCreditTransactions(tenantId, { page, limit, type });
  return NextResponse.json(result);
}
```

- [ ] **Step 3: Create packs endpoint**

```js
// src/app/api/credits/packs/route.js
import { NextResponse } from "next/server";
import { requireSession, hasRole } from "@/lib/server/auth-guard";
import { prisma } from "@/lib/prisma";

export async function GET(req) {
  const auth = await requireSession();
  if (auth.error) return auth.error;
  if (!hasRole(auth.session, ["ADMIN", "SALES"])) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const packs = await prisma.creditPack.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
  });

  return NextResponse.json({ packs });
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/credits/
git commit -m "feat: add /api/credits/balance, /transactions, /packs endpoints"
```

---

## Task 16: Credit Checkout + Cancel-Recurring Endpoints

**Files:**
- Create: `src/app/api/billing/credits/checkout/route.js`
- Create: `src/app/api/billing/credits/cancel-recurring/route.js`

- [ ] **Step 1: Create checkout endpoint**

```js
// src/app/api/billing/credits/checkout/route.js
import { NextResponse } from "next/server";
import { requireSession, getTenantContext, hasRole } from "@/lib/server/auth-guard";
import { prisma } from "@/lib/prisma";
import { getSubscriptionConfig } from "@/lib/subscription/subscription-service";
import Stripe from "stripe";

export async function POST(req) {
  const auth = await requireSession();
  if (auth.error) return auth.error;
  if (!hasRole(auth.session, ["ADMIN"])) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { packId } = await req.json();
  if (!packId) return NextResponse.json({ error: "packId required" }, { status: 400 });

  const { tenantId } = getTenantContext(auth.session, req);

  const pack = await prisma.creditPack.findUnique({ where: { id: packId } });
  if (!pack || !pack.isActive) {
    return NextResponse.json({ error: "Pack not found or inactive" }, { status: 404 });
  }

  const stripeEnabled = await getSubscriptionConfig("stripe_enabled", false);
  if (!stripeEnabled || !process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 400 });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const baseUrl = process.env.APP_BASE_URL || process.env.NEXTAUTH_URL;

  const session = await stripe.checkout.sessions.create({
    mode: pack.isRecurring ? "subscription" : "payment",
    line_items: [{
      price_data: {
        currency: "usd",
        unit_amount: Math.round(Number(pack.priceUsd) * 100),
        product_data: { name: `${pack.name} — ${pack.credits} AI Credits` },
        ...(pack.isRecurring ? { recurring: { interval: "month" } } : {}),
      },
      quantity: 1,
    }],
    metadata: {
      purchaseType: "credit_pack",
      tenantId,
      packId: pack.id,
    },
    success_url: `${baseUrl}/admin/billing?credit_success=1`,
    cancel_url:  `${baseUrl}/admin/billing?credit_cancelled=1`,
  });

  return NextResponse.json({ url: session.url });
}
```

- [ ] **Step 2: Create cancel-recurring endpoint**

```js
// src/app/api/billing/credits/cancel-recurring/route.js
import { NextResponse } from "next/server";
import { requireSession, getTenantContext, hasRole } from "@/lib/server/auth-guard";
import { prisma } from "@/lib/prisma";

export async function POST(req) {
  const auth = await requireSession();
  if (auth.error) return auth.error;
  if (!hasRole(auth.session, ["ADMIN"])) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { purchaseId } = await req.json();
  const { tenantId } = getTenantContext(auth.session, req);

  const purchase = await prisma.creditPackPurchase.findFirst({
    where: { id: purchaseId, tenantId, status: "ACTIVE_RECURRING" },
  });

  if (!purchase) {
    return NextResponse.json({ error: "Active recurring purchase not found" }, { status: 404 });
  }

  // Cancel in Stripe if applicable
  if (purchase.stripeSubscriptionId && process.env.STRIPE_SECRET_KEY) {
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    await stripe.subscriptions.cancel(purchase.stripeSubscriptionId).catch(() => {});
  }

  await prisma.creditPackPurchase.update({
    where: { id: purchaseId },
    data: { status: "CANCELLED" },
  });

  return NextResponse.json({ success: true });
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/billing/credits/
git commit -m "feat: add credit checkout and cancel-recurring billing endpoints"
```

---

## Task 17: SUPER_ADMIN Credit APIs

**Files:**
- Create: `src/app/api/admin/credit-packs/route.js`
- Create: `src/app/api/admin/credit-packs/[id]/route.js`
- Create: `src/app/api/admin/credits/adjust/route.js`
- Create: `src/app/api/admin/credits/[tenantId]/route.js`

- [ ] **Step 1: Create pack list + create endpoint**

```js
// src/app/api/admin/credit-packs/route.js
import { NextResponse } from "next/server";
import { requireSession, hasRole } from "@/lib/server/auth-guard";
import { prisma } from "@/lib/prisma";

export async function GET(req) {
  const auth = await requireSession();
  if (auth.error) return auth.error;
  if (!hasRole(auth.session, ["SUPER_ADMIN"])) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const packs = await prisma.creditPack.findMany({ orderBy: { sortOrder: "asc" } });
  return NextResponse.json({ packs });
}

export async function POST(req) {
  const auth = await requireSession();
  if (auth.error) return auth.error;
  if (!hasRole(auth.session, ["SUPER_ADMIN"])) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const data = await req.json();
  const pack = await prisma.creditPack.create({ data });
  return NextResponse.json({ pack }, { status: 201 });
}
```

- [ ] **Step 2: Create pack edit + deactivate endpoint**

```js
// src/app/api/admin/credit-packs/[id]/route.js
import { NextResponse } from "next/server";
import { requireSession, hasRole } from "@/lib/server/auth-guard";
import { prisma } from "@/lib/prisma";

export async function PUT(req, { params }) {
  const auth = await requireSession();
  if (auth.error) return auth.error;
  if (!hasRole(auth.session, ["SUPER_ADMIN"])) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const data = await req.json();
  const pack = await prisma.creditPack.update({ where: { id: params.id }, data });
  return NextResponse.json({ pack });
}

export async function DELETE(req, { params }) {
  const auth = await requireSession();
  if (auth.error) return auth.error;
  if (!hasRole(auth.session, ["SUPER_ADMIN"])) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Soft delete — deactivate, don't remove (preserves purchase history)
  await prisma.creditPack.update({ where: { id: params.id }, data: { isActive: false } });
  return NextResponse.json({ success: true });
}
```

- [ ] **Step 3: Create manual adjustment endpoint**

```js
// src/app/api/admin/credits/adjust/route.js
import { NextResponse } from "next/server";
import { requireSession, hasRole } from "@/lib/server/auth-guard";
import { adjustCredits } from "@/lib/credits/credit-service";

export async function POST(req) {
  const auth = await requireSession();
  if (auth.error) return auth.error;
  if (!hasRole(auth.session, ["SUPER_ADMIN"])) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { tenantId, amount, reason } = await req.json();
  if (!tenantId || amount === undefined || !reason) {
    return NextResponse.json({ error: "tenantId, amount, and reason are required" }, { status: 400 });
  }

  await adjustCredits(tenantId, Number(amount), reason);
  return NextResponse.json({ success: true });
}
```

- [ ] **Step 4: Create admin balance view endpoint**

```js
// src/app/api/admin/credits/[tenantId]/route.js
import { NextResponse } from "next/server";
import { requireSession, hasRole } from "@/lib/server/auth-guard";
import { getCreditBalance } from "@/lib/credits/credit-service";

export async function GET(req, { params }) {
  const auth = await requireSession();
  if (auth.error) return auth.error;
  if (!hasRole(auth.session, ["SUPER_ADMIN"])) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const balance = await getCreditBalance(params.tenantId);
  return NextResponse.json(balance ?? { available: 0 });
}
```

- [ ] **Step 5: Commit**

```bash
git add src/app/api/admin/credit-packs/ src/app/api/admin/credits/
git commit -m "feat: add SUPER_ADMIN credit management APIs — packs CRUD, manual adjust, balance view"
```

---

## Task 18: Dashboard Metrics API — Add Credit Summary

**Files:**
- Modify: `src/app/api/dashboard/metrics/route.js`

- [ ] **Step 1: Import `getCreditBalance`**

```js
import { getCreditBalance } from "@/lib/credits/credit-service";
```

- [ ] **Step 2: Add credit balance to the metrics response**

In the route handler, after the existing queries, add:

```js
const creditBalance = await getCreditBalance(tenantId).catch(() => null);
```

Include it in the response:
```js
return NextResponse.json({
  metrics: { /* existing */ },
  credits: creditBalance
    ? {
        available:           creditBalance.available,
        planCredits:         creditBalance.planCredits,
        purchasedCredits:    creditBalance.purchasedCredits,
        planCreditsAllocated: creditBalance.planCreditsAllocated,
        planResetNextAt:     creditBalance.planResetNextAt,
      }
    : null,
  // existing pipeline key
});
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/dashboard/metrics/route.js
git commit -m "feat: include credit balance summary in dashboard metrics API"
```

---

## Task 19: Navbar Credit Widget

**Files:**
- Modify: `src/components/shells/modern/modern-shell.js`

- [ ] **Step 1: Add `CreditWidget` component inside `modern-shell.js`**

Find the section with the user menu / header area. Add a new component inside the file:

```jsx
function CreditWidget({ tenantId }) {
  const [credits, setCredits] = React.useState(null);

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/credits/balance");
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setCredits(data);
      } catch {}
    }
    load();
    const interval = setInterval(load, 60_000); // refresh every 60s
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  if (!credits) return null;

  const pct = credits.planCreditsAllocated > 0
    ? (credits.available / credits.planCreditsAllocated) * 100
    : 100;

  const color = pct <= 5 ? "var(--ms-error, #ef4444)" : pct <= 20 ? "#f59e0b" : "var(--ms-accent)";

  return (
    <a
      href="/admin/billing"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "5px",
        padding: "4px 10px",
        borderRadius: "6px",
        background: "var(--ms-bg2)",
        border: "1px solid var(--ms-border)",
        fontSize: "12px",
        fontWeight: 600,
        color,
        textDecoration: "none",
        whiteSpace: "nowrap",
      }}
      title={`${credits.available} credits available — click to buy more`}
    >
      ⚡ {credits.available.toLocaleString()}
    </a>
  );
}
```

- [ ] **Step 2: Render `CreditWidget` in the shell header, hidden for SUPER_ADMIN**

Find where the header/topbar is rendered. Add the widget conditionally:

```jsx
{session?.role !== "SUPER_ADMIN" && <CreditWidget />}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/shells/modern/modern-shell.js
git commit -m "feat: add navbar credit widget — shows available credits with color thresholds"
```

---

## Task 20: Dashboard Credits Tile

**Files:**
- Modify: `src/components/modern/dashboard-view.js`

- [ ] **Step 1: Read `dashboard-view.js` to find the metrics grid**

Read `src/components/modern/dashboard-view.js` and find where the `metrics` from `/api/dashboard/metrics` are displayed.

- [ ] **Step 2: Add credits tile to the metrics grid**

After fetching `metrics`, render a credits tile if `metrics.credits` exists:

```jsx
{metrics?.credits && (
  <div className="ms-card" style={{ padding: "16px" }}>
    <div style={{ fontSize: "12px", color: "var(--ms-text2)", marginBottom: "8px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
      AI Credits
    </div>
    <div style={{ marginBottom: "6px" }}>
      <div style={{ background: "var(--ms-bg2)", borderRadius: "4px", height: "6px", overflow: "hidden" }}>
        <div style={{
          background: "#6366f1",
          width: `${Math.min(100, metrics.credits.planCreditsAllocated > 0 ? (metrics.credits.planCredits / metrics.credits.planCreditsAllocated) * 100 : 0)}%`,
          height: "100%",
          borderRadius: "4px",
          transition: "width 0.3s ease",
        }} />
      </div>
    </div>
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "var(--ms-text2)" }}>
      <span>{(metrics.credits.planCreditsAllocated - metrics.credits.planCredits).toLocaleString()} used</span>
      <span>
        {metrics.credits.planCreditsAllocated.toLocaleString()} / month
        {metrics.credits.planResetNextAt && (
          <> · resets in {Math.max(0, Math.ceil((new Date(metrics.credits.planResetNextAt) - Date.now()) / 86400000))}d</>
        )}
      </span>
    </div>
    {metrics.credits.purchasedCredits > 0 && (
      <div style={{ marginTop: "6px", fontSize: "12px", color: "var(--ms-text2)" }}>
        + {metrics.credits.purchasedCredits.toLocaleString()} purchased credits remaining
      </div>
    )}
  </div>
)}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/modern/dashboard-view.js
git commit -m "feat: add AI Credits tile to dashboard metrics grid"
```

---

## Task 21: Billing Page — Credits Section

**Files:**
- Modify: `src/components/modern/billing-view.js`

This is the largest UI task. Add a full credits section below the existing plan section.

- [ ] **Step 1: Read `billing-view.js` to understand current structure and state management pattern**

Read `src/components/modern/billing-view.js`.

- [ ] **Step 2: Add credit state and data loading**

Inside the component, add state and a load function for credits:

```js
const [creditBalance, setCreditBalance] = React.useState(null);
const [creditPacks, setCreditPacks]     = React.useState([]);
const [creditTxns, setCreditTxns]       = React.useState({ transactions: [], total: 0, page: 1, pages: 1 });
const [creditLoading, setCreditLoading] = React.useState(true);

React.useEffect(() => {
  async function loadCredits() {
    setCreditLoading(true);
    try {
      const [balRes, packsRes, txnsRes] = await Promise.all([
        fetch("/api/credits/balance"),
        fetch("/api/credits/packs"),
        fetch("/api/credits/transactions?limit=10"),
      ]);
      if (balRes.ok)   setCreditBalance(await balRes.json());
      if (packsRes.ok) setCreditPacks((await packsRes.json()).packs ?? []);
      if (txnsRes.ok)  setCreditTxns(await txnsRes.json());
    } finally {
      setCreditLoading(false);
    }
  }
  loadCredits();
}, []);
```

- [ ] **Step 3: Add the Credits section JSX**

After the existing plan/subscription section, render:

```jsx
{/* ── Credits Section ── */}
<div className="ms-card" style={{ padding: "20px" }}>
  <h3 style={{ margin: "0 0 16px", fontSize: "16px", fontWeight: 700, color: "var(--ms-text)" }}>
    AI Credits
  </h3>

  {/* 1. Balance */}
  {creditBalance && (
    <div style={{ marginBottom: "20px", padding: "14px", background: "var(--ms-bg2)", borderRadius: "8px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "10px" }}>
        <div>
          <div style={{ fontSize: "28px", fontWeight: 700, color: "var(--ms-text)" }}>
            {creditBalance.available.toLocaleString()}
          </div>
          <div style={{ fontSize: "12px", color: "var(--ms-text2)" }}>credits available</div>
        </div>
        <div style={{ textAlign: "right", fontSize: "12px", color: "var(--ms-text2)" }}>
          <div>Plan: {creditBalance.planCredits.toLocaleString()} / {creditBalance.planCreditsAllocated.toLocaleString()}</div>
          {creditBalance.purchasedCredits > 0 && <div>Purchased: {creditBalance.purchasedCredits.toLocaleString()}</div>}
          {creditBalance.reservedCredits > 0 && <div>Reserved: {creditBalance.reservedCredits.toLocaleString()}</div>}
          {creditBalance.planResetNextAt && (
            <div>Resets: {new Date(creditBalance.planResetNextAt).toLocaleDateString()}</div>
          )}
        </div>
      </div>
      <div style={{ background: "var(--ms-bg)", borderRadius: "4px", height: "6px", overflow: "hidden" }}>
        <div style={{
          background: "#6366f1",
          width: `${creditBalance.planCreditsAllocated > 0 ? Math.min(100, (creditBalance.planCredits / creditBalance.planCreditsAllocated) * 100) : 0}%`,
          height: "100%",
          borderRadius: "4px",
        }} />
      </div>
    </div>
  )}

  {/* 2. Buy Credits — One-time packs */}
  {creditPacks.filter(p => !p.isRecurring).length > 0 && (
    <div style={{ marginBottom: "20px" }}>
      <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--ms-text2)", marginBottom: "10px" }}>
        Buy Credits (one-time)
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: "10px" }}>
        {creditPacks.filter(p => !p.isRecurring).map(pack => (
          <div key={pack.id} style={{ padding: "12px", background: "var(--ms-bg2)", border: "1px solid var(--ms-border)", borderRadius: "8px" }}>
            <div style={{ fontWeight: 600, fontSize: "13px", color: "var(--ms-text)", marginBottom: "4px" }}>{pack.name}</div>
            <div style={{ fontSize: "22px", fontWeight: 700, color: "#6366f1" }}>{pack.credits.toLocaleString()}</div>
            <div style={{ fontSize: "11px", color: "var(--ms-text2)", marginBottom: "8px" }}>credits</div>
            <div style={{ fontSize: "13px", color: "var(--ms-text)", marginBottom: "8px" }}>
              ₹{Number(pack.priceInr).toLocaleString()} <span style={{ color: "var(--ms-text2)" }}>/ ${pack.priceUsd}</span>
            </div>
            <button
              className="ms-btn ms-btn-primary"
              style={{ width: "100%", fontSize: "12px", padding: "6px" }}
              onClick={() => handleBuyPack(pack.id)}
            >
              Buy
            </button>
          </div>
        ))}
      </div>
    </div>
  )}

  {/* 3. Transaction History */}
  {creditTxns.transactions.length > 0 && (
    <div>
      <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--ms-text2)", marginBottom: "10px" }}>
        Transaction History
      </div>
      <table className="ms-tbl" style={{ width: "100%", fontSize: "12px" }}>
        <thead>
          <tr>
            <th>Date</th><th>Type</th><th>Amount</th><th>Balance After</th>
          </tr>
        </thead>
        <tbody>
          {creditTxns.transactions.map(tx => (
            <tr key={tx.id}>
              <td>{new Date(tx.createdAt).toLocaleDateString()}</td>
              <td>{tx.type}</td>
              <td style={{ color: tx.amount > 0 ? "var(--ms-accent)" : "var(--ms-error, #ef4444)" }}>
                {tx.amount > 0 ? "+" : ""}{tx.amount}
              </td>
              <td>{tx.balanceAfter}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )}
</div>
```

- [ ] **Step 4: Add `handleBuyPack` function**

```js
async function handleBuyPack(packId) {
  try {
    const res = await fetch("/api/billing/credits/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ packId }),
    });
    const data = await res.json();
    if (data.url) window.location.href = data.url;
    else toast.error(data.error || "Failed to create checkout session");
  } catch {
    toast.error("Failed to initiate checkout");
  }
}
```

- [ ] **Step 5: Commit**

```bash
git add src/components/modern/billing-view.js
git commit -m "feat: add Credits section to billing page — balance, buy packs, transaction history"
```

---

## Task 22: SUPER_ADMIN Credit Config UI

**Files:**
- Modify the SUPER_ADMIN Subscription Config view (find the correct file)

- [ ] **Step 1: Find the SUPER_ADMIN Subscription Config view**

```bash
grep -r "Subscription Config\|SubscriptionConfig\|credit_init_fee" src/components --include="*.js" -l
```

- [ ] **Step 2: Add Credit Pack Manager section**

In the Subscription Config component, fetch packs from `/api/admin/credit-packs` and render a table with edit/deactivate actions.

- [ ] **Step 3: Add Credit Settings section**

Render form fields for the 7 credit config keys (`credit_init_fee`, `credit_per_minute`, `credit_reserve_amount`, `credit_low_warning_pct`, `credit_low_warning_pct_2`, `credit_purchased_expiry_days`, `credit_reserve_timeout_hours`). Save via existing subscription config update mechanism.

- [ ] **Step 4: Add Manual Adjustment section**

Tenant picker + amount (positive = grant, negative = deduct) + reason input → POST `/api/admin/credits/adjust`.

- [ ] **Step 5: Add Plan Credit Allocations section**

Show current `creditsPerMonth` per plan. Allow editing → POST `/api/admin/plans` (existing plan management endpoint).

- [ ] **Step 6: Commit**

```bash
git add src/components/modern/
git commit -m "feat: add credit config UI to SUPER_ADMIN Subscription Config page"
```

---

## Task 23: Data Migration for Existing Tenants

**Files:**
- Create: `prisma/migrations/manual-credit-balance-init.js` (one-time script, not a Prisma migration)

- [ ] **Step 1: Create migration script**

```js
// prisma/migrations/manual-credit-balance-init.js
// Run once: node prisma/migrations/manual-credit-balance-init.js
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const subscriptions = await prisma.tenantSubscription.findMany({
    include: { planDef: true },
  });

  let created = 0, skipped = 0;

  for (const sub of subscriptions) {
    const exists = await prisma.tenantCreditBalance.findUnique({ where: { tenantId: sub.tenantId } });
    if (exists) { skipped++; continue; }

    const credits = sub.planDef?.creditsPerMonth ?? 0;
    const resetNext = sub.currentPeriodEnd ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await prisma.tenantCreditBalance.create({
      data: {
        tenantId: sub.tenantId,
        planCredits: credits,
        planCreditsAllocated: credits,
        planResetNextAt: resetNext,
      },
    });
    created++;
    console.log(`Created balance for tenant ${sub.tenantId} (${sub.plan}) — ${credits} credits`);
  }

  console.log(`\nDone. Created: ${created}, Skipped: ${skipped}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
```

- [ ] **Step 2: Run the migration script**

```bash
node prisma/migrations/manual-credit-balance-init.js
```

Expected: one line per tenant, then `Done. Created: N, Skipped: 0`.

- [ ] **Step 3: Verify all tenants have a credit balance**

```bash
node -e "const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.tenantCreditBalance.count().then(n=>console.log('balances:',n)).finally(()=>p.\$disconnect())"
```

- [ ] **Step 4: Commit**

```bash
git add prisma/migrations/manual-credit-balance-init.js
git commit -m "chore: add one-time migration script to initialize credit balances for existing tenants"
```

---

## Task 24: Build Verification

- [ ] **Step 1: Run full test suite**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Production build**

```bash
npm run build
```

Expected: build completes with no errors.

- [ ] **Step 4: Smoke test credit flow**

Start dev server (`npm run dev`), login as `admin@crm.local`, navigate to:
1. Dashboard → verify credits tile appears
2. Billing page → verify Credits section appears with balance and pack cards
3. Navbar → verify `⚡ N credits` widget appears

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: AI credits system — complete implementation"
```

---

> [!tip] Implementation order
> Tasks 1→2→3 (schema+seed) must be done first. Tasks 4→5 (credit service + tests) must precede all integration tasks (6–15). UI tasks (19–22) can be done in any order after the API endpoints exist.

> [!warning] Not in scope
> Low-credit email notifications are mentioned in the spec but not implemented in this plan — the `checkLowCreditWarnings` helper in `credit-service.js` pauses campaigns and the UI widget shows the color change. Email sending can be added as a follow-up.
