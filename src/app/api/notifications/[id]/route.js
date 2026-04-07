import { requireSession } from "@/lib/server/auth-guard";
import { markRead } from "@/lib/notifications/notification-service";

export async function PATCH(request, { params }) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  const { tenantId } = auth.session.user;
  if (!tenantId) return Response.json({ error: "Tenant context required." }, { status: 400 });

  const { id } = params;
  await markRead(id, tenantId);
  return Response.json({ ok: true });
}
