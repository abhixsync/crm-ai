import twilio from "twilio";
import { requireSession, hasRole } from "@/lib/server/auth-guard";

function cleanEnv(value) {
  return String(value || "").trim();
}

function toCheck(name, ok, message) {
  return { name, ok, message };
}

function validateFormat(value, prefix) {
  return Boolean(value) && value.startsWith(prefix);
}

export async function GET() {
  const auth = await requireSession();

  if (auth.error) return auth.error;

  if (!hasRole(auth.session, ["ADMIN", "SALES"])) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const accountSid = cleanEnv(process.env.TWILIO_ACCOUNT_SID);
  const authToken = cleanEnv(process.env.TWILIO_AUTH_TOKEN);
  const apiKeySid = cleanEnv(process.env.TWILIO_API_KEY_SID);
  const apiKeySecret = cleanEnv(process.env.TWILIO_API_KEY_SECRET);
  const twimlAppSid = cleanEnv(process.env.TWILIO_TWIML_APP_SID);
  const appBaseUrl = cleanEnv(process.env.APP_BASE_URL);

  const checks = [
    toCheck(
      "TWILIO_ACCOUNT_SID",
      validateFormat(accountSid, "AC"),
      validateFormat(accountSid, "AC") ? "Looks valid." : "Missing or invalid. Expected prefix AC."
    ),
    toCheck(
      "TWILIO_AUTH_TOKEN",
      Boolean(authToken),
      authToken ? "Configured." : "Missing. Needed for server-side Twilio API verification."
    ),
    toCheck(
      "TWILIO_API_KEY_SID",
      validateFormat(apiKeySid, "SK"),
      validateFormat(apiKeySid, "SK") ? "Looks valid." : "Missing or invalid. Expected prefix SK."
    ),
    toCheck(
      "TWILIO_API_KEY_SECRET",
      Boolean(apiKeySecret),
      apiKeySecret ? "Configured." : "Missing."
    ),
    toCheck(
      "TWILIO_TWIML_APP_SID",
      validateFormat(twimlAppSid, "AP"),
      validateFormat(twimlAppSid, "AP") ? "Looks valid." : "Missing or invalid. Expected prefix AP."
    ),
    toCheck(
      "APP_BASE_URL",
      Boolean(appBaseUrl),
      appBaseUrl
        ? appBaseUrl.startsWith("https://")
          ? "Configured with HTTPS."
          : "Configured, but use HTTPS URL for browser voice in production."
        : "Missing."
    ),
  ];

  const canVerifyWithTwilio =
    validateFormat(accountSid, "AC") &&
    Boolean(authToken) &&
    validateFormat(apiKeySid, "SK") &&
    validateFormat(twimlAppSid, "AP");

  if (canVerifyWithTwilio) {
    const client = twilio(accountSid, authToken);

    try {
      await client.applications(twimlAppSid).fetch();
      checks.push(
        toCheck(
          "Twilio App Verification",
          true,
          "TwiML App SID is reachable with current Account SID/Auth Token."
        )
      );
    } catch (error) {
      checks.push(
        toCheck(
          "Twilio App Verification",
          false,
          error?.message || "Could not fetch TwiML App with provided credentials."
        )
      );
    }

    try {
      await client.keys(apiKeySid).fetch();
      checks.push(
        toCheck(
          "API Key Verification",
          true,
          "API Key SID is reachable with current Account SID/Auth Token."
        )
      );
    } catch (error) {
      checks.push(
        toCheck(
          "API Key Verification",
          false,
          error?.message || "Could not fetch API key. It may belong to another account/subaccount."
        )
      );
    }
  } else {
    checks.push(
      toCheck(
        "Twilio Remote Verification",
        false,
        "Skipped because one or more required Twilio credentials are missing or malformed."
      )
    );
  }

  const ok = checks.every((check) => check.ok);

  return Response.json({ ok, checks });
}
