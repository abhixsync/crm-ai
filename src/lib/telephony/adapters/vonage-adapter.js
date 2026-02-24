import crypto from "crypto";
import fs from "fs";
import path from "path";
import { createTelephonyAdapter } from "@/lib/telephony/telephony-contract";
import { normalizeE164Digits, parseJsonSafe } from "@/lib/telephony/utils";

function mapStatus(providerStatus) {
  const status = String(providerStatus || "").toLowerCase();

  if (["started", "ringing", "initiated"].includes(status)) return "INITIATED";
  if (["answered", "in-progress"].includes(status)) return "ANSWERED";
  if (["completed"].includes(status)) return "COMPLETED";
  if (["timeout", "busy", "unanswered", "rejected"].includes(status)) return "NO_ANSWER";
  if (["failed"].includes(status)) return "FAILED";

  return "INITIATED";
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text) return text;
  }
  return "";
}

function resolveCredentials(config) {
  const metadata = config?.metadata || {};
  const jsonFromApiKey = parseJsonSafe(config?.apiKey) || {};
  const privateKey = firstNonEmpty(
    metadata.privateKey,
    metadata.private_key,
    metadata.key,
    jsonFromApiKey.privateKey,
    jsonFromApiKey.private_key,
    jsonFromApiKey.key,
    process.env.VONAGE_PRIVATE_KEY
  );

  return {
    applicationId: firstNonEmpty(
      metadata.applicationId,
      metadata.application_id,
      metadata.appId,
      jsonFromApiKey.applicationId,
      jsonFromApiKey.application_id,
      jsonFromApiKey.appId,
      process.env.VONAGE_APPLICATION_ID
    ),
    privateKey,
    fromNumber: firstNonEmpty(
      metadata.fromNumber,
      metadata.from,
      metadata.from_number,
      metadata.callerId,
      jsonFromApiKey.fromNumber,
      jsonFromApiKey.from,
      jsonFromApiKey.from_number,
      jsonFromApiKey.callerId,
      process.env.VONAGE_FROM_NUMBER
    ),
    apiBase: firstNonEmpty(
      metadata.apiBase,
      metadata.baseUrl,
      jsonFromApiKey.apiBase,
      jsonFromApiKey.baseUrl,
      config?.endpoint,
      "https://api.nexmo.com"
    ),
  };
}

function normalizePrivateKey(rawPrivateKey) {
  const raw = String(rawPrivateKey || "").trim();
  if (!raw) return "";

  if (raw.includes("-----BEGIN") && raw.includes("\\n")) {
    return raw.replace(/\\n/g, "\n");
  }

  if (raw.includes("-----BEGIN")) {
    return raw;
  }

  const probablyPath =
    raw.endsWith(".key") || raw.endsWith(".pem") || raw.startsWith("./") || raw.startsWith("../");

  if (probablyPath) {
    const keyPath = path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
    if (fs.existsSync(keyPath)) {
      return fs.readFileSync(keyPath, "utf8").trim();
    }
  }

  try {
    const decoded = Buffer.from(raw, "base64").toString("utf8").trim();
    if (decoded.includes("-----BEGIN")) {
      return decoded;
    }
  } catch {
    // noop
  }

  return raw;
}

function createVonageJwt({ applicationId, privateKey }) {
  const now = Math.floor(Date.now() / 1000);
  const header = {
    alg: "RS256",
    typ: "JWT",
  };
  const payload = {
    application_id: applicationId,
    iat: now,
    exp: now + 300,
    jti: crypto.randomUUID(),
  };

  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned = `${encode(header)}.${encode(payload)}`;

  const signer = crypto.createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();

  const normalizedPrivateKey = normalizePrivateKey(privateKey);

  try {
    const signature = signer.sign(normalizedPrivateKey, "base64url");
    return `${unsigned}.${signature}`;
  } catch {
    throw new Error(
      "Vonage private key format is invalid. Set VONAGE_PRIVATE_KEY as PEM text, escaped PEM (\\n), base64 PEM, or a readable .key/.pem file path."
    );
  }
}

async function initiateCall({ payload, config }) {
  const {
    to,
    script,
    callbackUrl,
    statusCallbackUrl,
    vonageAnswerUrl,
    vonageEventUrl,
    vonageFallbackUrl,
  } = payload || {};
  const credentials = resolveCredentials(config);

  if (!credentials.applicationId || !credentials.privateKey || !credentials.fromNumber) {
    const missing = [
      !credentials.applicationId ? "applicationId" : null,
      !credentials.privateKey ? "privateKey" : null,
      !credentials.fromNumber ? "fromNumber" : null,
    ]
      .filter(Boolean)
      .join(", ");

    throw new Error(
      `Vonage is missing required config: ${missing}. Configure provider metadata or env vars.`
    );
  }

  const toNumber = normalizeE164Digits(to);
  const fromNumber = normalizeE164Digits(credentials.fromNumber);

  if (!toNumber || !fromNumber) {
    throw new Error("Vonage requires valid E.164 source and destination numbers.");
  }

  const token = createVonageJwt(credentials);
  const answerUrl = vonageAnswerUrl || callbackUrl;
  const eventUrl = vonageEventUrl || statusCallbackUrl;

  const body = {
    to: [{ type: "phone", number: toNumber }],
    from: { type: "phone", number: fromNumber },
    answer_method: "POST",
    answer_url: answerUrl
      ? [answerUrl]
      : [
          `https://example.invalid/ncco?text=${encodeURIComponent(
            script || "Hello from CRM telephony adapter."
          )}`,
        ],
  };

  if (eventUrl) {
    body.event_method = "POST";
    body.event_url = [eventUrl];
  }

  if (vonageFallbackUrl) {
    body.fallback_answer_method = "POST";
    body.fallback_answer_url = [vonageFallbackUrl];
  }

  const response = await fetch(`${credentials.apiBase}/v1/calls`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.title || data?.detail || "Vonage call initiation failed.");
  }

  return {
    providerCallId: String(data?.uuid || "").trim(),
    status: "INITIATED",
    providerLabel: "vonage",
    metadata: { response: data },
  };
}

async function speechToText() {
  throw new Error("Vonage adapter does not expose direct speech-to-text API in this CRM abstraction.");
}

async function textToSpeech({ payload }) {
  return {
    ncco: [
      {
        action: "talk",
        text: String(payload?.text || "").trim(),
      },
    ],
  };
}

async function checkConnection({ config }) {
  const credentials = resolveCredentials(config);

  if (!credentials.applicationId || !credentials.privateKey) {
    throw new Error("Vonage applicationId/privateKey missing.");
  }

  const token = createVonageJwt(credentials);
  const response = await fetch(`${credentials.apiBase}/v2/applications/${credentials.applicationId}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Vonage auth check failed (${response.status}): ${text}`);
  }

  return {
    ok: true,
    message: "Vonage credentials verified.",
  };
}

export function createVonageAdapter() {
  return createTelephonyAdapter({
    id: "vonage-telephony-adapter",
    initiateCall,
    speechToText,
    textToSpeech,
    mapStatus,
    checkConnection,
  });
}
