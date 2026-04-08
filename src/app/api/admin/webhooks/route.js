import { prisma } from "@/lib/prisma";
import { requireSession, hasRole, getTenantContext } from "@/lib/server/auth-guard";

export async function GET(request) {
  const auth = await requireSession();
  if (auth.error) return auth.error;
  if (!hasRole(auth.session, ["ADMIN", "SUPER_ADMIN"])) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const tenant = getTenantContext(auth.session, request);
  const tenantId = tenant.tenantId;
  if (!tenantId) return Response.json({ error: "Tenant context required." }, { status: 400 });

  const webhooks = await prisma.webhookConfig.findMany({
    where: { tenantId },
    include: {
      logs: {
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { id: true, event: true, success: true, statusCode: true, createdAt: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return Response.json({ webhooks });
}

export async function POST(request) {
  const auth = await requireSession();
  if (auth.error) return auth.error;
  if (!hasRole(auth.session, ["ADMIN", "SUPER_ADMIN"])) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const tenant = getTenantContext(auth.session, request);
  const tenantId = tenant.tenantId;
  if (!tenantId) return Response.json({ error: "Tenant context required." }, { status: 400 });

  const body = await request.json();
  const { name, url, events, secret } = body;

  if (!name?.trim() || !url?.trim()) {
    return Response.json({ error: "name and url are required" }, { status: 400 });
  }
  if (!Array.isArray(events) || events.length === 0) {
    return Response.json({ error: "Select at least one event" }, { status: 400 });
  }

  try {
    new URL(url);
  } catch {
    return Response.json({ error: "Invalid URL" }, { status: 400 });
  }

  const webhook = await prisma.webhookConfig.create({
    data: {
      tenantId,
      createdById: auth.session.user.id,
      name: name.trim(),
      url: url.trim(),
      events,
      secret: secret?.trim() || null,
    },
  });

  return Response.json({ webhook });
}
