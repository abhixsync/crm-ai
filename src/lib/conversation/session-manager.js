import { prisma } from "@/lib/prisma";

const SESSION_TTL_DAYS = 7;

/**
 * Get or create a conversation session for a customer.
 * Sessions persist cross-call context (extracted data, summaries) for up to 7 days.
 */
export async function getOrCreateSession(tenantId, customerId) {
  if (!tenantId || !customerId) return null;

  const sessionKey = `${tenantId}:${customerId}`;

  try {
    // Look for active session
    const existing = await prisma.conversationSession.findFirst({
      where: {
        tenantId,
        customerId,
        sessionKey,
        expiresAt: { gt: new Date() },
      },
      orderBy: { updatedAt: "desc" },
    });

    if (existing) return existing;

    // Create new session
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + SESSION_TTL_DAYS);

    return await prisma.conversationSession.create({
      data: {
        tenantId,
        customerId,
        sessionKey,
        context: {},
        turnCount: 0,
        expiresAt,
      },
    });
  } catch (error) {
    console.warn("[session-manager] Failed to get/create session:", error.message);
    return null;
  }
}

/**
 * Update session after a call completes.
 */
export async function updateSessionAfterCall(sessionId, { callLogId, turnCount, summary, extractedData }) {
  if (!sessionId) return null;

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + SESSION_TTL_DAYS);

  try {
    const session = await prisma.conversationSession.findUnique({
      where: { id: sessionId },
    });

    // Merge extracted data with existing context
    const existingContext = (session?.context && typeof session.context === "object") ? session.context : {};
    const existingExtracted = existingContext.extractedData || {};
    const mergedExtracted = { ...existingExtracted };

    // Only overwrite with non-null values
    if (extractedData && typeof extractedData === "object") {
      for (const [key, value] of Object.entries(extractedData)) {
        if (value != null) {
          mergedExtracted[key] = value;
        }
      }
    }

    return await prisma.conversationSession.update({
      where: { id: sessionId },
      data: {
        lastCallId: callLogId || undefined,
        turnCount: turnCount || undefined,
        summary: summary || undefined,
        context: {
          ...existingContext,
          extractedData: mergedExtracted,
          lastUpdated: new Date().toISOString(),
        },
        expiresAt,
      },
    });
  } catch (error) {
    console.warn("[session-manager] Failed to update session:", error.message);
    return null;
  }
}

/**
 * Get session context for injecting into AI prompts.
 * Returns { previousCallSummary, extractedData, lastStage } or empty object.
 */
export async function getSessionContext(tenantId, customerId) {
  if (!tenantId || !customerId) return {};

  try {
    const session = await prisma.conversationSession.findFirst({
      where: {
        tenantId,
        customerId,
        expiresAt: { gt: new Date() },
      },
      orderBy: { updatedAt: "desc" },
    });

    if (!session) return {};

    const context = (session.context && typeof session.context === "object") ? session.context : {};

    return {
      sessionId: session.id,
      previousCallSummary: session.summary || null,
      extractedData: context.extractedData || {},
      lastStage: context.lastStage || null,
      turnCount: session.turnCount || 0,
    };
  } catch (error) {
    console.warn("[session-manager] Failed to get session context:", error.message);
    return {};
  }
}
