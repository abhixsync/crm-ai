import { requireSession } from "@/lib/server/auth-guard";
import { getNotifications, getUnreadCount, markAllRead } from "@/lib/notifications/notification-service";

export async function GET(request) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  const { tenantId, id: userId } = auth.session.user;
  if (!tenantId) return Response.json({ notifications: [], unreadCount: 0 });

  const { searchParams } = new URL(request.url);
  const unreadOnly = searchParams.get("unread") === "1";
  const limitParam = Number(searchParams.get("limit") || 30);
  const limit = Number.isNaN(limitParam) || limitParam < 1 ? 30 : Math.min(limitParam, 50);

  const [notifications, unreadCount] = await Promise.all([
    getNotifications(tenantId, userId, { limit, unreadOnly }),
    getUnreadCount(tenantId, userId),
  ]);

  return Response.json({ notifications, unreadCount });
}

export async function POST(request) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  const { tenantId, id: userId } = auth.session.user;
  if (!tenantId) return Response.json({ ok: true });

  await markAllRead(tenantId, userId);
  return Response.json({ ok: true });
}
