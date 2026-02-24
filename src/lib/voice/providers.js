import twilio from "twilio";

function escapeXml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function normalizePhoneNumber(input) {
  const value = String(input || "").trim();
  if (!value) return "";

  if (value.startsWith("+")) {
    return `+${value.slice(1).replace(/\D/g, "")}`;
  }

  const digits = value.replace(/\D/g, "");
  if (digits.length === 10) {
    const defaultCountryCode = process.env.DEFAULT_COUNTRY_CODE || "+91";
    return `${defaultCountryCode}${digits}`;
  }

  if (digits.length > 10) {
    return `+${digits}`;
  }

  return value;
}

function mapCallStatus(providerStatus) {
  const status = (providerStatus || "").toLowerCase();

  if (["queued", "ringing"].includes(status)) return "INITIATED";
  if (status === "in-progress") return "ANSWERED";
  if (["completed"].includes(status)) return "COMPLETED";
  if (["no-answer", "busy", "canceled"].includes(status)) return "NO_ANSWER";
  if (["failed"].includes(status)) return "FAILED";

  return "INITIATED";
}

export async function createOutboundCall({ to, script, callbackUrl, statusCallbackUrl }) {
  const {
    TWILIO_ACCOUNT_SID: accountSid,
    TWILIO_AUTH_TOKEN: authToken,
    TWILIO_FROM_NUMBER: from,
  } = process.env;

  if (!accountSid || !authToken || !from) {
    return {
      sid: `mock-${Date.now()}`,
      status: "INITIATED",
      provider: "mock",
      script,
    };
  }

  const client = twilio(accountSid, authToken);
  const normalizedTo = normalizePhoneNumber(to);
  const normalizedFrom = normalizePhoneNumber(from);

  if (!normalizedTo.startsWith("+") || !normalizedFrom.startsWith("+")) {
    throw new Error("Twilio requires E.164 phone format. Use +<countrycode><number>.");
  }

  const payload = {
    to: normalizedTo,
    from: normalizedFrom,
  };

  if (callbackUrl) {
    payload.url = callbackUrl;
    payload.method = "POST";
  } else {
    const safeScript = escapeXml(script);
    payload.twiml = `<Response><Say voice=\"Polly.Joanna\">${safeScript}</Say></Response>`;
  }

  if (statusCallbackUrl) {
    payload.statusCallback = statusCallbackUrl;
    payload.statusCallbackEvent = ["initiated", "ringing", "answered", "completed"];
    payload.statusCallbackMethod = "POST";
  }

  const call = await client.calls.create(payload);

  return {
    sid: call.sid,
    status: mapCallStatus(call.status),
    provider: "twilio",
  };
}

export function mapProviderStatus(status) {
  return mapCallStatus(status);
}