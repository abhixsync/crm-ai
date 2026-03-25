import { prisma } from "@/lib/prisma";
import { generateInitialCallPrompt } from "@/lib/ai/openai";

function xmlEscape(value) {
  return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function plivoResponse(xmlBody) {
  const xml = `<?xml version="1.0" encoding="UTF-8"?><Response>${xmlBody}</Response>`;
  return new Response(xml, { status: 200, headers: { "Content-Type": "application/xml" } });
}

export async function POST(request) {
  const url = new URL(request.url);
  const customerId = url.searchParams.get("customerId");
  const callLogId = url.searchParams.get("callLogId");

  try {
    const customer = customerId
      ? await prisma.customer.findFirst({ where: { id: customerId } })
      : null;

    if (!customer) {
      return plivoResponse("<Speak>Customer not found. Goodbye.</Speak><Hangup/>");
    }

    const greeting = generateInitialCallPrompt(customer);

    if (callLogId) {
      await prisma.callLog.updateMany({
        where: { id: callLogId },
        data: { transcript: `Agent: ${greeting}` },
      });
    }

    // Plivo uses <GetInput> for speech recognition (similar to Twilio's <Gather>)
    const callbackUrl = `${url.origin}/api/plivo/voice/callback?customerId=${customer.id}&callLogId=${callLogId}&turn=1&failedAttempts=0`;

    return plivoResponse(
      `<GetInput action="${xmlEscape(callbackUrl)}" method="POST" inputType="speech" language="hi-IN" speechEndTimeout="1500">` +
      `<Speak>${xmlEscape(greeting)}</Speak>` +
      `</GetInput>` +
      `<Speak>Thank you for your time. Goodbye.</Speak><Hangup/>`
    );
  } catch (error) {
    console.error("[plivo/answer] Error:", error);
    return plivoResponse("<Speak>System error. Please try again later.</Speak><Hangup/>");
  }
}

export async function GET(request) {
  return POST(request);
}
