import twilio from "twilio";
import { requireSession, hasRole } from "@/lib/server/auth-guard";

function cleanEnv(value) {
  return String(value || "").trim();
}

function validateTwilioVoiceConfig({ accountSid, apiKeySid, apiKeySecret, twimlAppSid }) {
  const errors = [];

  if (!accountSid) errors.push("TWILIO_ACCOUNT_SID is missing.");
  if (!apiKeySid) errors.push("TWILIO_API_KEY_SID is missing.");
  if (!apiKeySecret) errors.push("TWILIO_API_KEY_SECRET is missing.");
  if (!twimlAppSid) errors.push("TWILIO_TWIML_APP_SID is missing.");

  if (accountSid && !accountSid.startsWith("AC")) {
    errors.push("TWILIO_ACCOUNT_SID must start with AC.");
  }

  if (apiKeySid && !apiKeySid.startsWith("SK")) {
    errors.push("TWILIO_API_KEY_SID must start with SK.");
  }

  if (twimlAppSid && !twimlAppSid.startsWith("AP")) {
    errors.push("TWILIO_TWIML_APP_SID must start with AP.");
  }

  return errors;
}

export async function GET() {
  const auth = await requireSession();

  if (auth.error) return auth.error;

  if (!hasRole(auth.session, ["ADMIN", "SALES"])) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const accountSid = cleanEnv(process.env.TWILIO_ACCOUNT_SID);
  const apiKeySid = cleanEnv(process.env.TWILIO_API_KEY_SID);
  const apiKeySecret = cleanEnv(process.env.TWILIO_API_KEY_SECRET);
  const twimlAppSid = cleanEnv(process.env.TWILIO_TWIML_APP_SID);

  const configErrors = validateTwilioVoiceConfig({
    accountSid,
    apiKeySid,
    apiKeySecret,
    twimlAppSid,
  });

  if (configErrors.length > 0) {
    return Response.json(
      {
        error: "Softphone configuration is invalid.",
        details: configErrors,
      },
      { status: 400 }
    );
  }

  const identity = `${auth.session.user.id}-${Date.now()}`;

  const AccessToken = twilio.jwt.AccessToken;
  const VoiceGrant = AccessToken.VoiceGrant;

  const token = new AccessToken(accountSid, apiKeySid, apiKeySecret, {
    identity,
    ttl: 3600,
  });

  const voiceGrant = new VoiceGrant({
    outgoingApplicationSid: twimlAppSid,
    incomingAllow: false,
  });

  token.addGrant(voiceGrant);

  return Response.json({
    token: token.toJwt(),
    identity,
    callerId: process.env.TWILIO_CALLER_ID || process.env.TWILIO_FROM_NUMBER || "",
  });
}
