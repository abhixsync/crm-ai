---
title: AI Credits System Design
date: 2026-04-07
tags:
  - design
  - credits
  - billing
  - ai-calling
status: approved
---

# AI Credits System Design

## Problem Statement

The current system limits AI calling by a flat count (`maxAiCallsPerMonth`). This is unfair: a 2-minute call and a 15-minute call cost the same. Additionally, `incrementAiCallUsage()` is defined but **never called** — the counter is checked but never incremented, making enforcement broken by design.

**Goal:** Replace the flat call-count limit with an AI credits system that meters usage by call initiation + duration, supports top-up purchases, and is fully configurable by SUPER_ADMIN.

---

## Design Decisions

> [!info] All decisions confirmed by the product owner.

| Decision | Choice | Reasoning |
|----------|--------|-----------|
| Consumption model | Hybrid: initiation fee + per-minute | Tenants pay own telephony; duration is the fairest meter |
| Overdraft protection | Reserve + Settle | Atomic reserve on call start; settle actual on webhook |
| Credit denomination | Dual: abstract in-app, INR/USD at purchase | Repricing flexibility + transparency at checkout |
| Plan credit rollover | Plan credits reset monthly; purchased credits persist | Use-it-or-lose-it for plan, carry-over for purchased |
| Extra purchase types | One-time packs + recurring monthly add-ons | Both available; SUPER_ADMIN configures all |
| Zero-credits behaviour | Hard block + campaign graceful pause | Warning at 2 configurable thresholds before block |
| Architecture | Balance row + append-only transaction log | Fast reads + full audit trail + clean separation |

---

## Credit Formula

```
credits_used = credit_init_fee + ceil(durationSecs / 60) * credit_per_minute
```

> [!important]
> Both `credit_init_fee` and `credit_per_minute` are read from `SubscriptionConfig` at runtime — not hardcoded. If SUPER_ADMIN changes `credit_per_minute` to `2`, all subsequent settlements use the new rate.

**Config keys (all configurable via `SubscriptionConfig`):**

| Config Key | Default | Meaning |
|------------|---------|---------|
| `credit_init_fee` | `2` | Credits charged per call connection |
| `credit_per_minute` | `1` | Credits per minute of duration |
| `credit_reserve_amount` | `20` | Credits held during active call |
| `credit_low_warning_pct` | `20` | First warning threshold (%) |
| `credit_low_warning_pct_2` | `5` | Second warning threshold (%) |
| `credit_purchased_expiry_days` | `365` | Purchased credit expiry (0 = never) |
| `credit_reserve_timeout_hours` | `2` | Stale reserve auto-release timeout |

**Examples (with default config):**
- 2-min call → 2 + ceil(120/60) × 1 = **4 credits**
- 5-min call → 2 + ceil(300/60) × 1 = **7 credits**
- 10-min call → 2 + ceil(600/60) × 1 = **12 credits**
- Failed / no-answer call → **0 credits** (full reserve refunded)

---

## Call Initiation Inventory

> [!warning] Every code path that initiates a call must call `reserveCredits()`. There are three, not one.

| Path | File | Integration point |
|------|------|------------------|
| Manual call | `src/app/api/calls/trigger/route.js` | After `guard.assertHasFeature("hasAiCalling")`, before telephony |
| Demo call | `src/app/api/calls/demo/route.js` | After existing guard check, before telephony |
| Campaign automation | `src/lib/journey/ai-campaign-service.js :: stateToCalling()` | Before `initiateTelephonyCallWithFailover()` |

All three paths also need the matching `settleCredits()` / `refundReserve()` in the status webhook, keyed by `callLogId`.

---

## Data Model

### New Models

#### `TenantCreditBalance`
One row per tenant. Source of truth for fast balance reads.

```prisma
model TenantCreditBalance {
  id                       String    @id @default(cuid())
  tenantId                 String    @unique
  planCredits              Int       @default(0)
  purchasedCredits         Int       @default(0)
  reservedCredits          Int       @default(0)
  planCreditsAllocated     Int       @default(0)   // snapshot of last monthly grant
  planCreditsUsedThisMonth Int       @default(0)   // plan pool consumed this cycle
  planResetAt              DateTime?               // when last reset ran
  planResetNextAt          DateTime?               // when next reset is due (shown in UI)
  createdAt                DateTime  @default(now())
  updatedAt                DateTime  @updatedAt

  tenant                   Tenant    @relation(fields: [tenantId], references: [id])
}
```

> [!important] Balance formula
> `available = planCredits + purchasedCredits - reservedCredits`
>
> **Deduction order:** plan credits first → purchased credits second.
> `planCreditsAllocated` is set to `plan.creditsPerMonth` on tenant creation and every monthly reset. Used for warning threshold calculations: `available / planCreditsAllocated`.

#### `CreditTransaction`
Append-only audit log. One row per credit event.

```prisma
model CreditTransaction {
  id               String                @id @default(cuid())
  tenantId         String
  type             CreditTransactionType
  amount           Int                   // positive = credit, negative = debit
  sourcePool       CreditPool            // PLAN | PURCHASED
  balanceAfter     Int                   // written inside atomic op — safe under lock
  callLogId        String?
  packPurchaseId   String?
  idempotencyKey   String                @unique  // NOT nullable — required for all events
  description      String?
  meta             Json?
  createdAt        DateTime              @default(now())

  tenant           Tenant                @relation(fields: [tenantId], references: [id])

  @@index([tenantId, createdAt])
  @@index([callLogId])
  @@index([tenantId, type])
}

enum CreditTransactionType {
  MONTHLY_GRANT       // plan credits granted at cycle start
  RESERVE             // credits held for in-progress call
  SETTLE              // final deduction after call ends
  PURCHASE            // one-time top-up pack
  SUBSCRIPTION_GRANT  // recurring add-on monthly grant
  EXPIRE              // purchased credits expiring
  ADJUSTMENT          // SUPER_ADMIN manual grant/deduction
  REFUND              // credits returned (failed call, cancelled purchase)
}

enum CreditPool {
  PLAN
  PURCHASED
}
```

**Idempotency key formats:**

| Event | Key format |
|-------|-----------|
| Reserve | `reserve-{callLogId}` |
| Settle / Refund | `settle-{callLogId}` |
| Monthly grant | `monthly-{tenantId}-{YYYY-MM}` |
| Purchase | `purchase-{providerTxId}` |
| Adjustment | `adjust-{tenantId}-{timestamp}` |

#### `CreditPack`
SUPER_ADMIN configures the catalog. Tenants see only active packs.

```prisma
model CreditPack {
  id              String              @id @default(cuid())
  name            String
  credits         Int
  bonusCredits    Int                 @default(0)
  priceInr        Decimal
  priceUsd        Decimal
  isRecurring     Boolean             @default(false)
  billingCycle    BillingCycle?       // uses existing enum: MONTHLY | ANNUAL
  isActive        Boolean             @default(true)
  sortOrder       Int                 @default(0)
  stripePriceId   String?
  razorpayPlanId  String?             // recurring only; one-time uses razorpay order
  createdAt       DateTime            @default(now())
  updatedAt       DateTime            @updatedAt

  purchases       CreditPackPurchase[]
}
```

#### `CreditPackPurchase`
One row per purchase event (one-time or recurring).

```prisma
model CreditPackPurchase {
  id                     String          @id @default(cuid())
  tenantId               String
  packId                 String
  creditsAtPurchase      Int             // snapshot — immune to pack edits
  priceAtPurchase        Decimal         // snapshot — immune to pack price changes
  amountInr              Decimal?
  amountUsd              Decimal?
  billingProvider        BillingProvider // STRIPE | RAZORPAY
  providerTxId           String?
  stripeSubscriptionId   String?         // recurring only
  razorpaySubscriptionId String?         // recurring only
  status                 PurchaseStatus
  isRecurring            Boolean         @default(false)
  nextRenewalAt          DateTime?
  renewalCount           Int             @default(0)
  expiresAt              DateTime?       // null = never expires; used for FIFO expiry
  createdAt              DateTime        @default(now())
  updatedAt              DateTime        @updatedAt

  tenant                 Tenant          @relation(fields: [tenantId], references: [id])
  pack                   CreditPack      @relation(fields: [packId], references: [id])

  @@index([tenantId, status])
  @@index([tenantId, createdAt])
  @@index([tenantId, expiresAt])  // for expiry cron queries
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

### Changes to Existing Models

**`PlanDefinition`**
```prisma
creditsPerMonth  Int  @default(0)   // NEW — 0=FREE, 100=PLUS, 500=PRO, 2000=MAX
// maxAiCallsPerMonth kept at -1 (deprecated, backward compat only)
```

**`CallLog`**
```prisma
creditsReserved  Int?      // NEW — credits held for this call
creditsCharged   Int?      // NEW — final credits deducted (0 for failed/no-answer)
reservedAt       DateTime? // NEW — timestamp of reserve, used for stale detection
```

**`Tenant`** — add back-relations for Prisma:
```prisma
creditBalance        TenantCreditBalance?
creditTransactions   CreditTransaction[]
creditPackPurchases  CreditPackPurchase[]
```

**`SubscriptionConfig`** — 7 new seeded keys:
`credit_init_fee`, `credit_per_minute`, `credit_reserve_amount`, `credit_low_warning_pct`, `credit_low_warning_pct_2`, `credit_purchased_expiry_days`, `credit_reserve_timeout_hours`

**`TenantSubscription` / `planSnapshot`** — `buildPlanSnapshot()` must include `creditsPerMonth` in the JSON snapshot so plan-guard reads the value correctly if `PlanDefinition` is later edited.

---

## Credit Lifecycle

### 1 — Tenant Created
`createTrialSubscription()` also calls `createCreditBalance(tenantId, PRO_credits)`.

Creates `TenantCreditBalance` with:
- `planCredits = PRO.creditsPerMonth` (500)
- `planCreditsAllocated = PRO.creditsPerMonth` (500)
- `planResetNextAt = trialEndsAt`

### 2 — Call Triggered (pre-call)
Applies to all three call initiation paths (trigger, demo, campaign automation).

1. Check `guard.assertHasFeature("hasAiCalling")` — kept; FREE plan has `hasAiCalling: false`
2. Read `available = planCredits + purchasedCredits - reservedCredits`
3. Check `available >= credit_reserve_amount` — throw 402 with `{ error, code: "INSUFFICIENT_CREDITS", available, required: credit_reserve_amount }` if not
4. **Atomic reserve:** `UPDATE TenantCreditBalance SET reservedCredits = reservedCredits + $amount WHERE tenantId = $id AND (planCredits + purchasedCredits - reservedCredits) >= $amount` — zero rows affected = race condition caught, throw 402
5. Log `RESERVE` transaction. Set `CallLog.reservedAt = now()`, `CallLog.creditsReserved = credit_reserve_amount`

> [!warning] Concurrency safety
> Step 4 is a single atomic `UPDATE ... WHERE` — not a read-then-write. Two simultaneous calls on a marginal balance: one succeeds, one gets zero rows → 402. No overdraft possible.

### 3A — Call Completed (webhook settles)
1. Receive `durationSecs` from telephony status webhook (`/api/calls/status`)
2. Compute: `actual = credit_init_fee + ceil(durationSecs / 60) * credit_per_minute`
3. Deduct plan credits first; if `planCredits < actual`, deduct remainder from `purchasedCredits`
4. In one `prisma.$transaction()`: `reservedCredits -= credit_reserve_amount`, deduct `actual`, increment `planCreditsUsedThisMonth`, set `CallLog.creditsCharged = actual`
5. Log `SETTLE` transaction (or two rows if straddling pools). Key: `settle-{callLogId}` — idempotent on webhook retry

### 3B — Call Failed / No-Answer (full refund)
Telephony status = FAILED or NO_ANSWER (`BUSY` does not exist in `CallStatus` — telephony adapters map provider "busy" signal to `FAILED`).

- `reservedCredits -= credit_reserve_amount` (full release)
- Log `REFUND` transaction. Key: `settle-{callLogId}` (same key — idempotent)
- `CallLog.creditsCharged = 0`

### 3C — Stale Reserve (cron cleanup)
Cron query: `CallLog WHERE creditsReserved > 0 AND creditsCharged IS NULL AND reservedAt < now() - credit_reserve_timeout_hours`

- Auto-settles with `durationSecs = 0` → charges `credit_init_fee` only (2 credits)
- Rationale: the telephony leg was initiated (call was placed); we cannot confirm it didn't connect. Charging the initiation fee is fair and predictable.
- Logs `SETTLE` with `meta.auto_settled_timeout = true`

### 4 — Credit Purchase
Stripe/Razorpay webhook fires with `metadata.purchaseType = "credit_pack"`.

In one `prisma.$transaction()`:
1. Create `CreditPackPurchase` (status = COMPLETED)
2. Set `expiresAt = now() + credit_purchased_expiry_days` (null if 0)
3. `purchasedCredits += creditsAtPurchase + bonusCredits`
4. Log `PURCHASE` transaction. Key: `purchase-{providerTxId}`

Recurring renewal: same flow, additionally update `nextRenewalAt`, increment `renewalCount`, status stays `ACTIVE_RECURRING`.

### 5 — Monthly Reset (cron)
- Guard: only run if `planResetNextAt <= now()`, idempotency key `monthly-{tenantId}-{YYYY-MM}`
- In one `prisma.$transaction()`: `planCredits = plan.creditsPerMonth`, `planCreditsAllocated = plan.creditsPerMonth`, `planCreditsUsedThisMonth = 0`, advance `planResetNextAt`
- `reservedCredits` NOT touched — in-flight calls unaffected
- `purchasedCredits` NOT touched
- Log `MONTHLY_GRANT`
- After grant: run `expirePurchasedCredits()` — find `CreditPackPurchase WHERE expiresAt <= now()`, deduct their remaining contribution from `purchasedCredits`, log `EXPIRE`

> [!note] Purchased credit expiry (FIFO)
> Each `CreditPackPurchase` has its own `expiresAt`. The expiry cron sums credits from expired purchases and deducts from `purchasedCredits`. If `purchasedCredits` would go negative (credits already spent), deduct only what remains. This gives per-pack FIFO expiry without needing per-pack balance tracking.

### 6 — Low Credit Warnings (async, non-blocking)
After every `SETTLE`, check `available / planCreditsAllocated`:
- `<= credit_low_warning_pct` (20%) → in-app amber banner + email to ADMIN
- `<= credit_low_warning_pct_2` (5%) → in-app red banner + second email
- `= 0` → hard block + set `Campaign.status = PAUSED` with `metadata.pauseReason = "INSUFFICIENT_CREDITS"` (it is the `Campaign` that pauses, not individual `CampaignJob` records)

> [!note] Campaign pause and resume
> Resume is **manual** — tenant tops up credits, then manually resumes the campaign from the UI. The automation runner checks `creditService.reserveCredits()` before each call attempt; the first failure triggers the campaign pause.

### 7 — Plan Upgrade
`upgradePlan()` in `subscription-service.js` must also update `TenantCreditBalance`:
- `planCredits = newPlan.creditsPerMonth` (immediate full grant, not prorated)
- `planCreditsAllocated = newPlan.creditsPerMonth`
- `planResetNextAt = newBillingPeriodEnd`
- Log `MONTHLY_GRANT` (upgrade trigger)

---

## Service Layer

**New file: `src/lib/credits/credit-service.js`**

| Function | Purpose |
|----------|---------|
| `getCreditBalance(tenantId)` | Read balance + metadata for UI |
| `reserveCredits(tenantId, callLogId)` | Atomic reserve — used by all 3 call paths |
| `settleCredits(tenantId, callLogId, durationSecs)` | Settle after call ends |
| `refundReserve(tenantId, callLogId)` | Full refund for failed/no-answer calls |
| `grantMonthlyCredits(tenantId)` | Monthly reset + expiry check |
| `grantPurchaseCredits(tenantId, packPurchaseId)` | Top-up after purchase webhook |
| `releaseStaleReserves()` | Cron: auto-settle abandoned reserves |
| `expirePurchasedCredits()` | Cron: expire old purchased credits |
| `adjustCredits(tenantId, amount, reason)` | SUPER_ADMIN manual grant/deduction |
| `getCreditTransactions(tenantId, page)` | Paginated transaction history |
| `initializeCreditBalance(tenantId, planCredits)` | Called from createTrialSubscription |

> [!important]
> All mutations use `prisma.$transaction()`. All writes include a non-null idempotency key. `credit_init_fee` and `credit_per_minute` are always read from `SubscriptionConfig` — never hardcoded.

---

## API Changes

### New Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/credits/balance` | ADMIN | Balance, reserved, reset date |
| GET | `/api/credits/transactions` | ADMIN | Paginated history |
| GET | `/api/credits/packs` | ADMIN | Available packs |
| POST | `/api/billing/credits/checkout` | ADMIN | Stripe/Razorpay checkout for pack |
| POST | `/api/billing/credits/cancel-recurring` | ADMIN | Cancel recurring add-on |
| GET/POST | `/api/admin/credit-packs` | SUPER_ADMIN | List + create packs |
| PUT/DEL | `/api/admin/credit-packs/[id]` | SUPER_ADMIN | Edit / deactivate pack |
| POST | `/api/admin/credits/adjust` | SUPER_ADMIN | Manual credit adjustment |
| GET | `/api/admin/credits/[tenantId]` | SUPER_ADMIN | View any tenant's balance |

### Modified Endpoints

**`POST /api/calls/trigger`**
- Keep: `guard.assertHasFeature("hasAiCalling")` — FREE plan still blocked here
- Remove: `guard.assertCanMakeAiCall()`
- Add: `creditService.reserveCredits(tenantId, callLogId)` — throws 402 on insufficient credits

**`POST /api/calls/demo`**
- Remove: `guard.assertCanMakeAiCall()`
- Add: `creditService.reserveCredits(tenantId, callLogId)`

**`src/lib/journey/ai-campaign-service.js :: stateToCalling()`**
- Add: `creditService.reserveCredits(tenantId, callLogId)` before `initiateTelephonyCallWithFailover()`
- If reserve fails → set campaign `PAUSED`, throw, do not initiate telephony

**`POST /api/calls/status`** (telephony status webhook)
- On COMPLETED → `settleCredits(tenantId, callLogId, durationSecs)`
- On FAILED or NO_ANSWER → `refundReserve(tenantId, callLogId)`

**`POST /api/billing/stripe/webhook`**
- Check `session.metadata.purchaseType`:
  - `"plan_subscription"` → existing `upgradePlan()` flow
  - `"credit_pack"` → new `grantPurchaseCredits()` flow

**`POST /api/billing/razorpay/webhook`**
- Same `purchaseType` routing as Stripe

**`POST /api/cron/subscription-expiry`**
- Add: `releaseStaleReserves()` → `expirePurchasedCredits()` → `grantMonthlyCredits()` for all due tenants

### Error Response Shape

Insufficient credits throws HTTP 402:
```json
{
  "error": "Insufficient credits",
  "code": "INSUFFICIENT_CREDITS",
  "available": 8,
  "required": 20
}
```

---

## UI Surfaces

### Navbar Widget (`modern-shell.js`)
Visible to ADMIN and SALES roles. Hidden for SUPER_ADMIN (no credit system for them).
- `⚡ 340 credits` — green (`> 20%` of monthly allocation)
- `⚡ 87 credits` — amber (`5–20%`)
- `⚡ 12 credits` — red (`<= 5%`)
- Click → Settings → Billing
- Fetches `/api/credits/balance` on mount, cached 60s

### Dashboard Metrics Tile (`dashboard-view.js`)
Added to existing metrics grid alongside customer count, call logs:
- Plan credits used / monthly allocation
- Progress bar (purple, `#6366f1`)
- Days until reset
- Purchased credits remaining (if any)

### Billing Page Credits Section (`billing-view.js`)
New section with 4 subsections:
1. **Credit Balance** — plan credits, purchased credits, reserved, reset date
2. **Buy Credits** — one-time pack cards with INR/USD price + Stripe/Razorpay checkout
3. **Recurring Add-ons** — active subscriptions with next renewal date + cancel button
4. **Transaction History** — paginated log: date, type, amount (±), call link, balance after

### SUPER_ADMIN Credit Config (Subscription Config page)
New section in existing Subscription Config admin view:
1. **Credit Pack Manager** — create/edit/deactivate packs (all fields)
2. **Credit Settings** — all 7 `SubscriptionConfig` keys with labels and defaults
3. **Manual Adjustment** — grant/deduct credits for any tenant with mandatory reason note
4. **Plan Credit Allocations** — set `creditsPerMonth` per plan (FREE/PLUS/PRO/MAX)

---

## Plan Defaults

| Plan | Price | Credits/month | Equiv. avg 3-min calls |
|------|-------|--------------|------------------------|
| FREE | $0 | 0 | None — `hasAiCalling: false` |
| PLUS | $9 / ₹299 | 100 | ~20 calls |
| PRO | $29 / ₹499 | 500 | ~100 calls |
| MAX | $79 / ₹799 | 2,000 | ~400 calls |

> [!note]
> Credit check applies to ALL plans including MAX. No bypass. `hasAiCalling` feature gate is kept — FREE plan is blocked by feature gate before reaching credit check.

---

## Credit Pack Catalog (Seeded Defaults)

### One-Time Packs

| Name | Credits | INR | USD | Per-credit (INR) |
|------|---------|-----|-----|-----------------|
| Micro | 100 | ₹49 | $0.60 | ₹0.49 |
| Starter | 300 | ₹149 | $2 | ₹0.50 |
| Standard | 1,000 | ₹399 | $5 | ₹0.40 |
| Pro Pack | 3,000 | ₹999 | $12 | ₹0.33 |
| Power Pack | 10,000 | ₹2,999 | $36 | ₹0.30 |

### Recurring Monthly Add-ons

| Name | Credits/month | INR/month | USD/month |
|------|--------------|-----------|-----------|
| Basic Add-on | 500 | ₹199 | $2.50 |
| Standard Add-on | 2,000 | ₹699 | $8.50 |

> [!tip] Pricing rationale
> Pack credits cost 2–5× less per credit than plan credits — clear upsell without cannibalising upgrades. Micro pack (₹49/100 credits) is the impulse-buy entry point for PLUS users who run out of their 100 monthly credits.

---

## Edge Cases

| Scenario | Handling |
|----------|---------|
| New tenant signup | `createTrialSubscription()` → `initializeCreditBalance()` with PRO credits |
| Plan upgrade mid-month | `upgradePlan()` → immediate full grant of new plan's credits + update `planCreditsAllocated` |
| Plan downgrade to FREE | `downgradeToFree()` does NOT zero `purchasedCredits` |
| SUPER_ADMIN triggers call for tenant | Debits that tenant's credits; SUPER_ADMIN has no balance of their own |
| Failed / no-answer call | Full reserve refunded — 0 credits charged; `creditsCharged = 0` |
| Webhook fires twice | `settle-{callLogId}` idempotency key — second settlement is no-op |
| Concurrent calls race | Atomic `UPDATE WHERE available >= N` — one wins, other gets 402 |
| Call reserves, webhook never fires | Cron: auto-settle after `credit_reserve_timeout_hours` (charges init fee only) |
| Stripe webhook type conflict | `metadata.purchaseType` routes to plan upgrade vs credit grant |
| Pack deactivated with active recurring subs | Grandfathered via `creditsAtPurchase` + `priceAtPurchase` snapshots |
| Monthly reset races active reserve | `reservedCredits` never touched by reset — reserve bucket is separate |
| Campaign runs out of credits mid-run | `Campaign.status = PAUSED`, reason `INSUFFICIENT_CREDITS`; manual resume after top-up |
| Purchased credits expiry across multiple packs | FIFO by `CreditPackPurchase.expiresAt`; cron sums expired packs and deducts from `purchasedCredits` |

---

## Migration Plan

1. Add back-relations to `Tenant` model: `creditBalance`, `creditTransactions`, `creditPackPurchases`
2. Add `creditsPerMonth` to `PlanDefinition` — seed: FREE=0, PLUS=100, PRO=500, MAX=2000
3. Set `maxAiCallsPerMonth = -1` for all plans in seed (deprecated)
4. Add `creditsReserved`, `creditsCharged`, `reservedAt` to `CallLog`
5. Add `TenantCreditBalance`, `CreditTransaction`, `CreditPack`, `CreditPackPurchase` models
6. Add `CreditTransactionType`, `CreditPool`, `PurchaseStatus` enums
7. Run data migration: create `TenantCreditBalance` for all existing tenants at their current plan's credit allocation
8. Update `buildPlanSnapshot()` to include `creditsPerMonth`
9. Seed `SubscriptionConfig` with 7 new credit config keys
10. Seed `CreditPack` with 5 one-time packs + 2 recurring add-ons
11. Replace `assertCanMakeAiCall()` in `plan-guard.js` with credit balance check
12. Add `creditService.reserveCredits()` to all 3 call initiation paths
13. Add `settleCredits()` / `refundReserve()` to status webhook

> [!warning] Existing tenants
> All existing tenants get a fresh `TenantCreditBalance` at their current plan's allocation. No historical `UsageRecord.aiCallsUsed` data is migrated — credit system starts clean. `UsageRecord` is kept for `leadsUploaded` and `storageUsedMb` tracking.

> [!tip] Rollback plan
> To revert to the old system: re-enable `assertCanMakeAiCall()` in `plan-guard.js`, restore original `maxAiCallsPerMonth` values in seed, and remove the `reserveCredits()` calls from the three initiation paths. The credit balance data is additive and does not break existing functionality if the credit checks are disabled.
