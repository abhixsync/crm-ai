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

  const creds = {
    sid:       String(process.env.EXOTEL_SID        || metadata.sid       || apiKeyJson.sid       || "").trim(),
    apiKey:    String(process.env.EXOTEL_API_KEY    || metadata.apiKey    || apiKeyJson.apiKey    || "").trim(),
    apiToken:  String(process.env.EXOTEL_API_TOKEN  || metadata.apiToken  || apiKeyJson.apiToken  || "").trim(),
    callerId:  String(process.env.EXOTEL_CALLER_ID  || metadata.callerId  || metadata.fromNumber  || apiKeyJson.callerId || "").trim(),
    subdomain: String(process.env.EXOTEL_SUBDOMAIN  || metadata.subdomain || apiKeyJson.subdomain || "api").trim(),
  };
  console.log("[exotel] resolveCredentials →", {
    hasSid: !!creds.sid,
    hasApiKey: !!creds.apiKey,
    hasApiToken: !!creds.apiToken,
    hasCallerId: !!creds.callerId,
    subdomain: creds.subdomain,
    source: metadata.sid ? "metadata" : apiKeyJson.sid ? "apiKeyJson" : process.env.EXOTEL_SID ? "env" : "MISSING",
  });
  return creds;
}

function buildBasicAuth(apiKey, apiToken) {
  const token = Buffer.from(`${apiKey}:${apiToken}`).toString("base64");
  return `Basic ${token}`;
}

async function initiateCall({ payload, config }) {
  const { to, exotelAnswerUrl, exotelStatusUrl, callbackUrl, statusCallbackUrl } = payload || {};
  // Prefer Exotel-specific URLs; fall back to generic ones
  const answerUrl = exotelAnswerUrl || callbackUrl;
  const statusUrl = exotelStatusUrl || statusCallbackUrl;
  const creds = resolveCredentials(config);

  if (!creds.sid || !creds.apiKey || !creds.apiToken || !creds.callerId) {
    throw new Error("Exotel requires sid, apiKey, apiToken, and callerId. Configure provider metadata or env vars.");
  }

  const normalizedTo = normalizePhoneNumber(to);

  if (!answerUrl) {
    throw new Error("Exotel requires an answer URL for call flow control.");
  }

  const baseUrl = `https://${creds.subdomain}.exotel.com/v1/Accounts/${creds.sid}/Calls/connect.json`;

  // Exotel uses form-encoded POST
  // For outbound: From = callerId (ExoPhone), To = customer number
  const formBody = new URLSearchParams({
    From: creds.callerId,
    To: String(normalizedTo).replace("+", ""),
    CallerId: creds.callerId,
    Url: answerUrl,
    ...(statusUrl ? { StatusCallback: statusUrl, StatusCallbackEvents: "terminal" } : {}),
  });

  console.log("[exotel/initiateCall] URL:", baseUrl);
  console.log("[exotel/initiateCall] FormBody (no creds):", {
    From: creds.callerId,
    To: String(normalizedTo).replace("+", ""),
    CallerId: creds.callerId,
    hasUrl: !!answerUrl,
    hasStatusUrl: !!statusUrl,
  });

  let response;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    response = await fetch(baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: buildBasicAuth(creds.apiKey, creds.apiToken),
      },
      body: formBody.toString(),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));
  } catch (fetchErr) {
    const causeMsg = fetchErr?.cause?.message || fetchErr?.cause?.code || String(fetchErr?.cause || "");
    const detail = fetchErr?.name === "AbortError" ? "timed out after 12s" : (causeMsg || fetchErr?.message);
    console.error("[exotel/initiateCall] fetch() threw:", fetchErr?.message, "| cause:", causeMsg || "(none)");
    throw new Error(`Exotel API unreachable: ${detail}. Check EXOTEL_* env vars and Exotel IP whitelist settings.`);
  }

  console.log("[exotel/initiateCall] HTTP status:", response.status, response.statusText);
  const data = await response.json().catch(() => ({}));
  console.log("[exotel/initiateCall] Response body:", JSON.stringify(data).substring(0, 300));
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
