import { timingSafeEqual } from "node:crypto";
import { runAutomationBatch } from "@/lib/journey/automation-runner";
import { prisma } from "@/lib/prisma";
import {
  getAutomationSettings,
  isCampaignWorkerEnabled,
  resolveAutomationExecutionMode,
} from "@/lib/journey/automation-settings";
import { databaseUnavailableResponse, isDatabaseUnavailable } from "@/lib/server/database-error";
import { sendEmail, buildCampaignCompletionEmail } from "@/lib/email/mailer";
import { resolveTenantTheme } from "@/modules/theme/theme.service";
import { createNotification } from "@/lib/notifications/notification-service";

const CRON_STATE_KEY = "AI_CAMPAIGN_CRON_STATE";

function getIntervalMinutes() {
  const raw = Number(process.env.CRON_INTERVAL_MINUTES || 5);
  return Number.isNaN(raw) || raw <= 0 ? 5 : Math.min(raw, 1440);
}

async function shouldRunCron() {
  const intervalMinutes = getIntervalMinutes();
  const record = await prisma.automationSetting.findFirst({ where: { key: CRON_STATE_KEY } });
  const lastRunAt = record?.value?.lastRunAt ? new Date(record.value.lastRunAt) : null;

  if (!lastRunAt || Number.isNaN(lastRunAt.getTime())) {
    return { run: true, intervalMinutes };
  }

  const elapsedMs = Date.now() - lastRunAt.getTime();
  const intervalMs = intervalMinutes * 60 * 1000;

  return { run: elapsedMs >= intervalMs, intervalMinutes, lastRunAt };
}

async function recordCronRun() {
  const existing = await prisma.automationSetting.findFirst({ where: { key: CRON_STATE_KEY } });
  const value = { lastRunAt: new Date().toISOString() };
  if (existing) {
    await prisma.automationSetting.update({
      where: { tenantId_key: { tenantId: existing.tenantId, key: CRON_STATE_KEY } },
      data: { value },
    });
  } else {
    // Anchor to first tenant
    const tenant = await prisma.tenant.findFirst({ select: { id: true } });
    if (tenant) {
      await prisma.automationSetting.create({
        data: { tenantId: tenant.id, key: CRON_STATE_KEY, value },
      });
    }
  }
}

function isAuthorized(request) {
  const secret = String(process.env.CRON_SECRET || "").trim();
  if (!secret) return false;

  const headerSecret = String(request.headers.get("x-cron-secret") || "").trim();
  const authHeader = String(request.headers.get("authorization") || "").trim();
  const bearerSecret = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  function safeEq(a, b) {
    if (!a || !b) return false;
    const ba = Buffer.from(a);
    const bb = Buffer.from(b);
    if (ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
  }

  return safeEq(headerSecret, secret) || safeEq(bearerSecret, secret);
}

async function checkAndNotifyCampaignCompletion() {
  const runningCampaigns = await prisma.campaign.findMany({
    where: { status: "RUNNING" },
    select: { id: true, tenantId: true, name: true, createdById: true },
  });

  if (runningCampaigns.length === 0) return;

  const campaignIds = runningCampaigns.map((c) => c.id);

  // Batch: count pending jobs per campaign
  const pendingCounts = await prisma.campaignJob.groupBy({
    by: ["campaignId"],
    where: { campaignId: { in: campaignIds }, status: { in: ["QUEUED", "ACTIVE"] } },
    _count: { id: true },
  });
  const pendingMap = new Map(pendingCounts.map((r) => [r.campaignId, r._count.id]));

  // Only process campaigns with no pending jobs
  const completedCampaigns = runningCampaigns.filter((c) => !pendingMap.has(c.id));
  if (completedCampaigns.length === 0) return;

  const completedIds = completedCampaigns.map((c) => c.id);

  // Batch mark complete
  await prisma.campaign.updateMany({
    where: { id: { in: completedIds } },
    data: { status: "COMPLETED" },
  }).catch(() => {});

  // Batch count all job statuses
  const jobStats = await prisma.campaignJob.groupBy({
    by: ["campaignId", "status"],
    where: { campaignId: { in: completedIds } },
    _count: { id: true },
  });

  const statsMap = new Map();
  for (const row of jobStats) {
    if (!statsMap.has(row.campaignId)) {
      statsMap.set(row.campaignId, { total: 0, completed: 0, failed: 0, skipped: 0 });
    }
    const s = statsMap.get(row.campaignId);
    s.total += row._count.id;
    if (row.status === "COMPLETED") s.completed = row._count.id;
    if (row.status === "FAILED") s.failed = row._count.id;
    if (row.status === "SKIPPED") s.skipped = row._count.id;
  }

  for (const campaign of completedCampaigns) {
    const stats = statsMap.get(campaign.id) || { total: 0, completed: 0, failed: 0 };

    createNotification(campaign.tenantId, {
      type: "CAMPAIGN_UPDATE",
      title: `Campaign completed: ${campaign.name}`,
      body: `All jobs processed. Check the campaign report for results.`,
      link: "/admin/automation",
    }).catch(() => {});

    // Send completion email (non-blocking)
    (async () => {
      try {
        const creator = campaign.createdById
          ? await prisma.user.findUnique({ where: { id: campaign.createdById }, select: { email: true, name: true } })
          : await prisma.user.findFirst({ where: { tenantId: campaign.tenantId, isPrimaryOwner: true }, select: { email: true, name: true } });
        if (!creator?.email) return;
        const theme = await resolveTenantTheme(campaign.tenantId).catch(() => null);
        const emailCtx = {
          brandName: theme?.emailFromName || theme?.brandName || null,
          primaryColor: theme?.primaryColor || null,
          fromName: theme?.emailFromName || theme?.brandName || null,
        };
        const email = buildCampaignCompletionEmail(
          creator.name || "there",
          campaign.name,
          { total: stats.total, completed: stats.completed, failed: stats.failed, interested: 0 },
          emailCtx
        );
        await sendEmail({ to: creator.email, ...email, fromName: email.fromName });
      } catch {}
    })();
  }
}

export async function GET(request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    if (isCampaignWorkerEnabled()) {
      return Response.json({
        skipped: true,
        reason: "worker_feature_enabled",
        executionMode: "WORKER",
      });
    }

    // Check global automation mode — use first tenant's settings as reference
    const firstTenant = await prisma.tenant.findFirst({ select: { id: true } });
    const settings = await getAutomationSettings(firstTenant?.id);
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

    checkAndNotifyCampaignCompletion().catch(() => {});

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
