import { prisma } from "@/lib/prisma";
import { generateInitialCallPrompt } from "@/lib/ai/openai";

function xmlEscape(value) {
  return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function exotelResponse(xmlBody) {
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
      return exotelResponse("<Say>Customer not found. Goodbye.</Say><Hangup/>");
    }

    const greeting = generateInitialCallPrompt(customer);

    if (callLogId) {
      await prisma.callLog.updateMany({
        where: { id: callLogId },
        data: { transcript: `Agent: ${greeting}` },
      });
    }

    // Exotel does not have native speech recognition like Twilio's <Gather>.
    // For now, play the script and hang up. Multi-turn requires Exotel's
    // Programmable Voice flow or a custom bridge.
    return exotelResponse(`<Say>${xmlEscape(greeting)}</Say><Hangup/>`);
  } catch (error) {
    console.error("[exotel/answer] Error:", error);
    return exotelResponse("<Say>System error. Please try again later.</Say><Hangup/>");
  }
}

export async function GET(request) {
  return POST(request);
}
