import { prisma } from "@/lib/prisma";
import {
  getAutomationSettings,
  isWithinWorkingHours,
  resolveAutomationExecutionMode,
} from "@/lib/journey/automation-settings";
import { enqueueCustomerIfEligible } from "@/lib/journey/enqueue-service";
import { CampaignJobStatus } from "@prisma/client";
import { runAICampaignForCustomer } from "@/lib/journey/ai-campaign-service";
import { scheduleRetryForFailure } from "@/lib/journey/retry-policy";

async function runCustomerInCronMode(customer, reason) {
  const queueJobId = `ai-campaign-cron-${customer.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  await prisma.campaignJob.create({
    data: {
      queueJobId,
      customerId: customer.id,
      reason,
      status: CampaignJobStatus.ACTIVE,
      enqueuedAt: new Date(),
      startedAt: new Date(),
      metadata: {
        source: "cron_runner",
      },
    },
  });

  try {
    await runAICampaignForCustomer(customer);

    await prisma.campaignJob.update({
      where: { queueJobId },
      data: {
        status: CampaignJobStatus.COMPLETED,
        completedAt: new Date(),
        result: {
          ok: true,
          mode: "CRON",
        },
      },
    });

    return { queued: true, jobId: queueJobId };
  } catch (error) {
    await scheduleRetryForFailure({
      customerId: customer.id,
      failureCode: "failed",
      errorMessage: error?.message || "cron_failure",
    });

    await prisma.campaignJob.update({
      where: { queueJobId },
      data: {
        status: CampaignJobStatus.FAILED,
        failedAt: new Date(),
        errorMessage: String(error?.message || "cron_failure"),
        result: {
          ok: false,
          mode: "CRON",
          reason: "cron_failure",
        },
      },
    });

    return { queued: false, jobId: queueJobId };
  }
}

export async function runAutomationBatch() {
  const settings = await getAutomationSettings();
  const executionMode = resolveAutomationExecutionMode(settings);

  if (!settings.enabled) {
    return { ok: false, status: 400, error: "AI automation is disabled." };
  }

  if (!isWithinWorkingHours(settings)) {
    return { ok: false, status: 400, error: "Outside configured working hours." };
  }

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const todayAICalls = await prisma.callLog.count({
    where: {
      mode: "AI",
      createdAt: { gte: todayStart },
    },
  });

  const remainingCap = Math.max(0, settings.dailyCap - todayAICalls);

  if (remainingCap <= 0) {
    return { ok: false, status: 400, error: "Daily AI call cap reached." };
  }

  const batchLimit = Math.min(settings.batchSize, remainingCap);

  const customers = await prisma.customer.findMany({
    where: {
      archivedAt: null,
      inActiveCall: false,
      status: {
        in: settings.eligibleStatuses,
      },
      retryCount: {
        lt: settings.maxRetries,
      },
    },
    orderBy: [{ nextFollowUpAt: "asc" }, { createdAt: "asc" }],
    take: batchLimit,
  });

  let queued = 0;
  const queuedJobs = [];

  for (const customer of customers) {
    const result =
      executionMode === "WORKER"
        ? await enqueueCustomerIfEligible(customer.id, "bulk_campaign")
        : await runCustomerInCronMode(customer, "bulk_campaign");

    if (result.queued) {
      queued += 1;
      queuedJobs.push({
        customerId: customer.id,
        jobId: result.jobId,
      });
    }
  }

  return {
    ok: true,
    status: 200,
    data: {
      queued,
      queuedJobs,
      attempted: customers.length,
      executionMode,
      dailyCap: settings.dailyCap,
      usedToday: todayAICalls,
      remainingCap: Math.max(0, settings.dailyCap - todayAICalls - queued),
    },
  };
}
