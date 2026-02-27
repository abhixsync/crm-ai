import { requireSession } from "@/lib/server/auth-guard";
import { prisma } from "@/lib/prisma";
import { hasRole } from "@/lib/server/auth-guard";
import { assertTenantMatch, resolveTenantContext } from "@/middleware/tenant.middleware";

export async function GET(request: Request) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  try {
    const url = new URL(request.url);
    const tenantIdParam = url.searchParams.get('tenantId');
    
    const context = resolveTenantContext(auth.session as any);
    let tenantId = context.tenantId;

    // Allow super admin to specify tenantId
    if (context.isSuperAdmin && tenantIdParam) {
      tenantId = tenantIdParam;
    }

    if (!tenantId) {
      return Response.json({ error: "Tenant context required." }, { status: 400 });
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { crmName: true, name: true },
    });

    return Response.json({ crmName: tenant?.crmName || null, tenantName: tenant?.name || null });
  } catch (error: any) {
    return Response.json({ error: error?.message || "Unable to fetch settings." }, { status: 400 });
  }
}

export async function PUT(request: Request) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  if (!hasRole(auth.session as any, ["ADMIN", "SUPER_ADMIN"])) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const url = new URL(request.url);
    const tenantIdParam = url.searchParams.get('tenantId');
    
    const payload = await request.json();
    const { crmName } = payload;

    const context = resolveTenantContext(auth.session as any);
    let tenantId = context.tenantId;

    // Allow super admin to specify tenantId
    if (context.isSuperAdmin && tenantIdParam) {
      tenantId = tenantIdParam;
    }

    if (!tenantId) {
      return Response.json({ error: "Tenant context required." }, { status: 400 });
    }

    await prisma.tenant.update({
      where: { id: tenantId },
      data: { crmName: crmName || null },
    });

    return Response.json({ success: true });
  } catch (error: any) {
    return Response.json({ error: error?.message || "Unable to update settings." }, { status: 400 });
  }
}