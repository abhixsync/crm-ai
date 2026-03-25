import { createTelephonyAdapter } from "@/lib/telephony/telephony-contract";
import { normalizePhoneNumber, parseJsonSafe } from "@/lib/telephony/utils";

function mapStatus(providerStatus) {
  const status = String(providerStatus || "").toLowerCase();

  if (["queued", "ringing", "initiated", "in-progress"].includes(status)) return "INITIATED";
  if (["answered"].includes(status)) return "ANSWERED";
  if (["completed"].includes(status)) return "COMPLETED";
  if (["busy", "no-answer", "canceled", "cancelled"].includes(status)) return "NO_ANSWER";
  if (["failed"].includes(status)) return "FAILED";

  return "INITIATED";
}

function resolveCredentials(config) {
  const metadata = config?.metadata || {};
  const apiKeyJson = parseJsonSafe(config?.apiKey) || {};

  return {
    sid: String(metadata.sid || apiKeyJson.sid || process.env.EXOTEL_SID || "").trim(),
    apiKey: String(metadata.apiKey || apiKeyJson.apiKey || process.env.EXOTEL_API_KEY || "").trim(),
    apiToken: String(metadata.apiToken || apiKeyJson.apiToken || process.env.EXOTEL_API_TOKEN || "").trim(),
    callerId: String(metadata.callerId || apiKeyJson.callerId || process.env.EXOTEL_CALLER_ID || "").trim(),
    subdomain: String(metadata.subdomain || apiKeyJson.subdomain || process.env.EXOTEL_SUBDOMAIN || "api").trim(),
  };
}

function buildBasicAuth(apiKey, apiToken) {
  const token = Buffer.from(`${apiKey}:${apiToken}`).toString("base64");
  return `Basic ${token}`;
}

async function initiateCall({ payload, config }) {
  const { to, callbackUrl, statusCallbackUrl } = payload || {};
  const creds = resolveCredentials(config);

  if (!creds.sid || !creds.apiKey || !creds.apiToken || !creds.callerId) {
    throw new Error("Exotel requires sid, apiKey, apiToken, and callerId. Configure provider metadata or env vars.");
  }

  const normalizedTo = normalizePhoneNumber(to);

  if (!callbackUrl) {
    throw new Error("Exotel requires callbackUrl (Url) for call flow control.");
  }

  const baseUrl = `https://${creds.subdomain}.exotel.com/v1/Accounts/${creds.sid}/Calls/connect.json`;

  // Exotel uses form-encoded POST
  const formBody = new URLSearchParams({
    From: normalizedTo.replace("+", ""),
    To: normalizedTo.replace("+", ""),
    CallerId: creds.callerId,
    Url: callbackUrl,
    ...(statusCallbackUrl ? { StatusCallback: statusCallbackUrl, StatusCallbackEvents: "terminal" } : {}),
  });

  // Exotel: 'From' = customer number, 'To' = agent number or flow URL
  // For outbound: From = callerId, To = customer
  formBody.set("From", creds.callerId);
  formBody.set("To", normalizedTo.replace("+", ""));

  const response = await fetch(baseUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: buildBasicAuth(creds.apiKey, creds.apiToken),
    },
    body: formBody.toString(),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.RestException?.Message || data?.error || "Exotel call initiation failed.");
  }

  const callSid = data?.Call?.Sid || "";

  return {
    providerCallId: String(callSid).trim(),
    status: "INITIATED",
    providerLabel: "exotel",
    metadata: { response: data },
  };
}

async function speechToText() {
  throw new Error("Exotel adapter does not expose direct speech-to-text API in this CRM abstraction.");
}

async function textToSpeech({ payload }) {
  // Exotel uses a TwiML-like format
  return {
    xml: `<?xml version="1.0" encoding="UTF-8"?><Response><Say>${String(
      payload?.text || ""
    )}</Say></Response>`,
  };
}

async function checkConnection({ config }) {
  const creds = resolveCredentials(config);

  if (!creds.sid || !creds.apiKey || !creds.apiToken) {
    throw new Error("Exotel sid/apiKey/apiToken missing.");
  }

  const response = await fetch(
    `https://${creds.subdomain}.exotel.com/v1/Accounts/${creds.sid}.json`,
    {
      method: "GET",
      headers: {
        Authorization: buildBasicAuth(creds.apiKey, creds.apiToken),
      },
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Exotel auth check failed (${response.status}): ${text}`);
  }

  return {
    ok: true,
    message: "Exotel credentials verified.",
  };
}

export function createExotelAdapter() {
  return createTelephonyAdapter({
    id: "exotel-telephony-adapter",
    initiateCall,
    speechToText,
    textToSpeech,
    mapStatus,
    checkConnection,
  });
}
