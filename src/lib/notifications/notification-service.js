import { prisma } from "@/lib/prisma";

/**
 * Create a notification. Non-blocking — callers should fire-and-forget with .catch(() => {}).
 * userId=null means visible to all admins of the tenant.
 */
export async function createNotification(tenantId, { userId = null, type, title, body, link = null, metadata = null }) {
  return prisma.inAppNotification.create({
    data: { tenantId, userId, type, title, body, link, metadata },
  });
}

/**
 * Get notifications for a user or tenant-wide (userId=null shows tenant-wide ones).
 * Returns up to `limit` most recent, optionally filtered to unread only.
 */
export async function getNotifications(tenantId, userId, { limit = 30, unreadOnly = false } = {}) {
  return prisma.inAppNotification.findMany({
    where: {
      tenantId,
      OR: [{ userId }, { userId: null }],
      ...(unreadOnly ? { isRead: false } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function getUnreadCount(tenantId, userId) {
  return prisma.inAppNotification.count({
    where: { tenantId, OR: [{ userId }, { userId: null }], isRead: false },
  });
}

export async function markRead(id, tenantId) {
  return prisma.inAppNotification.updateMany({
    where: { id, tenantId },
    data: { isRead: true },
  });
}

export async function markAllRead(tenantId, userId) {
  return prisma.inAppNotification.updateMany({
    where: { tenantId, OR: [{ userId }, { userId: null }], isRead: false },
    data: { isRead: true },
  });
}
