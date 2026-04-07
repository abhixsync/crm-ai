import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks (must be declared before imports) ─────────────────────────────────

vi.mock("@/lib/billing/stripe", () => ({
  constructStripeEvent: vi.fn(),
}));

vi.mock("@/lib/billing/razorpay", () => ({
  verifyRazorpayWebhook: vi.fn(),
}));

vi.mock("@/lib/subscription/subscription-service", () => ({
  upgradePlan: vi.fn(),
  cancelSubscription: vi.fn(),
  getPlatformCurrency: vi.fn(async () => "USD"),
}));

vi.mock("@/lib/credits/credit-service", () => ({
  grantPurchaseCredits: vi.fn(),
  getCreditBalance: vi.fn(async () => ({ available: 500 })),
}));

vi.mock("@/lib/email/mailer", () => ({
  sendEmail: vi.fn(async () => ({ ok: true })),
  buildPaymentConfirmationEmail: vi.fn(() => ({ subject: "s", html: "h", text: "t", fromName: null })),
  buildPaymentFailureEmail: vi.fn(() => ({ subject: "s", html: "h", text: "t", fromName: null })),
  buildCreditPurchaseEmail: vi.fn(() => ({ subject: "s", html: "h", text: "t", fromName: null })),
  buildPlanUpgradeEmail: vi.fn(() => ({ subject: "s", html: "h", text: "t", fromName: null })),
}));

vi.mock("@/modules/theme/theme.service", () => ({
  resolveTenantTheme: vi.fn(async () => null),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    tenantSubscription: { findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn() },
    subscriptionInvoice: { create: vi.fn() },
    user: { findFirst: vi.fn() },
    creditPack: { findUnique: vi.fn() },
  },
}));

// ─── Imports ──────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/prisma";
import { constructStripeEvent } from "@/lib/billing/stripe";
import { verifyRazorpayWebhook } from "@/lib/billing/razorpay";
import { upgradePlan, cancelSubscription } from "@/lib/subscription/subscription-service";
import { grantPurchaseCredits } from "@/lib/credits/credit-service";
import {
  sendEmail,
  buildPaymentConfirmationEmail,
  buildPaymentFailureEmail,
  buildCreditPurchaseEmail,
  buildPlanUpgradeEmail,
} from "@/lib/email/mailer";

import { POST as stripePost } from "@/app/api/billing/stripe/webhook/route.js";
import { POST as razorpayPost } from "@/app/api/billing/razorpay/webhook/route.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mockReq(body, headers = {}) {
  return {
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
    headers: { get: (k) => headers[k] || null },
  };
}

const TENANT_ID = "tenant_abc";
const PACK_ID   = "pack_starter";
const SUB_DB_ID = "sub_db_1";

/** A minimal tenant subscription row returned by prisma mocks. */
function makeDbSub(overrides = {}) {
  return {
    id:       SUB_DB_ID,
    tenantId: TENANT_ID,
    plan:     "PRO",
    stripeSubscriptionId:   "sub_stripe_1",
    razorpaySubscriptionId: "sub_rzp_1",
    ...overrides,
  };
}

// ─── beforeEach ───────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();

  // Razorpay signature passes by default (no-op); individual tests override when needed
  verifyRazorpayWebhook.mockReturnValue(undefined);

  // Default prisma stubs
  prisma.tenantSubscription.findFirst.mockResolvedValue(makeDbSub());
  prisma.tenantSubscription.update.mockResolvedValue({});
  prisma.tenantSubscription.updateMany.mockResolvedValue({ count: 1 });
  prisma.tenantSubscription.findUnique.mockResolvedValue(makeDbSub());
  prisma.subscriptionInvoice.create.mockResolvedValue({});
  prisma.user.findFirst.mockResolvedValue({ email: "owner@example.com", name: "Alice" });
  prisma.creditPack.findUnique.mockResolvedValue({ id: PACK_ID, name: "Starter Pack", credits: 100, bonusCredits: 20 });
});

// ═════════════════════════════════════════════════════════════════════════════
// STRIPE WEBHOOK TESTS
// ═════════════════════════════════════════════════════════════════════════════

describe("POST /api/billing/stripe/webhook", () => {

  // ── 1. Invalid signature ────────────────────────────────────────────────────
  it("returns 400 on invalid signature", async () => {
    constructStripeEvent.mockImplementation(() => {
      throw new Error("No signatures found matching the expected signature for payload");
    });

    const req = mockReq("{}", { "stripe-signature": "bad_sig" });
    const res = await stripePost(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid signature");
  });

  // ── 2. checkout.session.completed (credit_pack) → grantPurchaseCredits ──────
  it("checkout.session.completed (credit_pack) calls grantPurchaseCredits with correct args", async () => {
    constructStripeEvent.mockReturnValue({
      type: "checkout.session.completed",
      data: {
        object: {
          metadata: { purchaseType: "credit_pack", tenantId: TENANT_ID, packId: PACK_ID },
          payment_intent: "pi_test_1",
          amount_total: 999,
        },
      },
    });

    await stripePost(mockReq("{}"));

    expect(grantPurchaseCredits).toHaveBeenCalledOnce();
    expect(grantPurchaseCredits).toHaveBeenCalledWith(
      TENANT_ID,
      PACK_ID,
      "pi_test_1",
      "STRIPE",
      { usd: 9.99 }
    );
  });

  // ── 3. checkout.session.completed (credit_pack) → credit purchase email ─────
  it("checkout.session.completed (credit_pack) sends credit purchase email", async () => {
    constructStripeEvent.mockReturnValue({
      type: "checkout.session.completed",
      data: {
        object: {
          metadata: { purchaseType: "credit_pack", tenantId: TENANT_ID, packId: PACK_ID },
          payment_intent: "pi_test_1",
          amount_total: 999,
        },
      },
    });

    await stripePost(mockReq("{}"));
    // Let the non-blocking async IIFE settle
    await new Promise((r) => setTimeout(r, 50));

    expect(buildCreditPurchaseEmail).toHaveBeenCalledOnce();
    expect(sendEmail).toHaveBeenCalledOnce();
  });

  // ── 4. checkout.session.completed (plan subscription) → upgradePlan ─────────
  it("checkout.session.completed (plan) calls upgradePlan", async () => {
    constructStripeEvent.mockReturnValue({
      type: "checkout.session.completed",
      data: {
        object: {
          mode:         "subscription",
          metadata:     { tenantId: TENANT_ID },
          subscription: "sub_stripe_1",
          customer:     "cus_stripe_1",
        },
      },
    });

    await stripePost(mockReq("{}"));

    expect(upgradePlan).toHaveBeenCalledOnce();
    expect(upgradePlan.mock.calls[0][0]).toBe(TENANT_ID);
    expect(upgradePlan.mock.calls[0][1]).toMatchObject({
      billingProvider:      "STRIPE",
      stripeCustomerId:     "cus_stripe_1",
      stripeSubscriptionId: "sub_stripe_1",
    });
  });

  // ── 5. checkout.session.completed (plan) → plan upgrade email ────────────────
  it("checkout.session.completed (plan) sends plan upgrade email", async () => {
    constructStripeEvent.mockReturnValue({
      type: "checkout.session.completed",
      data: {
        object: {
          mode:         "subscription",
          metadata:     { tenantId: TENANT_ID },
          subscription: "sub_stripe_1",
          customer:     "cus_stripe_1",
        },
      },
    });

    await stripePost(mockReq("{}"));
    await new Promise((r) => setTimeout(r, 50));

    expect(buildPlanUpgradeEmail).toHaveBeenCalledOnce();
    expect(sendEmail).toHaveBeenCalledOnce();
  });

  // ── 6. invoice.paid → updates subscription to ACTIVE + creates invoice ───────
  it("invoice.paid updates tenantSubscription status to ACTIVE and creates invoice record", async () => {
    const now = Math.floor(Date.now() / 1000);
    constructStripeEvent.mockReturnValue({
      type: "invoice.paid",
      data: {
        object: {
          id:                  "in_stripe_1",
          subscription:        "sub_stripe_1",
          amount_paid:         2900,
          period_start:        now,
          period_end:          now + 30 * 24 * 3600,
          hosted_invoice_url:  "https://stripe.com/invoice/1",
        },
      },
    });

    await stripePost(mockReq("{}"));

    expect(prisma.tenantSubscription.update).toHaveBeenCalledOnce();
    expect(prisma.tenantSubscription.update.mock.calls[0][0].data.status).toBe("ACTIVE");

    expect(prisma.subscriptionInvoice.create).toHaveBeenCalledOnce();
    expect(prisma.subscriptionInvoice.create.mock.calls[0][0].data).toMatchObject({
      amountUsd:       29,
      currency:        "USD",
      status:          "PAID",
      billingProvider: "STRIPE",
    });
  });

  // ── 7. invoice.paid → payment confirmation email ─────────────────────────────
  it("invoice.paid sends payment confirmation email", async () => {
    const now = Math.floor(Date.now() / 1000);
    constructStripeEvent.mockReturnValue({
      type: "invoice.paid",
      data: {
        object: {
          id:           "in_stripe_1",
          subscription: "sub_stripe_1",
          amount_paid:  2900,
          period_start: now,
          period_end:   now + 30 * 24 * 3600,
        },
      },
    });

    await stripePost(mockReq("{}"));
    await new Promise((r) => setTimeout(r, 50));

    expect(buildPaymentConfirmationEmail).toHaveBeenCalledOnce();
    expect(sendEmail).toHaveBeenCalledOnce();
  });

  // ── 8. invoice.payment_failed → updates subscription to PAST_DUE ─────────────
  it("invoice.payment_failed updates tenantSubscription status to PAST_DUE", async () => {
    constructStripeEvent.mockReturnValue({
      type: "invoice.payment_failed",
      data: {
        object: {
          subscription: "sub_stripe_1",
          amount_due:   2900,
        },
      },
    });

    await stripePost(mockReq("{}"));

    expect(prisma.tenantSubscription.update).toHaveBeenCalledOnce();
    expect(prisma.tenantSubscription.update.mock.calls[0][0].data.status).toBe("PAST_DUE");
  });

  // ── 9. invoice.payment_failed → payment failure email ────────────────────────
  it("invoice.payment_failed sends payment failure email", async () => {
    constructStripeEvent.mockReturnValue({
      type: "invoice.payment_failed",
      data: {
        object: {
          subscription: "sub_stripe_1",
          amount_due:   2900,
        },
      },
    });

    await stripePost(mockReq("{}"));
    await new Promise((r) => setTimeout(r, 50));

    expect(buildPaymentFailureEmail).toHaveBeenCalledOnce();
    expect(sendEmail).toHaveBeenCalledOnce();
  });

  // ── 10. customer.subscription.deleted → cancelSubscription ───────────────────
  it("customer.subscription.deleted calls cancelSubscription", async () => {
    constructStripeEvent.mockReturnValue({
      type: "customer.subscription.deleted",
      data: {
        object: { id: "sub_stripe_1" },
      },
    });

    await stripePost(mockReq("{}"));

    expect(cancelSubscription).toHaveBeenCalledOnce();
    expect(cancelSubscription).toHaveBeenCalledWith(TENANT_ID, "stripe_subscription_deleted");
  });

  // ── 11. Returns 200 { received: true } on all successful events ───────────────
  it("returns 200 with { received: true } on a successful event", async () => {
    constructStripeEvent.mockReturnValue({
      type: "customer.subscription.deleted",
      data: { object: { id: "sub_stripe_1" } },
    });

    const res = await stripePost(mockReq("{}"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ received: true });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// RAZORPAY WEBHOOK TESTS
// ═════════════════════════════════════════════════════════════════════════════

describe("POST /api/billing/razorpay/webhook", () => {

  // ── 1. Invalid signature ────────────────────────────────────────────────────
  it("returns 400 when signature verification throws", async () => {
    verifyRazorpayWebhook.mockImplementation(() => {
      throw new Error("Invalid webhook signature");
    });

    const req = mockReq("{}", { "x-razorpay-signature": "bad_sig" });
    const res = await razorpayPost(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid signature");
  });

  // ── 2. subscription.activated (credit_pack) → grantPurchaseCredits ──────────
  it("subscription.activated (credit_pack) calls grantPurchaseCredits", async () => {
    // No DB sub row for this flow — tenant comes from notes
    prisma.tenantSubscription.findFirst.mockResolvedValue(null);

    const payload = {
      event: "subscription.activated",
      payload: {
        subscription: {
          entity: {
            id: "sub_rzp_1",
            notes: { purchaseType: "credit_pack", tenantId: TENANT_ID, packId: PACK_ID },
          },
        },
        payment: { entity: { amount: 49900 } },
      },
    };

    await razorpayPost(mockReq(payload));

    expect(grantPurchaseCredits).toHaveBeenCalledOnce();
    expect(grantPurchaseCredits).toHaveBeenCalledWith(
      TENANT_ID,
      PACK_ID,
      "sub_rzp_1",
      "RAZORPAY",
      { inr: 499 }
    );
  });

  // ── 3. subscription.activated (credit_pack) → credit purchase email ──────────
  it("subscription.activated (credit_pack) sends credit purchase email", async () => {
    prisma.tenantSubscription.findFirst.mockResolvedValue(null);

    const payload = {
      event: "subscription.activated",
      payload: {
        subscription: {
          entity: {
            id:    "sub_rzp_1",
            notes: { purchaseType: "credit_pack", tenantId: TENANT_ID, packId: PACK_ID },
          },
        },
        payment: { entity: { amount: 49900 } },
      },
    };

    await razorpayPost(mockReq(payload));
    await new Promise((r) => setTimeout(r, 50));

    expect(buildCreditPurchaseEmail).toHaveBeenCalledOnce();
    expect(sendEmail).toHaveBeenCalledOnce();
  });

  // ── 4. subscription.activated (plan) → upgradePlan ───────────────────────────
  it("subscription.activated (plan) calls upgradePlan", async () => {
    prisma.tenantSubscription.findFirst.mockResolvedValue(null);

    const payload = {
      event: "subscription.activated",
      payload: {
        subscription: {
          entity: {
            id:          "sub_rzp_1",
            customer_id: "cust_rzp_1",
            notes:       { tenantId: TENANT_ID },
          },
        },
      },
    };

    await razorpayPost(mockReq(payload));

    expect(upgradePlan).toHaveBeenCalledOnce();
    expect(upgradePlan.mock.calls[0][0]).toBe(TENANT_ID);
    expect(upgradePlan.mock.calls[0][1]).toMatchObject({
      billingProvider:        "RAZORPAY",
      razorpayCustomerId:     "cust_rzp_1",
      razorpaySubscriptionId: "sub_rzp_1",
    });
  });

  // ── 5. subscription.activated (plan) → plan upgrade email ────────────────────
  it("subscription.activated (plan) sends plan upgrade email", async () => {
    prisma.tenantSubscription.findFirst.mockResolvedValue(null);

    const payload = {
      event: "subscription.activated",
      payload: {
        subscription: {
          entity: {
            id:    "sub_rzp_1",
            notes: { tenantId: TENANT_ID },
          },
        },
      },
    };

    await razorpayPost(mockReq(payload));
    await new Promise((r) => setTimeout(r, 50));

    expect(buildPlanUpgradeEmail).toHaveBeenCalledOnce();
    expect(sendEmail).toHaveBeenCalledOnce();
  });

  // ── 6. subscription.charged → updates to ACTIVE + payment confirmation email ─
  it("subscription.charged updates status to ACTIVE and sends payment confirmation email", async () => {
    const createdAt = Math.floor(Date.now() / 1000);
    const payload = {
      event: "subscription.charged",
      payload: {
        subscription: {
          entity: { id: "sub_rzp_1" },
        },
        payment: {
          entity: { id: "pay_rzp_1", amount: 290000, created_at: createdAt },
        },
      },
    };

    await razorpayPost(mockReq(payload));
    await new Promise((r) => setTimeout(r, 50));

    expect(prisma.tenantSubscription.update).toHaveBeenCalledOnce();
    expect(prisma.tenantSubscription.update.mock.calls[0][0].data.status).toBe("ACTIVE");

    expect(buildPaymentConfirmationEmail).toHaveBeenCalledOnce();
    expect(sendEmail).toHaveBeenCalledOnce();
  });

  // ── 7. subscription.halted → updates to PAST_DUE + payment failure email ──────
  it("subscription.halted updates status to PAST_DUE and sends payment failure email", async () => {
    const payload = {
      event: "subscription.halted",
      payload: {
        subscription: {
          entity: { id: "sub_rzp_1" },
        },
        payment: {
          entity: { amount: 290000 },
        },
      },
    };

    await razorpayPost(mockReq(payload));
    await new Promise((r) => setTimeout(r, 50));

    expect(prisma.tenantSubscription.update).toHaveBeenCalledOnce();
    expect(prisma.tenantSubscription.update.mock.calls[0][0].data.status).toBe("PAST_DUE");

    expect(buildPaymentFailureEmail).toHaveBeenCalledOnce();
    expect(sendEmail).toHaveBeenCalledOnce();
  });

  // ── 8. subscription.cancelled → cancelSubscription ───────────────────────────
  it("subscription.cancelled calls cancelSubscription", async () => {
    const payload = {
      event: "subscription.cancelled",
      payload: {
        subscription: {
          entity: { id: "sub_rzp_1", notes: { tenantId: TENANT_ID } },
        },
      },
    };

    await razorpayPost(mockReq(payload));

    expect(cancelSubscription).toHaveBeenCalledOnce();
    expect(cancelSubscription).toHaveBeenCalledWith(TENANT_ID, "razorpay_subscription_cancelled");
  });
});
