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
    
    const context = resolveTenantContext(auth.session);
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

    return Response.json({
      crmName: tenant?.crmName || null,
      tenantName: tenant?.name || null,
      tenantDisplayName: tenant?.name || null,
    });
  } catch (error: any) {
    return Response.json({ error: error?.message || "Unable to fetch settings." }, { status: 400 });
  }
}

export async function PUT(request: Request) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  if (!hasRole(auth.session, ["ADMIN", "SUPER_ADMIN"])) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const url = new URL(request.url);
    const tenantIdParam = url.searchParams.get('tenantId');
    
    const payload = await request.json();
    const crmName = payload?.crmName;
    const tenantDisplayName = payload?.tenantDisplayName;

    const context = resolveTenantContext(auth.session);
    let tenantId = context.tenantId;

    // Allow super admin to specify tenantId
    if (context.isSuperAdmin && tenantIdParam) {
      tenantId = tenantIdParam;
    }

    if (!tenantId) {
      return Response.json({ error: "Tenant context required." }, { status: 400 });
    }

    const updateData: { crmName?: string | null; name?: string } = {};

    if (crmName !== undefined) {
      updateData.crmName = String(crmName || "").trim() || null;
    }

    if (tenantDisplayName !== undefined) {
      const normalizedTenantDisplayName = String(tenantDisplayName || "").trim();
      if (!normalizedTenantDisplayName) {
        return Response.json({ error: "Tenant display name is required." }, { status: 400 });
      }
      updateData.name = normalizedTenantDisplayName;
    }

    if (Object.keys(updateData).length === 0) {
      return Response.json({ error: "No settings changes provided." }, { status: 400 });
    }

    await prisma.tenant.update({
      where: { id: tenantId },
      data: updateData,
    });

    return Response.json({ success: true });
  } catch (error: any) {
    return Response.json({ error: error?.message || "Unable to update settings." }, { status: 400 });
  }
}