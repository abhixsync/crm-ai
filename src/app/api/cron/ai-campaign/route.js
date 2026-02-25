import { runAutomationBatch } from "@/lib/journey/automation-runner";
import { prisma } from "@/lib/prisma";
import { getAutomationSettings, resolveAutomationExecutionMode } from "@/lib/journey/automation-settings";
import { databaseUnavailableResponse, isDatabaseUnavailable } from "@/lib/server/database-error";

const CRON_STATE_KEY = "AI_CAMPAIGN_CRON_STATE";

function getIntervalMinutes() {
  const raw = Number(process.env.CRON_INTERVAL_MINUTES || 5);
  return Number.isNaN(raw) || raw <= 0 ? 5 : Math.min(raw, 1440);
}

async function shouldRunCron() {
  const intervalMinutes = getIntervalMinutes();
  const record = await prisma.automationSetting.findUnique({ where: { key: CRON_STATE_KEY } });
  const lastRunAt = record?.value?.lastRunAt ? new Date(record.value.lastRunAt) : null;

  if (!lastRunAt || Number.isNaN(lastRunAt.getTime())) {
    return { run: true, intervalMinutes };
  }

  const elapsedMs = Date.now() - lastRunAt.getTime();
  const intervalMs = intervalMinutes * 60 * 1000;

  return { run: elapsedMs >= intervalMs, intervalMinutes, lastRunAt };
}

async function recordCronRun() {
  await prisma.automationSetting.upsert({
    where: { key: CRON_STATE_KEY },
    create: { key: CRON_STATE_KEY, value: { lastRunAt: new Date().toISOString() } },
    update: { value: { lastRunAt: new Date().toISOString() } },
  });
}

function isAuthorized(request) {
  const secret = String(process.env.CRON_SECRET || "").trim();
  if (!secret) return true;

  const headerSecret = String(request.headers.get("x-cron-secret") || "").trim();
  const authHeader = String(request.headers.get("authorization") || "").trim();

  if (headerSecret && headerSecret === secret) return true;
  if (authHeader && authHeader === `Bearer ${secret}`) return true;

  return false;
}

export async function GET(request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const settings = await getAutomationSettings();
    const executionMode = resolveAutomationExecutionMode(settings);

    if (executionMode === "WORKER") {
      return Response.json({
        skipped: true,
        reason: "execution_mode_worker",
        executionMode,
      });
    }

    const gate = await shouldRunCron();
    if (!gate.run) {
      return Response.json({
        skipped: true,
        reason: "interval_not_reached",
        executionMode,
        intervalMinutes: gate.intervalMinutes,
        lastRunAt: gate.lastRunAt?.toISOString() || null,
      });
    }

    const result = await runAutomationBatch();

    if (!result.ok) {
      return Response.json({ error: result.error }, { status: result.status });
    }

    await recordCronRun();

    return Response.json({
      ...result.data,
      executionMode,
    });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      console.warn("[api/cron/ai-campaign] Database unavailable; returning degraded response.");
      return databaseUnavailableResponse();
    }

    throw error;
  }
}
