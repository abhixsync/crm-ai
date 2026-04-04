import { requireSession, getTenantContext } from "@/lib/server/auth-guard";
import { prisma } from "@/lib/prisma";
import { verifyDomainCname } from "@/lib/tenant/domain";

export async function POST(request) {
  const { session, error } = await requireSession();
  if (error) return error;
  const { tenantId } = getTenantContext(session, request);
  if (!["ADMIN", "SUPER_ADMIN"].includes(session.user.role)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant?.customDomain) {
    return Response.json({ error: "No custom domain configured." }, { status: 400 });
  }

  const verified = await verifyDomainCname(tenant.customDomain);

  if (verified && !tenant.customDomainVerified) {
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { customDomainVerified: true },
    });
  }

  return Response.json({ verified, domain: tenant.customDomain });
}
