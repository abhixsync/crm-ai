import { Worker } from "bullmq";
import { prisma } from "@/lib/prisma";
import { AI_CAMPAIGN_QUEUE, queueConnection } from "@/lib/queue/ai-campaign-queue";
import { getAutomationSettings, isWithinWorkingHours } from "@/lib/journey/automation-settings";
import { isEligibleForAutomation } from "@/lib/journey/campaign-eligibility";
import { runAICampaignForCustomer } from "@/lib/journey/ai-campaign-service";
import { scheduleRetryForFailure } from "@/lib/journey/retry-policy";

const worker = new Worker(
  AI_CAMPAIGN_QUEUE,
  async (job) => {
    const { customerId } = job.data;

    const settings = await getAutomationSettings();
    if (!settings.enabled) {
      return { skipped: true, reason: "automation_disabled" };
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
      },
    });

    if (todayCalls >= settings.dailyCap) {
      return { skipped: true, reason: "daily_cap_reached" };
    }

    const customer = await prisma.customer.findUnique({ where: { id: customerId } });

    if (!customer) {
      return { skipped: true, reason: "customer_not_found" };
    }

    if (!isEligibleForAutomation(customer, settings)) {
      return { skipped: true, reason: "not_eligible" };
    }

    try {
      await runAICampaignForCustomer(customer);
      return { ok: true, customerId };
    } catch (error) {
      await scheduleRetryForFailure({
        customerId,
        failureCode: "failed",
        errorMessage: error?.message || "worker_failure",
      });
      throw error;
    }
  },
  {
    connection: queueConnection,
    concurrency: Number(process.env.AI_CAMPAIGN_WORKER_CONCURRENCY || 5),
  }
);

worker.on("completed", (job) => {
  console.log(`[ai-campaign-worker] completed job ${job.id}`);
});

worker.on("failed", (job, err) => {
  console.error(`[ai-campaign-worker] failed job ${job?.id}:`, err?.message || err);
});

console.log("[ai-campaign-worker] started");
