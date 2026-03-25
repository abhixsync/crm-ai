import { requireSession, hasRole } from "@/lib/server/auth-guard";
import { runAIWithFailover } from "@/lib/ai/provider-router";
import { isDatabaseUnavailable, databaseUnavailableResponse } from "@/lib/server/database-error";

export async function POST(request) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  if (!hasRole(auth.session, ["ADMIN", "SUPER_ADMIN"])) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { transcript, extractedData, customerProfile } = await request.json();

    if (!transcript) {
      return Response.json({ error: "Transcript is required" }, { status: 400 });
    }

    const aiOutput = await runAIWithFailover({
      task: "CALL_SUMMARY",
      payload: {
        transcript,
        extractedData: extractedData || null,
        customer: customerProfile || null,
      },
    });

    return Response.json({
      ...aiOutput.result,
      provider: aiOutput.provider?.name || "unknown",
    });
  } catch (error) {
    if (isDatabaseUnavailable(error)) return databaseUnavailableResponse();
    console.error("[ai-simulator/summary] Error:", error);
    return Response.json({ error: "Summary generation failed", details: error.message }, { status: 500 });
  }
}
