#!/usr/bin/env node

/**
 * Quick Dialogflow detectIntent probe for debugging phrase matching.
 *
 * Usage:
 *   node scripts/check-dialogflow-detect-intent.cjs
 *   node scripts/check-dialogflow-detect-intent.cjs "I need a personal loan" "call me later"
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/cloud-platform";

function parseJsonSafe(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function normalizePrivateKey(raw) {
  return String(raw || "").replace(/\\n/g, "\n").trim();
}

function getServiceAccount() {
  const envJson = parseJsonSafe(process.env.DIALOGFLOW_SERVICE_ACCOUNT_JSON || "");
  if (envJson && envJson.client_email && envJson.private_key) {
    return envJson;
  }

  if (process.env.DIALOGFLOW_SERVICE_ACCOUNT_BASE64) {
    const decoded = Buffer.from(process.env.DIALOGFLOW_SERVICE_ACCOUNT_BASE64, "base64").toString("utf8");
    const parsed = parseJsonSafe(decoded);
    if (parsed && parsed.client_email && parsed.private_key) {
      return parsed;
    }
  }

  if (process.env.DIALOGFLOW_CLIENT_EMAIL && process.env.DIALOGFLOW_PRIVATE_KEY) {
    return {
      client_email: String(process.env.DIALOGFLOW_CLIENT_EMAIL).trim(),
      private_key: normalizePrivateKey(process.env.DIALOGFLOW_PRIVATE_KEY),
      project_id: String(process.env.DIALOGFLOW_PROJECT_ID || "").trim() || undefined,
    };
  }

  const credsDir = path.resolve(process.cwd(), "creds");
  if (fs.existsSync(credsDir)) {
    const file = fs
      .readdirSync(credsDir)
      .find((name) => name.toLowerCase().endsWith(".json"));
    if (file) {
      const parsed = parseJsonSafe(fs.readFileSync(path.join(credsDir, file), "utf8"));
      if (parsed && parsed.client_email && parsed.private_key) {
        return parsed;
      }
    }
  }

  throw new Error("Dialogflow service account not found.");
}

function buildJwt(sa) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      iss: sa.client_email,
      scope: SCOPE,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
    })
  ).toString("base64url");

  const unsigned = `${header}.${payload}`;
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();

  return `${unsigned}.${signer.sign(sa.private_key, "base64url")}`;
}

async function getAccessToken(sa) {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: buildJwt(sa),
    }).toString(),
  });

  const data = await response.json();
  if (!response.ok || !data.access_token) {
    throw new Error(`Token fetch failed: ${JSON.stringify(data)}`);
  }

  return data.access_token;
}

async function detectIntent({ projectId, accessToken, languageCode, phrase }) {
  const sessionId = `probe-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const endpoint = `https://dialogflow.googleapis.com/v2/projects/${projectId}/agent/sessions/${encodeURIComponent(
    sessionId
  )}:detectIntent`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      queryInput: {
        text: {
          text: phrase,
          languageCode,
        },
      },
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(`detectIntent failed: ${JSON.stringify(data)}`);
  }

  const queryResult = data.queryResult || {};
  const intent = queryResult.intent || {};

  return {
    phrase,
    intentName: intent.displayName || "UNKNOWN",
    isFallback: intent.isFallback === true,
    fulfillmentText: String(queryResult.fulfillmentText || "").trim(),
  };
}

async function main() {
  const phrases = process.argv.slice(2);
  const probePhrases =
    phrases.length > 0
      ? phrases
      : [
          "I need a personal loan this week",
          "call me later",
          "not interested",
          "mujhe personal loan chahiye",
        ];

  const sa = getServiceAccount();
  const projectId = String(process.env.DIALOGFLOW_PROJECT_ID || sa.project_id || "").trim();
  const languageCode = String(process.env.DIALOGFLOW_LANGUAGE_CODE || "en").trim() || "en";

  if (!projectId) {
    throw new Error("Missing project ID. Set DIALOGFLOW_PROJECT_ID.");
  }

  const accessToken = await getAccessToken(sa);

  console.log(`Project: ${projectId}`);
  console.log(`Language: ${languageCode}`);

  for (const phrase of probePhrases) {
    const result = await detectIntent({
      projectId,
      accessToken,
      languageCode,
      phrase,
    });

    console.log("\nPhrase:", result.phrase);
    console.log("Intent:", result.intentName);
    console.log("Fallback:", result.isFallback);
    console.log("Reply:", result.fulfillmentText);
  }
}

main().catch((error) => {
  console.error("ERROR:", error.message);
  process.exit(1);
});
