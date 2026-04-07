import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock nodemailer before any import that uses it ──────────────────────────
// vi.mock is hoisted — the factory must be self-contained (no outer const refs).
// We expose the mock fns via the module's named export so tests can access them.

vi.mock("nodemailer", () => {
  const sendMail = vi.fn();
  const createTransport = vi.fn(() => ({ sendMail }));
  return { default: { createTransport, __sendMail: sendMail } };
});

import nodemailer from "nodemailer";

// After import, grab the spy references that live inside the mock.
// nodemailer.__sendMail is the shared vi.fn() the factory exposed.
const mockSendMail       = nodemailer.__sendMail;
const mockCreateTransport = nodemailer.createTransport;

import {
  sendEmail,
  buildVerificationEmail,
  buildTrialWelcomeEmail,
  buildTrialExpiryWarningEmail,
  buildPaymentConfirmationEmail,
  buildPaymentFailureEmail,
  buildCreditPurchaseEmail,
  buildPlanDowngradeEmail,
  buildAccountSuspendEmail,
  buildCreditLowWarningEmail,
  buildPlanUpgradeEmail,
  buildCampaignCompletionEmail,
  buildPasswordResetEmail,
  buildTeamInviteEmail,
  buildCreditExpiringSoonEmail,
  buildRenewalReminderEmail,
} from "@/lib/email/mailer";

// ─── Test constants ───────────────────────────────────────────────────────────

const BASE_URL = "http://localhost:3000";
const BRAND    = "Acme CRM";
const COLOR    = "#FF6600";
const NAME     = "Alice";
const TOKEN    = "abc123token";

// A future date used for trial/expiry fields
const FUTURE_DATE = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SMTP_HOST    = "smtp.example.com";
  process.env.APP_BASE_URL = BASE_URL;
  mockSendMail.mockResolvedValue({ messageId: "msg_001" });
});

// ─── sendEmail() ─────────────────────────────────────────────────────────────

describe("sendEmail", () => {
  it("returns { ok: true, skipped: true } when SMTP_HOST not set", async () => {
    delete process.env.SMTP_HOST;
    const result = await sendEmail({ to: "x@x.com", subject: "hi", html: "<p>hi</p>" });
    expect(result).toMatchObject({ ok: true, skipped: true });
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it("returns { ok: true, messageId } on successful send", async () => {
    const result = await sendEmail({ to: "x@x.com", subject: "hi", html: "<p>hi</p>" });
    expect(result).toMatchObject({ ok: true, messageId: "msg_001" });
  });

  it("returns { ok: false, error } when transporter throws", async () => {
    mockSendMail.mockRejectedValue(new Error("connection refused"));
    const result = await sendEmail({ to: "x@x.com", subject: "hi", html: "<p>hi</p>" });
    expect(result).toMatchObject({ ok: false, error: "connection refused" });
  });

  it("sets from as \"Name\" <addr> when fromName provided", async () => {
    await sendEmail({ to: "x@x.com", subject: "hi", html: "<p>hi</p>", fromName: "My Brand" });
    const callArgs = mockSendMail.mock.calls[0][0];
    expect(callArgs.from).toMatch(/^"My Brand"/);
  });

  it("sets from as bare address when no fromName provided", async () => {
    await sendEmail({ to: "x@x.com", subject: "hi", html: "<p>hi</p>" });
    const callArgs = mockSendMail.mock.calls[0][0];
    // bare address has no leading quote
    expect(callArgs.from).not.toMatch(/^"/);
  });
});

// ─── Template helper ─────────────────────────────────────────────────────────

/**
 * Shared assertions applied to every template result.
 * @param {object} result   - the object returned by a build*Email function
 * @param {string} brandName - expected brand label in subject/html
 * @param {string} color     - expected hex color in html
 */
function assertCommonTemplate(result, brandName, color) {
  expect(result.subject).toContain(brandName);
  expect(result.html).toContain(brandName);
  expect(result.html).toContain(color);
  expect(typeof result.text).toBe("string");
  expect(result.text.length).toBeGreaterThan(0);
}

// ─── 1. buildVerificationEmail ───────────────────────────────────────────────

describe("buildVerificationEmail", () => {
  it("subject contains brandName", () => {
    const r = buildVerificationEmail(NAME, TOKEN, { brandName: BRAND, primaryColor: COLOR });
    expect(r.subject).toContain(BRAND);
  });

  it("subject falls back to WrenForge when no brandName", () => {
    const r = buildVerificationEmail(NAME, TOKEN);
    expect(r.subject).toContain("WrenForge");
  });

  it("subject contains Verify", () => {
    const r = buildVerificationEmail(NAME, TOKEN, { brandName: BRAND });
    expect(r.subject.toLowerCase()).toContain("verify");
  });

  it("html contains brandName", () => {
    const r = buildVerificationEmail(NAME, TOKEN, { brandName: BRAND, primaryColor: COLOR });
    expect(r.html).toContain(BRAND);
  });

  it("html contains primaryColor", () => {
    const r = buildVerificationEmail(NAME, TOKEN, { brandName: BRAND, primaryColor: COLOR });
    expect(r.html).toContain(COLOR);
  });

  it("html falls back to #1DE9A8 when no primaryColor", () => {
    const r = buildVerificationEmail(NAME, TOKEN, { brandName: BRAND });
    expect(r.html).toContain("#1DE9A8");
  });

  it("html contains verify URL with token", () => {
    const r = buildVerificationEmail(NAME, TOKEN, { brandName: BRAND });
    expect(r.html).toContain(`/api/auth/verify-email?token=${TOKEN}`);
  });

  it("text is a non-empty string", () => {
    const r = buildVerificationEmail(NAME, TOKEN, { brandName: BRAND });
    expect(typeof r.text).toBe("string");
    expect(r.text.length).toBeGreaterThan(0);
  });

  it("fromName is returned in result", () => {
    const r = buildVerificationEmail(NAME, TOKEN, { brandName: BRAND, fromName: "Sender" });
    expect(r.fromName).toBe("Sender");
  });

  it("html contains CTA button href pointing to verify URL", () => {
    const r = buildVerificationEmail(NAME, TOKEN, { brandName: BRAND });
    expect(r.html).toContain(`href="${BASE_URL}/api/auth/verify-email?token=${TOKEN}"`);
  });
});

// ─── 2. buildTrialWelcomeEmail ────────────────────────────────────────────────

describe("buildTrialWelcomeEmail", () => {
  it("subject contains brandName", () => {
    const r = buildTrialWelcomeEmail(NAME, FUTURE_DATE, { brandName: BRAND, primaryColor: COLOR });
    expect(r.subject).toContain(BRAND);
  });

  it("subject falls back to WrenForge when no brandName", () => {
    const r = buildTrialWelcomeEmail(NAME, FUTURE_DATE);
    expect(r.subject).toContain("WrenForge");
  });

  it("subject contains trial is active", () => {
    const r = buildTrialWelcomeEmail(NAME, FUTURE_DATE, { brandName: BRAND });
    expect(r.subject.toLowerCase()).toContain("trial is active");
  });

  it("html contains brandName", () => {
    const r = buildTrialWelcomeEmail(NAME, FUTURE_DATE, { brandName: BRAND, primaryColor: COLOR });
    expect(r.html).toContain(BRAND);
  });

  it("html contains primaryColor", () => {
    const r = buildTrialWelcomeEmail(NAME, FUTURE_DATE, { brandName: BRAND, primaryColor: COLOR });
    expect(r.html).toContain(COLOR);
  });

  it("html falls back to #1DE9A8 when no primaryColor", () => {
    const r = buildTrialWelcomeEmail(NAME, FUTURE_DATE, { brandName: BRAND });
    expect(r.html).toContain("#1DE9A8");
  });

  it("html contains dashboard link", () => {
    const r = buildTrialWelcomeEmail(NAME, FUTURE_DATE, { brandName: BRAND });
    expect(r.html).toContain(`${BASE_URL}/dashboard`);
  });

  it("text is a non-empty string", () => {
    const r = buildTrialWelcomeEmail(NAME, FUTURE_DATE, { brandName: BRAND });
    expect(typeof r.text).toBe("string");
    expect(r.text.length).toBeGreaterThan(0);
  });

  it("fromName is returned in result", () => {
    const r = buildTrialWelcomeEmail(NAME, FUTURE_DATE, { brandName: BRAND, fromName: "Sender" });
    expect(r.fromName).toBe("Sender");
  });

  it("html CTA button points to dashboard", () => {
    const r = buildTrialWelcomeEmail(NAME, FUTURE_DATE, { brandName: BRAND });
    expect(r.html).toContain(`href="${BASE_URL}/dashboard"`);
  });
});

// ─── 3. buildTrialExpiryWarningEmail ─────────────────────────────────────────

describe("buildTrialExpiryWarningEmail", () => {
  it("subject contains brandName", () => {
    const r = buildTrialExpiryWarningEmail(NAME, FUTURE_DATE, 7, { brandName: BRAND, primaryColor: COLOR });
    expect(r.subject).toContain(BRAND);
  });

  it("subject falls back to WrenForge when no brandName", () => {
    const r = buildTrialExpiryWarningEmail(NAME, FUTURE_DATE, 7);
    expect(r.subject).toContain("WrenForge");
  });

  it("html contains brandName", () => {
    const r = buildTrialExpiryWarningEmail(NAME, FUTURE_DATE, 7, { brandName: BRAND, primaryColor: COLOR });
    expect(r.html).toContain(BRAND);
  });

  it("html contains primaryColor", () => {
    const r = buildTrialExpiryWarningEmail(NAME, FUTURE_DATE, 7, { brandName: BRAND, primaryColor: COLOR });
    expect(r.html).toContain(COLOR);
  });

  it("html falls back to #1DE9A8 when no primaryColor", () => {
    const r = buildTrialExpiryWarningEmail(NAME, FUTURE_DATE, 7);
    expect(r.html).toContain("#1DE9A8");
  });

  it("uses red urgency color #EF4444 when daysLeft is 1", () => {
    const r = buildTrialExpiryWarningEmail(NAME, FUTURE_DATE, 1, { brandName: BRAND });
    expect(r.html).toContain("#EF4444");
  });

  it("uses accent color (not red) when daysLeft is 7", () => {
    const r = buildTrialExpiryWarningEmail(NAME, FUTURE_DATE, 7, { brandName: BRAND, primaryColor: COLOR });
    // COLOR is the accent; red should NOT appear as urgency for 7 days
    expect(r.html).not.toContain("#EF4444");
  });

  it("text is a non-empty string", () => {
    const r = buildTrialExpiryWarningEmail(NAME, FUTURE_DATE, 3, { brandName: BRAND });
    expect(typeof r.text).toBe("string");
    expect(r.text.length).toBeGreaterThan(0);
  });

  it("fromName is returned in result", () => {
    const r = buildTrialExpiryWarningEmail(NAME, FUTURE_DATE, 3, { brandName: BRAND, fromName: "Sender" });
    expect(r.fromName).toBe("Sender");
  });

  it("html CTA button points to billing page", () => {
    const r = buildTrialExpiryWarningEmail(NAME, FUTURE_DATE, 7, { brandName: BRAND });
    expect(r.html).toContain(`href="${BASE_URL}/admin/billing"`);
  });
});

// ─── 4. buildPaymentConfirmationEmail ────────────────────────────────────────

describe("buildPaymentConfirmationEmail", () => {
  const INVOICE = { amountPaid: 2900, currency: "USD", plan: "PRO" };

  it("subject contains brandName", () => {
    const r = buildPaymentConfirmationEmail(NAME, INVOICE, { brandName: BRAND, primaryColor: COLOR });
    expect(r.subject).toContain(BRAND);
  });

  it("subject falls back to WrenForge when no brandName", () => {
    const r = buildPaymentConfirmationEmail(NAME, INVOICE);
    expect(r.subject).toContain("WrenForge");
  });

  it("html contains brandName", () => {
    const r = buildPaymentConfirmationEmail(NAME, INVOICE, { brandName: BRAND, primaryColor: COLOR });
    expect(r.html).toContain(BRAND);
  });

  it("html contains primaryColor", () => {
    const r = buildPaymentConfirmationEmail(NAME, INVOICE, { brandName: BRAND, primaryColor: COLOR });
    expect(r.html).toContain(COLOR);
  });

  it("html falls back to #1DE9A8 when no primaryColor", () => {
    const r = buildPaymentConfirmationEmail(NAME, INVOICE);
    expect(r.html).toContain("#1DE9A8");
  });

  it("html shows $29.00 for amountPaid 2900 USD", () => {
    const r = buildPaymentConfirmationEmail(NAME, INVOICE, { brandName: BRAND });
    expect(r.html).toContain("$29.00");
  });

  it("text is a non-empty string", () => {
    const r = buildPaymentConfirmationEmail(NAME, INVOICE, { brandName: BRAND });
    expect(typeof r.text).toBe("string");
    expect(r.text.length).toBeGreaterThan(0);
  });

  it("fromName is returned in result", () => {
    const r = buildPaymentConfirmationEmail(NAME, INVOICE, { brandName: BRAND, fromName: "Sender" });
    expect(r.fromName).toBe("Sender");
  });

  it("html CTA button points to billing page", () => {
    const r = buildPaymentConfirmationEmail(NAME, INVOICE, { brandName: BRAND });
    expect(r.html).toContain(`href="${BASE_URL}/admin/billing"`);
  });
});

// ─── 5. buildPaymentFailureEmail ─────────────────────────────────────────────

describe("buildPaymentFailureEmail", () => {
  const INVOICE = { amountDue: 2900, currency: "USD" };

  it("subject contains brandName", () => {
    const r = buildPaymentFailureEmail(NAME, INVOICE, { brandName: BRAND, primaryColor: COLOR });
    expect(r.subject).toContain(BRAND);
  });

  it("subject falls back to WrenForge when no brandName", () => {
    const r = buildPaymentFailureEmail(NAME, INVOICE);
    expect(r.subject).toContain("WrenForge");
  });

  it("html contains brandName", () => {
    const r = buildPaymentFailureEmail(NAME, INVOICE, { brandName: BRAND, primaryColor: COLOR });
    expect(r.html).toContain(BRAND);
  });

  it("html contains primaryColor", () => {
    const r = buildPaymentFailureEmail(NAME, INVOICE, { brandName: BRAND, primaryColor: COLOR });
    expect(r.html).toContain(COLOR);
  });

  it("html falls back to #1DE9A8 when no primaryColor", () => {
    const r = buildPaymentFailureEmail(NAME, INVOICE);
    expect(r.html).toContain("#1DE9A8");
  });

  it("html shows $29.00 for amountDue 2900 USD", () => {
    const r = buildPaymentFailureEmail(NAME, INVOICE, { brandName: BRAND });
    expect(r.html).toContain("$29.00");
  });

  it("text is a non-empty string", () => {
    const r = buildPaymentFailureEmail(NAME, INVOICE, { brandName: BRAND });
    expect(typeof r.text).toBe("string");
    expect(r.text.length).toBeGreaterThan(0);
  });

  it("fromName is returned in result", () => {
    const r = buildPaymentFailureEmail(NAME, INVOICE, { brandName: BRAND, fromName: "Sender" });
    expect(r.fromName).toBe("Sender");
  });

  it("html CTA button points to billing page", () => {
    const r = buildPaymentFailureEmail(NAME, INVOICE, { brandName: BRAND });
    expect(r.html).toContain(`href="${BASE_URL}/admin/billing"`);
  });
});

// ─── 6. buildCreditPurchaseEmail ─────────────────────────────────────────────

describe("buildCreditPurchaseEmail", () => {
  const PACK_NAME    = "Starter Pack";
  const CREDITS      = 500;
  const BALANCE      = 1200;
  const EXPIRES_AT   = FUTURE_DATE;
  const AMOUNT       = 9.99;
  const CURRENCY     = "USD";

  it("subject contains brandName", () => {
    const r = buildCreditPurchaseEmail(NAME, PACK_NAME, CREDITS, BALANCE, EXPIRES_AT, AMOUNT, CURRENCY, { brandName: BRAND, primaryColor: COLOR });
    expect(r.subject).toContain(BRAND);
  });

  it("subject falls back to WrenForge when no brandName", () => {
    const r = buildCreditPurchaseEmail(NAME, PACK_NAME, CREDITS, BALANCE, EXPIRES_AT, AMOUNT, CURRENCY);
    expect(r.subject).toContain("WrenForge");
  });

  it("html contains brandName", () => {
    const r = buildCreditPurchaseEmail(NAME, PACK_NAME, CREDITS, BALANCE, EXPIRES_AT, AMOUNT, CURRENCY, { brandName: BRAND, primaryColor: COLOR });
    expect(r.html).toContain(BRAND);
  });

  it("html contains primaryColor", () => {
    const r = buildCreditPurchaseEmail(NAME, PACK_NAME, CREDITS, BALANCE, EXPIRES_AT, AMOUNT, CURRENCY, { brandName: BRAND, primaryColor: COLOR });
    expect(r.html).toContain(COLOR);
  });

  it("html falls back to #1DE9A8 when no primaryColor", () => {
    const r = buildCreditPurchaseEmail(NAME, PACK_NAME, CREDITS, BALANCE, EXPIRES_AT, AMOUNT, CURRENCY);
    expect(r.html).toContain("#1DE9A8");
  });

  it("html shows credit count", () => {
    const r = buildCreditPurchaseEmail(NAME, PACK_NAME, CREDITS, BALANCE, EXPIRES_AT, AMOUNT, CURRENCY, { brandName: BRAND });
    expect(r.html).toContain("500");
  });

  it("text is a non-empty string", () => {
    const r = buildCreditPurchaseEmail(NAME, PACK_NAME, CREDITS, BALANCE, EXPIRES_AT, AMOUNT, CURRENCY, { brandName: BRAND });
    expect(typeof r.text).toBe("string");
    expect(r.text.length).toBeGreaterThan(0);
  });

  it("fromName is returned in result", () => {
    const r = buildCreditPurchaseEmail(NAME, PACK_NAME, CREDITS, BALANCE, EXPIRES_AT, AMOUNT, CURRENCY, { brandName: BRAND, fromName: "Sender" });
    expect(r.fromName).toBe("Sender");
  });

  it("html CTA button points to billing page", () => {
    const r = buildCreditPurchaseEmail(NAME, PACK_NAME, CREDITS, BALANCE, EXPIRES_AT, AMOUNT, CURRENCY, { brandName: BRAND });
    expect(r.html).toContain(`href="${BASE_URL}/admin/billing"`);
  });
});

// ─── 7. buildPlanDowngradeEmail ───────────────────────────────────────────────

describe("buildPlanDowngradeEmail", () => {
  it("subject contains brandName", () => {
    const r = buildPlanDowngradeEmail(NAME, "PRO", { brandName: BRAND, primaryColor: COLOR });
    expect(r.subject).toContain(BRAND);
  });

  it("subject falls back to WrenForge when no brandName", () => {
    const r = buildPlanDowngradeEmail(NAME, "PRO");
    expect(r.subject).toContain("WrenForge");
  });

  it("html contains brandName", () => {
    const r = buildPlanDowngradeEmail(NAME, "PRO", { brandName: BRAND, primaryColor: COLOR });
    expect(r.html).toContain(BRAND);
  });

  it("html contains primaryColor", () => {
    const r = buildPlanDowngradeEmail(NAME, "PRO", { brandName: BRAND, primaryColor: COLOR });
    expect(r.html).toContain(COLOR);
  });

  it("html falls back to #1DE9A8 when no primaryColor", () => {
    const r = buildPlanDowngradeEmail(NAME, "PRO");
    expect(r.html).toContain("#1DE9A8");
  });

  it("html contains Free plan text", () => {
    const r = buildPlanDowngradeEmail(NAME, "PRO", { brandName: BRAND });
    expect(r.html).toContain("Free plan");
  });

  it("text is a non-empty string", () => {
    const r = buildPlanDowngradeEmail(NAME, "PRO", { brandName: BRAND });
    expect(typeof r.text).toBe("string");
    expect(r.text.length).toBeGreaterThan(0);
  });

  it("fromName is returned in result", () => {
    const r = buildPlanDowngradeEmail(NAME, "PRO", { brandName: BRAND, fromName: "Sender" });
    expect(r.fromName).toBe("Sender");
  });

  it("html CTA button points to billing page", () => {
    const r = buildPlanDowngradeEmail(NAME, "PRO", { brandName: BRAND });
    expect(r.html).toContain(`href="${BASE_URL}/admin/billing"`);
  });
});

// ─── 8. buildAccountSuspendEmail ─────────────────────────────────────────────

describe("buildAccountSuspendEmail", () => {
  const TENANT_BRAND = "Acme Corp";

  it("subject contains brandName", () => {
    const r = buildAccountSuspendEmail(NAME, TENANT_BRAND, { brandName: BRAND, primaryColor: COLOR });
    expect(r.subject).toContain(BRAND);
  });

  it("subject falls back to WrenForge when no brandName", () => {
    const r = buildAccountSuspendEmail(NAME, TENANT_BRAND);
    expect(r.subject).toContain("WrenForge");
  });

  it("html contains brandName", () => {
    const r = buildAccountSuspendEmail(NAME, TENANT_BRAND, { brandName: BRAND, primaryColor: COLOR });
    expect(r.html).toContain(BRAND);
  });

  it("html contains primaryColor", () => {
    const r = buildAccountSuspendEmail(NAME, TENANT_BRAND, { brandName: BRAND, primaryColor: COLOR });
    expect(r.html).toContain(COLOR);
  });

  it("html falls back to #1DE9A8 when no primaryColor", () => {
    const r = buildAccountSuspendEmail(NAME, TENANT_BRAND);
    expect(r.html).toContain("#1DE9A8");
  });

  it("html contains tenant name", () => {
    const r = buildAccountSuspendEmail(NAME, TENANT_BRAND, { brandName: BRAND });
    expect(r.html).toContain(TENANT_BRAND);
  });

  it("text is a non-empty string", () => {
    const r = buildAccountSuspendEmail(NAME, TENANT_BRAND, { brandName: BRAND });
    expect(typeof r.text).toBe("string");
    expect(r.text.length).toBeGreaterThan(0);
  });

  it("fromName is returned in result", () => {
    const r = buildAccountSuspendEmail(NAME, TENANT_BRAND, { brandName: BRAND, fromName: "Sender" });
    expect(r.fromName).toBe("Sender");
  });
});

// ─── 9. buildCreditLowWarningEmail ───────────────────────────────────────────

describe("buildCreditLowWarningEmail", () => {
  it("subject contains brandName", () => {
    const r = buildCreditLowWarningEmail(NAME, 50, 500, 10, { brandName: BRAND, primaryColor: COLOR });
    expect(r.subject).toContain(BRAND);
  });

  it("subject falls back to WrenForge when no brandName", () => {
    const r = buildCreditLowWarningEmail(NAME, 50, 500, 10);
    expect(r.subject).toContain("WrenForge");
  });

  it("html contains brandName", () => {
    const r = buildCreditLowWarningEmail(NAME, 50, 500, 10, { brandName: BRAND, primaryColor: COLOR });
    expect(r.html).toContain(BRAND);
  });

  it("html contains primaryColor", () => {
    const r = buildCreditLowWarningEmail(NAME, 50, 500, 10, { brandName: BRAND, primaryColor: COLOR });
    expect(r.html).toContain(COLOR);
  });

  it("html falls back to #1DE9A8 when no primaryColor", () => {
    const r = buildCreditLowWarningEmail(NAME, 50, 500, 10);
    expect(r.html).toContain("#1DE9A8");
  });

  it("shows Critical urgency label when balance/allocated gives 0%", () => {
    // balance=0, allocated=500 → pct=0 → isCritical=true
    const r = buildCreditLowWarningEmail(NAME, 0, 500, 0, { brandName: BRAND });
    expect(r.html).toContain("Critical");
  });

  it("shows Low credit warning label when pct is 15 (not critical)", () => {
    // balance=75, allocated=500 → pct=15 → isCritical=false
    const r = buildCreditLowWarningEmail(NAME, 75, 500, 15, { brandName: BRAND });
    expect(r.html).toContain("Low credit warning");
  });

  it("text is a non-empty string", () => {
    const r = buildCreditLowWarningEmail(NAME, 50, 500, 10, { brandName: BRAND });
    expect(typeof r.text).toBe("string");
    expect(r.text.length).toBeGreaterThan(0);
  });

  it("fromName is returned in result", () => {
    const r = buildCreditLowWarningEmail(NAME, 50, 500, 10, { brandName: BRAND, fromName: "Sender" });
    expect(r.fromName).toBe("Sender");
  });

  it("html CTA button points to billing page", () => {
    const r = buildCreditLowWarningEmail(NAME, 50, 500, 10, { brandName: BRAND });
    expect(r.html).toContain(`href="${BASE_URL}/admin/billing"`);
  });
});

// ─── 10. buildPlanUpgradeEmail ───────────────────────────────────────────────

describe("buildPlanUpgradeEmail", () => {
  it("subject contains brandName", () => {
    const r = buildPlanUpgradeEmail(NAME, "PLUS", "PRO", { brandName: BRAND, primaryColor: COLOR });
    expect(r.subject).toContain(BRAND);
  });

  it("subject falls back to WrenForge when no brandName", () => {
    const r = buildPlanUpgradeEmail(NAME, "PLUS", "PRO");
    expect(r.subject).toContain("WrenForge");
  });

  it("subject mentions new plan name", () => {
    const r = buildPlanUpgradeEmail(NAME, "PLUS", "PRO", { brandName: BRAND });
    expect(r.subject).toContain("PRO");
  });

  it("html contains brandName", () => {
    const r = buildPlanUpgradeEmail(NAME, "PLUS", "PRO", { brandName: BRAND, primaryColor: COLOR });
    expect(r.html).toContain(BRAND);
  });

  it("html contains primaryColor", () => {
    const r = buildPlanUpgradeEmail(NAME, "PLUS", "PRO", { brandName: BRAND, primaryColor: COLOR });
    expect(r.html).toContain(COLOR);
  });

  it("html falls back to #1DE9A8 when no primaryColor", () => {
    const r = buildPlanUpgradeEmail(NAME, "PLUS", "PRO");
    expect(r.html).toContain("#1DE9A8");
  });

  it("text is a non-empty string", () => {
    const r = buildPlanUpgradeEmail(NAME, "PLUS", "PRO", { brandName: BRAND });
    expect(typeof r.text).toBe("string");
    expect(r.text.length).toBeGreaterThan(0);
  });

  it("fromName is returned in result", () => {
    const r = buildPlanUpgradeEmail(NAME, "PLUS", "PRO", { brandName: BRAND, fromName: "Sender" });
    expect(r.fromName).toBe("Sender");
  });

  it("html CTA button points to dashboard", () => {
    const r = buildPlanUpgradeEmail(NAME, "PLUS", "PRO", { brandName: BRAND });
    expect(r.html).toContain(`href="${BASE_URL}/dashboard"`);
  });
});

// ─── 11. buildCampaignCompletionEmail ────────────────────────────────────────

describe("buildCampaignCompletionEmail", () => {
  const CAMPAIGN = "Spring Outreach";
  const STATS    = { total: 100, completed: 82, failed: 5, interested: 30 };

  it("subject contains campaign name", () => {
    const r = buildCampaignCompletionEmail(NAME, CAMPAIGN, STATS, { brandName: BRAND, primaryColor: COLOR });
    expect(r.subject).toContain(CAMPAIGN);
  });

  it("html contains brandName", () => {
    const r = buildCampaignCompletionEmail(NAME, CAMPAIGN, STATS, { brandName: BRAND });
    expect(r.html).toContain(BRAND);
  });

  it("html falls back to WrenForge when no brandName", () => {
    const r = buildCampaignCompletionEmail(NAME, CAMPAIGN, STATS);
    expect(r.html).toContain("WrenForge");
  });

  it("html contains primaryColor", () => {
    const r = buildCampaignCompletionEmail(NAME, CAMPAIGN, STATS, { brandName: BRAND, primaryColor: COLOR });
    expect(r.html).toContain(COLOR);
  });

  it("html falls back to #1DE9A8 when no primaryColor", () => {
    const r = buildCampaignCompletionEmail(NAME, CAMPAIGN, STATS);
    expect(r.html).toContain("#1DE9A8");
  });

  it("html shows total stat", () => {
    const r = buildCampaignCompletionEmail(NAME, CAMPAIGN, STATS, { brandName: BRAND });
    expect(r.html).toContain("100");
  });

  it("html shows completed stat", () => {
    const r = buildCampaignCompletionEmail(NAME, CAMPAIGN, STATS, { brandName: BRAND });
    expect(r.html).toContain("82");
  });

  it("html shows failed stat", () => {
    const r = buildCampaignCompletionEmail(NAME, CAMPAIGN, STATS, { brandName: BRAND });
    expect(r.html).toContain("5");
  });

  it("html shows interested stat", () => {
    const r = buildCampaignCompletionEmail(NAME, CAMPAIGN, STATS, { brandName: BRAND });
    expect(r.html).toContain("30");
  });

  it("text is a non-empty string", () => {
    const r = buildCampaignCompletionEmail(NAME, CAMPAIGN, STATS, { brandName: BRAND });
    expect(typeof r.text).toBe("string");
    expect(r.text.length).toBeGreaterThan(0);
  });

  it("fromName is returned in result", () => {
    const r = buildCampaignCompletionEmail(NAME, CAMPAIGN, STATS, { brandName: BRAND, fromName: "Sender" });
    expect(r.fromName).toBe("Sender");
  });

  it("html CTA button points to call-logs page", () => {
    const r = buildCampaignCompletionEmail(NAME, CAMPAIGN, STATS, { brandName: BRAND });
    expect(r.html).toContain(`href="${BASE_URL}/admin/call-logs"`);
  });
});

// ─── 12. buildPasswordResetEmail ─────────────────────────────────────────────

describe("buildPasswordResetEmail", () => {
  it("subject contains brandName", () => {
    const r = buildPasswordResetEmail(NAME, TOKEN, { brandName: BRAND, primaryColor: COLOR });
    expect(r.subject).toContain(BRAND);
  });

  it("subject falls back to WrenForge when no brandName", () => {
    const r = buildPasswordResetEmail(NAME, TOKEN);
    expect(r.subject).toContain("WrenForge");
  });

  it("html contains brandName", () => {
    const r = buildPasswordResetEmail(NAME, TOKEN, { brandName: BRAND, primaryColor: COLOR });
    expect(r.html).toContain(BRAND);
  });

  it("html contains primaryColor", () => {
    const r = buildPasswordResetEmail(NAME, TOKEN, { brandName: BRAND, primaryColor: COLOR });
    expect(r.html).toContain(COLOR);
  });

  it("html falls back to #1DE9A8 when no primaryColor", () => {
    const r = buildPasswordResetEmail(NAME, TOKEN);
    expect(r.html).toContain("#1DE9A8");
  });

  it("html contains reset URL with token", () => {
    const r = buildPasswordResetEmail(NAME, TOKEN, { brandName: BRAND });
    expect(r.html).toContain(`/reset-password?token=${TOKEN}`);
  });

  it("text is a non-empty string", () => {
    const r = buildPasswordResetEmail(NAME, TOKEN, { brandName: BRAND });
    expect(typeof r.text).toBe("string");
    expect(r.text.length).toBeGreaterThan(0);
  });

  it("fromName is returned in result", () => {
    const r = buildPasswordResetEmail(NAME, TOKEN, { brandName: BRAND, fromName: "Sender" });
    expect(r.fromName).toBe("Sender");
  });

  it("html CTA button href points to reset URL", () => {
    const r = buildPasswordResetEmail(NAME, TOKEN, { brandName: BRAND });
    expect(r.html).toContain(`href="${BASE_URL}/reset-password?token=${TOKEN}"`);
  });
});

// ─── 13. buildTeamInviteEmail ────────────────────────────────────────────────

describe("buildTeamInviteEmail", () => {
  const INVITEE  = "Bob";
  const INVITER  = "Carol";
  const TENANT   = "Acme Sales";
  const ROLE     = "SALES";

  it("subject contains brandName", () => {
    const r = buildTeamInviteEmail(INVITEE, INVITER, TENANT, ROLE, TOKEN, { brandName: BRAND, primaryColor: COLOR });
    expect(r.subject).toContain(BRAND);
  });

  it("subject falls back to WrenForge when no brandName", () => {
    const r = buildTeamInviteEmail(INVITEE, INVITER, TENANT, ROLE, TOKEN);
    expect(r.subject).toContain("WrenForge");
  });

  it("html contains brandName", () => {
    const r = buildTeamInviteEmail(INVITEE, INVITER, TENANT, ROLE, TOKEN, { brandName: BRAND, primaryColor: COLOR });
    expect(r.html).toContain(BRAND);
  });

  it("html contains primaryColor", () => {
    const r = buildTeamInviteEmail(INVITEE, INVITER, TENANT, ROLE, TOKEN, { brandName: BRAND, primaryColor: COLOR });
    expect(r.html).toContain(COLOR);
  });

  it("html falls back to #1DE9A8 when no primaryColor", () => {
    const r = buildTeamInviteEmail(INVITEE, INVITER, TENANT, ROLE, TOKEN);
    expect(r.html).toContain("#1DE9A8");
  });

  it("html contains inviter name", () => {
    const r = buildTeamInviteEmail(INVITEE, INVITER, TENANT, ROLE, TOKEN, { brandName: BRAND });
    expect(r.html).toContain(INVITER);
  });

  it("html contains role label Sales Agent for SALES role", () => {
    const r = buildTeamInviteEmail(INVITEE, INVITER, TENANT, "SALES", TOKEN, { brandName: BRAND });
    expect(r.html).toContain("Sales Agent");
  });

  it("html contains role label Administrator for ADMIN role", () => {
    const r = buildTeamInviteEmail(INVITEE, INVITER, TENANT, "ADMIN", TOKEN, { brandName: BRAND });
    expect(r.html).toContain("Administrator");
  });

  it("text is a non-empty string", () => {
    const r = buildTeamInviteEmail(INVITEE, INVITER, TENANT, ROLE, TOKEN, { brandName: BRAND });
    expect(typeof r.text).toBe("string");
    expect(r.text.length).toBeGreaterThan(0);
  });

  it("fromName is returned in result", () => {
    const r = buildTeamInviteEmail(INVITEE, INVITER, TENANT, ROLE, TOKEN, { brandName: BRAND, fromName: "Sender" });
    expect(r.fromName).toBe("Sender");
  });

  it("html CTA button href contains accept-invite URL with token", () => {
    const r = buildTeamInviteEmail(INVITEE, INVITER, TENANT, ROLE, TOKEN, { brandName: BRAND });
    expect(r.html).toContain(`href="${BASE_URL}/accept-invite?token=${TOKEN}"`);
  });
});

// ─── 14. buildCreditExpiringSoonEmail ────────────────────────────────────────

describe("buildCreditExpiringSoonEmail", () => {
  const CREDITS_AMOUNT = 750;

  it("subject contains credit count", () => {
    const r = buildCreditExpiringSoonEmail(NAME, CREDITS_AMOUNT, FUTURE_DATE, { brandName: BRAND, primaryColor: COLOR });
    expect(r.subject).toContain("750");
  });

  it("subject contains use them now", () => {
    const r = buildCreditExpiringSoonEmail(NAME, CREDITS_AMOUNT, FUTURE_DATE);
    expect(r.subject).toContain("use them now");
  });

  it("html contains brandName", () => {
    const r = buildCreditExpiringSoonEmail(NAME, CREDITS_AMOUNT, FUTURE_DATE, { brandName: BRAND, primaryColor: COLOR });
    expect(r.html).toContain(BRAND);
  });

  it("html falls back to WrenForge when no brandName", () => {
    const r = buildCreditExpiringSoonEmail(NAME, CREDITS_AMOUNT, FUTURE_DATE);
    expect(r.html).toContain("WrenForge");
  });

  it("html contains primaryColor", () => {
    const r = buildCreditExpiringSoonEmail(NAME, CREDITS_AMOUNT, FUTURE_DATE, { brandName: BRAND, primaryColor: COLOR });
    expect(r.html).toContain(COLOR);
  });

  it("html falls back to #1DE9A8 when no primaryColor", () => {
    const r = buildCreditExpiringSoonEmail(NAME, CREDITS_AMOUNT, FUTURE_DATE);
    expect(r.html).toContain("#1DE9A8");
  });

  it("html shows credit count", () => {
    const r = buildCreditExpiringSoonEmail(NAME, CREDITS_AMOUNT, FUTURE_DATE, { brandName: BRAND });
    expect(r.html).toContain("750");
  });

  it("text is a non-empty string", () => {
    const r = buildCreditExpiringSoonEmail(NAME, CREDITS_AMOUNT, FUTURE_DATE, { brandName: BRAND });
    expect(typeof r.text).toBe("string");
    expect(r.text.length).toBeGreaterThan(0);
  });

  it("fromName is returned in result", () => {
    const r = buildCreditExpiringSoonEmail(NAME, CREDITS_AMOUNT, FUTURE_DATE, { brandName: BRAND, fromName: "Sender" });
    expect(r.fromName).toBe("Sender");
  });

  it("html CTA button points to campaigns page", () => {
    const r = buildCreditExpiringSoonEmail(NAME, CREDITS_AMOUNT, FUTURE_DATE, { brandName: BRAND });
    expect(r.html).toContain(`href="${BASE_URL}/admin/campaigns"`);
  });
});

// ─── 15. buildRenewalReminderEmail ────────────────────────────────────────────

describe("buildRenewalReminderEmail", () => {
  const RENEWAL_DATE = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  it("subject contains brandName", () => {
    const r = buildRenewalReminderEmail(NAME, "PRO", RENEWAL_DATE, 29, "USD", { brandName: BRAND, primaryColor: COLOR });
    expect(r.subject).toContain(BRAND);
  });

  it("subject falls back to WrenForge when no brandName", () => {
    const r = buildRenewalReminderEmail(NAME, "PRO", RENEWAL_DATE, 29, "USD");
    expect(r.subject).toContain("WrenForge");
  });

  it("html contains brandName", () => {
    const r = buildRenewalReminderEmail(NAME, "PRO", RENEWAL_DATE, 29, "USD", { brandName: BRAND, primaryColor: COLOR });
    expect(r.html).toContain(BRAND);
  });

  it("html contains primaryColor", () => {
    const r = buildRenewalReminderEmail(NAME, "PRO", RENEWAL_DATE, 29, "USD", { brandName: BRAND, primaryColor: COLOR });
    expect(r.html).toContain(COLOR);
  });

  it("html falls back to #1DE9A8 when no primaryColor", () => {
    const r = buildRenewalReminderEmail(NAME, "PRO", RENEWAL_DATE, 29, "USD");
    expect(r.html).toContain("#1DE9A8");
  });

  it("html shows $ symbol for USD currency", () => {
    const r = buildRenewalReminderEmail(NAME, "PRO", RENEWAL_DATE, 29, "USD", { brandName: BRAND });
    expect(r.html).toContain("$");
  });

  it("html shows ₹ symbol for INR currency", () => {
    const r = buildRenewalReminderEmail(NAME, "PRO", RENEWAL_DATE, 2499, "INR", { brandName: BRAND });
    expect(r.html).toContain("₹");
  });

  it("text is a non-empty string", () => {
    const r = buildRenewalReminderEmail(NAME, "PRO", RENEWAL_DATE, 29, "USD", { brandName: BRAND });
    expect(typeof r.text).toBe("string");
    expect(r.text.length).toBeGreaterThan(0);
  });

  it("fromName is returned in result", () => {
    const r = buildRenewalReminderEmail(NAME, "PRO", RENEWAL_DATE, 29, "USD", { brandName: BRAND, fromName: "Sender" });
    expect(r.fromName).toBe("Sender");
  });

  it("html CTA button points to billing page", () => {
    const r = buildRenewalReminderEmail(NAME, "PRO", RENEWAL_DATE, 29, "USD", { brandName: BRAND });
    expect(r.html).toContain(`href="${BASE_URL}/admin/billing"`);
  });
});
