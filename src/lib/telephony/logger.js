function safeJson(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify({ message: "unserializable-log-payload" });
  }
}

function redact(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.length <= 8) return "***";
  return `${raw.slice(0, 4)}***${raw.slice(-2)}`;
}

export function redactedPhone(phone) {
  const raw = String(phone || "").trim();
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  if (!digits) return redact(raw);
  return `***${digits.slice(-4)}`;
}

export function redactProviderSecrets(providerConfig) {
  const metadata = providerConfig?.metadata || {};

  return {
    ...providerConfig,
    apiKey: providerConfig?.apiKey ? redact(providerConfig.apiKey) : providerConfig?.apiKey,
    metadata: {
      ...metadata,
      authToken: metadata.authToken ? redact(metadata.authToken) : metadata.authToken,
      privateKey: metadata.privateKey ? "***" : metadata.privateKey,
      apiSecret: metadata.apiSecret ? redact(metadata.apiSecret) : metadata.apiSecret,
    },
  };
}

export function logTelephony(level, event, payload = {}) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    event,
    ...payload,
  };

  const message = `[telephony] ${safeJson(entry)}`;

  if (level === "error") {
    console.error(message);
    return;
  }

  if (level === "warn") {
    console.warn(message);
    return;
  }

  console.info(message);
}
