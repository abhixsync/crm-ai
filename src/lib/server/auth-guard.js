import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function requireSession() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return { error: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  return { session };
}

export function hasRole(session, roles) {
  const role = session?.user?.role;
  if (role === "SUPER_ADMIN") {
    return true;
  }
  return roles.includes(role);
}

export function getTenantContext(session, request = null) {
  const role = session?.user?.role;
  let tenantId = session?.user?.tenantId || null;
  const isSuperAdmin = role === "SUPER_ADMIN";

  // For SUPER_ADMIN with no session tenant: read X-Tenant-ID (tenant switcher)
  if (isSuperAdmin && !tenantId && request) {
    const headerTenantId =
      request.headers?.get?.("X-Tenant-ID") ||
      request.headers?.get?.("x-tenant-id");
    if (headerTenantId) tenantId = headerTenantId;
  }

  // For regular users: x-resolved-tenant-id is injected by middleware
  if (!isSuperAdmin && !tenantId && request) {
    const resolved = request.headers?.get?.("x-resolved-tenant-id");
    if (resolved) tenantId = resolved;
  }

  if (!isSuperAdmin && !tenantId) {
    throw new Error("Tenant context missing for non-super admin user.");
  }

  return { tenantId, isSuperAdmin };
}