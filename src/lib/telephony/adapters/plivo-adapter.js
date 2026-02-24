import { createTelephonyAdapter } from "@/lib/telephony/telephony-contract";
import { normalizePhoneNumber, parseJsonSafe } from "@/lib/telephony/utils";

function mapStatus(providerStatus) {
  const status = String(providerStatus || "").toLowerCase();

  if (["queued", "ringing", "initiated"].includes(status)) return "INITIATED";
  if (["in-progress", "answered"].includes(status)) return "ANSWERED";
  if (["completed"].includes(status)) return "COMPLETED";
  if (["busy", "no-answer", "cancelled"].includes(status)) return "NO_ANSWER";
  if (["failed"].includes(status)) return "FAILED";

  return "INITIATED";
}

function resolveCredentials(config) {
  const metadata = config?.metadata || {};
  const apiKeyJson = parseJsonSafe(config?.apiKey) || {};

  return {
    authId: String(metadata.authId || apiKeyJson.authId || process.env.PLIVO_AUTH_ID || "").trim(),
    authToken: String(
      metadata.authToken || apiKeyJson.authToken || process.env.PLIVO_AUTH_TOKEN || ""
    ).trim(),
    fromNumber: String(metadata.fromNumber || process.env.PLIVO_FROM_NUMBER || "").trim(),
    apiBase: String(metadata.apiBase || config?.endpoint || "https://api.plivo.com").trim(),
  };
}

function buildBasicAuth(authId, authToken) {
  const token = Buffer.from(`${authId}:${authToken}`).toString("base64");
  return `Basic ${token}`;
}

async function initiateCall({ payload, config }) {
  const { to, callbackUrl, statusCallbackUrl } = payload || {};
  const credentials = resolveCredentials(config);

  if (!credentials.authId || !credentials.authToken || !credentials.fromNumber) {
    throw new Error("Plivo requires authId, authToken, and fromNumber. Configure provider metadata or env vars.");
  }

  const normalizedTo = normalizePhoneNumber(to);
  const normalizedFrom = normalizePhoneNumber(credentials.fromNumber);

  if (!normalizedTo.startsWith("+") || !normalizedFrom.startsWith("+")) {
    throw new Error("Plivo requires E.164 phone format. Use +<countrycode><number>.");
  }

  if (!callbackUrl) {
    throw new Error("Plivo requires callbackUrl (answer_url) for call flow control.");
  }

  const response = await fetch(`${credentials.apiBase}/v1/Account/${credentials.authId}/Call/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: buildBasicAuth(credentials.authId, credentials.authToken),
    },
    body: JSON.stringify({
      from: normalizedFrom,
      to: normalizedTo,
      answer_url: callbackUrl,
      answer_method: "POST",
      hangup_url: statusCallbackUrl || undefined,
      hangup_method: statusCallbackUrl ? "POST" : undefined,
      callback_url: statusCallbackUrl || undefined,
      callback_method: statusCallbackUrl ? "POST" : undefined,
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || data?.message || "Plivo call initiation failed.");
  }

  return {
    providerCallId: String(data?.request_uuid || data?.message_uuid || "").trim(),
    status: "INITIATED",
    providerLabel: "plivo",
    metadata: { response: data },
  };
}

async function speechToText() {
  throw new Error("Plivo adapter does not expose direct speech-to-text API in this CRM abstraction.");
}

async function textToSpeech({ payload }) {
  return {
    xml: `<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response><Speak>${String(
      payload?.text || ""
    )}</Speak></Response>`,
  };
}

async function checkConnection({ config }) {
  const credentials = resolveCredentials(config);

  if (!credentials.authId || !credentials.authToken) {
    throw new Error("Plivo authId/authToken missing.");
  }

  const response = await fetch(`${credentials.apiBase}/v1/Account/${credentials.authId}/`, {
    method: "GET",
    headers: {
      Authorization: buildBasicAuth(credentials.authId, credentials.authToken),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Plivo auth check failed (${response.status}): ${text}`);
  }

  return {
    ok: true,
    message: "Plivo credentials verified.",
  };
}

export function createPlivoAdapter() {
  return createTelephonyAdapter({
    id: "plivo-telephony-adapter",
    initiateCall,
    speechToText,
    textToSpeech,
    mapStatus,
    checkConnection,
  });
}
