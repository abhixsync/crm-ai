import { prisma } from "@/lib/prisma";
import { requireSession, hasRole, getTenantContext } from "@/lib/server/auth-guard";

export async function PATCH(request, { params }) {
  const auth = await requireSession();
  if (auth.error) return auth.error;
  if (!hasRole(auth.session, ["ADMIN", "SUPER_ADMIN"])) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const tenant = getTenantContext(auth.session, request);
  const tenantId = tenant.tenantId;
  const { id } = await params;

  const webhook = await prisma.webhookConfig.findFirst({ where: { id, tenantId } });
  if (!webhook) return Response.json({ error: "Not found" }, { status: 404 });

  const body = await request.json();
  const data = {};
  if (body.enabled !== undefined) data.enabled = Boolean(body.enabled);
  if (body.name !== undefined) data.name = body.name.trim();
  if (body.url !== undefined) data.url = body.url.trim();
  if (body.events !== undefined) data.events = body.events;
  if (body.secret !== undefined) data.secret = body.secret?.trim() || null;

  const updated = await prisma.webhookConfig.update({ where: { id }, data });
  return Response.json({ webhook: updated });
}

export async function DELETE(request, { params }) {
  const auth = await requireSession();
  if (auth.error) return auth.error;
  if (!hasRole(auth.session, ["ADMIN", "SUPER_ADMIN"])) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const tenant = getTenantContext(auth.session, request);
  const tenantId = tenant.tenantId;
  const { id } = await params;

  const result = await prisma.webhookConfig.deleteMany({ where: { id, tenantId } });
  if (result.count === 0) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ ok: true });
}
