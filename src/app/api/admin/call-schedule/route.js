import { prisma } from "@/lib/prisma";
import { requireSession, hasRole, getTenantContext } from "@/lib/server/auth-guard";
import { databaseUnavailableResponse, isDatabaseUnavailable } from "@/lib/server/database-error";

async function requireAdminSession() {
  const auth = await requireSession();
  if (auth.error) return auth;
  if (!hasRole(auth.session, ["ADMIN", "SUPER_ADMIN"])) {
    return { error: Response.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return auth;
}

export async function GET() {
  const auth = await requireAdminSession();
  if (auth.error) return auth.error;

  const tenant = getTenantContext(auth.session);
  if (!tenant.tenantId) {
    return Response.json({ config: null });
  }

  try {
    const config = await prisma.callScheduleConfig.findUnique({
      where: { tenantId: tenant.tenantId },
    });
    return Response.json({ config });
  } catch (error) {
    if (isDatabaseUnavailable(error)) return databaseUnavailableResponse();
    throw error;
  }
}

export async function PUT(request) {
  const auth = await requireAdminSession();
  if (auth.error) return auth.error;

  const tenant = getTenantContext(auth.session);
  if (!tenant.tenantId) {
    return Response.json({ error: "SUPER_ADMIN must select a tenant" }, { status: 400 });
  }

  const body = await request.json();

  const data = {
    timezone: String(body.timezone || "Asia/Kolkata").trim(),
    callWindowStart: String(body.callWindowStart || "09:00").trim(),
    callWindowEnd: String(body.callWindowEnd || "18:00").trim(),
    allowedDays: Array.isArray(body.allowedDays) ? body.allowedDays.map(Number).filter(d => d >= 0 && d <= 6) : [1,2,3,4,5,6],
    maxCallsPerDay: Math.max(1, Math.min(5000, Number(body.maxCallsPerDay) || 200)),
    maxRetries: Math.max(0, Math.min(10, Number(body.maxRetries) || 3)),
    retryIntervalHours: Math.max(1, Math.min(168, Number(body.retryIntervalHours) || 24)),
    minCallGapMins: Math.max(5, Math.min(480, Number(body.minCallGapMins) || 30)),
  };

  try {
    const config = await prisma.callScheduleConfig.upsert({
      where: { tenantId: tenant.tenantId },
      update: data,
      create: { tenantId: tenant.tenantId, ...data },
    });
    return Response.json({ config });
  } catch (error) {
    if (isDatabaseUnavailable(error)) return databaseUnavailableResponse();
    throw error;
  }
}
