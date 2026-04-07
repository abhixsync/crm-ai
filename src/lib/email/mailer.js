/**
 * Transactional email mailer — thin wrapper over nodemailer.
 * All templates are fully theme-aware: brandName, primaryColor, fromName
 * are resolved from the tenant's TenantTheme before calling any builder.
 */

import nodemailer from "nodemailer";

function getTransporter() {
  const host   = process.env.SMTP_HOST   || "";
  const port   = Number(process.env.SMTP_PORT || 587);
  const secure = process.env.SMTP_SECURE === "true" || port === 465;
  const user   = process.env.SMTP_USER   || "";
  const pass   = process.env.SMTP_PASS   || "";

  return nodemailer.createTransport({
    host,
    port,
    secure,
    ...(user || pass ? { auth: { user, pass } } : {}),
  });
}

const FROM     = process.env.ADVISOR_EMAIL_FROM || process.env.SMTP_FROM || "noreply@wrenforge.com";
const APP_BASE = (process.env.APP_BASE_URL || process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/$/, "");
const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "WrenForge";

/**
 * Send a transactional email. Returns { ok, messageId?, error?, skipped? }.
 * Silently skips when SMTP_HOST is not configured.
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
    const info  = await transporter.sendMail({ from, to, subject, html, text });
    return { ok: true, messageId: info.messageId };
  } catch (err) {
    console.error("[mailer] sendMail failed:", err?.message);
    return { ok: false, error: err?.message };
  }
}

// ─── SHARED LAYOUT HELPERS ────────────────────────────────────────────────────

/**
 * Wraps email content in the standard shell:
 *   outer dark background → centered container → header bar → body → footer
 */
function wrapEmail(brandName, color, bodyHtml) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="dark">
  <title>${brandName}</title>
</head>
<body style="margin:0;padding:0;background:#080710;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#080710;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">

          <!-- HEADER -->
          <tr>
            <td style="padding-bottom:8px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0"
                     style="background:#100F1C;border:1px solid #2E2A42;border-radius:14px 14px 0 0;padding:24px 32px;">
                <tr>
                  <td>
                    <span style="font-size:22px;font-weight:800;color:${color};letter-spacing:-0.5px;">${brandName}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- BODY -->
          <tr>
            <td>
              <table width="100%" cellpadding="0" cellspacing="0" border="0"
                     style="background:#13111E;border:1px solid #2E2A42;border-top:none;border-radius:0 0 14px 14px;padding:32px 32px 36px;">
                <tr>
                  <td style="color:#DDD8E8;font-size:15px;line-height:1.7;">
                    ${bodyHtml}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="padding-top:24px;text-align:center;">
              <p style="margin:0;font-size:12px;color:#4A4560;line-height:1.6;">
                You received this email because you have an account with ${brandName}.<br>
                &copy; ${new Date().getFullYear()} ${brandName}. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** A full-width CTA button */
function ctaButton(href, label, color) {
  return `
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 8px;">
  <tr>
    <td align="center">
      <a href="${href}"
         style="display:inline-block;background:${color};color:#080710;font-size:15px;font-weight:700;
                text-decoration:none;padding:14px 36px;border-radius:9px;letter-spacing:0.1px;">
        ${label}
      </a>
    </td>
  </tr>
</table>`;
}

/** A subtle divider line */
const DIVIDER = `<hr style="border:none;border-top:1px solid #2E2A42;margin:24px 0;">`;

/** Heading text */
function heading(text, color) {
  return `<h2 style="margin:0 0 20px;font-size:22px;font-weight:700;color:${color};line-height:1.3;">${text}</h2>`;
}

/** Small muted note */
function note(text) {
  return `<p style="margin:16px 0 0;font-size:12px;color:#5A5475;line-height:1.6;">${text}</p>`;
}

// ─── EMAIL TEMPLATES ──────────────────────────────────────────────────────────

/**
 * Sent on registration — user must click to verify before accessing the app.
 */
export function buildVerificationEmail(name, token, { brandName, primaryColor, fromName } = {}) {
  const b     = brandName    || APP_NAME;
  const color = primaryColor || "#1DE9A8";
  const url   = `${APP_BASE}/api/auth/verify-email?token=${token}`;

  const body = `
    ${heading(`Verify your email address`, color)}
    <p style="margin:0 0 16px;">Hi <strong>${name}</strong>,</p>
    <p style="margin:0 0 16px;">
      Welcome to <strong>${b}</strong>! Click the button below to verify your email address
      and activate your <strong>30-day Pro trial</strong> — no credit card required.
    </p>
    ${ctaButton(url, "Verify Email Address", color)}
    ${DIVIDER}
    <p style="margin:0 0 8px;font-size:13px;color:#706C85;">
      Or paste this link into your browser:
    </p>
    <p style="margin:0;font-size:12px;word-break:break-all;">
      <a href="${url}" style="color:${color};text-decoration:none;">${url}</a>
    </p>
    ${note("This link expires in <strong style='color:#DDD8E8;'>24 hours</strong>. If you didn't create an account, you can safely ignore this email.")}
  `;

  return {
    subject: `Verify your ${b} email address`,
    html: wrapEmail(b, color, body),
    text: `Hi ${name},\n\nVerify your ${b} email: ${url}\n\nThis link expires in 24 hours.`,
    fromName,
  };
}

/**
 * Sent once email is verified — confirms trial is live and onboards the user.
 */
export function buildTrialWelcomeEmail(name, trialEndsAt, { brandName, primaryColor, fromName } = {}) {
  const b        = brandName    || APP_NAME;
  const color    = primaryColor || "#1DE9A8";
  const daysLeft = Math.max(1, Math.ceil((new Date(trialEndsAt) - Date.now()) / (1000 * 60 * 60 * 24)));
  const endDate  = new Date(trialEndsAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  const features = [
    ["📞", "AI-powered outbound calling",    "2,000 calls/month"],
    ["👥", "Customer management",            "Up to 10,000 contacts"],
    ["📊", "Deal pipeline & analytics",      "Full reporting suite"],
    ["🤖", "Custom AI prompts",              "Conversation memory"],
    ["💬", "Multi-channel messaging",        "SMS, WhatsApp, Email"],
  ];

  const featureRows = features.map(([icon, title, sub]) => `
    <tr>
      <td style="padding:10px 12px;vertical-align:top;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0"
               style="background:#1C1930;border:1px solid #2E2A42;border-radius:9px;padding:12px 16px;">
          <tr>
            <td style="font-size:20px;padding-right:12px;vertical-align:middle;">${icon}</td>
            <td style="vertical-align:middle;">
              <div style="font-size:13px;font-weight:600;color:#DDD8E8;">${title}</div>
              <div style="font-size:12px;color:#706C85;margin-top:2px;">${sub}</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>`).join("");

  const body = `
    ${heading(`Your Pro trial is live! 🎉`, color)}
    <p style="margin:0 0 20px;">Hi <strong>${name}</strong>,</p>
    <p style="margin:0 0 24px;">
      Your <strong>${daysLeft}-day ${b} Pro trial</strong> is now active. You have full access
      to every Pro feature until <strong>${endDate}</strong>.
    </p>

    <!-- Feature grid -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
      ${featureRows}
    </table>

    ${ctaButton(`${APP_BASE}/dashboard`, "Open My Dashboard", color)}
    ${DIVIDER}
    ${note(`Trial ends <strong style='color:#DDD8E8;'>${endDate}</strong> (${daysLeft} days away). Upgrade anytime from your <a href='${APP_BASE}/admin/billing' style='color:${color};text-decoration:none;'>Billing page</a> to keep full access.`)}
  `;

  return {
    subject: `Your ${b} Pro trial is active — ${daysLeft} days to explore`,
    html: wrapEmail(b, color, body),
    text: `Hi ${name},\n\nYour ${daysLeft}-day ${b} Pro trial is active until ${endDate}.\n\nDashboard: ${APP_BASE}/dashboard`,
    fromName,
  };
}

/**
 * Sent at 7, 3, and 1 day(s) before trial expiry to prompt upgrade.
 */
export function buildTrialExpiryWarningEmail(name, trialEndsAt, daysLeft, { brandName, primaryColor, fromName } = {}) {
  const b       = brandName    || APP_NAME;
  const color   = primaryColor || "#1DE9A8";
  const endDate = new Date(trialEndsAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const urgency = daysLeft === 1 ? "#EF4444" : daysLeft <= 3 ? "#F59E0B" : color;
  const dayWord = daysLeft === 1 ? "1 day" : `${daysLeft} days`;

  const lostFeatures = [
    "AI outbound calling",
    "Campaign automation",
    "Deal pipeline",
    "Advanced analytics",
    "Team management",
  ];

  const featureList = lostFeatures.map(f =>
    `<li style="padding:4px 0;color:#DDD8E8;">${f}</li>`
  ).join("");

  const body = `
    <!-- Urgency banner -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
      <tr>
        <td style="background:#1C1930;border:1px solid ${urgency};border-radius:10px;padding:16px 20px;text-align:center;">
          <div style="font-size:28px;font-weight:800;color:${urgency};">${dayWord}</div>
          <div style="font-size:13px;color:#9994AA;margin-top:4px;">remaining on your Pro trial</div>
        </td>
      </tr>
    </table>

    ${heading("Your trial is ending soon", urgency)}
    <p style="margin:0 0 16px;">Hi <strong>${name}</strong>,</p>
    <p style="margin:0 0 16px;">
      Your <strong>${b} Pro trial</strong> expires on <strong>${endDate}</strong>.
      After that, your account will revert to the Free plan and you'll lose access to:
    </p>
    <ul style="margin:0 0 24px;padding-left:20px;line-height:1.9;">
      ${featureList}
    </ul>
    <p style="margin:0 0 8px;font-size:14px;color:#9994AA;">
      Upgrade now and keep everything — your data, settings, and team stay intact.
    </p>

    ${ctaButton(`${APP_BASE}/admin/billing`, "Upgrade & Keep Access", color)}
    ${DIVIDER}
    ${note(`Questions? Reply to this email or visit <a href='${APP_BASE}/admin/billing' style='color:${color};text-decoration:none;'>your billing page</a>. We're happy to help.`)}
  `;

  return {
    subject: `⏰ Your ${b} trial ends in ${dayWord} — upgrade to keep access`,
    html: wrapEmail(b, color, body),
    text: `Hi ${name},\n\nYour ${b} Pro trial ends in ${dayWord} (${endDate}).\n\nUpgrade: ${APP_BASE}/admin/billing`,
    fromName,
  };
}

/**
 * Sent when a plan payment is successfully processed (Stripe or Razorpay).
 */
export function buildPaymentConfirmationEmail(name, invoice, { brandName, primaryColor, fromName } = {}) {
  const b     = brandName    || APP_NAME;
  const color = primaryColor || "#1DE9A8";

  const isInr  = invoice.currency?.toUpperCase() === "INR";
  const symbol = isInr ? "₹" : "$";
  const amount = invoice.amountPaid != null
    ? `${symbol}${(invoice.amountPaid / 100).toFixed(2)}`
    : "—";
  const dateStr = new Date(invoice.createdAt || Date.now()).toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  });

  const rows = [
    ["Plan",     invoice.plan || "—",      "#DDD8E8"],
    ["Amount",   amount,                   color],
    ["Currency", (invoice.currency || "USD").toUpperCase(), "#DDD8E8"],
    ["Date",     dateStr,                  "#DDD8E8"],
  ].map(([label, value, valColor]) => `
    <tr>
      <td style="padding:11px 0;color:#706C85;font-size:14px;border-bottom:1px solid #2E2A42;">${label}</td>
      <td style="padding:11px 0;font-size:14px;font-weight:600;color:${valColor};text-align:right;border-bottom:1px solid #2E2A42;">${value}</td>
    </tr>`).join("");

  const body = `
    <!-- Success badge -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
      <tr>
        <td style="background:#0D1F15;border:1px solid #1A5C38;border-radius:10px;padding:14px 20px;text-align:center;">
          <span style="font-size:22px;">✓</span>
          <span style="font-size:15px;font-weight:700;color:#22C55E;margin-left:8px;">Payment successful</span>
        </td>
      </tr>
    </table>

    ${heading("Thank you for your payment", color)}
    <p style="margin:0 0 24px;">Hi <strong>${name}</strong>, we've received your payment for <strong>${b}</strong>.</p>

    <!-- Receipt table -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
      ${rows}
    </table>

    ${ctaButton(`${APP_BASE}/admin/billing`, "View Billing Details", color)}
    ${DIVIDER}
    ${note(`Keep this email as your payment receipt. If you have questions about this charge, reply here or visit <a href='${APP_BASE}/admin/billing' style='color:${color};text-decoration:none;'>your billing page</a>.`)}
  `;

  return {
    subject: `Payment confirmed — ${amount} received for ${b}`,
    html: wrapEmail(b, color, body),
    text: `Hi ${name},\n\nPayment of ${amount} confirmed for ${b}.\n\nView receipt: ${APP_BASE}/admin/billing`,
    fromName,
  };
}

/**
 * Sent when a payment attempt fails (Stripe invoice.payment_failed / Razorpay subscription.halted).
 */
export function buildPaymentFailureEmail(name, invoice, { brandName, primaryColor, fromName } = {}) {
  const b     = brandName    || APP_NAME;
  const color = primaryColor || "#1DE9A8";
  const isInr  = invoice.currency?.toUpperCase() === "INR";
  const symbol = isInr ? "₹" : "$";
  const amount = invoice.amountDue != null
    ? `${symbol}${(invoice.amountDue / 100).toFixed(2)}`
    : "—";

  const body = `
    <!-- Failure banner -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
      <tr>
        <td style="background:#1F0D0D;border:1px solid #7F1D1D;border-radius:10px;padding:14px 20px;text-align:center;">
          <span style="font-size:22px;">✗</span>
          <span style="font-size:15px;font-weight:700;color:#EF4444;margin-left:8px;">Payment failed</span>
        </td>
      </tr>
    </table>

    ${heading("We couldn't process your payment", "#EF4444")}
    <p style="margin:0 0 16px;">Hi <strong>${name}</strong>,</p>
    <p style="margin:0 0 16px;">
      We attempted to charge <strong>${amount}</strong> for your <strong>${b}</strong> subscription
      but the payment was unsuccessful.
    </p>
    <p style="margin:0 0 24px;color:#9994AA;font-size:14px;">
      Your account has entered a <strong style="color:#DDD8E8;">grace period</strong>. Update your payment method
      within 7 days to avoid service interruption.
    </p>

    ${ctaButton(`${APP_BASE}/admin/billing`, "Update Payment Method", color)}
    ${DIVIDER}
    ${note("If you believe this is an error, please contact your bank or reply to this email. We're happy to help resolve this quickly.")}
  `;

  return {
    subject: `Action required — payment of ${amount} failed for ${b}`,
    html: wrapEmail(b, color, body),
    text: `Hi ${name},\n\nYour ${b} payment of ${amount} failed. Please update your payment method: ${APP_BASE}/admin/billing`,
    fromName,
  };
}

/**
 * Sent when a credit pack purchase is completed (Stripe checkout or Razorpay activation).
 */
export function buildCreditPurchaseEmail(name, packName, creditsAdded, totalBalance, expiresAt, amount, currency, { brandName, primaryColor, fromName } = {}) {
  const b     = brandName    || APP_NAME;
  const color = primaryColor || "#1DE9A8";
  const isInr = currency?.toUpperCase() === "INR";
  const symbol = isInr ? "₹" : "$";
  const amountStr = amount != null ? `${symbol}${Number(amount).toFixed(2)}` : "—";
  const expiryStr = expiresAt
    ? new Date(expiresAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : "Never";

  const rows = [
    ["Pack",           packName || "Credit Pack",        "#DDD8E8"],
    ["Credits added",  creditsAdded?.toLocaleString() || "—", color],
    ["New balance",    totalBalance?.toLocaleString()  || "—", "#DDD8E8"],
    ["Expires",        expiryStr,                       "#DDD8E8"],
    ["Amount charged", amountStr,                       "#DDD8E8"],
  ].map(([label, value, valColor]) => `
    <tr>
      <td style="padding:10px 0;color:#706C85;font-size:14px;border-bottom:1px solid #2E2A42;">${label}</td>
      <td style="padding:10px 0;font-size:14px;font-weight:600;color:${valColor};text-align:right;border-bottom:1px solid #2E2A42;">${value}</td>
    </tr>`).join("");

  const body = `
    <!-- Success badge -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
      <tr>
        <td style="background:#0D1F15;border:1px solid #1A5C38;border-radius:10px;padding:14px 20px;text-align:center;">
          <span style="font-size:22px;">⚡</span>
          <span style="font-size:15px;font-weight:700;color:#22C55E;margin-left:8px;">${creditsAdded?.toLocaleString()} credits added</span>
        </td>
      </tr>
    </table>

    ${heading("Credit pack purchased", color)}
    <p style="margin:0 0 24px;">Hi <strong>${name}</strong>, your credits are ready to use.</p>

    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
      ${rows}
    </table>

    ${ctaButton(`${APP_BASE}/admin/billing`, "View Credit Balance", color)}
    ${DIVIDER}
    ${note("Credits are consumed when AI calls are made. Purchased credits are used after your monthly plan credits run out.")}
  `;

  return {
    subject: `${creditsAdded?.toLocaleString()} credits added to your ${b} account`,
    html: wrapEmail(b, color, body),
    text: `Hi ${name},\n\n${creditsAdded} credits added to ${b}. New balance: ${totalBalance}.\n\nView: ${APP_BASE}/admin/billing`,
    fromName,
  };
}

/**
 * Sent when a tenant's plan is downgraded to FREE (trial expired or subscription lapsed).
 */
export function buildPlanDowngradeEmail(name, oldPlan, { brandName, primaryColor, fromName } = {}) {
  const b     = brandName    || APP_NAME;
  const color = primaryColor || "#1DE9A8";

  const lostFeatures = [
    "AI outbound calling",
    "Campaign automation",
    "Advanced analytics",
    "Team management",
    "Deal pipeline",
  ];
  const featureList = lostFeatures.map(f =>
    `<li style="padding:3px 0;color:#9994AA;">${f}</li>`
  ).join("");

  const body = `
    ${heading("Your plan has changed", "#F59E0B")}
    <p style="margin:0 0 16px;">Hi <strong>${name}</strong>,</p>
    <p style="margin:0 0 16px;">
      Your <strong>${b} ${oldPlan || "Pro"} plan</strong> has ended and your account has been
      moved to the <strong>Free plan</strong>.
    </p>
    <p style="margin:0 0 8px;font-size:14px;color:#9994AA;">Features no longer available on Free:</p>
    <ul style="margin:0 0 24px;padding-left:20px;line-height:1.8;">${featureList}</ul>
    <p style="margin:0 0 8px;font-size:14px;">
      Your data is safe — customers, deals, and call history are all preserved.
      Upgrade anytime to restore full access instantly.
    </p>

    ${ctaButton(`${APP_BASE}/admin/billing`, "Upgrade to Restore Access", color)}
    ${DIVIDER}
    ${note("Questions about your account? Reply to this email and we'll help.")}
  `;

  return {
    subject: `Your ${b} plan has changed — upgrade to restore access`,
    html: wrapEmail(b, color, body),
    text: `Hi ${name},\n\nYour ${b} ${oldPlan || "Pro"} plan has ended. Upgrade: ${APP_BASE}/admin/billing`,
    fromName,
  };
}

/**
 * Sent to non-owner users who are suspended when a tenant downgrades.
 */
export function buildAccountSuspendEmail(name, tenantBrand, { brandName, primaryColor, fromName } = {}) {
  const b     = brandName    || APP_NAME;
  const color = primaryColor || "#1DE9A8";

  const body = `
    ${heading("Your account has been suspended", "#F59E0B")}
    <p style="margin:0 0 16px;">Hi <strong>${name}</strong>,</p>
    <p style="margin:0 0 16px;">
      Your <strong>${b}</strong> account has been temporarily suspended because the
      <strong>${tenantBrand || "your organisation"}</strong> subscription was downgraded
      below the user limit.
    </p>
    <p style="margin:0 0 24px;font-size:14px;color:#9994AA;">
      You won't be able to log in until the account owner upgrades their plan.
      Your data and settings are fully preserved.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
      <tr>
        <td style="background:#1C1930;border:1px solid #2E2A42;border-radius:9px;padding:16px 20px;">
          <p style="margin:0;font-size:13px;color:#9994AA;line-height:1.7;">
            <strong style="color:#DDD8E8;">What to do next:</strong><br>
            Ask your account administrator to upgrade the subscription plan. Once upgraded,
            your access will be restored automatically — no action needed on your part.
          </p>
        </td>
      </tr>
    </table>
    ${DIVIDER}
    ${note("If you think this is a mistake, contact your account administrator or reply to this email.")}
  `;

  return {
    subject: `Your ${b} account has been suspended`,
    html: wrapEmail(b, color, body),
    text: `Hi ${name},\n\nYour ${b} account has been suspended due to a plan downgrade. Contact your account administrator to restore access.`,
    fromName,
  };
}

/**
 * Sent when credit balance drops to/below a warning threshold after a call settles.
 */
export function buildCreditLowWarningEmail(name, currentBalance, allocated, thresholdPct, { brandName, primaryColor, fromName } = {}) {
  const b     = brandName    || APP_NAME;
  const color = primaryColor || "#1DE9A8";
  const pct   = allocated > 0 ? Math.round((currentBalance / allocated) * 100) : 0;
  const isCritical = pct <= 5;
  const urgencyColor = isCritical ? "#EF4444" : "#F59E0B";
  const urgencyLabel = isCritical ? "Critical — campaigns paused" : "Low credit warning";

  const body = `
    <!-- Credit meter -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
      <tr>
        <td style="background:#1C1930;border:1px solid ${urgencyColor};border-radius:10px;padding:16px 20px;">
          <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
            <span style="font-size:13px;color:#9994AA;">Credit balance</span>
            <span style="font-size:13px;font-weight:700;color:${urgencyColor};">${pct}% remaining</span>
          </div>
          <div style="background:#2E2A42;border-radius:4px;height:8px;overflow:hidden;">
            <div style="background:${urgencyColor};height:100%;width:${Math.max(2, pct)}%;border-radius:4px;"></div>
          </div>
          <div style="margin-top:8px;font-size:12px;color:#706C85;">
            ${currentBalance?.toLocaleString()} of ${allocated?.toLocaleString()} credits remaining
          </div>
        </td>
      </tr>
    </table>

    ${heading(urgencyLabel, urgencyColor)}
    <p style="margin:0 0 16px;">Hi <strong>${name}</strong>,</p>
    <p style="margin:0 0 ${isCritical ? "24px" : "16px"};">
      ${isCritical
        ? `Your <strong>${b}</strong> credit balance has hit <strong style="color:#EF4444;">0%</strong>. Active campaigns have been automatically paused to prevent call failures.`
        : `Your <strong>${b}</strong> credit balance is running low (<strong style="color:#F59E0B;">${pct}%</strong>). Purchase additional credits to keep your campaigns running uninterrupted.`
      }
    </p>

    ${ctaButton(`${APP_BASE}/admin/billing`, "Purchase Credits", color)}
    ${DIVIDER}
    ${note("Credits reset monthly with your plan. Purchased credits never expire within 12 months and are consumed after your monthly allowance runs out.")}
  `;

  return {
    subject: `${isCritical ? "⚠️ Credits exhausted" : "⚡ Low credit balance"} — ${b} campaigns ${isCritical ? "paused" : "at risk"}`,
    html: wrapEmail(b, color, body),
    text: `Hi ${name},\n\nYour ${b} credit balance is at ${pct}% (${currentBalance} of ${allocated}). Purchase more: ${APP_BASE}/admin/billing`,
    fromName,
  };
}

/**
 * Sent when a plan is successfully upgraded via billing webhook.
 */
export function buildPlanUpgradeEmail(name, oldPlan, newPlan, { brandName, primaryColor, fromName } = {}) {
  const b     = brandName    || APP_NAME;
  const color = primaryColor || "#1DE9A8";

  const planFeatures = {
    PLUS: ["AI calling (500 calls/month)", "Up to 1,000 customers", "Basic analytics"],
    PRO:  ["AI calling (2,000 calls/month)", "Up to 10,000 customers", "Deal pipeline & teams", "Advanced analytics", "Custom AI prompts"],
    MAX:  ["Unlimited AI calling", "Unlimited customers", "Full feature access", "Priority support", "Custom integrations"],
  };
  const features = planFeatures[newPlan] || planFeatures.PRO;
  const featureList = features.map(f =>
    `<li style="padding:4px 0;color:#DDD8E8;">${f}</li>`
  ).join("");

  const body = `
    <!-- Success banner -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
      <tr>
        <td style="background:#0D1F15;border:1px solid #1A5C38;border-radius:10px;padding:14px 20px;text-align:center;">
          <span style="font-size:15px;font-weight:700;color:#22C55E;">
            ✓ Upgraded to ${newPlan} plan
          </span>
        </td>
      </tr>
    </table>

    ${heading(`Welcome to ${b} ${newPlan}!`, color)}
    <p style="margin:0 0 16px;">Hi <strong>${name}</strong>,</p>
    <p style="margin:0 0 16px;">
      Your account has been upgraded${oldPlan ? ` from <strong>${oldPlan}</strong>` : ""} to the
      <strong>${newPlan} plan</strong>. All features are now active.
    </p>
    <p style="margin:0 0 8px;font-size:14px;color:#9994AA;">What's included in your plan:</p>
    <ul style="margin:0 0 28px;padding-left:20px;line-height:1.9;">${featureList}</ul>

    ${ctaButton(`${APP_BASE}/dashboard`, "Go to Dashboard", color)}
    ${DIVIDER}
    ${note(`Need help getting started? Reply to this email or explore your <a href='${APP_BASE}/admin/settings' style='color:${color};text-decoration:none;'>settings page</a>.`)}
  `;

  return {
    subject: `Your ${b} account is now on the ${newPlan} plan 🎉`,
    html: wrapEmail(b, color, body),
    text: `Hi ${name},\n\nYour ${b} account has been upgraded to ${newPlan}.\n\nDashboard: ${APP_BASE}/dashboard`,
    fromName,
  };
}

/**
 * Sent to the campaign creator when all jobs in a campaign batch complete.
 */
export function buildCampaignCompletionEmail(name, campaignName, stats, { brandName, primaryColor, fromName } = {}) {
  const b     = brandName    || APP_NAME;
  const color = primaryColor || "#1DE9A8";
  const { total = 0, completed = 0, failed = 0, interested = 0 } = stats || {};
  const successRate = total > 0 ? Math.round((completed / total) * 100) : 0;
  const convRate    = total > 0 ? Math.round((interested / total) * 100) : 0;

  const statCards = [
    ["Total",       total,       "#DDD8E8"],
    ["Completed",   completed,   color],
    ["Failed",      failed,      failed > 0 ? "#EF4444" : "#706C85"],
    ["Interested",  interested,  "#22C55E"],
  ].map(([label, value, c]) => `
    <td style="width:25%;padding:0 6px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0"
             style="background:#1C1930;border:1px solid #2E2A42;border-radius:9px;padding:14px 8px;text-align:center;">
        <tr><td style="font-size:22px;font-weight:800;color:${c};">${value}</td></tr>
        <tr><td style="font-size:11px;color:#706C85;margin-top:4px;">${label}</td></tr>
      </table>
    </td>`).join("");

  const body = `
    ${heading(`Campaign complete`, color)}
    <p style="margin:0 0 8px;">Hi <strong>${name}</strong>,</p>
    <p style="margin:0 0 24px;">
      Your campaign <strong>"${campaignName}"</strong> has finished processing.
    </p>

    <!-- Stat grid -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
      <tr>${statCards}</tr>
    </table>

    <!-- Rates -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
      <tr>
        <td style="background:#1C1930;border:1px solid #2E2A42;border-radius:9px;padding:14px 20px;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="font-size:13px;color:#9994AA;">Success rate</td>
              <td style="font-size:15px;font-weight:700;color:${color};text-align:right;">${successRate}%</td>
            </tr>
            <tr>
              <td style="font-size:13px;color:#9994AA;padding-top:6px;">Conversion rate</td>
              <td style="font-size:15px;font-weight:700;color:#22C55E;text-align:right;padding-top:6px;">${convRate}%</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    ${ctaButton(`${APP_BASE}/admin/call-logs`, "View Call Logs", color)}
    ${DIVIDER}
    ${note("Interested contacts have been flagged for follow-up. Check your Follow-ups page to assign tasks.")}
  `;

  return {
    subject: `Campaign "${campaignName}" complete — ${interested} interested out of ${total}`,
    html: wrapEmail(b, color, body),
    text: `Hi ${name},\n\nCampaign "${campaignName}" complete. ${completed}/${total} calls completed, ${interested} interested.\n\nView: ${APP_BASE}/admin/call-logs`,
    fromName,
  };
}

/**
 * Sent when a user requests a password reset.
 */
export function buildPasswordResetEmail(name, token, { brandName, primaryColor, fromName } = {}) {
  const b     = brandName    || APP_NAME;
  const color = primaryColor || "#1DE9A8";
  const url   = `${APP_BASE}/reset-password?token=${token}`;

  const body = `
    ${heading("Reset your password", color)}
    <p style="margin:0 0 16px;">Hi <strong>${name}</strong>,</p>
    <p style="margin:0 0 16px;">
      We received a request to reset your <strong>${b}</strong> password. Click the button
      below to choose a new password.
    </p>

    ${ctaButton(url, "Reset Password", color)}
    ${DIVIDER}
    <p style="margin:0 0 8px;font-size:13px;color:#706C85;">Or paste this link into your browser:</p>
    <p style="margin:0;font-size:12px;word-break:break-all;">
      <a href="${url}" style="color:${color};text-decoration:none;">${url}</a>
    </p>
    ${note("This link expires in <strong style='color:#DDD8E8;'>1 hour</strong>. If you didn't request a password reset, you can safely ignore this email — your password won't change.")}
  `;

  return {
    subject: `Reset your ${b} password`,
    html: wrapEmail(b, color, body),
    text: `Hi ${name},\n\nReset your ${b} password: ${url}\n\nThis link expires in 1 hour.`,
    fromName,
  };
}

/**
 * Sent to invite a new team member to a tenant.
 */
export function buildTeamInviteEmail(inviteeName, inviterName, tenantName, role, token, { brandName, primaryColor, fromName } = {}) {
  const b     = brandName    || APP_NAME;
  const color = primaryColor || "#1DE9A8";
  const url   = `${APP_BASE}/accept-invite?token=${token}`;
  const roleLabel = role === "ADMIN" ? "Administrator" : role === "SALES" ? "Sales Agent" : role || "Team Member";

  const body = `
    ${heading(`You've been invited to join ${tenantName || b}`, color)}
    <p style="margin:0 0 16px;">Hi <strong>${inviteeName || "there"}</strong>,</p>
    <p style="margin:0 0 24px;">
      <strong>${inviterName || "Your team lead"}</strong> has invited you to join
      <strong>${tenantName || b}</strong> on <strong>${b}</strong> as a
      <strong>${roleLabel}</strong>.
    </p>

    <!-- Role card -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
      <tr>
        <td style="background:#1C1930;border:1px solid #2E2A42;border-radius:9px;padding:16px 20px;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="font-size:13px;color:#9994AA;">Organisation</td>
              <td style="font-size:13px;font-weight:600;color:#DDD8E8;text-align:right;">${tenantName || b}</td>
            </tr>
            <tr>
              <td style="font-size:13px;color:#9994AA;padding-top:8px;">Your role</td>
              <td style="font-size:13px;font-weight:600;color:${color};text-align:right;padding-top:8px;">${roleLabel}</td>
            </tr>
            <tr>
              <td style="font-size:13px;color:#9994AA;padding-top:8px;">Invited by</td>
              <td style="font-size:13px;font-weight:600;color:#DDD8E8;text-align:right;padding-top:8px;">${inviterName || "—"}</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    ${ctaButton(url, "Accept Invitation", color)}
    ${DIVIDER}
    ${note("This invitation expires in <strong style='color:#DDD8E8;'>48 hours</strong>. If you weren't expecting this, you can safely ignore it.")}
  `;

  return {
    subject: `You've been invited to join ${tenantName || b} on ${b}`,
    html: wrapEmail(b, color, body),
    text: `Hi ${inviteeName || "there"},\n\n${inviterName} invited you to join ${tenantName || b} on ${b} as ${roleLabel}.\n\nAccept: ${url}\n\nExpires in 48 hours.`,
    fromName,
  };
}

/**
 * Sent when purchased credits are within 7 days of expiring.
 */
export function buildCreditExpiringSoonEmail(name, creditsAmount, expiresAt, { brandName, primaryColor, fromName } = {}) {
  const b       = brandName    || APP_NAME;
  const color   = primaryColor || "#1DE9A8";
  const expDate = new Date(expiresAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const daysLeft = Math.max(1, Math.ceil((new Date(expiresAt) - Date.now()) / (1000 * 60 * 60 * 24)));

  const body = `
    <!-- Expiry banner -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
      <tr>
        <td style="background:#1C1930;border:1px solid #F59E0B;border-radius:10px;padding:16px 20px;text-align:center;">
          <div style="font-size:28px;font-weight:800;color:#F59E0B;">${creditsAmount?.toLocaleString()}</div>
          <div style="font-size:13px;color:#9994AA;margin-top:2px;">credits expire in ${daysLeft} day${daysLeft === 1 ? "" : "s"}</div>
        </td>
      </tr>
    </table>

    ${heading("Your credits are expiring soon", "#F59E0B")}
    <p style="margin:0 0 16px;">Hi <strong>${name}</strong>,</p>
    <p style="margin:0 0 24px;">
      <strong>${creditsAmount?.toLocaleString()} purchased credits</strong> on your <strong>${b}</strong>
      account expire on <strong>${expDate}</strong>. Use them before they're gone — or run a campaign now.
    </p>

    ${ctaButton(`${APP_BASE}/admin/campaigns`, "Run a Campaign", color)}
    ${DIVIDER}
    ${note(`Credits expire on <strong style='color:#DDD8E8;'>${expDate}</strong>. Unused credits cannot be rolled over after expiry.`)}
  `;

  return {
    subject: `⏳ ${creditsAmount?.toLocaleString()} credits expiring in ${daysLeft} day${daysLeft === 1 ? "" : "s"} — use them now`,
    html: wrapEmail(b, color, body),
    text: `Hi ${name},\n\n${creditsAmount} credits on your ${b} account expire on ${expDate}. Run a campaign: ${APP_BASE}/admin/campaigns`,
    fromName,
  };
}

/**
 * Sent 7 days before a subscription billing period ends to remind the user of upcoming renewal.
 */
export function buildRenewalReminderEmail(name, plan, renewalDate, amount, currency, { brandName, primaryColor, fromName } = {}) {
  const b       = brandName    || APP_NAME;
  const color   = primaryColor || "#1DE9A8";
  const isInr   = currency?.toUpperCase() === "INR";
  const symbol  = isInr ? "₹" : "$";
  const amountStr = amount != null ? `${symbol}${Number(amount).toFixed(2)}` : "—";
  const dateStr = new Date(renewalDate).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  const body = `
    ${heading("Your subscription renews soon", color)}
    <p style="margin:0 0 16px;">Hi <strong>${name}</strong>,</p>
    <p style="margin:0 0 24px;">
      Just a heads-up — your <strong>${b} ${plan} plan</strong> renews on
      <strong>${dateStr}</strong> for <strong>${amountStr}</strong>.
      No action needed if you'd like to continue.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
      <tr>
        <td style="background:#1C1930;border:1px solid #2E2A42;border-radius:9px;padding:14px 20px;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="font-size:13px;color:#9994AA;">Plan</td>
              <td style="font-size:14px;font-weight:600;color:#DDD8E8;text-align:right;">${plan}</td>
            </tr>
            <tr>
              <td style="font-size:13px;color:#9994AA;padding-top:8px;">Renewal date</td>
              <td style="font-size:14px;font-weight:600;color:#DDD8E8;text-align:right;padding-top:8px;">${dateStr}</td>
            </tr>
            <tr>
              <td style="font-size:13px;color:#9994AA;padding-top:8px;">Amount</td>
              <td style="font-size:14px;font-weight:600;color:${color};text-align:right;padding-top:8px;">${amountStr}</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    ${ctaButton(`${APP_BASE}/admin/billing`, "Manage Subscription", color)}
    ${DIVIDER}
    ${note("To cancel or change your plan before renewal, visit your billing page. Cancellations take effect at the end of the current period.")}
  `;

  return {
    subject: `Your ${b} ${plan} plan renews on ${dateStr} — ${amountStr}`,
    html: wrapEmail(b, color, body),
    text: `Hi ${name},\n\nYour ${b} ${plan} subscription renews on ${dateStr} for ${amountStr}.\n\nManage: ${APP_BASE}/admin/billing`,
    fromName,
  };
}
