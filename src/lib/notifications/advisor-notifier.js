import nodemailer from "nodemailer";
import { prisma } from "@/lib/prisma";
import { ACTIONABLE_INTENTS, canonicalizeIntent } from "@/lib/journey/intent-normalization";
import { normalizeE164Digits, normalizePhoneNumber } from "@/lib/telephony/utils";

const WHATSAPP_API_MODES = new Set(["meta", "generic"]);
const MAX_WHATSAPP_BODY_LENGTH = 1400;

function buildCustomerName(customer) {
  const firstName = String(customer?.firstName || "").trim();
  const lastName = String(customer?.lastName || "").trim();
  return `${firstName} ${lastName}`.trim() || "Unknown Customer";
}

function truncateText(value, maxLength) {
  const text = String(value || "").trim();
  if (!text || text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
}

function resolveCallsUrl() {
  const baseUrl = String(process.env.APP_BASE_URL || process.env.NEXTAUTH_URL || "").trim();
  if (!baseUrl) {
    return "/calls";
  }

  return `${baseUrl.replace(/\/$/, "")}/calls`;
}

function getNormalizedWhatsAppMode() {
  const configured = String(process.env.WHATSAPP_API_MODE || "meta").trim().toLowerCase();
  if (WHATSAPP_API_MODES.has(configured)) {
    return configured;
  }

  return "meta";
}

function isLikelyE164(value) {
  return /^\+\d{8,15}$/.test(String(value || ""));
}

function toWhatsAppPhone(value) {
  const normalized = normalizePhoneNumber(value);
  return isLikelyE164(normalized) ? normalized : "";
}

function parseBooleanEnv(value, fallback = false) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }

  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return fallback;
}

function parsePort(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function persistNotificationAudit(callLogId, auditEntry) {
  const id = String(callLogId || "").trim();
  if (!id) return;

  try {
    const callLog = await prisma.callLog.findFirst({
      where: { id },
      select: {
        id: true,
        tenantId: true,
        metadata: true,
      },
    });

    if (!callLog) {
      return;
    }

    const metadata = isPlainObject(callLog.metadata) ? { ...callLog.metadata } : {};
    const existingHistory = Array.isArray(metadata.advisorNotificationHistory)
      ? metadata.advisorNotificationHistory.filter(isPlainObject)
      : [];

    const nextEntry = {
      at: new Date().toISOString(),
      ...auditEntry,
    };

    const nextHistory = [...existingHistory.slice(-19), nextEntry];
    metadata.advisorNotificationLast = nextEntry;
    metadata.advisorNotificationHistory = nextHistory;

    await prisma.callLog.updateMany({
      where: { id: callLog.id, tenantId: callLog.tenantId },
      data: { metadata },
    });
  } catch (error) {
    console.warn("[advisor-notifier] Failed to persist notification audit:", error?.message || error);
  }
}

function buildNotificationPayload(callLog, normalizedIntent) {
  const tenant = callLog?.tenant;
  const customer = callLog?.customer;
  const crmName = String(tenant?.crmName || tenant?.name || "CRM").trim();
  const customerName = buildCustomerName(customer);
  const customerPhone = String(customer?.phone || "N/A").trim();
  const summary = truncateText(callLog?.summary || "No AI summary available.", 700);
  const nextAction = truncateText(callLog?.nextAction || "Review and follow up with the customer.", 300);
  const transcriptPreview = truncateText(String(callLog?.transcript || "").replace(/\s+/g, " "), 400);
  const callsUrl = resolveCallsUrl();
  const intentLabel = (normalizedIntent || "unknown").toUpperCase();

  const whatsappLines = [
    "AI CALL ALERT",
    `CRM: ${crmName}`,
    `Customer: ${customerName} (${customerPhone})`,
    `Intent: ${intentLabel}`,
    `Summary: ${summary}`,
    `Next Action: ${nextAction}`,
    `Open CRM: ${callsUrl}`,
  ];

  if (transcriptPreview) {
    whatsappLines.splice(6, 0, `Transcript: ${transcriptPreview}`);
  }

  return {
    subject: `[AI Call] ${customerName} - ${intentLabel}`,
    whatsappBody: truncateText(whatsappLines.join("\n"), MAX_WHATSAPP_BODY_LENGTH),
    emailBody: [
      `CRM: ${crmName}`,
      `Customer: ${customerName}`,
      `Customer Phone: ${customerPhone}`,
      `Intent: ${intentLabel}`,
      "",
      `Summary: ${summary}`,
      "",
      `Next Action: ${nextAction}`,
      transcriptPreview ? "" : null,
      transcriptPreview ? `Transcript Preview: ${transcriptPreview}` : null,
      "",
      `Open CRM: ${callsUrl}`,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

async function resolveTenantNotificationContext(tenantId) {
  const id = String(tenantId || "").trim();
  if (!id) {
    return null;
  }

  return prisma.tenant.findFirst({
    where: { id },
    select: {
      id: true,
      name: true,
      crmName: true,
      loanAssistantHumanAdvisorName: true,
      loanAssistantCallbackPhone: true,
    },
  });
}

function buildCustomerFromProfile(customerProfile) {
  const fullName = String(
    customerProfile?.name || customerProfile?.fullName || customerProfile?.customer_name || "Unknown Customer"
  ).trim();
  const segments = fullName ? fullName.split(/\s+/) : [];
  const firstName = segments.shift() || "Unknown";
  const lastName = segments.join(" ");
  const phone =
    customerProfile?.phone ||
    customerProfile?.mobile ||
    customerProfile?.phoneNumber ||
    customerProfile?.contact_number ||
    null;

  return {
    firstName,
    lastName,
    phone,
    assignedTo: null,
  };
}

async function resolveAdvisorEmail(callLog) {
  const assignedAdvisorEmail = String(callLog?.customer?.assignedTo?.email || "").trim();
  if (assignedAdvisorEmail) {
    return assignedAdvisorEmail;
  }

  const fallbackEmail = String(process.env.ADVISOR_EMAIL_TO || "").trim();
  if (fallbackEmail) {
    return fallbackEmail;
  }

  const tenantId = String(callLog?.tenantId || "").trim();
  if (!tenantId) {
    return "";
  }

  const tenantAdmin = await prisma.user.findFirst({
    where: {
      tenantId,
      isActive: true,
      role: {
        in: ["ADMIN", "SUPER_ADMIN"],
      },
    },
    orderBy: { createdAt: "asc" },
    select: { email: true },
  });

  return String(tenantAdmin?.email || "").trim();
}

async function sendAdvisorWhatsAppNotification({ to, body }) {
  const endpoint = String(process.env.WHATSAPP_API_URL || "").trim();
  const token = String(process.env.WHATSAPP_API_TOKEN || "").trim();
  const mode = getNormalizedWhatsAppMode();
  const from = String(process.env.WHATSAPP_API_FROM || "").trim();

  if (!to) {
    return { status: "skipped", reason: "missing_recipient" };
  }

  if (!endpoint) {
    return { status: "skipped", reason: "missing_whatsapp_api_url" };
  }

  const normalizedTo = toWhatsAppPhone(to);
  if (!normalizedTo) {
    return { status: "skipped", reason: "invalid_whatsapp_recipient" };
  }

  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const payload =
    mode === "meta"
      ? {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: normalizeE164Digits(normalizedTo),
          type: "text",
          text: {
            preview_url: false,
            body,
          },
        }
      : {
          to: normalizedTo,
          message: body,
          ...(from ? { from } : {}),
        };

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    const rawBody = await response.text().catch(() => "");
    const data = rawBody
      ? (() => {
          try {
            return JSON.parse(rawBody);
          } catch {
            return null;
          }
        })()
      : null;

    if (!response.ok) {
      return {
        status: "failed",
        reason: `whatsapp_api_${response.status}${rawBody ? `: ${rawBody}` : ""}`,
      };
    }

    const providerMessageId =
      data?.messages?.[0]?.id ||
      data?.id ||
      data?.messageId ||
      data?.data?.id ||
      null;

    return {
      status: "sent",
      providerMessageId,
    };
  } catch (error) {
    return {
      status: "failed",
      reason: error?.message || "whatsapp_send_failed",
    };
  }
}

async function sendAdvisorEmailNotification({ to, subject, text }) {
  const host = String(process.env.SMTP_HOST || "").trim();
  const port = parsePort(process.env.SMTP_PORT, 587);
  const secure = parseBooleanEnv(process.env.SMTP_SECURE, port === 465);
  const user = String(process.env.SMTP_USER || "").trim();
  const pass = String(process.env.SMTP_PASS || "").trim();
  const from = String(process.env.ADVISOR_EMAIL_FROM || "").trim();

  if (!to) {
    return { status: "skipped", reason: "missing_recipient" };
  }

  if (!host) {
    return { status: "skipped", reason: "missing_smtp_host" };
  }

  if (!from) {
    return { status: "skipped", reason: "missing_email_sender" };
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    ...(user || pass
      ? {
          auth: {
            user,
            pass,
          },
        }
      : {}),
  });

  try {
    const info = await transporter.sendMail({
      from,
      to,
      subject,
      text,
    });

    return {
      status: "sent",
      providerMessageId: info?.messageId || null,
    };
  } catch (error) {
    return {
      status: "failed",
      reason: error?.message || "email_send_failed",
    };
  }
}

export async function notifyAdvisorForCallLog(callLogId, options = {}) {
  const id = String(callLogId || "").trim();
  const force = Boolean(options.force);

  if (!id) {
    return {
      ok: false,
      skipped: true,
      reason: "missing_call_log_id",
    };
  }

  try {
    const callLog = await prisma.callLog.findFirst({
      where: { id },
      select: {
        id: true,
        tenantId: true,
        transcript: true,
        summary: true,
        nextAction: true,
        intent: true,
        intentClassification: true,
        tenant: {
          select: {
            id: true,
            name: true,
            crmName: true,
            loanAssistantHumanAdvisorName: true,
            loanAssistantCallbackPhone: true,
          },
        },
        customer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            assignedTo: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
      },
    });

    if (!callLog) {
      return {
        ok: false,
        skipped: true,
        reason: "call_log_not_found",
      };
    }

    const normalizedIntent = canonicalizeIntent(callLog.intentClassification || callLog.intent);
    console.info("[advisor-notifier] evaluating call for notification", {
      callLogId: callLog.id,
      intent: normalizedIntent || "unknown",
      force,
      hasSummary: Boolean(String(callLog.summary || "").trim()),
      hasTranscript: Boolean(String(callLog.transcript || "").trim()),
    });

    if (!force && !ACTIONABLE_INTENTS.has(normalizedIntent)) {
      const result = {
        ok: true,
        skipped: true,
        reason: "intent_not_actionable",
        intent: normalizedIntent || "unknown",
      };

      await persistNotificationAudit(callLog.id, {
        status: "skipped",
        reason: result.reason,
        intent: result.intent,
      });
      console.info("[advisor-notifier] notification skipped", {
        callLogId: callLog.id,
        reason: result.reason,
        intent: result.intent,
      });

      return result;
    }

    const advisorEmail = await resolveAdvisorEmail(callLog);
    const advisorWhatsApp = toWhatsAppPhone(
      String(process.env.ADVISOR_WHATSAPP_TO || callLog?.tenant?.loanAssistantCallbackPhone || "").trim()
    );

    const payload = buildNotificationPayload(callLog, normalizedIntent);

    const [whatsapp, email] = await Promise.all([
      sendAdvisorWhatsAppNotification({
        to: advisorWhatsApp,
        body: payload.whatsappBody,
      }),
      sendAdvisorEmailNotification({
        to: advisorEmail,
        subject: payload.subject,
        text: payload.emailBody,
      }),
    ]);

    const sent = whatsapp.status === "sent" || email.status === "sent";

    const result = {
      ok: true,
      skipped: false,
      sent,
      intent: normalizedIntent || "unknown",
      channels: {
        whatsapp,
        email,
      },
    };

    await persistNotificationAudit(callLog.id, {
      status: sent ? "sent" : "not_sent",
      reason: sent ? null : "all_channels_skipped_or_failed",
      intent: result.intent,
      channels: {
        whatsapp: {
          status: whatsapp.status,
          reason: whatsapp.reason || null,
          providerMessageId: whatsapp.providerMessageId || null,
        },
        email: {
          status: email.status,
          reason: email.reason || null,
          providerMessageId: email.providerMessageId || null,
        },
      },
      recipients: {
        advisorWhatsApp: advisorWhatsApp || null,
        advisorEmail: advisorEmail || null,
      },
    });

    console.info("[advisor-notifier] notification channels complete", {
      callLogId: callLog.id,
      intent: result.intent,
      sent: result.sent,
      whatsappStatus: whatsapp.status,
      emailStatus: email.status,
      whatsappReason: whatsapp.reason || null,
      emailReason: email.reason || null,
    });

    return result;
  } catch (error) {
    console.error("[advisor-notifier] notification execution failed", {
      callLogId: id,
      message: error?.message || "advisor_notification_failed",
    });

    await persistNotificationAudit(id, {
      status: "failed",
      reason: error?.message || "advisor_notification_failed",
      intent: null,
    });

    return {
      ok: false,
      skipped: false,
      reason: error?.message || "advisor_notification_failed",
    };
  }
}

export async function notifyAdvisorForSummary(summaryInput, options = {}) {
  const force = Boolean(options.force);

  try {
    const normalizedIntent = canonicalizeIntent(summaryInput?.intent);
    console.info("[advisor-notifier] evaluating summary notification", {
      source: String(summaryInput?.source || "loan_assistant").trim() || "loan_assistant",
      intent: normalizedIntent || "unknown",
      force,
      tenantId: String(summaryInput?.tenantId || "").trim() || null,
    });

    if (!force && !ACTIONABLE_INTENTS.has(normalizedIntent)) {
      const result = {
        ok: true,
        skipped: true,
        reason: "intent_not_actionable",
        intent: normalizedIntent || "unknown",
      };

      console.info("[advisor-notifier] summary notification skipped", {
        source: String(summaryInput?.source || "loan_assistant").trim() || "loan_assistant",
        reason: result.reason,
        intent: result.intent,
      });

      return result;
    }

    const tenant = summaryInput?.tenant || (await resolveTenantNotificationContext(summaryInput?.tenantId));
    const callLike = {
      tenantId: String(tenant?.id || summaryInput?.tenantId || "").trim() || null,
      tenant,
      customer: buildCustomerFromProfile(summaryInput?.customerProfile),
      summary: summaryInput?.summary || "Loan assistant conversation completed.",
      nextAction: summaryInput?.nextAction || "Review and follow up with the customer.",
      transcript: summaryInput?.transcript || null,
      aiProviderUsed: summaryInput?.aiProviderUsed || null,
    };

    const advisorEmail = await resolveAdvisorEmail(callLike);
    const advisorWhatsApp = toWhatsAppPhone(
      String(process.env.ADVISOR_WHATSAPP_TO || tenant?.loanAssistantCallbackPhone || "").trim()
    );
    const payload = buildNotificationPayload(callLike, normalizedIntent);

    const [whatsapp, email] = await Promise.all([
      sendAdvisorWhatsAppNotification({
        to: advisorWhatsApp,
        body: payload.whatsappBody,
      }),
      sendAdvisorEmailNotification({
        to: advisorEmail,
        subject: payload.subject,
        text: payload.emailBody,
      }),
    ]);

    const sent = whatsapp.status === "sent" || email.status === "sent";
    const result = {
      ok: true,
      skipped: false,
      sent,
      intent: normalizedIntent || "unknown",
      channels: {
        whatsapp,
        email,
      },
      recipients: {
        advisorWhatsApp: advisorWhatsApp || null,
        advisorEmail: advisorEmail || null,
      },
    };

    console.info("[advisor-notifier] summary notification channels complete", {
      source: String(summaryInput?.source || "loan_assistant").trim() || "loan_assistant",
      intent: result.intent,
      sent: result.sent,
      whatsappStatus: whatsapp.status,
      emailStatus: email.status,
      whatsappReason: whatsapp.reason || null,
      emailReason: email.reason || null,
    });

    return result;
  } catch (error) {
    console.error("[advisor-notifier] summary notification execution failed", {
      source: String(summaryInput?.source || "loan_assistant").trim() || "loan_assistant",
      message: error?.message || "advisor_notification_failed",
    });

    return {
      ok: false,
      skipped: false,
      reason: error?.message || "advisor_notification_failed",
    };
  }
}
