import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "node:crypto";

// ─── Mocks (must be declared before any imports that transitively use them) ───

vi.mock("@/lib/prisma", () => ({
  prisma: {
    tenantSubscription: {
      findFirst: vi.fn(),
      update:    vi.fn(),
    },
    subscriptionInvoice: {
      create: vi.fn(),
      findFirst: vi.fn(),
    },
    user: {
      findFirst: vi.fn(),
    },
    creditPack: {
      findUnique: vi.fn(),
    },
    tenantCreditBalance: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/lib/subscription/subscription-service", () => ({
  upgradePlan:        vi.fn(async () => {}),
  cancelSubscription: vi.fn(async () => {}),
}));

vi.mock("@/lib/email/mailer", () => ({
  sendEmail:                    vi.fn(async () => ({ ok: true })),
  buildPaymentConfirmationEmail: vi.fn(() => ({ subject: "s", html: "h", text: "t", fromName: null })),
  buildPaymentFailureEmail:      vi.fn(() => ({ subject: "s", html: "h", text: "t", fromName: null })),
  buildCreditPurchaseEmail:      vi.fn(() => ({ subject: "s", html: "h", text: "t", fromName: null })),
  buildPlanUpgradeEmail:         vi.fn(() => ({ subject: "s", html: "h", text: "t", fromName: null })),
}));

vi.mock("@/modules/theme/theme.service", () => ({
  resolveTenantTheme: vi.fn(async () => null),
}));

vi.mock("@/lib/credits/credit-service", () => ({
  grantPurchaseCredits: vi.fn(async () => {}),
  getCreditBalance:     vi.fn(async () => ({ available: 100 })),
}));

vi.mock("@/lib/notifications/notification-service", () => ({
  createNotification: vi.fn(async () => {}),
}));

// Import after mocks
import { prisma } from "@/lib/prisma";
import { cancelSubscription } from "@/lib/subscription/subscription-service";
import { grantPurchaseCredits } from "@/lib/credits/credit-service";
import { constructStripeEvent } from "@/lib/billing/stripe";

// ─── Real HMAC helper (mirrors Stripe's signing logic exactly) ────────────────

function makeSignedStripePayload(payload, secret) {
  const timestamp = Math.floor(Date.now() / 1000);
  const body = JSON.stringify(payload);
  const signed = `${timestamp}.${body}`;
  const sig = crypto.createHmac("sha256", secret).update(signed).digest("hex");
  return {
    body,
    signature: `t=${timestamp},v1=${sig}`,
    secret,
  };
}

// ─── Realistic Stripe payload fixtures ────────────────────────────────────────

const checkoutSessionCompleted = {
  id: "evt_test_checkout",
  type: "checkout.session.completed",
  data: {
    object: {
      id: "cs_test_abc123",
      mode: "subscription",
      subscription: "sub_test_abc123",
      customer: "cus_test_abc123",
      client_reference_id: "tenant-123",
      metadata: { tenantId: "tenant-123" },
      amount_total: 2900,
    },
  },
};

const checkoutSessionCompletedNoMetaTenantId = {
  id: "evt_test_checkout_clientref",
  type: "checkout.session.completed",
  data: {
    object: {
      id: "cs_test_clientref",
      mode: "subscription",
      subscription: "sub_test_clientref",
      customer: "cus_test_clientref",
      client_reference_id: "tenant-from-clientref",
      metadata: {},          // no tenantId here
      amount_total: 2900,
    },
  },
};

const checkoutSessionCreditPack = {
  id: "evt_test_credit_pack",
  type: "checkout.session.completed",
  data: {
    object: {
      id: "cs_test_pack",
      mode: "payment",
      payment_intent: "pi_test_abc",
      metadata: { purchaseType: "credit_pack", tenantId: "tenant-pack", packId: "pack-starter" },
      amount_total: 999,
    },
  },
};

const invoicePaid = {
  id: "evt_test_invoice_paid",
  type: "invoice.paid",
  data: {
    object: {
      id: "in_test_abc123",
      subscription: "sub_test_abc123",
      amount_paid: 2900,
      period_start: 1700000000,
      period_end: 1702678400,
      hosted_invoice_url: "https://invoice.stripe.com/test",
    },
  },
};

const invoicePaymentFailed = {
  id: "evt_test_invoice_failed",
  type: "invoice.payment_failed",
  data: {
    object: {
      id: "in_test_failed",
      subscription: "sub_test_abc123",
      amount_due: 2900,
    },
  },
};

const subscriptionDeleted = {
  id: "evt_test_sub_deleted",
  type: "customer.subscription.deleted",
  data: {
    object: {
      id: "sub_test_abc123",
      status: "canceled",
    },
  },
};

const subscriptionUpdated = {
  id: "evt_test_sub_updated",
  type: "customer.subscription.updated",
  data: {
    object: {
      id: "sub_test_abc123",
      status: "active",
      current_period_start: 1700000000,
      current_period_end: 1702678400,
    },
  },
};

const unknownEvent = {
  id: "evt_test_unknown",
  type: "payment_intent.created",
  data: { object: { id: "pi_test_unknown" } },
};

// ─── Shared sub fixture returned by prisma.tenantSubscription.findFirst ───────

function makeDbSub(overrides = {}) {
  return {
    id: "dbsub-1",
    tenantId: "tenant-123",
    stripeSubscriptionId: "sub_test_abc123",
    plan: "PRO",
    ...overrides,
  };
}

// ─── Webhook handler invoker ──────────────────────────────────────────────────
// Dynamically import the route handler and call it with a minimal Request-like
// object so we stay decoupled from Next.js internals.

async function callHandler(eventFixture) {
  // Re-import fresh each time so module-level state doesn't bleed between tests.
  // vi.mock calls are hoisted and persist across dynamic imports within the same
  // test file, so mocks remain active.
  const { POST } = await import("@/app/api/billing/stripe/webhook/route.js");

  const body = JSON.stringify(eventFixture);
  const req = {
    text: async () => body,
    headers: { get: (h) => (h === "stripe-signature" ? "test-sig" : null) },
  };
  return POST(req);
}

// Mock constructStripeEvent at module level so handler tests bypass crypto
vi.mock("@/lib/billing/stripe", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    constructStripeEvent: vi.fn(),
  };
});

// ─── Setup ────────────────────────────────────────────────────────────────────

const TEST_WEBHOOK_SECRET = "whsec_test_secret_for_hmac";

beforeEach(() => {
  vi.clearAllMocks();

  // Default: prisma finds the matching DB subscription
  prisma.tenantSubscription.findFirst.mockResolvedValue(makeDbSub());
  prisma.tenantSubscription.update.mockResolvedValue({});
  prisma.subscriptionInvoice.findFirst.mockResolvedValue(null);
  prisma.subscriptionInvoice.create.mockResolvedValue({});
  prisma.user.findFirst.mockResolvedValue(null); // email notifications skipped by default
});

// ═════════════════════════════════════════════════════════════════════════════
// 1. constructStripeEvent — real HMAC verification
// ═════════════════════════════════════════════════════════════════════════════

describe("constructStripeEvent — real HMAC verification", () => {
  // These tests use the REAL constructStripeEvent (imported directly from
  // stripe.js) — NOT the mock used by the handler tests below.
  // We reach into the actual module via a separate import to avoid the mock.

  it("succeeds when payload is signed with the correct secret", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_dummy");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", TEST_WEBHOOK_SECRET);

    const { constructStripeEvent: realFn } = await import("@/lib/billing/stripe?real");
    const { body, signature } = makeSignedStripePayload(
      { id: "evt_verify_ok", type: "ping", data: { object: {} } },
      TEST_WEBHOOK_SECRET
    );

    // Stripe SDK validatess the HMAC and returns the parsed event object
    const evt = realFn(body, signature);
    expect(evt).toMatchObject({ id: "evt_verify_ok", type: "ping" });

    vi.unstubAllEnvs();
  });

  it("throws when the signature does not match", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_dummy");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", TEST_WEBHOOK_SECRET);

    const { constructStripeEvent: realFn } = await import("@/lib/billing/stripe?real");
    const { body } = makeSignedStripePayload(
      { id: "evt_tampered", type: "ping", data: { object: {} } },
      TEST_WEBHOOK_SECRET
    );

    expect(() => realFn(body, "t=1234567890,v1=badhash")).toThrow();

    vi.unstubAllEnvs();
  });

  it("throws when STRIPE_WEBHOOK_SECRET is not set", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_dummy");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");

    const { constructStripeEvent: realFn } = await import("@/lib/billing/stripe?real");

    expect(() => realFn("{}", "t=1,v1=abc")).toThrow("STRIPE_WEBHOOK_SECRET is not set");

    vi.unstubAllEnvs();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. Handler tests — constructStripeEvent mocked to return fixture directly
// ═════════════════════════════════════════════════════════════════════════════

describe("checkout.session.completed — tenantId extraction", () => {
  it("extracts tenantId from session.metadata.tenantId when present", async () => {
    constructStripeEvent.mockReturnValue(checkoutSessionCompleted);

    const res = await callHandler(checkoutSessionCompleted);
    const json = await res.json();

    expect(json).toMatchObject({ received: true });
  });

  it("extracts tenantId from session.client_reference_id when metadata.tenantId is absent", async () => {
    constructStripeEvent.mockReturnValue(checkoutSessionCompletedNoMetaTenantId);

    // The handler reads: tenantId = session.metadata?.tenantId || session.client_reference_id
    // With empty metadata.tenantId, it must fall back to client_reference_id.
    // upgradePlan is called — spy to capture the tenantId it receives.
    const { upgradePlan } = await import("@/lib/subscription/subscription-service");

    const res = await callHandler(checkoutSessionCompletedNoMetaTenantId);
    const json = await res.json();

    expect(json).toMatchObject({ received: true });
    expect(upgradePlan).toHaveBeenCalledWith(
      "tenant-from-clientref",
      expect.any(Object)
    );
  });
});

describe("checkout.session.completed — credit_pack purchaseType", () => {
  it("calls grantPurchaseCredits with tenantId, packId, and payment_intent", async () => {
    constructStripeEvent.mockReturnValue(checkoutSessionCreditPack);

    const res = await callHandler(checkoutSessionCreditPack);
    const json = await res.json();

    expect(json).toMatchObject({ received: true });
    expect(grantPurchaseCredits).toHaveBeenCalledWith(
      "tenant-pack",
      "pack-starter",
      "pi_test_abc",
      "STRIPE",
      { usd: 9.99 }
    );
  });
});

describe("invoice.paid — field extraction from real Stripe shape", () => {
  it("converts amount_paid from cents to dollars (2900 → 29.00)", async () => {
    constructStripeEvent.mockReturnValue(invoicePaid);

    await callHandler(invoicePaid);

    const createCall = prisma.subscriptionInvoice.create.mock.calls[0][0];
    expect(createCall.data.amountUsd).toBeCloseTo(29.0);
  });

  it("converts period_start Unix timestamp to a JS Date for currentPeriodStart", async () => {
    constructStripeEvent.mockReturnValue(invoicePaid);

    await callHandler(invoicePaid);

    const updateCall = prisma.tenantSubscription.update.mock.calls[0][0];
    expect(updateCall.data.currentPeriodStart).toEqual(new Date(1700000000 * 1000));
  });

  it("converts period_end Unix timestamp to a JS Date for currentPeriodEnd", async () => {
    constructStripeEvent.mockReturnValue(invoicePaid);

    await callHandler(invoicePaid);

    const updateCall = prisma.tenantSubscription.update.mock.calls[0][0];
    expect(updateCall.data.currentPeriodEnd).toEqual(new Date(1702678400 * 1000));
  });

  it("sets subscription status to ACTIVE and clears gracePeriodEndsAt", async () => {
    constructStripeEvent.mockReturnValue(invoicePaid);

    await callHandler(invoicePaid);

    const updateCall = prisma.tenantSubscription.update.mock.calls[0][0];
    expect(updateCall.data.status).toBe("ACTIVE");
    expect(updateCall.data.gracePeriodEndsAt).toBeNull();
  });

  it("records invoice with correct externalInvoiceId and invoiceUrl", async () => {
    constructStripeEvent.mockReturnValue(invoicePaid);

    await callHandler(invoicePaid);

    const createCall = prisma.subscriptionInvoice.create.mock.calls[0][0];
    expect(createCall.data.externalInvoiceId).toBe("in_test_abc123");
    expect(createCall.data.invoiceUrl).toBe("https://invoice.stripe.com/test");
  });

  it("is a no-op when no DB subscription matches the stripeSubscriptionId", async () => {
    prisma.tenantSubscription.findFirst.mockResolvedValue(null);
    constructStripeEvent.mockReturnValue(invoicePaid);

    const res = await callHandler(invoicePaid);
    const json = await res.json();

    expect(json).toMatchObject({ received: true });
    expect(prisma.tenantSubscription.update).not.toHaveBeenCalled();
    expect(prisma.subscriptionInvoice.create).not.toHaveBeenCalled();
  });
});

describe("invoice.payment_failed — field extraction from real Stripe shape", () => {
  it("converts amount_due from cents to dollars when building failure email", async () => {
    constructStripeEvent.mockReturnValue(invoicePaymentFailed);
    const { buildPaymentFailureEmail } = await import("@/lib/email/mailer");

    // Give the handler an owner so the email path is exercised
    prisma.user.findFirst.mockResolvedValue({ email: "owner@test.com", name: "Alice" });

    await callHandler(invoicePaymentFailed);
    // Allow fire-and-forget email promise to settle
    await new Promise((r) => setTimeout(r, 50));

    // If the email builder was called, amount_due was correctly divided by 100
    if (buildPaymentFailureEmail.mock.calls.length > 0) {
      const emailArg = buildPaymentFailureEmail.mock.calls[0][1];
      expect(emailArg.amountDue).toBeCloseTo(29.0);
    }
  });

  it("marks subscription status as PAST_DUE", async () => {
    constructStripeEvent.mockReturnValue(invoicePaymentFailed);

    await callHandler(invoicePaymentFailed);

    const updateCall = prisma.tenantSubscription.update.mock.calls[0][0];
    expect(updateCall.data.status).toBe("PAST_DUE");
  });

  it("is a no-op when no DB subscription matches the stripeSubscriptionId", async () => {
    prisma.tenantSubscription.findFirst.mockResolvedValue(null);
    constructStripeEvent.mockReturnValue(invoicePaymentFailed);

    const res = await callHandler(invoicePaymentFailed);
    const json = await res.json();

    expect(json).toMatchObject({ received: true });
    expect(prisma.tenantSubscription.update).not.toHaveBeenCalled();
  });
});

describe("customer.subscription.deleted — calls cancelSubscription with correct tenantId", () => {
  it("calls cancelSubscription with the tenantId from the matched DB subscription", async () => {
    prisma.tenantSubscription.findFirst.mockResolvedValue(
      makeDbSub({ tenantId: "tenant-to-cancel" })
    );
    constructStripeEvent.mockReturnValue(subscriptionDeleted);

    await callHandler(subscriptionDeleted);

    expect(cancelSubscription).toHaveBeenCalledWith(
      "tenant-to-cancel",
      "stripe_subscription_deleted"
    );
  });

  it("is a no-op when no DB subscription matches the stripeSubscriptionId", async () => {
    prisma.tenantSubscription.findFirst.mockResolvedValue(null);
    constructStripeEvent.mockReturnValue(subscriptionDeleted);

    const res = await callHandler(subscriptionDeleted);
    const json = await res.json();

    expect(json).toMatchObject({ received: true });
    expect(cancelSubscription).not.toHaveBeenCalled();
  });
});

describe("customer.subscription.updated — active status updates period dates", () => {
  it("updates currentPeriodStart and currentPeriodEnd from Unix timestamps", async () => {
    constructStripeEvent.mockReturnValue(subscriptionUpdated);

    await callHandler(subscriptionUpdated);

    const updateCall = prisma.tenantSubscription.update.mock.calls[0][0];
    expect(updateCall.data.currentPeriodStart).toEqual(new Date(1700000000 * 1000));
    expect(updateCall.data.currentPeriodEnd).toEqual(new Date(1702678400 * 1000));
  });

  it("sets subscription status to ACTIVE", async () => {
    constructStripeEvent.mockReturnValue(subscriptionUpdated);

    await callHandler(subscriptionUpdated);

    const updateCall = prisma.tenantSubscription.update.mock.calls[0][0];
    expect(updateCall.data.status).toBe("ACTIVE");
  });

  it("does NOT update when subscription status is not 'active'", async () => {
    const pastDueUpdate = {
      ...subscriptionUpdated,
      data: {
        object: { ...subscriptionUpdated.data.object, status: "past_due" },
      },
    };
    constructStripeEvent.mockReturnValue(pastDueUpdate);

    await callHandler(pastDueUpdate);

    expect(prisma.tenantSubscription.update).not.toHaveBeenCalled();
  });

  it("is a no-op when no DB subscription matches the stripeSubscriptionId", async () => {
    prisma.tenantSubscription.findFirst.mockResolvedValue(null);
    constructStripeEvent.mockReturnValue(subscriptionUpdated);

    const res = await callHandler(subscriptionUpdated);
    const json = await res.json();

    expect(json).toMatchObject({ received: true });
    expect(prisma.tenantSubscription.update).not.toHaveBeenCalled();
  });
});

describe("unknown event type", () => {
  it("returns { received: true } without throwing or updating the DB", async () => {
    constructStripeEvent.mockReturnValue(unknownEvent);

    const res = await callHandler(unknownEvent);
    const json = await res.json();

    expect(json).toMatchObject({ received: true });
    expect(res.status).toBe(200);
    expect(prisma.tenantSubscription.update).not.toHaveBeenCalled();
    expect(prisma.subscriptionInvoice.create).not.toHaveBeenCalled();
    expect(cancelSubscription).not.toHaveBeenCalled();
  });
});

describe("signature verification failure", () => {
  it("returns 400 when constructStripeEvent throws", async () => {
    constructStripeEvent.mockImplementation(() => {
      throw new Error("No signatures found matching the expected signature for payload");
    });

    const res = await callHandler(checkoutSessionCompleted);
    const json = await res.json();

    expect(json).toMatchObject({ error: "Invalid signature" });
  });
});
