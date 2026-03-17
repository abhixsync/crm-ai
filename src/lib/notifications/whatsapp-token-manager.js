/**
 * WhatsApp (Meta) access-token manager.
 *
 * Exchanges the seed token for a fresh long-lived token via the Meta Graph API
 * and re-exchanges it on a configurable interval so the app never holds an
 * expired token.
 *
 * Required env vars (only when auto-refresh is desired):
 *   META_APP_ID            – Facebook/Meta App ID
 *   META_APP_SECRET        – Facebook/Meta App Secret
 *   WHATSAPP_API_TOKEN     – seed token (short-lived or long-lived)
 *   WHATSAPP_TOKEN_REFRESH_INTERVAL_HOURS – refresh cadence (default 23)
 */

const META_GRAPH_BASE = "https://graph.facebook.com";
const META_GRAPH_VERSION = "v22.0";

let _currentToken = "";
let _tokenExpiresAt = 0; // epoch ms
let _refreshTimer = null;
let _initialized = false;

function log(message, data) {
  console.log(`[whatsapp-token-manager] ${message}`, data ?? "");
}

function warn(message, data) {
  console.warn(`[whatsapp-token-manager] ${message}`, data ?? "");
}

function getEnv(key) {
  return String(process.env[key] || "").trim();
}

function getRefreshIntervalMs() {
  const hours = Number(getEnv("WHATSAPP_TOKEN_REFRESH_INTERVAL_HOURS"));
  if (Number.isFinite(hours) && hours > 0) {
    return hours * 60 * 60 * 1000;
  }
  return 23 * 60 * 60 * 1000; // default 23 hours
}

function canAutoRefresh() {
  return Boolean(getEnv("META_APP_ID") && getEnv("META_APP_SECRET"));
}

/**
 * Exchange the current token for a new long-lived token using the
 * Meta Graph API token exchange endpoint.
 *
 * @see https://developers.facebook.com/docs/facebook-login/guides/access-tokens/get-long-lived/
 */
async function exchangeToken(currentToken) {
  const appId = getEnv("META_APP_ID");
  const appSecret = getEnv("META_APP_SECRET");

  if (!appId || !appSecret) {
    throw new Error("META_APP_ID and META_APP_SECRET are required for token refresh");
  }

  if (!currentToken) {
    throw new Error("No token available to exchange");
  }

  const url = new URL(`${META_GRAPH_BASE}/${META_GRAPH_VERSION}/oauth/access_token`);
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", appId);
  url.searchParams.set("client_secret", appSecret);
  url.searchParams.set("fb_exchange_token", currentToken);

  const response = await fetch(url.toString(), { method: "GET" });
  const body = await response.text();

  if (!response.ok) {
    throw new Error(`Token exchange failed (${response.status}): ${body}`);
  }

  let data;
  try {
    data = JSON.parse(body);
  } catch {
    throw new Error(`Token exchange returned invalid JSON: ${body}`);
  }

  const newToken = String(data.access_token || "").trim();
  if (!newToken) {
    throw new Error(`Token exchange did not return an access_token: ${body}`);
  }

  // Meta returns expires_in in seconds (typically 5184000 = 60 days for long-lived)
  const expiresInMs = Number(data.expires_in) > 0
    ? Number(data.expires_in) * 1000
    : getRefreshIntervalMs();

  return { token: newToken, expiresInMs };
}

async function refreshToken() {
  try {
    const tokenToExchange = _currentToken || getEnv("WHATSAPP_API_TOKEN");
    if (!tokenToExchange) {
      warn("No seed token available — skipping refresh");
      return false;
    }

    log("Exchanging token…");
    const { token, expiresInMs } = await exchangeToken(tokenToExchange);

    _currentToken = token;
    _tokenExpiresAt = Date.now() + expiresInMs;

    log("Token refreshed successfully", {
      expiresInHours: Math.round(expiresInMs / 3600000),
      nextRefreshInHours: Math.round(getRefreshIntervalMs() / 3600000),
    });

    return true;
  } catch (error) {
    warn("Token refresh failed — will use existing token", { error: error.message });
    return false;
  }
}

function scheduleNextRefresh() {
  if (_refreshTimer) {
    clearInterval(_refreshTimer);
  }

  const intervalMs = getRefreshIntervalMs();
  _refreshTimer = setInterval(async () => {
    await refreshToken();
  }, intervalMs);

  // Unref so this timer doesn't prevent Node from exiting
  if (_refreshTimer?.unref) {
    _refreshTimer.unref();
  }

  log("Scheduled auto-refresh", {
    intervalHours: Math.round(intervalMs / 3600000),
  });
}

/**
 * Initialise the token manager: performs an immediate exchange (if credentials
 * are present) and schedules periodic refreshes.
 *
 * Safe to call multiple times — only the first call takes effect.
 */
export async function initWhatsAppTokenManager() {
  if (_initialized) return;
  _initialized = true;

  // Seed from env
  _currentToken = getEnv("WHATSAPP_API_TOKEN");

  if (!canAutoRefresh()) {
    log("Auto-refresh disabled (META_APP_ID / META_APP_SECRET not set) — using static token");
    return;
  }

  // Perform an immediate exchange so we start with a fresh token
  await refreshToken();
  scheduleNextRefresh();
}

/**
 * Return the current valid WhatsApp API token.
 *
 * • If auto-refresh is configured and the token is expired (or about to expire
 *   within 5 minutes), an on-demand refresh is attempted.
 * • Otherwise falls back to the static env token.
 */
export async function getWhatsAppToken() {
  if (!_initialized) {
    await initWhatsAppTokenManager();
  }

  // If auto-refresh is not available, return whatever we have
  if (!canAutoRefresh()) {
    return _currentToken || getEnv("WHATSAPP_API_TOKEN");
  }

  // Proactive refresh: if the token expires within 5 minutes, refresh now
  const BUFFER_MS = 5 * 60 * 1000;
  if (_tokenExpiresAt > 0 && Date.now() + BUFFER_MS >= _tokenExpiresAt) {
    log("Token expiring soon — refreshing proactively");
    await refreshToken();
  }

  return _currentToken || getEnv("WHATSAPP_API_TOKEN");
}

/**
 * Teardown — stop the refresh timer (useful in tests or graceful shutdown).
 */
export function stopWhatsAppTokenRefresh() {
  if (_refreshTimer) {
    clearInterval(_refreshTimer);
    _refreshTimer = null;
  }
  _initialized = false;
  _currentToken = "";
  _tokenExpiresAt = 0;
}
