import { prisma } from "@/lib/prisma";
import { getAutomationSettings, isWithinWorkingHours } from "@/lib/journey/automation-settings";
import { enqueueCustomerIfEligible } from "@/lib/journey/enqueue-service";

export async function runAutomationBatch() {
  const settings = await getAutomationSettings();

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
    const result = await enqueueCustomerIfEligible(customer.id, "bulk_campaign");
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
      dailyCap: settings.dailyCap,
      usedToday: todayAICalls,
      remainingCap: Math.max(0, settings.dailyCap - todayAICalls - queued),
    },
  };
}
