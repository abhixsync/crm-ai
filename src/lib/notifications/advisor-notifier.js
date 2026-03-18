import nodemailer from "nodemailer";
import { prisma } from "@/lib/prisma";
import { ACTIONABLE_INTENTS, canonicalizeIntent } from "@/lib/journey/intent-normalization";
import { normalizeE164Digits, normalizePhoneNumber } from "@/lib/telephony/utils";
import { getWhatsAppToken } from "@/lib/notifications/whatsapp-token-manager";

const WHATSAPP_API_MODES = new Set(["meta", "generic"]);
const MAX_WHATSAPP_BODY_LENGTH = 1400;
const META_TEMPLATE_NAME = "advisor_callback_alert_v1";
const META_TEMPLATE_FALLBACK_NAME = "";
const META_TEMPLATE_LANGUAGE = "en_IN";
const MAX_TEMPLATE_PARAM_LENGTH = 900;

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

function normalizeTemplateText(value, fallback = "N/A", maxLength = MAX_TEMPLATE_PARAM_LENGTH) {
  const compact = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();

  if (!compact) {
    return fallback;
  }

  return truncateText(compact, maxLength) || fallback;
}

function formatLoanAmountForTemplate(value) {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    return `INR ${Math.round(numeric).toLocaleString("en-IN")}`;
  }

  const text = String(value || "").trim();
  return text || "N/A";
}

function resolveExtractedLoanData(callLike) {
  if (isPlainObject(callLike?.extractedData)) {
    return callLike.extractedData;
  }

  const metadata = isPlainObject(callLike?.metadata) ? callLike.metadata : null;
  const loanAssistant = isPlainObject(metadata?.loanAssistant) ? metadata.loanAssistant : null;
  const extractedData = isPlainObject(loanAssistant?.extractedData) ? loanAssistant.extractedData : null;
  return extractedData;
}

function humanizeTemplateToken(value) {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeAgentPromptSummary(summary) {
  const text = String(summary || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) {
    return true;
  }

  const lower = text.toLowerCase();
  const startsLikePrompt = /^(got it|noted|sure|okay|ok|thanks|thank you|hello|hi)\b/i.test(text);
  const hasQuestionMark = text.includes("?");
  const hasPromptCue =
    /(\bwhat\b|\bwhen\b|\bwhich\b|\bhow\b|\bcan you\b|\bcould you\b|\bwould you\b|\bdo you\b|\bplease share\b|\btell me\b|\bloan amount\b|\bplan to apply\b)/.test(
      lower
    );

  return startsLikePrompt || (hasQuestionMark && hasPromptCue);
}

function buildTemplateFallbackSummary({ customerName, intentValue, loanType, loanAmount, timeline }) {
  const intentText = humanizeTemplateToken(intentValue) || "unknown";
  const signals = [
    loanType !== "N/A" ? `loan type ${humanizeTemplateToken(loanType)}` : null,
    loanAmount !== "N/A" ? `amount ${loanAmount}` : null,
    timeline !== "N/A" ? `timeline ${humanizeTemplateToken(timeline)}` : null,
  ].filter(Boolean);

  if (signals.length > 0) {
    return `${customerName} showed ${intentText} intent with ${signals.join(", ")}.`;
  }

  return `${customerName} showed ${intentText} intent and requested advisor follow-up.`;
}

function buildTemplateParameters(callLike, normalizedIntent) {
  const extractedData = resolveExtractedLoanData(callLike);
  const advisorName = normalizeTemplateText(
    callLike?.customer?.assignedTo?.name || callLike?.tenant?.loanAssistantHumanAdvisorName || "Advisor",
    "Advisor",
    120
  );
  const customerName = normalizeTemplateText(buildCustomerName(callLike?.customer), "Unknown Customer", 120);
  const customerPhone = normalizeTemplateText(
    toWhatsAppPhone(callLike?.customer?.phone) || callLike?.customer?.phone || "N/A",
    "N/A",
    32
  );
  const intentValue = normalizeTemplateText(normalizedIntent || "unknown", "unknown", 48);
  const loanType = normalizeTemplateText(
    extractedData?.loanType || extractedData?.loan_type || extractedData?.type || "N/A",
    "N/A",
    120
  );
  const loanAmount = normalizeTemplateText(
    formatLoanAmountForTemplate(extractedData?.amount || extractedData?.loanAmount || extractedData?.loan_amount),
    "N/A",
    64
  );
  const extractedTimeline = normalizeTemplateText(
    extractedData?.timeline || extractedData?.preferredCallbackTime || extractedData?.preferred_callback_time || "N/A",
    "N/A",
    180
  );
  const callbackTime = normalizeTemplateText(
    extractedData?.timeline ||
      extractedData?.preferredCallbackTime ||
      extractedData?.preferred_callback_time ||
      callLike?.nextAction ||
      "N/A",
    "N/A",
    180
  );
  const rawSummary = String(callLike?.summary || "").trim();
  const resolvedSummary = looksLikeAgentPromptSummary(rawSummary)
    ? buildTemplateFallbackSummary({
        customerName,
        intentValue,
        loanType,
        loanAmount,
        timeline: extractedTimeline,
      })
    : rawSummary;
  const summaryText = normalizeTemplateText(resolvedSummary || "No AI summary available.", "No AI summary available.", 700);

  return {
    primary: [advisorName, customerName, customerPhone, intentValue, loanType, loanAmount, callbackTime, summaryText],
    fallback: [advisorName, customerName, customerPhone, intentValue, summaryText],
  };
}

function buildMetaTemplatePayload({ to, templateName, languageCode, parameters }) {
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: normalizeE164Digits(to),
    type: "template",
    template: {
      name: templateName,
      language: { code: languageCode },
      components: [
        {
          type: "body",
          parameters: parameters.map((value) => ({
            type: "text",
            text: normalizeTemplateText(value),
          })),
        },
      ],
    },
  };
}

function parseRawResponse(rawBody) {
  if (!rawBody) {
    return null;
  }

  try {
    return JSON.parse(rawBody);
  } catch {
    return null;
  }
}

function resolveProviderMessageId(data) {
  return data?.messages?.[0]?.id || data?.id || data?.messageId || data?.data?.id || null;
}

async function postWhatsAppPayload({ endpoint, headers, payload }) {
  console.info("[advisor-notifier] POST WhatsApp", {
    url: endpoint,
    payloadType: payload?.type || payload?.template?.name || "unknown",
    to: payload?.to,
  });
  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  const rawBody = await response.text().catch(() => "");
  const data = parseRawResponse(rawBody);

  if (!response.ok) {
    console.error("[advisor-notifier] WhatsApp API error", {
      status: response.status,
      url: endpoint,
      responseBody: rawBody?.slice(0, 500),
    });
  }

  return {
    ok: response.ok,
    status: response.status,
    rawBody,
    data,
  };
}

function formatWhatsAppApiReason(result) {
  return `whatsapp_api_${result.status}${result.rawBody ? `: ${result.rawBody}` : ""}`;
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

  const templateParameters = buildTemplateParameters(callLog, normalizedIntent);

  return {
    subject: `[AI Call] ${customerName} - ${intentLabel}`,
    whatsappBody: truncateText(whatsappLines.join("\n"), MAX_WHATSAPP_BODY_LENGTH),
    whatsappTemplate: templateParameters,
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
      loanAssistantNotificationEmail: true,
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

  // Tenant-configured notification email (from loan settings)
  const tenantEmail = String(
    callLog?.tenant?.loanAssistantNotificationEmail || ""
  ).trim();
  if (tenantEmail) {
    return tenantEmail;
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

async function sendAdvisorWhatsAppNotification({ to, body, template }) {
  const endpoint = String(process.env.WHATSAPP_API_URL || "").trim();
  const token = await getWhatsAppToken();
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

  const metaTextPayload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: normalizeE164Digits(normalizedTo),
    type: "text",
    text: {
      preview_url: false,
      body,
    },
  };

  const genericPayload = {
    to: normalizedTo,
    message: body,
    ...(from ? { from } : {}),
  };

  const primaryTemplatePayload = buildMetaTemplatePayload({
    to: normalizedTo,
    templateName: META_TEMPLATE_NAME,
    languageCode: META_TEMPLATE_LANGUAGE,
    parameters: Array.isArray(template?.primary) ? template.primary : [],
  });

  console.info("[advisor-notifier] primary meta template payload prepared", {
    to: primaryTemplatePayload.to,
    templateName: primaryTemplatePayload?.template?.name || null,
    languageCode: primaryTemplatePayload?.template?.language?.code || null,
    parameterCount: primaryTemplatePayload?.template?.components?.[0]?.parameters?.length || 0,
    parameters: (primaryTemplatePayload?.template?.components?.[0]?.parameters || []).map((param) => param?.text || null),
  });

  const fallbackTemplatePayload = buildMetaTemplatePayload({
    to: normalizedTo,
    templateName: META_TEMPLATE_FALLBACK_NAME,
    languageCode: META_TEMPLATE_LANGUAGE,
    parameters: Array.isArray(template?.fallback) ? template.fallback : [],
  });

  console.info("[advisor-notifier] fallback meta template payload prepared", {
    to: fallbackTemplatePayload.to,
    templateName: fallbackTemplatePayload?.template?.name || null,
    languageCode: fallbackTemplatePayload?.template?.language?.code || null,
    parameterCount: fallbackTemplatePayload?.template?.components?.[0]?.parameters?.length || 0,
    parameters: (fallbackTemplatePayload?.template?.components?.[0]?.parameters || []).map((param) => param?.text || null),
  });

  console.info("[advisor-notifier] WhatsApp API debug", {
    endpoint,
    mode,
    hasToken: Boolean(token),
    tokenPrefix: token ? `${token.slice(0, 8)}...${token.slice(-4)}` : "(none)",
    recipient: normalizedTo,
    from: from || "(not set)",
  });

  try {
    if (mode === "meta") {
      const primaryResult = await postWhatsAppPayload({
        endpoint,
        headers,
        payload: primaryTemplatePayload,
      });

      console.info("[advisor-notifier] primary meta template send attempt", {
        status: primaryResult.status,
        ok: primaryResult.ok,
        templateName: META_TEMPLATE_NAME,
        providerMessageId: resolveProviderMessageId(primaryResult.data),
        error: primaryResult.ok ? null : primaryResult.rawBody || null,
      });

      if (primaryResult.ok) {
        return {
          status: "sent",
          providerMessageId: resolveProviderMessageId(primaryResult.data),
          dispatchType: "template",
          templateName: META_TEMPLATE_NAME,
        };
      }

      const shouldTryFallbackTemplate =
        META_TEMPLATE_FALLBACK_NAME &&
        META_TEMPLATE_FALLBACK_NAME !== META_TEMPLATE_NAME &&
        Array.isArray(template?.fallback) &&
        template.fallback.length > 0;

      if (shouldTryFallbackTemplate) {
        const fallbackResult = await postWhatsAppPayload({
          endpoint,
          headers,
          payload: fallbackTemplatePayload,
        });

        console.info("[advisor-notifier] fallback meta template send attempt", {
          status: fallbackResult.status,
          ok: fallbackResult.ok,
          templateName: META_TEMPLATE_FALLBACK_NAME,
          providerMessageId: resolveProviderMessageId(fallbackResult.data),
          error: fallbackResult.ok ? null : fallbackResult.rawBody || null,
        });

        if (fallbackResult.ok) {
          return {
            status: "sent",
            providerMessageId: resolveProviderMessageId(fallbackResult.data),
            dispatchType: "template_fallback",
            templateName: META_TEMPLATE_FALLBACK_NAME,
          };
        }
      }

      const textFallbackResult = await postWhatsAppPayload({
        endpoint,
        headers,
        payload: metaTextPayload,
      });

      if (textFallbackResult.ok) {
        return {
          status: "sent",
          providerMessageId: resolveProviderMessageId(textFallbackResult.data),
          dispatchType: "text_fallback",
          reason: formatWhatsAppApiReason(primaryResult),
        };
      }

      return {
        status: "failed",
        reason: `${formatWhatsAppApiReason(primaryResult)} | text_fallback_failed: ${formatWhatsAppApiReason(textFallbackResult)}`,
      };
    }

    const genericResult = await postWhatsAppPayload({
      endpoint,
      headers,
      payload: genericPayload,
    });

    if (!genericResult.ok) {
      return {
        status: "failed",
        reason: formatWhatsAppApiReason(genericResult),
      };
    }

    return {
      status: "sent",
      providerMessageId: resolveProviderMessageId(genericResult.data),
      dispatchType: "generic",
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
        metadata: true,
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
            loanAssistantNotificationEmail: true,
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
        template: payload.whatsappTemplate,
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
          dispatchType: whatsapp.dispatchType || null,
          templateName: whatsapp.templateName || null,
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
      whatsappDispatchType: whatsapp.dispatchType || null,
      whatsappTemplateName: whatsapp.templateName || null,
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
      extractedData: isPlainObject(summaryInput?.extractedData) ? summaryInput.extractedData : null,
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
        template: payload.whatsappTemplate,
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
