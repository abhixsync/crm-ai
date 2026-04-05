import { requireSession, getTenantContext } from "@/lib/server/auth-guard";
import { prisma } from "@/lib/prisma";
import { isValidCustomDomain, addDomainToVercel, removeDomainFromVercel } from "@/lib/tenant/domain";

// GET — current domain status
export async function GET(request) {
  const { session, error } = await requireSession();
  if (error) return error;
  const { tenantId } = getTenantContext(session, request);

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { slug: true, customDomain: true, customDomainVerified: true, customDomainAddedAt: true },
  });
  return Response.json(tenant);
}

// POST — add/update custom domain
export async function POST(request) {
  const { session, error } = await requireSession();
  if (error) return error;
  const { tenantId } = getTenantContext(session, request);
  if (!["ADMIN", "SUPER_ADMIN"].includes(session.user.role)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { domain } = await request.json();
  if (!domain || !isValidCustomDomain(domain)) {
    return Response.json({ error: "Invalid domain format." }, { status: 400 });
  }

  // Check not already taken by another tenant
  const existing = await prisma.tenant.findFirst({
    where: { customDomain: domain, NOT: { id: tenantId } },
  });
  if (existing) {
    return Response.json({ error: "Domain already in use." }, { status: 409 });
  }

  try {
    await addDomainToVercel(domain);
  } catch (e) {
    if (!process.env.VERCEL_TOKEN) {
      console.warn("VERCEL_TOKEN not set — skipping Vercel domain registration");
    } else {
      return Response.json({ error: e.message }, { status: 502 });
    }
  }

  await prisma.tenant.update({
    where: { id: tenantId },
    data: { customDomain: domain, customDomainVerified: false, customDomainAddedAt: new Date() },
  });

  return Response.json({
    domain,
    verified: false,
    cname: "cname.vercel-dns.com",
  });
}

// DELETE — remove custom domain
export async function DELETE(request) {
  const { session, error } = await requireSession();
  if (error) return error;
  const { tenantId } = getTenantContext(session, request);
  if (!["ADMIN", "SUPER_ADMIN"].includes(session.user.role)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (tenant?.customDomain) {
    await removeDomainFromVercel(tenant.customDomain).catch(() => {});
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { customDomain: null, customDomainVerified: false, customDomainAddedAt: null },
    });
  }

  return Response.json({ ok: true });
}
