import crypto from "crypto";
import { prisma } from "@/lib/prisma";

/**
 * Delivers a webhook event to a configured endpoint and records the result.
 * @param {object} webhook - WebhookConfig record (id, tenantId, url, secret)
 * @param {string} event - event name e.g. "call.completed"
 * @param {object} payload - event data
 */
export async function deliverWebhook(webhook, event, payload) {
  const envelope = { event, payload, timestamp: new Date().toISOString() };
  const body = JSON.stringify(envelope);

  const headers = {
    "Content-Type": "application/json",
    "X-CRM-Event": event,
    "User-Agent": "CRM-AI-Webhook/1.0",
  };

  if (webhook.secret) {
    const sig = crypto.createHmac("sha256", webhook.secret).update(body).digest("hex");
    headers["X-CRM-Signature"] = `sha256=${sig}`;
  }

  let statusCode = null;
  let responseText = null;
  let success = false;

  try {
    const res = await fetch(webhook.url, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(10000),
    });
    statusCode = res.status;
    responseText = await res.text().catch(() => null);
    success = res.ok;
  } catch (err) {
    responseText = err?.message || "Network error";
  }

  const log = await prisma.webhookLog.create({
    data: {
      tenantId: webhook.tenantId,
      webhookId: webhook.id,
      event,
      payload: envelope,
      statusCode,
      response: responseText ? responseText.substring(0, 2000) : null,
      success,
    },
  });

  return log;
}
