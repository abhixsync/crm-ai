import { describe, expect, it } from "vitest";
import { assertTenantMatch, resolveTenantContext } from "@/middleware/tenant.middleware";

describe("tenant.middleware", () => {
  it("resolves tenant context for tenant scoped user", () => {
    const ctx = resolveTenantContext({ user: { role: "ADMIN", tenantId: "t1" } } as any);
    expect(ctx).toEqual({ tenantId: "t1", isSuperAdmin: false });
  });

  it("throws for non-super-admin without tenantId", () => {
    expect(() => resolveTenantContext({ user: { role: "ADMIN", tenantId: null } } as any)).toThrow();
  });

  it("blocks mismatched tenant access", () => {
    expect(() => assertTenantMatch("tenant-a", "tenant-b")).toThrow("Tenant mismatch");
  });
});
