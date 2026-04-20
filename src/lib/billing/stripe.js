/**
 * Stripe billing service (USD / international).
 *
 * Env vars required:
 *   STRIPE_SECRET_KEY          — sk_live_... or sk_test_...
 *   STRIPE_WEBHOOK_SECRET      — whsec_...
 *   NEXT_PUBLIC_APP_URL        — https://yourdomain.com
 */

import Stripe from "stripe";

let _stripe;
export function getStripe() {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
    _stripe = new Stripe(key, { apiVersion: "2024-12-18.acacia" });
  }
  return _stripe;
}

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_BASE_URL || "http://localhost:3000").replace(/\/$/, "");

// ─── CHECKOUT SESSION ────────────────────────────────────

/**
 * Create a Stripe Checkout session for a plan upgrade.
 *
 * @param {object} opts
 * @param {string} opts.tenantId
 * @param {string} opts.customerEmail
 * @param {string} opts.stripeCustomerId   — existing Stripe customer ID (or null)
 * @param {string} opts.stripePriceId      — Stripe Price ID for the selected plan/cycle
 * @param {string} opts.successUrl         — URL after successful payment
 * @param {string} opts.cancelUrl          — URL if user cancels
 */
export async function createCheckoutSession({
  tenantId,
  customerEmail,
  stripeCustomerId,
  stripePriceId,
  successUrl = `${APP_URL}/admin/billing?payment=success`,
  cancelUrl  = `${APP_URL}/admin/billing?payment=cancelled`,
}) {
  const stripe = getStripe();

  const params = {
    mode: "subscription",
    line_items: [{ price: stripePriceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url:  cancelUrl,
    client_reference_id: tenantId,
    metadata: { tenantId },
    subscription_data: { metadata: { tenantId } },
    allow_promotion_codes: true,
  };

  if (stripeCustomerId) {
    params.customer = stripeCustomerId;
  } else if (customerEmail) {
    params.customer_email = customerEmail;
  }

  return stripe.checkout.sessions.create(params);
}

// ─── CUSTOMER PORTAL ────────────────────────────────────

export async function createCustomerPortalSession(stripeCustomerId, returnUrl = `${APP_URL}/admin/billing`) {
  const stripe = getStripe();
  return stripe.billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: returnUrl,
  });
}

// ─── WEBHOOK VERIFICATION ───────────────────────────────

export function constructStripeEvent(rawBody, signature) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET is not set");
  return getStripe().webhooks.constructEvent(rawBody, signature, secret);
}

// ─── PLAN → STRIPE PRICE MAP ────────────────────────────
// Stripe Price IDs are stored in PlanDefinition.metadata or env vars.
// Recommended: store in DB via PlanDefinition.stripePriceIdMonthly / Annual
// For now: read from env vars as fallback.

export function getStripePriceId(plan, billingCycle) {
  const key = `STRIPE_PRICE_${plan.toUpperCase()}_${billingCycle.toUpperCase()}`;
  return process.env[key] || null;
}
