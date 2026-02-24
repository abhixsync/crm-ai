export function escapeXml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function normalizePhoneNumber(input) {
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

export function normalizeE164Digits(input) {
  return normalizePhoneNumber(input).replace(/^\+/, "");
}

export function parseJsonSafe(value) {
  if (!value) return null;
  if (typeof value === "object") return value;

  const raw = String(value).trim();
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
