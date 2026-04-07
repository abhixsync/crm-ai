import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHmac } from "crypto";

// ─── Constants ───────────────────────────────────────────────────────────────

const TEST_SECRET = "test_webhook_secret_123";
const TENANT_ID   = "tenant-123";
const SUB_DB_ID   = "db-sub-id-1";

// Generates a real HMAC-SHA256 signature for use in signature tests
function sign(body) {
  return createHmac("sha256", TEST_SECRET).update(body).digest("hex");
}

// ─── Mocks (must be declared before any imports that use them) ────────────────

vi.mock("@/lib/prisma", () => ({
  prisma: {
    tenantSubscription: {
      findFirst:   vi.fn(),
      findUnique:  vi.fn(),
      update:      vi.fn(),
      updateMany:  vi.fn(),
    },
    subscriptionInvoice: {
      create: vi.fn(),
    },
    user: {
      findFirst: vi.fn(),
    },
    creditPack: {
      findUnique: vi.fn(),
    },
    inAppNotification: {
      create: vi.fn(),
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
  getCreditBalance:     vi.fn(async () => ({ available: 500 })),
}));

vi.mock("@/lib/notifications/notification-service", () => ({
  createNotification: vi.fn(async () => {}),
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { prisma }             from "@/lib/prisma";
import { verifyRazorpayWebhook } from "@/lib/billing/razorpay";
import { upgradePlan, cancelSubscription } from "@/lib/subscription/subscription-service";
import { grantPurchaseCredits }            from "@/lib/credits/credit-service";
import { createNotification }              from "@/lib/notifications/notification-service";

// Import the route handler via dynamic import inside each test so we can
// control the environment (vi.stubEnv) before the module runs.
// We re-use a single dynamic import cached after the first load.
let POST;
async function getHandler() {
  if (!POST) {
    const mod = await import("@/app/api/billing/razorpay/webhook/route");
    POST = mod.POST;
  }
  return POST;
}

// ─── Payload fixtures ────────────────────────────────────────────────────────

const subscriptionActivated = {
  event: "subscription.activated",
  payload: {
    subscription: {
      entity: {
        id:          "sub_test_abc",
        plan_id:     "plan_test_pro",
        customer_id: "cust_test_abc",
        status:      "active",
        notes:       { tenantId: TENANT_ID },
      },
    },
    payment: {
      entity: {
        id:         "pay_test_abc",
        amount:     29000,
        created_at: 1700000000,
      },
    },
  },
};

const subscriptionCharged = {
  event: "subscription.charged",
  payload: {
    subscription: {
      entity: {
        id:    "sub_test_abc",
        notes: { tenantId: TENANT_ID },
      },
    },
    payment: {
      entity: {
        id:         "pay_test_xyz",
        amount:     29000,
        created_at: 1700000000,
      },
    },
  },
};

const subscriptionCancelled = {
  event: "subscription.cancelled",
  payload: {
    subscription: {
      entity: {
        id:    "sub_test_abc",
        notes: { tenantId: TENANT_ID },
      },
    },
  },
};

const subscriptionHalted = {
  event: "subscription.halted",
  payload: {
    subscription: {
      entity: {
        id:    "sub_test_abc",
        notes: { tenantId: TENANT_ID },
      },
    },
    payment: {
      entity: {
        id:     "pay_test_xyz",
        amount: 29000,
      },
    },
  },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Build a minimal NextRequest-like object the route handler can consume.
function makeRequest(body, signature) {
  const rawBody = typeof body === "string" ? body : JSON.stringify(body);
  return {
    text:    async () => rawBody,
    headers: { get: (name) => (name === "x-razorpay-signature" ? signature : null) },
  };
}

// Make the signature for a given payload object using TEST_SECRET.
function validSig(payload) {
  return sign(JSON.stringify(payload));
}

// Stub a matching DB subscription record for handler tests.
function stubMatchingSub(overrides = {}) {
  prisma.tenantSubscription.findFirst.mockResolvedValue({
    id:       SUB_DB_ID,
    tenantId: TENANT_ID,
    plan:     "PRO",
    ...overrides,
  });
}

// Drain fire-and-forget async IIFEs inside the handler.
function flushAsync() {
  return new Promise((resolve) => setTimeout(resolve, 30));
}

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  // Default: no DB subscription row found (overridden per test as needed)
  prisma.tenantSubscription.findFirst.mockResolvedValue(null);
  prisma.tenantSubscription.update.mockResolvedValue({});
  prisma.tenantSubscription.updateMany.mockResolvedValue({ count: 1 });
  prisma.subscriptionInvoice.create.mockResolvedValue({});
  prisma.user.findFirst.mockResolvedValue(null);
  prisma.inAppNotification.create.mockResolvedValue({});
});

// ═════════════════════════════════════════════════════════════════════════════
// 1. verifyRazorpayWebhook — signature verification unit tests
// ═════════════════════════════════════════════════════════════════════════════

describe("verifyRazorpayWebhook", () => {
  it("succeeds when HMAC signature matches the raw body", () => {
    vi.stubEnv("RAZORPAY_WEBHOOK_SECRET", TEST_SECRET);
    const body = '{"event":"subscription.activated"}';
    const sig  = sign(body);
    expect(() => verifyRazorpayWebhook(body, sig)).not.toThrow();
    vi.unstubAllEnvs();
  });

  it("throws when the provided signature does not match", () => {
    vi.stubEnv("RAZORPAY_WEBHOOK_SECRET", TEST_SECRET);
    const body = '{"event":"subscription.activated"}';
    expect(() => verifyRazorpayWebhook(body, "bad_signature_abc123")).toThrow(
      "Razorpay webhook signature mismatch"
    );
    vi.unstubAllEnvs();
  });

  it("throws when RAZORPAY_WEBHOOK_SECRET env var is not set", () => {
    vi.stubEnv("RAZORPAY_WEBHOOK_SECRET", "");
    const body = '{"event":"subscription.activated"}';
    expect(() => verifyRazorpayWebhook(body, sign(body))).toThrow(
      "RAZORPAY_WEBHOOK_SECRET is not set"
    );
    vi.unstubAllEnvs();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Handler tests — verifyRazorpayWebhook is bypassed via env secret + real HMAC
// so tests focus on business logic, not crypto.
//
// We set RAZORPAY_WEBHOOK_SECRET and pass a real matching signature so the
// verification step passes without stubbing the module itself.
// ═════════════════════════════════════════════════════════════════════════════

describe("POST /api/billing/razorpay/webhook — handler", () => {
  beforeEach(() => {
    vi.stubEnv("RAZORPAY_WEBHOOK_SECRET", TEST_SECRET);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // ── subscription.activated ────────────────────────────────────────────────

  describe("subscription.activated", () => {
    it("calls upgradePlan with tenantId from notes.tenantId when DB row is absent", async () => {
      // No DB subscription match — tenantId comes from notes.tenantId
      prisma.tenantSubscription.findFirst.mockResolvedValue(null);

      const handler = await getHandler();
      const res = await handler(makeRequest(subscriptionActivated, validSig(subscriptionActivated)));

      expect(res.status).toBe(200);
      expect(upgradePlan).toHaveBeenCalledOnce();
      const [calledTenantId] = upgradePlan.mock.calls[0];
      expect(calledTenantId).toBe(TENANT_ID);
    });

    it("falls back to sub.tenantId from DB when notes.tenantId is absent", async () => {
      const payloadNoNotes = {
        ...subscriptionActivated,
        payload: {
          ...subscriptionActivated.payload,
          subscription: {
            entity: {
              ...subscriptionActivated.payload.subscription.entity,
              notes: {}, // no tenantId in notes
            },
          },
        },
      };

      // DB row carries the tenantId
      prisma.tenantSubscription.findFirst.mockResolvedValue({
        id:       SUB_DB_ID,
        tenantId: TENANT_ID,
        plan:     "PRO",
      });

      const handler = await getHandler();
      await handler(makeRequest(payloadNoNotes, validSig(payloadNoNotes)));

      expect(upgradePlan).toHaveBeenCalledOnce();
      expect(upgradePlan.mock.calls[0][0]).toBe(TENANT_ID);
    });

    it("calls grantPurchaseCredits instead of upgradePlan when purchaseType is credit_pack", async () => {
      const creditPackPayload = {
        event: "subscription.activated",
        payload: {
          subscription: {
            entity: {
              id:          "sub_test_abc",
              plan_id:     "plan_test_pro",
              customer_id: "cust_test_abc",
              status:      "active",
              notes:       { tenantId: TENANT_ID, purchaseType: "credit_pack", packId: "pack_pro_50" },
            },
          },
          payment: {
            entity: { id: "pay_test_abc", amount: 29000, created_at: 1700000000 },
          },
        },
      };

      prisma.tenantSubscription.findFirst.mockResolvedValue(null);
      prisma.creditPack.findUnique.mockResolvedValue({ id: "pack_pro_50", credits: 500, bonusCredits: 50, name: "Pro Pack" });

      const handler = await getHandler();
      await handler(makeRequest(creditPackPayload, validSig(creditPackPayload)));

      expect(grantPurchaseCredits).toHaveBeenCalledOnce();
      expect(upgradePlan).not.toHaveBeenCalled();

      const [grantTenantId, grantPackId] = grantPurchaseCredits.mock.calls[0];
      expect(grantTenantId).toBe(TENANT_ID);
      expect(grantPackId).toBe("pack_pro_50");
    });
  });

  // ── subscription.charged ──────────────────────────────────────────────────

  describe("subscription.charged", () => {
    it("converts payment amount from paise to INR (29000 paise → 290 INR)", async () => {
      stubMatchingSub();

      const handler = await getHandler();
      await handler(makeRequest(subscriptionCharged, validSig(subscriptionCharged)));

      expect(prisma.subscriptionInvoice.create).toHaveBeenCalledOnce();
      const invoiceData = prisma.subscriptionInvoice.create.mock.calls[0][0].data;
      expect(invoiceData.amountInr).toBe(290); // 29000 / 100
    });

    it("sets currentPeriodEnd to +31 days from payment created_at timestamp", async () => {
      stubMatchingSub();

      const handler = await getHandler();
      await handler(makeRequest(subscriptionCharged, validSig(subscriptionCharged)));

      expect(prisma.tenantSubscription.update).toHaveBeenCalledOnce();
      const updateData = prisma.tenantSubscription.update.mock.calls[0][0].data;

      const expectedPaidAt     = new Date(1700000000 * 1000);
      const expectedPeriodEnd  = new Date(expectedPaidAt.getTime() + 31 * 24 * 60 * 60 * 1000);
      expect(updateData.currentPeriodEnd.getTime()).toBe(expectedPeriodEnd.getTime());
    });

    it("creates a SubscriptionInvoice record with currency INR and status PAID", async () => {
      stubMatchingSub();

      const handler = await getHandler();
      await handler(makeRequest(subscriptionCharged, validSig(subscriptionCharged)));

      expect(prisma.subscriptionInvoice.create).toHaveBeenCalledOnce();
      const invoiceData = prisma.subscriptionInvoice.create.mock.calls[0][0].data;
      expect(invoiceData.currency).toBe("INR");
      expect(invoiceData.status).toBe("PAID");
      expect(invoiceData.billingProvider).toBe("RAZORPAY");
      expect(invoiceData.externalInvoiceId).toBe("pay_test_xyz");
    });

    it("skips invoice creation when no matching DB subscription row exists", async () => {
      // findFirst returns null → sub is null → handler skips the charged block
      prisma.tenantSubscription.findFirst.mockResolvedValue(null);

      const handler = await getHandler();
      await handler(makeRequest(subscriptionCharged, validSig(subscriptionCharged)));

      expect(prisma.subscriptionInvoice.create).not.toHaveBeenCalled();
    });
  });

  // ── subscription.cancelled ────────────────────────────────────────────────

  describe("subscription.cancelled", () => {
    it("calls cancelSubscription with the tenantId from notes", async () => {
      prisma.tenantSubscription.findFirst.mockResolvedValue(null);

      const handler = await getHandler();
      await handler(makeRequest(subscriptionCancelled, validSig(subscriptionCancelled)));

      expect(cancelSubscription).toHaveBeenCalledOnce();
      expect(cancelSubscription.mock.calls[0][0]).toBe(TENANT_ID);
    });
  });

  // ── subscription.halted ───────────────────────────────────────────────────

  describe("subscription.halted", () => {
    it("sets subscription status to PAST_DUE", async () => {
      stubMatchingSub();

      const handler = await getHandler();
      await handler(makeRequest(subscriptionHalted, validSig(subscriptionHalted)));

      expect(prisma.tenantSubscription.update).toHaveBeenCalledOnce();
      const updateData = prisma.tenantSubscription.update.mock.calls[0][0].data;
      expect(updateData.status).toBe("PAST_DUE");
    });
  });

  // ── unknown event ─────────────────────────────────────────────────────────

  describe("unknown event", () => {
    it("returns { received: true } without error for unrecognised event type", async () => {
      const unknownPayload = { event: "payment.captured", payload: {} };

      const handler = await getHandler();
      const res = await handler(makeRequest(unknownPayload, validSig(unknownPayload)));

      const body = await res.json();
      expect(body).toEqual({ received: true });
    });
  });

  // ── bad request scenarios ─────────────────────────────────────────────────

  describe("invalid input", () => {
    it("returns 400 for invalid JSON body (signature passes, body unparseable)", async () => {
      // The handler verifies signature BEFORE parsing JSON.
      // With a valid secret set, we need a real sig for the raw string,
      // but the JSON.parse step will fail and return 400.
      const rawGarbage = "not-valid-json{{{";
      const sig = sign(rawGarbage);

      const handler = await getHandler();
      const res = await handler(makeRequest(rawGarbage, sig));

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("Invalid JSON");
    });

    it("returns 400 when the x-razorpay-signature header is wrong", async () => {
      const handler = await getHandler();
      const res = await handler(makeRequest(subscriptionActivated, "wrong_signature_xyz"));

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("Invalid signature");
    });
  });
});
