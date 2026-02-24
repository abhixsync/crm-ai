import { prisma } from "@/lib/prisma";
import { getAutomationSettings } from "@/lib/journey/automation-settings";
import { isEligibleForAutomation } from "@/lib/journey/campaign-eligibility";
import { enqueueAICampaignJob } from "@/lib/queue/ai-campaign-queue";
import { applyCustomerTransition } from "@/lib/journey/transition-service";
import { CustomerStatus } from "@prisma/client";

export async function enqueueCustomerIfEligible(customerId, reason = "new_customer") {
  const [settings, customer] = await Promise.all([
    getAutomationSettings(),
    prisma.customer.findUnique({ where: { id: customerId } }),
  ]);

  if (!isEligibleForAutomation(customer, settings)) {
    return { queued: false, reason: "not_eligible" };
  }

  const queueResult = await enqueueAICampaignJob({ customerId, reason });

  if (!queueResult?.queued) {
    return { queued: false, reason: queueResult?.reason || "queue_unavailable" };
  }

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
