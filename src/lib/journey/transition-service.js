import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { isTerminalState, toIntentLabel } from "@/lib/journey/constants";

function createTransitionKey(payload) {
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export async function applyCustomerTransition({
  customerId,
  toStatus,
  reason,
  source,
  tenantId,
  metadata = {},
  callLogData,
  idempotencyScope,
}) {
  const transitionKey = createTransitionKey({
    customerId,
    toStatus,
    reason,
    source,
    idempotencyScope: idempotencyScope || metadata,
  });

  return prisma.$transaction(async (tx) => {
    const existingTransition = await tx.customerTransition.findUnique({
      where: { transitionKey },
    });

    if (existingTransition) {
      return { idempotent: true, transition: existingTransition };
    }

    const customer = await tx.customer.findFirst({
      where: {
        id: customerId,
        ...(tenantId ? { tenantId } : {}),
      },
    });

    if (!customer || customer.archivedAt) {
      throw new Error("Customer not found");
    }

    if (isTerminalState(customer.status) && customer.status !== toStatus) {
      return { idempotent: false, skipped: true, reason: "terminal_state" };
    }

    const updatedCustomer = await tx.customer.update({
      where: { id: customerId },
      data: {
        status: toStatus,
        retryCount:
          metadata.retryCount !== undefined ? Number(metadata.retryCount) : customer.retryCount,
        nextFollowUpAt:
          metadata.nextFollowUpAt !== undefined ? metadata.nextFollowUpAt : customer.nextFollowUpAt,
        inActiveCall:
          metadata.inActiveCall !== undefined ? Boolean(metadata.inActiveCall) : customer.inActiveCall,
        lastContactedAt:
          metadata.lastContactedAt !== undefined ? metadata.lastContactedAt : customer.lastContactedAt,
        aiSummary:
          metadata.aiSummary !== undefined ? String(metadata.aiSummary || "") : customer.aiSummary,
        aiIntent:
          metadata.aiIntent !== undefined ? toIntentLabel(metadata.aiIntent) : customer.aiIntent,
        manualReview:
          metadata.manualReview !== undefined ? Boolean(metadata.manualReview) : customer.manualReview,
      },
    });

    const transition = await tx.customerTransition.create({
      data: {
        customerId,
        fromStatus: customer.status,
        toStatus,
        reason: reason || null,
        source,
        transitionKey,
        metadata,
      },
    });

    if (callLogData) {
      await tx.callLog.create({
        data: {
          customerId,
          tenantId: customer.tenantId,
          ...callLogData,
        },
      });
    }

    return { idempotent: false, transition, customer: updatedCustomer };
  });
}
