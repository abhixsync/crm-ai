import { Queue } from "bullmq";
import net from "node:net";

const redisHost = process.env.REDIS_HOST || "127.0.0.1";
const redisPort = Number(process.env.REDIS_PORT || 6379);
const redisPassword = process.env.REDIS_PASSWORD || undefined;

export const queueConnection = {
  host: redisHost,
  port: redisPort,
  password: redisPassword,
};

export const AI_CAMPAIGN_QUEUE = "ai-campaign";

let queueInstance;
let redisDownUntil = 0;
const REDIS_COOLDOWN_MS = Number(process.env.REDIS_RETRY_COOLDOWN_MS || 30000);
const REDIS_CONNECT_TIMEOUT_MS = Number(process.env.REDIS_CONNECT_TIMEOUT_MS || 250);

function markRedisUnavailable() {
  redisDownUntil = Date.now() + REDIS_COOLDOWN_MS;
}

function isRedisCooldownActive() {
  return Date.now() < redisDownUntil;
}

async function canReachRedis() {
  if (isRedisCooldownActive()) {
    return false;
  }

  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;

    const finish = (reachable) => {
      if (settled) return;
      settled = true;
      socket.destroy();

      if (!reachable) {
        markRedisUnavailable();
      }

      resolve(reachable);
    };

    socket.setTimeout(REDIS_CONNECT_TIMEOUT_MS);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
    socket.connect(redisPort, redisHost);
  });
}

async function getQueue() {
  if (!queueInstance) {
    const reachable = await canReachRedis();

    if (!reachable) {
      return null;
    }

    queueInstance = new Queue(AI_CAMPAIGN_QUEUE, {
      connection: queueConnection,
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: 1000,
        removeOnFail: 1000,
      },
    });

    queueInstance.on("error", () => {
      markRedisUnavailable();
      queueInstance = undefined;
    });
  }

  return queueInstance;
}

export async function enqueueAICampaignJob({ customerId, reason = "automation", delayMs = 0 }) {
  const queue = await getQueue();

  if (!queue) {
    return { queued: false, reason: "redis_unavailable" };
  }

  try {
    const normalizedReason = String(reason || "automation")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "automation";

    const job = await queue.add(
      "customer-call",
      { customerId, reason },
      {
        delay: Math.max(0, Number(delayMs || 0)),
        jobId: `ai-campaign-${customerId}-${normalizedReason}-${Date.now()}`,
      }
    );

    return { queued: true, jobId: job.id };
  } catch (error) {
    const message = String(error?.message || "").toLowerCase();

    if (
      error?.code === "ECONNREFUSED" ||
      message.includes("econnrefused") ||
      message.includes("connect")
    ) {
      markRedisUnavailable();
      queueInstance = undefined;
      return { queued: false, reason: "redis_unavailable" };
    }

    throw error;
  }
}
