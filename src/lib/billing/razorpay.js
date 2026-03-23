/**
 * Razorpay billing service (INR / India).
 *
 * Env vars required:
 *   RAZORPAY_KEY_ID       — rzp_live_... or rzp_test_...
 *   RAZORPAY_KEY_SECRET   — secret
 *   RAZORPAY_WEBHOOK_SECRET
 */

import Razorpay from "razorpay";
import { createHmac } from "crypto";

let _razorpay;
function getRazorpay() {
  if (!_razorpay) {
    const key_id     = process.env.RAZORPAY_KEY_ID;
    const key_secret = process.env.RAZORPAY_KEY_SECRET;
    if (!key_id || !key_secret) throw new Error("RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET not set");
    _razorpay = new Razorpay({ key_id, key_secret });
  }
  return _razorpay;
}

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_BASE_URL || "http://localhost:3000").replace(/\/$/, "");

// ─── SUBSCRIPTION ────────────────────────────────────────

/**
 * Create a Razorpay subscription.
 *
 * @param {object} opts
 * @param {string} opts.tenantId
 * @param {string} opts.razorpayPlanId     — plan ID from Razorpay dashboard
 * @param {number} opts.totalCount         — number of billing cycles (12 for annual, 120 for ~10y monthly)
 * @param {string} opts.customerEmail
 * @param {string} opts.customerName
 * @param {string} opts.customerPhone
 */
export async function createSubscription({
  tenantId,
  razorpayPlanId,
  totalCount = 120,
  customerEmail,
  customerName,
  customerPhone,
}) {
  const rp = getRazorpay();

  // Create/find Razorpay customer
  let customer;
  try {
    // Razorpay doesn't have a "find by email" API — create fresh
    customer = await rp.customers.create({
      name: customerName,
      email: customerEmail,
      contact: customerPhone || undefined,
    });
  } catch (err) {
    console.error("[razorpay] customer create failed:", err?.message);
  }

  const sub = await rp.subscriptions.create({
    plan_id:     razorpayPlanId,
    total_count: totalCount,
    quantity:    1,
    customer_id: customer?.id,
    notes: { tenantId },
  });

  return { subscription: sub, customerId: customer?.id };
}

// ─── WEBHOOK VERIFICATION ───────────────────────────────

export function verifyRazorpayWebhook(rawBody, signature) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) throw new Error("RAZORPAY_WEBHOOK_SECRET is not set");

  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  if (expected !== signature) throw new Error("Razorpay webhook signature mismatch");
}

// ─── PLAN → RAZORPAY PLAN MAP ───────────────────────────
// Razorpay Plan IDs stored as env vars (same pattern as Stripe):
//   RAZORPAY_PLAN_PLUS_MONTHLY, RAZORPAY_PLAN_PRO_MONTHLY, etc.

export function getRazorpayPlanId(plan, billingCycle) {
  const key = `RAZORPAY_PLAN_${plan.toUpperCase()}_${billingCycle.toUpperCase()}`;
  return process.env[key] || null;
}
