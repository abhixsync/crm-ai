import crypto from "crypto";
import fs from "fs";
import path from "path";
import { AI_TASKS, createEngineAdapter } from "@/lib/ai/engine-contract";

const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const DIALOGFLOW_SCOPE = "https://www.googleapis.com/auth/cloud-platform";

function parseJsonSafe(value) {
  if (!value) return null;

  if (typeof value === "object") {
    return value;
  }

  const raw = String(value).trim();
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function parseBase64Json(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  try {
    const decoded = Buffer.from(raw, "base64").toString("utf8");
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

function parseJsonFilePath(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  const looksLikePath =
    raw.endsWith(".json") || raw.startsWith("./") || raw.startsWith("../") || raw.includes("\\");

  if (!looksLikePath) return null;

  const filePath = path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
  if (!fs.existsSync(filePath)) return null;

  try {
    const json = fs.readFileSync(filePath, "utf8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function normalizePrivateKey(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return raw.replace(/\\n/g, "\n");
}

function parseServiceAccountFromDiscreteEnv() {
  const clientEmail = String(process.env.DIALOGFLOW_CLIENT_EMAIL || "").trim();
  const privateKey = normalizePrivateKey(process.env.DIALOGFLOW_PRIVATE_KEY);
  const projectId = String(process.env.DIALOGFLOW_PROJECT_ID || "").trim();

  if (!clientEmail || !privateKey) return null;

  return {
    client_email: clientEmail,
    private_key: privateKey,
    project_id: projectId || undefined,
  };
}

function getServiceAccount(config) {
  const metadata = config?.metadata || {};
  const envServiceAccount = process.env.DIALOGFLOW_SERVICE_ACCOUNT_JSON;

  return (
    parseJsonSafe(config?.apiKey) ||
    parseJsonSafe(metadata?.serviceAccountJson) ||
    parseJsonSafe(envServiceAccount) ||
    parseJsonFilePath(envServiceAccount) ||
    parseBase64Json(process.env.DIALOGFLOW_SERVICE_ACCOUNT_BASE64) ||
    parseServiceAccountFromDiscreteEnv()
  );
}

function getProjectId(config, serviceAccount) {
  const metadata = config?.metadata || {};

  return (
    String(metadata?.projectId || "").trim() ||
    String(process.env.DIALOGFLOW_PROJECT_ID || "").trim() ||
    String(serviceAccount?.project_id || "").trim() ||
    String(config?.model || "").trim()
  );
}

function createSignedJwt(serviceAccount) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + 3600;

  const header = {
    alg: "RS256",
    typ: "JWT",
  };

  const payload = {
    iss: serviceAccount.client_email,
    scope: DIALOGFLOW_SCOPE,
    aud: GOOGLE_OAUTH_TOKEN_URL,
    exp: expiresAt,
    iat: issuedAt,
  };

  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsignedToken = `${encode(header)}.${encode(payload)}`;

  const signer = crypto.createSign("RSA-SHA256");
  signer.update(unsignedToken);
  signer.end();

  const signature = signer.sign(serviceAccount.private_key, "base64url");
  return `${unsignedToken}.${signature}`;
}

async function getAccessToken(serviceAccount) {
  if (!serviceAccount?.client_email || !serviceAccount?.private_key) {
    throw new Error("Dialogflow service account is missing client_email/private_key.");
  }

  const assertion = createSignedJwt(serviceAccount);
  const payload = new URLSearchParams();
  payload.set("grant_type", "urn:ietf:params:oauth:grant-type:jwt-bearer");
  payload.set("assertion", assertion);

  const response = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: payload.toString(),
  });

  const data = await response.json();

  if (!response.ok || !data?.access_token) {
    throw new Error(data?.error_description || data?.error || "Dialogflow auth failed.");
  }

  return data.access_token;
}

function buildDialogflowInputText(task, input) {
  const truncate = (value, max = 240) => {
    const text = String(value || "").trim();
    if (text.length <= max) return text;
    return `${text.slice(0, Math.max(0, max - 3))}...`;
  };

  if (task === AI_TASKS.CALL_SCRIPT) {
    const customer = input.customer || {};
    const compactProfile = {
      firstName: customer.firstName || "",
      loanType: customer.loanType || "",
      loanAmount: customer.loanAmount || "",
      monthlyIncome: customer.monthlyIncome || "",
      city: customer.city || "",
    };

    return truncate(
      `Generate concise loan call script (max 120 words). Profile: ${JSON.stringify(compactProfile)}`,
      240
    );
  }

  if (task === AI_TASKS.CALL_SUMMARY) {
    return truncate(
      `Analyze loan call transcript and return summary, intent, nextAction: ${input.transcript || ""}`,
      240
    );
  }

  if (task === AI_TASKS.CALL_TURN) {
    const customer = input.customer || {};
    const compactProfile = {
      firstName: customer.firstName || "",
      loanType: customer.loanType || "",
      loanAmount: customer.loanAmount || "",
    };

    return truncate(
      `Profile:${JSON.stringify(compactProfile)} Conversation:${input.transcript || ""} Turn:${input.turn}. Reply briefly and say if shouldEnd true/false.`,
      240
    );
  }

  return "";
}

function normalizeTurnResponse(replyText) {
  const reply = String(replyText || "Please continue.").trim();
  const lower = reply.toLowerCase();
  const shouldEnd =
    lower.includes("thank you for your time") ||
    lower.includes("we will call you back") ||
    lower.includes("goodbye") ||
    lower.includes("not interested");

  return { reply, shouldEnd };
}

function normalizeSummaryResponse(replyText, intentName) {
  const summary = String(replyText || "Transcript processed.").trim();
  return {
    summary,
    intent: String(intentName || "UNKNOWN"),
    nextAction: "Review and schedule follow-up based on intent.",
  };
}

async function invokeDialogflow({ task, input, config }) {
  const serviceAccount = getServiceAccount(config);
  if (!serviceAccount) {
    throw new Error(
      "Dialogflow credentials are missing. Configure service account JSON in provider apiKey/metadata, DIALOGFLOW_SERVICE_ACCOUNT_JSON, DIALOGFLOW_SERVICE_ACCOUNT_BASE64, or DIALOGFLOW_CLIENT_EMAIL + DIALOGFLOW_PRIVATE_KEY."
    );
  }

  const projectId = getProjectId(config, serviceAccount);
  if (!projectId) {
    throw new Error("Dialogflow project ID is missing. Set metadata.projectId, model, or DIALOGFLOW_PROJECT_ID.");
  }

  const accessToken = await getAccessToken(serviceAccount);
  const sessionId =
    String(input.customer?.id || "").trim() ||
    String(input.metadata?.sessionId || "").trim() ||
    `crm-${Date.now()}`;

  const languageCode =
    String(config?.metadata?.languageCode || process.env.DIALOGFLOW_LANGUAGE_CODE || "en").trim() || "en";

  const endpoint = `https://dialogflow.googleapis.com/v2/projects/${projectId}/agent/sessions/${encodeURIComponent(
    sessionId
  )}:detectIntent`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      queryInput: {
        text: {
          text: buildDialogflowInputText(task, input),
          languageCode,
        },
      },
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || "Dialogflow detectIntent failed.");
  }

  const queryResult = data?.queryResult || {};
  const fulfillmentText = queryResult.fulfillmentText || "";
  const intentName = queryResult?.intent?.displayName || "UNKNOWN";

  if (task === AI_TASKS.CALL_SCRIPT) {
    return { script: String(fulfillmentText || "").trim() };
  }

  if (task === AI_TASKS.CALL_SUMMARY) {
    return normalizeSummaryResponse(fulfillmentText, intentName);
  }

  if (task === AI_TASKS.CALL_TURN) {
    return normalizeTurnResponse(fulfillmentText);
  }

  throw new Error(`Dialogflow does not support task: ${task}`);
}

export function createDialogflowEngine() {
  return createEngineAdapter({
    id: "dialogflow-engine",
    supportedTasks: [AI_TASKS.CALL_SCRIPT, AI_TASKS.CALL_SUMMARY, AI_TASKS.CALL_TURN],
    invoke: invokeDialogflow,
  });
}
