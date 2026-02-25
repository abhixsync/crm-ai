import { prisma } from "@/lib/prisma";
import { getAutomationSettings, resolveAutomationExecutionMode } from "@/lib/journey/automation-settings";
import { isEligibleForAutomation } from "@/lib/journey/campaign-eligibility";
import { enqueueAICampaignJob } from "@/lib/queue/ai-campaign-queue";
import { applyCustomerTransition } from "@/lib/journey/transition-service";
import { CampaignJobStatus, CustomerStatus } from "@prisma/client";

export async function enqueueCustomerIfEligible(customerId, reason = "new_customer") {
  const [settings, customer] = await Promise.all([
    getAutomationSettings(),
    prisma.customer.findUnique({ where: { id: customerId } }),
  ]);

  if (!isEligibleForAutomation(customer, settings)) {
    return { queued: false, reason: "not_eligible" };
  }

  const executionMode = resolveAutomationExecutionMode(settings);
  if (executionMode !== "WORKER") {
    return { queued: false, reason: "execution_mode_cron" };
  }

  const queueResult = await enqueueAICampaignJob({ customerId, reason });

  if (!queueResult?.queued) {
    return { queued: false, reason: queueResult?.reason || "queue_unavailable" };
  }

  await prisma.campaignJob.upsert({
    where: { queueJobId: String(queueResult.jobId) },
    update: {
      customerId,
      reason,
      status: CampaignJobStatus.QUEUED,
      enqueuedAt: new Date(),
      errorMessage: null,
      result: null,
      failedAt: null,
      completedAt: null,
      startedAt: null,
      metadata: {
        source: "enqueue-service",
        executionRuntime: "WORKER",
      },
    },
    create: {
      queueJobId: String(queueResult.jobId),
      customerId,
      reason,
      status: CampaignJobStatus.QUEUED,
      enqueuedAt: new Date(),
      metadata: {
        source: "enqueue-service",
        executionRuntime: "WORKER",
      },
    },
  });

  await applyCustomerTransition({
    customerId,
    toStatus: CustomerStatus.CALL_PENDING,
    reason: "Customer auto-enqueued for AI campaign",
    source: "SYSTEM",
    metadata: {
      inActiveCall: false,
    },
    idempotencyScope: { reason, enqueue: true, customerId },
  });

  return { queued: true, jobId: queueResult.jobId };
}
