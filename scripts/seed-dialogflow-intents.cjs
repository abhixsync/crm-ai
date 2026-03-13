#!/usr/bin/env node

/**
 * Seed/update Dialogflow ES intents from a local JSON pack.
 *
 * Usage:
 *   node scripts/seed-dialogflow-intents.cjs
 *   node scripts/seed-dialogflow-intents.cjs --pack docs/dialogflow-intent-training-pack.json --replace true
 *   node scripts/seed-dialogflow-intents.cjs --pack docs/dialogflow-intent-training-pack-hi.json --language hi --replace true
 *
 * Env priority for credentials:
 * 1) DIALOGFLOW_SERVICE_ACCOUNT_JSON
 * 2) DIALOGFLOW_SERVICE_ACCOUNT_BASE64
 * 3) DIALOGFLOW_CLIENT_EMAIL + DIALOGFLOW_PRIVATE_KEY (+ optional DIALOGFLOW_PROJECT_ID)
 * 4) First JSON file in ./creds/
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/cloud-platform";

function parseArgs(argv) {
  const args = {
    pack: "docs/dialogflow-intent-training-pack.json",
    languageCode: process.env.DIALOGFLOW_LANGUAGE_CODE || null,
    projectId: process.env.DIALOGFLOW_PROJECT_ID || null,
    replace: true,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const next = argv[i + 1];

    if (key === "--pack" && next) {
      args.pack = next;
      i += 1;
      continue;
    }

    if ((key === "--language" || key === "--languageCode") && next) {
      args.languageCode = next;
      i += 1;
      continue;
    }

    if (key === "--project" && next) {
      args.projectId = next;
      i += 1;
      continue;
    }

    if (key === "--replace" && next) {
      args.replace = String(next).toLowerCase() !== "false";
      i += 1;
      continue;
    }
  }

  return args;
}

function parseJsonSafe(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function normalizePrivateKey(raw) {
  return String(raw || "").replace(/\\n/g, "\n").trim();
}

function tryLoadServiceAccountFromEnv() {
  if (process.env.DIALOGFLOW_SERVICE_ACCOUNT_JSON) {
    const parsed = parseJsonSafe(process.env.DIALOGFLOW_SERVICE_ACCOUNT_JSON);
    if (parsed && parsed.client_email && parsed.private_key) {
      return parsed;
    }
  }

  if (process.env.DIALOGFLOW_SERVICE_ACCOUNT_BASE64) {
    try {
      const decoded = Buffer.from(process.env.DIALOGFLOW_SERVICE_ACCOUNT_BASE64, "base64").toString("utf8");
      const parsed = parseJsonSafe(decoded);
      if (parsed && parsed.client_email && parsed.private_key) {
        return parsed;
      }
    } catch {
      // no-op
    }
  }

  if (process.env.DIALOGFLOW_CLIENT_EMAIL && process.env.DIALOGFLOW_PRIVATE_KEY) {
    return {
      client_email: String(process.env.DIALOGFLOW_CLIENT_EMAIL).trim(),
      private_key: normalizePrivateKey(process.env.DIALOGFLOW_PRIVATE_KEY),
      project_id: String(process.env.DIALOGFLOW_PROJECT_ID || "").trim() || undefined,
    };
  }

  return null;
}

function tryLoadServiceAccountFromCredsDir() {
  const credsDir = path.resolve(process.cwd(), "creds");
  if (!fs.existsSync(credsDir)) return null;

  const jsonFiles = fs
    .readdirSync(credsDir)
    .filter((name) => name.toLowerCase().endsWith(".json"))
    .sort();

  for (const fileName of jsonFiles) {
    const filePath = path.join(credsDir, fileName);
    const parsed = parseJsonSafe(fs.readFileSync(filePath, "utf8"));
    if (parsed && parsed.client_email && parsed.private_key) {
      return parsed;
    }
  }

  return null;
}

function loadServiceAccount() {
  const fromEnv = tryLoadServiceAccountFromEnv();
  if (fromEnv) return fromEnv;

  const fromCredsDir = tryLoadServiceAccountFromCredsDir();
  if (fromCredsDir) return fromCredsDir;

  throw new Error(
    "Dialogflow credentials not found. Set env vars or place a service-account JSON file in ./creds/."
  );
}

function buildJwt(serviceAccount) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      iss: serviceAccount.client_email,
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

  const signature = signer.sign(serviceAccount.private_key, "base64url");
  return `${unsigned}.${signature}`;
}

async function getAccessToken(serviceAccount) {
  const assertion = buildJwt(serviceAccount);
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion,
  }).toString();

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const data = await response.json();
  if (!response.ok || !data.access_token) {
    throw new Error(`Failed to get access token: ${JSON.stringify(data)}`);
  }

  return data.access_token;
}

function loadIntentPack(packPath) {
  const resolved = path.resolve(process.cwd(), packPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Intent pack file not found: ${resolved}`);
  }

  const parsed = parseJsonSafe(fs.readFileSync(resolved, "utf8"));
  if (!parsed || !Array.isArray(parsed.intents) || parsed.intents.length === 0) {
    throw new Error("Invalid intent pack. Expected { languageCode, intents[] }.");
  }

  return parsed;
}

function toDialogflowIntent(intentDef) {
  const trainingPhrases = (intentDef.trainingPhrases || [])
    .map((phrase) => String(phrase || "").trim())
    .filter(Boolean)
    .map((phrase) => ({
      type: "EXAMPLE",
      parts: [{ text: phrase }],
    }));

  const responses = (intentDef.responses || [])
    .map((line) => String(line || "").trim())
    .filter(Boolean);

  if (!intentDef.displayName || trainingPhrases.length === 0 || responses.length === 0) {
    throw new Error(
      `Invalid intent entry. displayName/trainingPhrases/responses required. Entry: ${JSON.stringify(intentDef)}`
    );
  }

  return {
    displayName: String(intentDef.displayName).trim(),
    trainingPhrases,
    messages: [{ text: { text: responses } }],
  };
}

async function listIntents({ projectId, accessToken, languageCode }) {
  let endpoint = `https://dialogflow.googleapis.com/v2/projects/${projectId}/agent/intents?pageSize=500`;
  if (languageCode) {
    endpoint += `&languageCode=${encodeURIComponent(languageCode)}`;
  }

  const response = await fetch(endpoint, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(`Failed to list intents: ${JSON.stringify(data)}`);
  }

  return data.intents || [];
}

async function createIntent({ projectId, accessToken, languageCode, intentBody }) {
  const endpoint = `https://dialogflow.googleapis.com/v2/projects/${projectId}/agent/intents?languageCode=${encodeURIComponent(
    languageCode
  )}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(intentBody),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(`Failed to create intent ${intentBody.displayName}: ${JSON.stringify(data)}`);
  }

  return data;
}

async function updateIntentLanguage({ intentName, accessToken, languageCode, intentBody }) {
  const masksToTry = ["training_phrases,messages", "trainingPhrases,messages"];
  let lastError = null;

  for (const updateMask of masksToTry) {
    const endpoint = `https://dialogflow.googleapis.com/v2/${intentName}?languageCode=${encodeURIComponent(
      languageCode
    )}&updateMask=${encodeURIComponent(updateMask)}`;

    const response = await fetch(endpoint, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: intentName,
        displayName: intentBody.displayName,
        trainingPhrases: intentBody.trainingPhrases,
        messages: intentBody.messages,
      }),
    });

    const data = await response.json();
    if (response.ok) {
      return data;
    }

    lastError = data;
    const errorText = JSON.stringify(data).toLowerCase();
    const isMaskError = errorText.includes("field mask") || errorText.includes("update mask");
    if (!isMaskError) {
      break;
    }
  }

  throw new Error(`Failed to update intent language for ${intentBody.displayName}: ${JSON.stringify(lastError)}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const serviceAccount = loadServiceAccount();
  const pack = loadIntentPack(args.pack);

  const languageCode = String(args.languageCode || pack.languageCode || "en").trim();
  const projectId = String(args.projectId || serviceAccount.project_id || "").trim();

  if (!projectId) {
    throw new Error("Project ID is missing. Set --project or DIALOGFLOW_PROJECT_ID.");
  }

  const accessToken = await getAccessToken(serviceAccount);
  const existingIntents = await listIntents({ projectId, accessToken });
  const existingByName = new Map(existingIntents.map((intent) => [intent.displayName, intent]));

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const intentDef of pack.intents) {
    const intentBody = toDialogflowIntent(intentDef);
    const existing = existingByName.get(intentBody.displayName);

    if (existing && existing.isFallback) {
      console.log(`SKIP fallback intent: ${intentBody.displayName}`);
      skipped += 1;
      continue;
    }

    if (existing && !args.replace) {
      console.log(`SKIP existing intent: ${intentBody.displayName}`);
      skipped += 1;
      continue;
    }

    if (existing && args.replace) {
      await updateIntentLanguage({
        intentName: existing.name,
        accessToken,
        languageCode,
        intentBody,
      });
      updated += 1;
      console.log(`UPDATED intent (${languageCode}): ${intentBody.displayName}`);
    } else {
      console.log(`CREATED intent: ${intentBody.displayName}`);
      await createIntent({
        projectId,
        accessToken,
        languageCode,
        intentBody,
      });
      created += 1;
    }
  }

  console.log("\nDialogflow intent seeding complete.");
  console.log(`Project: ${projectId}`);
  console.log(`Language: ${languageCode}`);
  console.log(`Created: ${created}`);
  console.log(`Updated: ${updated}`);
  console.log(`Skipped: ${skipped}`);
  console.log("\nNext: open Dialogflow console and test detectIntent with your sample phrases.");
}

main().catch((error) => {
  console.error("\nERROR:", error.message);
  process.exit(1);
});
