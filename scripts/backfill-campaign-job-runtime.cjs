const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

function detectRuntime(job) {
  const explicit = String(job?.metadata?.executionRuntime || "").trim().toUpperCase();
  if (explicit === "WORKER" || explicit === "CRON") {
    return explicit;
  }

  const source = String(job?.metadata?.source || "").trim().toLowerCase();
  if (source.includes("cron")) return "CRON";
  if (source.includes("worker") || source.includes("enqueue-service")) return "WORKER";

  const resultMode = String(job?.result?.mode || "").trim().toUpperCase();
  if (resultMode === "WORKER" || resultMode === "CRON") {
    return resultMode;
  }

  const queueJobId = String(job?.queueJobId || "").trim().toLowerCase();
  if (queueJobId.startsWith("ai-campaign-cron-")) return "CRON";
  if (queueJobId.startsWith("ai-campaign-")) return "WORKER";

  return "UNKNOWN";
}

async function main() {
  const BATCH_SIZE = 500;
  let cursor = null;

  let scanned = 0;
  let updated = 0;
  let cronMarked = 0;
  let workerMarked = 0;
  let unknown = 0;

  while (true) {
    const jobs = await prisma.campaignJob.findMany({
      orderBy: { createdAt: "asc" },
      take: BATCH_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        queueJobId: true,
        metadata: true,
        result: true,
      },
    });

    if (jobs.length === 0) break;

    for (const job of jobs) {
      scanned += 1;

      const currentRuntime = String(job?.metadata?.executionRuntime || "")
        .trim()
        .toUpperCase();
      if (currentRuntime === "WORKER" || currentRuntime === "CRON") {
        continue;
      }

      const runtime = detectRuntime(job);
      if (runtime === "UNKNOWN") {
        unknown += 1;
        continue;
      }

      const currentMeta = job?.metadata && typeof job.metadata === "object" ? job.metadata : {};
      const nextMeta = {
        ...currentMeta,
        executionRuntime: runtime,
      };

      await prisma.campaignJob.update({
        where: { id: job.id },
        data: { metadata: nextMeta },
      });

      updated += 1;
      if (runtime === "CRON") cronMarked += 1;
      if (runtime === "WORKER") workerMarked += 1;
    }

    cursor = jobs[jobs.length - 1].id;
  }

  console.log("[backfill-campaign-job-runtime] Completed");
  console.log(`  scanned: ${scanned}`);
  console.log(`  updated: ${updated}`);
  console.log(`  marked CRON: ${cronMarked}`);
  console.log(`  marked WORKER: ${workerMarked}`);
  console.log(`  still UNKNOWN: ${unknown}`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error("[backfill-campaign-job-runtime] Failed:", error?.message || error);
    await prisma.$disconnect();
    process.exit(1);
  });
