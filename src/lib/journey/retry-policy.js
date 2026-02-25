import { CustomerStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { RETRYABLE_FAILURE_CODES } from "@/lib/journey/constants";
import { getAutomationSettings, resolveAutomationExecutionMode } from "@/lib/journey/automation-settings";
import { applyCustomerTransition } from "@/lib/journey/transition-service";
import { enqueueAICampaignJob } from "@/lib/queue/ai-campaign-queue";

export function calculateBackoffMs(retryCount) {
  const baseMs = 60 * 1000;
  const delay = 2 ** Math.max(1, retryCount) * baseMs;
  return Math.min(delay, 4 * 60 * 60 * 1000);
}

export async function scheduleRetryForFailure({ customerId, failureCode, errorMessage }) {
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });

  if (!customer || customer.archivedAt) {
    return { scheduled: false, reason: "customer_not_found" };
  }

  const normalizedFailure = String(failureCode || "failed").toLowerCase();

  if (!RETRYABLE_FAILURE_CODES.has(normalizedFailure)) {
    await applyCustomerTransition({
      customerId,
      toStatus: CustomerStatus.CALL_FAILED,
      reason: `Non-retryable failure: ${normalizedFailure}`,
      source: "AI_AUTOMATION",
      metadata: {
        inActiveCall: false,
        lastContactedAt: new Date(),
      },
      callLogData: {
        mode: "AI",
        status: "FAILED",
        errorReason: errorMessage || normalizedFailure,
      },
      idempotencyScope: { normalizedFailure, errorMessage, terminal: true },
    });

    return { scheduled: false, reason: "non_retryable" };
  }

  const settings = await getAutomationSettings();
  const nextRetryCount = customer.retryCount + 1;

  if (nextRetryCount >= settings.maxRetries) {
    await applyCustomerTransition({
      customerId,
      toStatus: CustomerStatus.CALL_FAILED,
      reason: "Max retries reached",
      source: "AI_AUTOMATION",
      metadata: {
        retryCount: nextRetryCount,
        inActiveCall: false,
        manualReview: true,
        lastContactedAt: new Date(),
      },
      callLogData: {
        mode: "AI",
        status: "FAILED",
        errorReason: errorMessage || normalizedFailure,
        attemptNumber: nextRetryCount,
      },
      idempotencyScope: { normalizedFailure, errorMessage, maxed: true, nextRetryCount },
    });

    return { scheduled: false, reason: "max_retries_reached", retryCount: nextRetryCount };
  }

  const delayMs = calculateBackoffMs(nextRetryCount);
  const nextFollowUpAt = new Date(Date.now() + delayMs);

  await applyCustomerTransition({
    customerId,
    toStatus: CustomerStatus.RETRY_SCHEDULED,
    reason: `Retry scheduled due to ${normalizedFailure}`,
    source: "AI_AUTOMATION",
    metadata: {
      retryCount: nextRetryCount,
      nextFollowUpAt,
      inActiveCall: false,
      lastContactedAt: new Date(),
    },
    idempotencyScope: { normalizedFailure, nextRetryCount, nextFollowUpAt: nextFollowUpAt.toISOString() },
  });

  const executionMode = resolveAutomationExecutionMode(settings);
  if (executionMode !== "WORKER") {
    return {
      scheduled: true,
      retryCount: nextRetryCount,
      delayMs,
      nextFollowUpAt,
      mode: "CRON",
    };
  }

  const queueResult = await enqueueAICampaignJob({
    customerId,
    reason: "retry",
    delayMs,
  });

  if (!queueResult?.queued) {
    return {
      scheduled: false,
      reason: queueResult?.reason || "queue_unavailable",
      retryCount: nextRetryCount,
      delayMs,
      nextFollowUpAt,
    };
  }

  await applyCustomerTransition({
    customerId,
    toStatus: CustomerStatus.CALL_PENDING,
    reason: "Queued after retry schedule",
    source: "AI_AUTOMATION",
    metadata: {
      retryCount: nextRetryCount,
      nextFollowUpAt,
      inActiveCall: false,
    },
    idempotencyScope: { toPendingAfterRetry: true, nextRetryCount, nextFollowUpAt: nextFollowUpAt.toISOString() },
  });

  return {
    scheduled: true,
    retryCount: nextRetryCount,
    delayMs,
    nextFollowUpAt,
  };
}
