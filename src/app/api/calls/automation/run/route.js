import { prisma } from "@/lib/prisma";
import { hasRole, requireSession } from "@/lib/server/auth-guard";
import { getAutomationSettings, isWithinWorkingHours } from "@/lib/journey/automation-settings";
import { enqueueCustomerIfEligible } from "@/lib/journey/enqueue-service";

export async function POST() {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  if (!hasRole(auth.session, ["SUPER_ADMIN"])) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const settings = await getAutomationSettings();

  if (!settings.enabled) {
    return Response.json({ error: "AI automation is disabled." }, { status: 400 });
  }

  if (!isWithinWorkingHours(settings)) {
    return Response.json({ error: "Outside configured working hours." }, { status: 400 });
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
    return Response.json({ error: "Daily AI call cap reached." }, { status: 400 });
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

  return Response.json({
    queued,
    queuedJobs,
    attempted: customers.length,
    dailyCap: settings.dailyCap,
    usedToday: todayAICalls,
    remainingCap: Math.max(0, settings.dailyCap - todayAICalls - queued),
  });
}
