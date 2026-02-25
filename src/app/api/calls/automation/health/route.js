import { Queue } from "bullmq";
import { prisma } from "@/lib/prisma";
import { hasRole, requireSession } from "@/lib/server/auth-guard";
import { AI_CAMPAIGN_QUEUE, queueConnection } from "@/lib/queue/ai-campaign-queue";
import { databaseUnavailableResponse, isDatabaseUnavailable } from "@/lib/server/database-error";

const WORKER_HEARTBEAT_KEY = "AI_CAMPAIGN_WORKER_HEARTBEAT";
const WORKER_ONLINE_WINDOW_MS = 45 * 1000;

export async function GET() {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  if (!hasRole(auth.session, ["SUPER_ADMIN"])) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const queue = new Queue(AI_CAMPAIGN_QUEUE, {
    connection: queueConnection,
  });

  try {
    const counts = await queue.getJobCounts("waiting", "active", "completed", "failed", "delayed", "paused");

    let heartbeatRecord = null;
    try {
      heartbeatRecord = await prisma.automationSetting.findUnique({ where: { key: WORKER_HEARTBEAT_KEY } });
    } catch (error) {
      if (isDatabaseUnavailable(error)) {
        console.warn("[api/calls/automation/health] Database unavailable; returning degraded response.");
        return databaseUnavailableResponse({
          workerOnline: false,
          heartbeat: null,
          queue: counts,
        });
      }

      throw error;
    }

    const heartbeatAt = new Date(heartbeatRecord?.value?.lastHeartbeatAt || 0);
    const workerOnline = Date.now() - heartbeatAt.getTime() <= WORKER_ONLINE_WINDOW_MS;

    return Response.json({
      workerOnline,
      heartbeat: heartbeatRecord?.value || null,
      queue: counts,
    });
  } finally {
    await queue.close();
  }
}
