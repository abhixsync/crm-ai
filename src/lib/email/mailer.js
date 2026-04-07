/**
 * Transactional email mailer — thin wrapper over nodemailer.
 * Uses the same SMTP env vars as advisor-notifier.js.
 */

import nodemailer from "nodemailer";

function getTransporter() {
  const host = process.env.SMTP_HOST || "";
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = process.env.SMTP_SECURE === "true" || port === 465;
  const user = process.env.SMTP_USER || "";
  const pass = process.env.SMTP_PASS || "";

  return nodemailer.createTransport({
    host,
    port,
    secure,
    ...(user || pass ? { auth: { user, pass } } : {}),
  });
}

const FROM = process.env.ADVISOR_EMAIL_FROM || process.env.SMTP_FROM || "noreply@crm.local";
const APP_BASE = (process.env.APP_BASE_URL || process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/$/, "");
const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "CRM AI";

/**
 * Send a transactional email. Returns { ok: boolean, error?: string }.
 * Silently skips (ok: true) when SMTP_HOST is not configured.
 */
export async function sendEmail({ to, subject, html, text, fromName = null }) {
  const host = process.env.SMTP_HOST || "";
  if (!host) {
    console.warn("[mailer] SMTP_HOST not set — skipping email to", to);
    return { ok: true, skipped: true, reason: "no_smtp_host" };
  }

  try {
    const transporter = getTransporter();
    const from = fromName ? `"${fromName}" <${FROM}>` : FROM;
    const info = await transporter.sendMail({ from, to, subject, html, text });
    return { ok: true, messageId: info.messageId };
  } catch (err) {
    console.error("[mailer] sendMail failed:", err?.message);
    return { ok: false, error: err?.message };
  }
}

// ─── EMAIL TEMPLATES ─────────────────────────────────────

export function buildVerificationEmail(name, token, { brandName, primaryColor } = {}) {
  const resolvedBrandName = brandName || APP_NAME;
  const resolvedColor     = primaryColor || "#1DE9A8";
  const verifyUrl = `${APP_BASE}/api/auth/verify-email?token=${token}`;
  const html = `
<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;background:#0B0A0F;color:#E0DDD8;padding:40px 20px;">
  <div style="max-width:520px;margin:0 auto;background:#13111A;border:1px solid #2A2535;border-radius:12px;padding:40px;">
    <h1 style="color:${resolvedColor};margin-top:0;">${resolvedBrandName}</h1>
    <h2 style="color:#E0DDD8;">Verify your email</h2>
    <p>Hi ${name},</p>
    <p>Welcome! Please verify your email address to get started with your 30-day Pro trial.</p>
    <p style="margin:32px 0;">
      <a href="${verifyUrl}"
         style="background:${resolvedColor};color:#0B0A0F;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block;">
        Verify Email Address
      </a>
    </p>
    <p style="font-size:13px;color:#706C78;">Or copy this link into your browser:<br>
      <a href="${verifyUrl}" style="color:${resolvedColor};word-break:break-all;">${verifyUrl}</a>
    </p>
    <p style="font-size:13px;color:#706C78;">This link expires in 24 hours. If you didn't create an account, you can safely ignore this email.</p>
  </div>
</body>
</html>`;

  return {
    subject: `Verify your ${resolvedBrandName} email address`,
    html,
    text: `Hi ${name},\n\nVerify your email: ${verifyUrl}\n\nThis link expires in 24 hours.`,
  };
}

export function buildTrialExpiryWarningEmail(name, trialEndsAt, daysLeft, { brandName, primaryColor, fromName } = {}) {
  const resolvedBrandName = brandName || APP_NAME;
  const resolvedColor     = primaryColor || "#1DE9A8";
  const html = `
<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;background:#0B0A0F;color:#E0DDD8;padding:40px 20px;">
  <div style="max-width:520px;margin:0 auto;background:#13111A;border:1px solid #2A2535;border-radius:12px;padding:40px;">
    <h1 style="color:${resolvedColor};margin-top:0;">${resolvedBrandName}</h1>
    <h2 style="color:#f5c842;">Your trial ends in ${daysLeft} day${daysLeft === 1 ? "" : "s"}</h2>
    <p>Hi ${name},</p>
    <p>Your ${resolvedBrandName} Pro trial expires on <strong>${new Date(trialEndsAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</strong>.</p>
    <p>After that date, your account will be downgraded to the Free plan and some features will be paused.</p>
    <p style="margin:32px 0;">
      <a href="${APP_BASE}/admin/billing"
         style="background:${resolvedColor};color:#0B0A0F;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block;">
        Upgrade Now — Keep Everything
      </a>
    </p>
    <p style="font-size:13px;color:#706C78;">Questions? Reply to this email or visit our support page.</p>
  </div>
</body>
</html>`;

  return {
    subject: `⏰ Your ${resolvedBrandName} trial ends in ${daysLeft} day${daysLeft === 1 ? "" : "s"} — upgrade to keep access`,
    html,
    text: `Hi ${name},\n\nYour Pro trial ends in ${daysLeft} day${daysLeft === 1 ? "" : "s"}.\n\nUpgrade: ${APP_BASE}/admin/billing`,
    fromName,
  };
}

export function buildPaymentConfirmationEmail(name, invoice, { brandName, primaryColor, fromName } = {}) {
  const resolvedBrandName = brandName || APP_NAME;
  const resolvedColor     = primaryColor || "#1DE9A8";
  const amount = invoice.amountPaid != null
    ? `${invoice.currency?.toUpperCase() === "INR" ? "₹" : "$"}${(invoice.amountPaid / 100).toFixed(2)}`
    : "—";
  const html = `
<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;background:#0B0A0F;color:#E0DDD8;padding:40px 20px;">
  <div style="max-width:520px;margin:0 auto;background:#13111A;border:1px solid #2A2535;border-radius:12px;padding:40px;">
    <h1 style="color:${resolvedColor};margin-top:0;">${resolvedBrandName}</h1>
    <h2 style="color:#E0DDD8;">Payment confirmed ✓</h2>
    <p>Hi ${name},</p>
    <p>Thank you! We've received your payment of <strong>${amount}</strong>.</p>
    <table style="width:100%;border-collapse:collapse;margin:24px 0;font-size:14px;">
      <tr style="border-bottom:1px solid #2A2535;">
        <td style="padding:8px 0;color:#706C78;">Plan</td>
        <td style="padding:8px 0;color:#E0DDD8;text-align:right;">${invoice.plan || "—"}</td>
      </tr>
      <tr style="border-bottom:1px solid #2A2535;">
        <td style="padding:8px 0;color:#706C78;">Amount</td>
        <td style="padding:8px 0;color:${resolvedColor};font-weight:bold;text-align:right;">${amount}</td>
      </tr>
      <tr>
        <td style="padding:8px 0;color:#706C78;">Date</td>
        <td style="padding:8px 0;color:#E0DDD8;text-align:right;">${new Date(invoice.createdAt || Date.now()).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</td>
      </tr>
    </table>
    <p>
      <a href="${APP_BASE}/admin/billing"
         style="background:${resolvedColor};color:#0B0A0F;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block;">
        View Billing Details
      </a>
    </p>
  </div>
</body>
</html>`;

  return {
    subject: `Payment confirmed — ${amount} received for ${resolvedBrandName}`,
    html,
    text: `Hi ${name},\n\nPayment of ${amount} confirmed.\n\nView: ${APP_BASE}/admin/billing`,
    fromName,
  };
}

export function buildTrialWelcomeEmail(name, trialEndsAt, { brandName, primaryColor, fromName } = {}) {
  const resolvedBrandName = brandName || APP_NAME;
  const resolvedColor     = primaryColor || "#1DE9A8";
  const daysLeft = Math.ceil((new Date(trialEndsAt) - Date.now()) / (1000 * 60 * 60 * 24));
  const html = `
<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;background:#0B0A0F;color:#E0DDD8;padding:40px 20px;">
  <div style="max-width:520px;margin:0 auto;background:#13111A;border:1px solid #2A2535;border-radius:12px;padding:40px;">
    <h1 style="color:${resolvedColor};margin-top:0;">${resolvedBrandName}</h1>
    <h2 style="color:#E0DDD8;">Your Pro trial is active 🎉</h2>
    <p>Hi ${name},</p>
    <p>Your <strong>${daysLeft}-day Pro trial</strong> is now active. You have access to all Pro features including:</p>
    <ul>
      <li>AI-powered outbound calling (2,000 calls/month)</li>
      <li>Up to 10,000 customers</li>
      <li>Deal pipeline, Teams, Multi-channel messaging</li>
      <li>Advanced analytics &amp; exports</li>
      <li>Custom AI prompts &amp; conversation memory</li>
    </ul>
    <p>
      <a href="${APP_BASE}/dashboard"
         style="background:${resolvedColor};color:#0B0A0F;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block;">
        Go to Dashboard
      </a>
    </p>
    <p style="font-size:13px;color:#706C78;">Trial ends in ${daysLeft} days. Upgrade anytime at ${APP_BASE}/admin/billing</p>
  </div>
</body>
</html>`;

  return {
    subject: `Your ${resolvedBrandName} Pro trial is active — ${daysLeft} days to explore`,
    html,
    text: `Hi ${name},\n\nYour ${daysLeft}-day Pro trial is now active.\n\nGo to: ${APP_BASE}/dashboard`,
    fromName,
  };
}
