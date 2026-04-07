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
  if (!secret) return true;

  const headerSecret = String(request.headers.get("x-cron-secret") || "").trim();
  const authHeader = String(request.headers.get("authorization") || "").trim();

  if (headerSecret && headerSecret === secret) return true;
  if (authHeader && authHeader === `Bearer ${secret}`) return true;

  return false;
}

async function checkAndNotifyCampaignCompletion() {
  // Find RUNNING campaigns where all queued/active jobs are now done
  const runningCampaigns = await prisma.campaign.findMany({
    where: { status: "RUNNING" },
    select: { id: true, tenantId: true, name: true, createdById: true },
  });

  for (const campaign of runningCampaigns) {
    const pendingJobs = await prisma.campaignJob.count({
      where: { campaignId: campaign.id, status: { in: ["QUEUED", "ACTIVE"] } },
    });
    if (pendingJobs > 0) continue;

    // Mark campaign complete
    await prisma.campaign.update({ where: { id: campaign.id }, data: { status: "COMPLETED" } }).catch(() => {});

    // In-app notification (non-blocking)
    createNotification(campaign.tenantId, {
      type: "CAMPAIGN_UPDATE",
      title: `Campaign completed: ${campaign.name}`,
      body: `All jobs processed. Check the campaign report for results.`,
      link: "/admin/automation",
    }).catch(() => {});

    // Gather stats
    const [total, completed, failed] = await Promise.all([
      prisma.campaignJob.count({ where: { campaignId: campaign.id } }),
      prisma.campaignJob.count({ where: { campaignId: campaign.id, status: "COMPLETED" } }),
      prisma.campaignJob.count({ where: { campaignId: campaign.id, status: "FAILED" } }),
    ]);
    const interested = await prisma.customer.count({
      where: {
        tenantId: campaign.tenantId,
        status: "INTERESTED",
        campaignJobs: { some: { campaignId: campaign.id } },
      },
    });

    // Send email to campaign creator (non-blocking)
    (async () => {
      try {
        const creator = campaign.createdById
          ? await prisma.user.findUnique({ where: { id: campaign.createdById }, select: { email: true, name: true } })
          : await prisma.user.findFirst({ where: { tenantId: campaign.tenantId, isPrimaryOwner: true }, select: { email: true, name: true } });
        if (!creator?.email) return;
        const theme = await resolveTenantTheme(campaign.tenantId).catch(() => null);
        const emailCtx = {
          brandName:    theme?.emailFromName || theme?.brandName || null,
          primaryColor: theme?.primaryColor || null,
          fromName:     theme?.emailFromName || theme?.brandName || null,
        };
        const email = buildCampaignCompletionEmail(
          creator.name || "there",
          campaign.name,
          { total, completed, failed, interested },
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
