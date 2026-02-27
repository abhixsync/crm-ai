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

export function getTenantContext(session) {
  const role = session?.user?.role;
  const tenantId = session?.user?.tenantId || null;
  const isSuperAdmin = role === "SUPER_ADMIN";

  if (!isSuperAdmin && !tenantId) {
    throw new Error("Tenant context missing for non-super admin user.");
  }

  return {
    tenantId,
    isSuperAdmin,
  };
}