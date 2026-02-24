import twilio from "twilio";
import { createTelephonyAdapter } from "@/lib/telephony/telephony-contract";
import { escapeXml, normalizePhoneNumber } from "@/lib/telephony/utils";

function mapStatus(providerStatus) {
  const status = String(providerStatus || "").toLowerCase();

  if (["queued", "ringing", "initiated"].includes(status)) return "INITIATED";
  if (["in-progress", "answered"].includes(status)) return "ANSWERED";
  if (["completed"].includes(status)) return "COMPLETED";
  if (["no-answer", "busy", "canceled"].includes(status)) return "NO_ANSWER";
  if (["failed"].includes(status)) return "FAILED";

  return "INITIATED";
}

function resolveCredentials(config) {
  const metadata = config?.metadata || {};

  return {
    accountSid: String(metadata.accountSid || process.env.TWILIO_ACCOUNT_SID || "").trim(),
    authToken: String(metadata.authToken || config?.apiKey || process.env.TWILIO_AUTH_TOKEN || "").trim(),
    fromNumber: String(metadata.fromNumber || process.env.TWILIO_FROM_NUMBER || "").trim(),
  };
}

async function initiateCall({ payload, config }) {
  const { to, script, callbackUrl, statusCallbackUrl } = payload || {};
  const { accountSid, authToken, fromNumber } = resolveCredentials(config);

  if (!accountSid || !authToken || !fromNumber) {
    return {
      providerCallId: `mock-${Date.now()}`,
      status: "INITIATED",
      providerLabel: "twilio-mock",
      metadata: { reason: "Twilio credentials missing. Running in mock mode." },
    };
  }

  const client = twilio(accountSid, authToken);
  const normalizedTo = normalizePhoneNumber(to);
  const normalizedFrom = normalizePhoneNumber(fromNumber);

  if (!normalizedTo.startsWith("+") || !normalizedFrom.startsWith("+")) {
    throw new Error("Twilio requires E.164 phone format. Use +<countrycode><number>.");
  }

  const request = {
    to: normalizedTo,
    from: normalizedFrom,
  };

  if (callbackUrl) {
    request.url = callbackUrl;
    request.method = "POST";
  } else {
    const safeScript = escapeXml(script || "Hello from CRM telephony adapter.");
    request.twiml = `<Response><Say voice=\"Polly.Joanna\">${safeScript}</Say></Response>`;
  }

  if (statusCallbackUrl) {
    request.statusCallback = statusCallbackUrl;
    request.statusCallbackEvent = ["initiated", "ringing", "answered", "completed"];
    request.statusCallbackMethod = "POST";
  }

  const call = await client.calls.create(request);

  return {
    providerCallId: call.sid,
    status: mapStatus(call.status),
    providerLabel: "twilio",
  };
}

async function speechToText() {
  throw new Error("Twilio adapter does not expose direct speech-to-text API in this CRM abstraction.");
}

async function textToSpeech({ payload }) {
  const text = escapeXml(payload?.text || "");
  return {
    ssml: `<Response><Say voice=\"Polly.Joanna\">${text}</Say></Response>`,
  };
}

async function checkConnection({ config }) {
  const { accountSid, authToken } = resolveCredentials(config);

  if (!accountSid || !authToken) {
    throw new Error("Twilio accountSid/authToken missing.");
  }

  const client = twilio(accountSid, authToken);
  await client.api.accounts(accountSid).fetch();

  return {
    ok: true,
    message: "Twilio credentials verified.",
  };
}

export function createTwilioAdapter() {
  return createTelephonyAdapter({
    id: "twilio-telephony-adapter",
    initiateCall,
    speechToText,
    textToSpeech,
    mapStatus,
    checkConnection,
  });
}
