import { prisma } from "@/lib/prisma";
import { runAIWithFailover } from "@/lib/ai/provider-router";

export async function POST(request) {
  const body = await request.json();
  const { callSid, transcript } = body;

  if (!callSid || !transcript) {
    return Response.json({ error: "callSid and transcript are required" }, { status: 400 });
  }

  const aiOutput = await runAIWithFailover({
    task: "CALL_SUMMARY",
    payload: { transcript },
  });
  const analysis = aiOutput.result;

  await prisma.callLog.updateMany({
    where: { providerCallId: callSid },
    data: {
      transcript,
      summary: analysis.summary,
      intent: analysis.intent,
      nextAction: analysis.nextAction,
      aiProviderUsed: aiOutput.provider.name,
    },
  });

  return Response.json({ ok: true, analysis, provider: aiOutput.provider.name });
}