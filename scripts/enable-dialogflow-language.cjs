#!/usr/bin/env node

/**
 * Enable a supported language on a Dialogflow ES agent.
 *
 * Usage:
 *   node scripts/enable-dialogflow-language.cjs hi
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

async function getAgent(projectId, accessToken) {
  const endpoint = `https://dialogflow.googleapis.com/v2/projects/${projectId}/agent`;
  const response = await fetch(endpoint, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(`Failed to get agent: ${JSON.stringify(data)}`);
  }

  return data;
}

async function setAgent(agent, accessToken) {
  const endpoint = `https://dialogflow.googleapis.com/v2/projects/${agent.parent.replace("projects/", "")}/agent`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(agent),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(`Failed to set agent: ${JSON.stringify(data)}`);
  }

  return data;
}

async function main() {
  const languageCode = String(process.argv[2] || "hi").trim();
  if (!languageCode) {
    throw new Error("Pass language code, e.g. hi");
  }

  const sa = getServiceAccount();
  const projectId = String(process.env.DIALOGFLOW_PROJECT_ID || sa.project_id || "").trim();
  if (!projectId) {
    throw new Error("Missing DIALOGFLOW_PROJECT_ID.");
  }

  const accessToken = await getAccessToken(sa);
  const agent = await getAgent(projectId, accessToken);

  const supported = new Set(agent.supportedLanguageCodes || []);
  if (languageCode === agent.defaultLanguageCode || supported.has(languageCode)) {
    console.log(`Language '${languageCode}' is already enabled.`);
    console.log(`Default language: ${agent.defaultLanguageCode}`);
    console.log(`Supported: ${(agent.supportedLanguageCodes || []).join(", ") || "(none)"}`);
    return;
  }

  supported.add(languageCode);

  const updated = await setAgent(
    {
      parent: agent.parent,
      displayName: agent.displayName,
      defaultLanguageCode: agent.defaultLanguageCode,
      timeZone: agent.timeZone,
      supportedLanguageCodes: Array.from(supported),
      enableLogging: Boolean(agent.enableLogging),
      matchMode: agent.matchMode || "MATCH_MODE_HYBRID",
      classificationThreshold:
        typeof agent.classificationThreshold === "number" ? agent.classificationThreshold : 0.3,
      apiVersion: agent.apiVersion || "API_VERSION_V2",
    },
    accessToken
  );

  console.log(`Enabled language '${languageCode}'.`);
  console.log(`Default language: ${updated.defaultLanguageCode}`);
  console.log(`Supported: ${(updated.supportedLanguageCodes || []).join(", ") || "(none)"}`);
}

main().catch((error) => {
  console.error("ERROR:", error.message);
  process.exit(1);
});
