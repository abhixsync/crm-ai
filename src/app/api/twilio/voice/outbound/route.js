import twilio from "twilio";

function normalizePhone(value) {
  const raw = String(value || "").trim();

  if (!raw) {
    return "";
  }

  if (raw.startsWith("+")) {
    return `+${raw.slice(1).replace(/\D/g, "")}`;
  }

  const digits = raw.replace(/\D/g, "");

  if (digits.length === 10) {
    const defaultCountryCode = process.env.DEFAULT_COUNTRY_CODE || "+91";
    return `${defaultCountryCode}${digits}`;
  }

  if (digits.length > 10) {
    return `+${digits}`;
  }

  return raw;
}

function buildTwiml(to) {
  const voiceResponse = new twilio.twiml.VoiceResponse();

  if (!to) {
    voiceResponse.say("No destination number was provided.");
    voiceResponse.hangup();
    return voiceResponse.toString();
  }

  const dial = voiceResponse.dial({
    callerId: process.env.TWILIO_CALLER_ID || process.env.TWILIO_FROM_NUMBER,
  });

  dial.number(to);

  return voiceResponse.toString();
}

export async function POST(request) {
  const form = await request.formData();
  const to = normalizePhone(form.get("To"));

  return new Response(buildTwiml(to), {
    status: 200,
    headers: {
      "Content-Type": "text/xml",
    },
  });
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const to = normalizePhone(searchParams.get("To"));

  return new Response(buildTwiml(to), {
    status: 200,
    headers: {
      "Content-Type": "text/xml",
    },
  });
}
