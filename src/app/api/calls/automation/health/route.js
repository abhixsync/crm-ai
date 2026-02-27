import { prisma } from "@/lib/prisma";
import { hasRole, requireSession, getTenantContext } from "@/lib/server/auth-guard";
import {
  getAutomationSettings,
  isCampaignWorkerEnabled,
  resolveAutomationExecutionMode,
} from "@/lib/journey/automation-settings";
import { databaseUnavailableResponse, isDatabaseUnavailable } from "@/lib/server/database-error";

const CRON_STATE_KEY = "AI_CAMPAIGN_CRON_STATE";
const WORKER_HEARTBEAT_KEY = "AI_CAMPAIGN_WORKER_HEARTBEAT";

function getIntervalMinutes() {
  const raw = Number(process.env.CRON_INTERVAL_MINUTES || 5);
  return Number.isNaN(raw) || raw <= 0 ? 5 : Math.min(raw, 1440);
}

function getCountsByStatus(rows) {
  const byStatus = Object.fromEntries(rows.map((row) => [row.status, row._count]));

  return {
    waiting: byStatus.QUEUED || 0,
    active: byStatus.ACTIVE || 0,
    failed: byStatus.FAILED || 0,
    completed: byStatus.COMPLETED || 0,
    skipped: byStatus.SKIPPED || 0,
    total: Object.values(byStatus).reduce((sum, count) => sum + count, 0),
  };
}

export async function GET() {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  if (!hasRole(auth.session, ["ADMIN", "SUPER_ADMIN"])) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const tenant = getTenantContext(auth.session);

  try {
    const intervalMinutes = getIntervalMinutes();
    const workerEnabled = isCampaignWorkerEnabled();

    const settings = await getAutomationSettings();
    const executionMode = resolveAutomationExecutionMode(settings);

    let cronStateRecord = null;
    let workerHeartbeatRecord = null;
    let queue = {
      waiting: 0,
      active: 0,
      failed: 0,
      completed: 0,
      skipped: 0,
      total: 0,
    };

    try {
      const [cronState, workerHeartbeat, groupedJobs] = await Promise.all([
        prisma.automationSetting.findUnique({ where: { key: CRON_STATE_KEY } }),
        prisma.automationSetting.findUnique({ where: { key: WORKER_HEARTBEAT_KEY } }),
        prisma.campaignJob.groupBy({
          by: ["status"],
          _count: true,
          where: tenant.isSuperAdmin ? {} : {
            customer: {
              tenantId: tenant.tenantId,
            },
          },
        }),
      ]);

      cronStateRecord = cronState;
      workerHeartbeatRecord = workerHeartbeat;
      queue = getCountsByStatus(groupedJobs);
    } catch (error) {
      if (isDatabaseUnavailable(error)) {
        console.warn("[api/calls/automation/health] Database unavailable; returning degraded response.");
        return databaseUnavailableResponse({
          schedulerOnline: false,
          runtimeOnline: false,
          executionMode,
          workerEnabled,
          runtimeKind: executionMode,
          runtimeLabel: executionMode === "WORKER" ? "Campaign Worker" : "Cron Scheduler",
          lastRunAt: null,
          lastHeartbeatAt: null,
          intervalMinutes,
          queue,
        });
      }

      throw error;
    }

    const lastRunAtRaw = cronStateRecord?.value?.lastRunAt || null;
    const lastRunAt = lastRunAtRaw ? new Date(lastRunAtRaw) : null;
    const isValidLastRun = Boolean(lastRunAt && !Number.isNaN(lastRunAt.getTime()));
    const cronOnlineWindowMs = intervalMinutes * 2 * 60 * 1000;
    const schedulerOnline = isValidLastRun ? Date.now() - lastRunAt.getTime() <= cronOnlineWindowMs : false;

    const lastHeartbeatAtRaw = workerHeartbeatRecord?.value?.lastHeartbeatAt || null;
    const lastHeartbeatAt = lastHeartbeatAtRaw ? new Date(lastHeartbeatAtRaw) : null;
    const isValidHeartbeat = Boolean(lastHeartbeatAt && !Number.isNaN(lastHeartbeatAt.getTime()));
    const workerOnlineWindowMs = 45 * 1000;
    const workerOnline = isValidHeartbeat
      ? Date.now() - lastHeartbeatAt.getTime() <= workerOnlineWindowMs
      : false;

    const runtimeOnline = executionMode === "WORKER" ? workerOnline : schedulerOnline;

    return Response.json({
      schedulerOnline,
      workerOnline,
      runtimeOnline,
      workerEnabled,
      executionMode,
      runtimeKind: executionMode,
      runtimeLabel: executionMode === "WORKER" ? "Campaign Worker" : "Cron Scheduler",
      lastRunAt: isValidLastRun ? lastRunAt.toISOString() : null,
      lastHeartbeatAt: isValidHeartbeat ? lastHeartbeatAt.toISOString() : null,
      intervalMinutes,
      queue,
    });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      console.warn("[api/calls/automation/health] Database unavailable; returning degraded response.");
      return databaseUnavailableResponse({
        schedulerOnline: false,
        workerOnline: false,
        runtimeOnline: false,
        workerEnabled: isCampaignWorkerEnabled(),
        executionMode: "CRON",
        runtimeKind: "CRON",
        runtimeLabel: "Cron Scheduler",
        lastRunAt: null,
        lastHeartbeatAt: null,
        intervalMinutes: getIntervalMinutes(),
        queue: {
          waiting: 0,
          active: 0,
          failed: 0,
          completed: 0,
          skipped: 0,
          total: 0,
        },
      });
    }

    throw error;
  }
}
