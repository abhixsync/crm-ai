import { createHmac } from "node:crypto";

/**
 * Signs a callLogId with NEXTAUTH_SECRET so webhook URLs carry a verifiable
 * token. All telephony providers (Twilio, Vonage, Plivo, Exotel) simply call
 * the URL we supply — appending a _sig param works for all of them.
 */
function sign(callLogId) {
  const secret = process.env.NEXTAUTH_SECRET || "";
  if (!secret) return "";
  return createHmac("sha256", secret)
    .update(`webhook:${callLogId}`)
    .digest("hex")
    .slice(0, 16);
}

/** Append ?_sig=<token> (or &_sig=<token>) to a webhook URL. */
export function signWebhookUrl(url, callLogId) {
  const token = sign(callLogId);
  if (!token) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}_sig=${token}`;
}

/**
 * Verify the _sig param on an incoming webhook request.
 * Returns true if:
 *  - NEXTAUTH_SECRET is not configured (permissive fallback), OR
 *  - the signature matches
 * Returns false (reject) if secret is configured but sig is missing/wrong.
 */
export function verifyWebhookSig(urlOrSearchParams, callLogId) {
  if (!process.env.NEXTAUTH_SECRET) return true;
  if (!callLogId) return false;
  const params =
    urlOrSearchParams instanceof URLSearchParams
      ? urlOrSearchParams
      : new URL(urlOrSearchParams).searchParams;
  const provided = params.get("_sig") || "";
  const expected = sign(callLogId);
  return provided === expected;
}
