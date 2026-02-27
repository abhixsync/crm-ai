import { Worker } from "bullmq";
import { CampaignJobStatus } from "@prisma/client";
import os from "node:os";
import { prisma } from "@/lib/prisma";
import { AI_CAMPAIGN_QUEUE, queueConnection } from "@/lib/queue/ai-campaign-queue";
import {
  getAutomationSettings,
  isCampaignWorkerEnabled,
  isWithinWorkingHours,
} from "@/lib/journey/automation-settings";
import { isEligibleForAutomation } from "@/lib/journey/campaign-eligibility";
import { runAICampaignForCustomer } from "@/lib/journey/ai-campaign-service";
import { scheduleRetryForFailure } from "@/lib/journey/retry-policy";

const WORKER_HEARTBEAT_KEY = "AI_CAMPAIGN_WORKER_HEARTBEAT";

if (!isCampaignWorkerEnabled()) {
  console.log("[ai-campaign-worker] ENABLE_CAMPAIGN_WORKER is false. Exiting.");
  process.exit(0);
}

async function updateCampaignJob(job, patch = {}) {
  const queueJobId = String(job?.id || "");
  if (!queueJobId) return;

  const customerId = job?.data?.customerId || null;
  const reason = String(job?.data?.reason || "automation");

  await prisma.campaignJob.upsert({
    where: { queueJobId },
    update: patch,
    create: {
      queueJobId,
      customerId,
      reason,
      ...patch,
    },
  });
}

function workerRuntimeMetadata(extra = {}) {
  return {
    executionRuntime: "WORKER",
    source: "worker_processor",
    ...extra,
  };
}

const worker = new Worker(
  AI_CAMPAIGN_QUEUE,
  async (job) => {
    const { customerId, tenantId } = job.data;

    await updateCampaignJob(job, {
      status: CampaignJobStatus.ACTIVE,
      startedAt: new Date(),
      attemptsMade: Number(job.attemptsMade || 0),
      errorMessage: null,
      result: null,
      metadata: workerRuntimeMetadata(),
    });

    const settings = await getAutomationSettings();
    if (!settings.enabled) {
      const result = { skipped: true, reason: "automation_disabled" };
      await updateCampaignJob(job, {
        status: CampaignJobStatus.SKIPPED,
        completedAt: new Date(),
        result,
        metadata: workerRuntimeMetadata(),
      });
      return result;
    }

    if (!isWithinWorkingHours(settings)) {
      throw new Error("outside_working_hours");
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayCalls = await prisma.callLog.count({
      where: {
        createdAt: { gte: todayStart },
        mode: "AI",
        ...(tenantId ? { tenantId } : {}),
      },
    });

    if (todayCalls >= settings.dailyCap) {
      const result = { skipped: true, reason: "daily_cap_reached" };
      await updateCampaignJob(job, {
        status: CampaignJobStatus.SKIPPED,
        completedAt: new Date(),
        result,
        metadata: workerRuntimeMetadata(),
      });
      return result;
    }

    const customer = await prisma.customer.findFirst({
      where: {
        id: customerId,
        ...(tenantId ? { tenantId } : {}),
      },
    });

    if (!customer) {
      const result = { skipped: true, reason: "customer_not_found" };
      await updateCampaignJob(job, {
        status: CampaignJobStatus.SKIPPED,
        completedAt: new Date(),
        result,
        metadata: workerRuntimeMetadata(),
      });
      return result;
    }

    if (!isEligibleForAutomation(customer, settings)) {
      const result = { skipped: true, reason: "not_eligible" };
      await updateCampaignJob(job, {
        status: CampaignJobStatus.SKIPPED,
        completedAt: new Date(),
        result,
        metadata: workerRuntimeMetadata(),
      });
      return result;
    }

    try {
      await runAICampaignForCustomer(customer);
      const result = { ok: true, customerId };
      await updateCampaignJob(job, {
        status: CampaignJobStatus.COMPLETED,
        completedAt: new Date(),
        result,
        metadata: workerRuntimeMetadata(),
      });
      return result;
    } catch (error) {
      await scheduleRetryForFailure({
        customerId,
        tenantId: customer?.tenantId || tenantId || null,
        failureCode: "failed",
        errorMessage: error?.message || "worker_failure",
      });

      await updateCampaignJob(job, {
        status: CampaignJobStatus.FAILED,
        failedAt: new Date(),
        errorMessage: String(error?.message || "worker_failure"),
        result: {
          ok: false,
          customerId,
          reason: "worker_failure",
        },
        metadata: workerRuntimeMetadata(),
      });

      throw error;
    }
  },
  {
    connection: queueConnection,
    concurrency: Number(process.env.AI_CAMPAIGN_WORKER_CONCURRENCY || 5),
  }
);

async function writeWorkerHeartbeat() {
  await prisma.automationSetting.upsert({
    where: { key: WORKER_HEARTBEAT_KEY },
    create: {
      key: WORKER_HEARTBEAT_KEY,
      value: {
        lastHeartbeatAt: new Date().toISOString(),
        pid: process.pid,
        host: os.hostname(),
      },
    },
    update: {
      value: {
        lastHeartbeatAt: new Date().toISOString(),
        pid: process.pid,
        host: os.hostname(),
      },
    },
  });
}

writeWorkerHeartbeat().catch(() => {});
const heartbeatInterval = setInterval(() => {
  writeWorkerHeartbeat().catch(() => {});
}, 15000);

heartbeatInterval.unref();

worker.on("completed", (job) => {
  console.log(`[ai-campaign-worker] completed job ${job.id}`);
});

worker.on("failed", (job, err) => {
  console.error(`[ai-campaign-worker] failed job ${job?.id}:`, err?.message || err);
});

worker.on("closed", () => {
  clearInterval(heartbeatInterval);
});

console.log("[ai-campaign-worker] started");
