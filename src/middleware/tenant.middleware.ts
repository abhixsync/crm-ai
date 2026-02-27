import type { Session } from "next-auth";

type TenantAwareRequest = {
  tenantId?: string | null;
};

type TenantContext = {
  tenantId: string | null;
  isSuperAdmin: boolean;
};

export function resolveTenantContext(session: Session): TenantContext {
  const role = (session as any)?.user?.role;
  const tenantId = (session as any)?.user?.tenantId ?? null;
  const isSuperAdmin = role === "SUPER_ADMIN";

  if (!isSuperAdmin && !tenantId) {
    throw new Error("Tenant context missing for non-super admin user.");
  }

  return { tenantId, isSuperAdmin };
}

export function attachTenantToRequest<T extends TenantAwareRequest>(req: T, session: Session): T {
  const { tenantId } = resolveTenantContext(session);
  req.tenantId = tenantId;
  return req;
}

export function assertTenantMatch(contextTenantId: string | null, targetTenantId?: string | null) {
  if (!targetTenantId) return;
  if (!contextTenantId) return;

  if (contextTenantId !== targetTenantId) {
    throw new Error("Tenant mismatch. Cross-tenant access blocked.");
  }
}
