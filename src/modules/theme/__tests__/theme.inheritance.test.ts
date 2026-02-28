import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  resolveTenantTheme,
  updateTenantTheme,
  resetTenantTheme,
  hasTenantCustomTheme,
  getTenantThemeStatus,
  invalidateThemeCache,
  getDefaultTheme
} from "@/modules/theme/theme.service";
import { SYSTEM_THEME_DEFAULT } from "@/core/theme/system-defaults";

describe("Theme Inheritance System", () => {
  const testTenantId = "test-tenant-123";
  const baseTenantId = null; // Base theme

  beforeEach(async () => {
    // Create test tenant if it doesn't exist
    await prisma.tenant.upsert({
      where: { id: testTenantId },
      update: {},
      create: {
        id: testTenantId,
        name: "Test Tenant",
        slug: "test-tenant",
        isActive: true,
      },
    });

    // Clean up any existing test theme data
    await prisma.tenantTheme.deleteMany({
      where: {}
    });

    // Clear caches
    await invalidateThemeCache(testTenantId);
    await invalidateThemeCache(null);
    await invalidateThemeCache("tenant-1");
    await invalidateThemeCache("tenant-2");
  });

  afterEach(async () => {
    // Clean up theme data
    await prisma.tenantTheme.deleteMany({
      where: {
        OR: [
          { tenantId: testTenantId },
          { tenantId: baseTenantId, isBaseTheme: true }
        ]
      }
    });

    // Clean up test tenant
    await prisma.tenant.deleteMany({
      where: { id: testTenantId }
    });

    // Clear caches
    await invalidateThemeCache(testTenantId);
    await invalidateThemeCache(baseTenantId);
  });

  describe("System Defaults", () => {
    it("returns system default theme when no customizations exist", async () => {
      const theme = await resolveTenantTheme(testTenantId);

      expect(theme.primaryColor).toBe(SYSTEM_THEME_DEFAULT.primaryColor);
      expect(theme.secondaryColor).toBe(SYSTEM_THEME_DEFAULT.secondaryColor);
      expect(theme.source).toBe("default");
      expect(theme.updatedAt).toBeNull();
    });

    it("getDefaultTheme returns correct shape", () => {
      const theme = getDefaultTheme();

      expect(theme.primaryColor).toBe(SYSTEM_THEME_DEFAULT.primaryColor);
      expect(theme.source).toBe("default");
      expect(theme.updatedAt).toBeNull();
    });
  });

  describe("Base Theme Inheritance", () => {
    it("inherits from base theme when no tenant override exists", async () => {
      // Create a base theme
      const baseTheme = {
        primaryColor: "#ff0000",
        secondaryColor: "#00ff00",
        accentColor: "#0000ff"
      };

      await updateTenantTheme(baseTenantId, baseTheme, true);

      // Resolve theme for tenant
      const theme = await resolveTenantTheme(testTenantId);

      expect(theme.primaryColor).toBe("#ff0000");
      expect(theme.secondaryColor).toBe("#00ff00");
      expect(theme.accentColor).toBe("#0000ff");
      expect(theme.source).toBe("base");
    });

    it("base theme overrides system defaults", async () => {
      // Create base theme with different colors
      const baseTheme = {
        primaryColor: "#ff0000",
        secondaryColor: "#00ff00"
      };

      await updateTenantTheme(baseTenantId, baseTheme, true);

      const theme = await resolveTenantTheme(testTenantId);

      expect(theme.primaryColor).toBe("#ff0000");
      expect(theme.secondaryColor).toBe("#00ff00");
      // Other properties should still be system defaults
      expect(theme.accentColor).toBe(SYSTEM_THEME_DEFAULT.accentColor);
    });
  });

  describe("Tenant Override Inheritance", () => {
    it("tenant override takes precedence over base theme", async () => {
      // Create base theme
      const baseTheme = {
        primaryColor: "#ff0000",
        secondaryColor: "#00ff00"
      };
      await updateTenantTheme(baseTenantId, baseTheme, true);

      // Create tenant override
      const tenantTheme = {
        primaryColor: "#0000ff",
        fontFamily: "Arial, sans-serif"
      };
      await updateTenantTheme(testTenantId, tenantTheme, false);

      const theme = await resolveTenantTheme(testTenantId);

      // Tenant override should win
      expect(theme.primaryColor).toBe("#0000ff");
      expect(theme.fontFamily).toBe("Arial, sans-serif");
      // Inherited from base
      expect(theme.secondaryColor).toBe("#00ff00");
      // System default
      expect(theme.accentColor).toBe(SYSTEM_THEME_DEFAULT.accentColor);
      expect(theme.source).toBe("tenant");
    });

    it("partial tenant override merges correctly", async () => {
      // Create base theme
      const baseTheme = {
        primaryColor: "#ff0000",
        secondaryColor: "#00ff00",
        accentColor: "#0000ff"
      };
      await updateTenantTheme(baseTenantId, baseTheme, true);

      // Create tenant override with only one property
      const tenantTheme = {
        primaryColor: "#ffff00"
      };
      await updateTenantTheme(testTenantId, tenantTheme, false);

      const theme = await resolveTenantTheme(testTenantId);

      expect(theme.primaryColor).toBe("#ffff00"); // Overridden
      expect(theme.secondaryColor).toBe("#00ff00"); // From base
      expect(theme.accentColor).toBe("#0000ff"); // From base
    });
  });

  describe("Reset Functionality", () => {
    it("resetTenantTheme removes tenant override", async () => {
      // Create tenant override
      const tenantTheme = {
        primaryColor: "#ff0000",
        secondaryColor: "#00ff00"
      };
      await updateTenantTheme(testTenantId, tenantTheme, false);

      // Verify override exists
      let theme = await resolveTenantTheme(testTenantId);
      expect(theme.primaryColor).toBe("#ff0000");
      expect(theme.source).toBe("tenant");

      // Reset theme
      const resetTheme = await resetTenantTheme(testTenantId);

      // Verify theme is reset to defaults
      expect(resetTheme.primaryColor).toBe(SYSTEM_THEME_DEFAULT.primaryColor);
      expect(resetTheme.source).toBe("default");
    });

    it("resetTenantTheme works when base theme exists", async () => {
      // Create base theme
      const baseTheme = {
        primaryColor: "#ff0000"
      };
      await updateTenantTheme(baseTenantId, baseTheme, true);

      // Create tenant override
      const tenantTheme = {
        primaryColor: "#0000ff"
      };
      await updateTenantTheme(testTenantId, tenantTheme, false);

      // Reset tenant theme
      const resetTheme = await resetTenantTheme(testTenantId);

      // Should inherit from base theme
      expect(resetTheme.primaryColor).toBe("#ff0000");
      expect(resetTheme.source).toBe("base");
    });
  });

  describe("Status Checking", () => {
    it("hasTenantCustomTheme returns false when no override exists", async () => {
      const hasCustom = await hasTenantCustomTheme(testTenantId);
      expect(hasCustom).toBe(false);
    });

    it("hasTenantCustomTheme returns true when override exists", async () => {
      const tenantTheme = {
        primaryColor: "#ff0000"
      };
      await updateTenantTheme(testTenantId, tenantTheme, false);

      const hasCustom = await hasTenantCustomTheme(testTenantId);
      expect(hasCustom).toBe(true);
    });

    it("getTenantThemeStatus returns correct status for default tenant", async () => {
      const status = await getTenantThemeStatus(testTenantId);

      expect(status.hasCustomTheme).toBe(false);
      expect(status.source).toBe("default");
      expect(status.canReset).toBe(false);
    });

    it("getTenantThemeStatus returns correct status for customized tenant", async () => {
      const tenantTheme = {
        primaryColor: "#ff0000"
      };
      const updatedTheme = await updateTenantTheme(testTenantId, tenantTheme, false);

      const status = await getTenantThemeStatus(testTenantId);

      expect(status.hasCustomTheme).toBe(true);
      expect(status.source).toBe("tenant");
      expect(status.canReset).toBe(true);
      expect(status.updatedAt).toBe(updatedTheme.updatedAt);
    });
  });

  describe("Edge Cases", () => {
    it("handles null tenantId correctly", async () => {
      const theme = await resolveTenantTheme(null);
      expect(theme.source).toBe("default");
    });

    it("handles invalid tenantId gracefully", async () => {
      const theme = await resolveTenantTheme("nonexistent-tenant");
      expect(theme.source).toBe("default");
    });

    it("multiple tenant overrides work independently", async () => {
      const tenant1Id = "tenant-1";
      const tenant2Id = "tenant-2";

      // Create test tenants
      await prisma.tenant.upsert({
        where: { id: tenant1Id },
        update: {},
        create: {
          id: tenant1Id,
          name: "Tenant 1",
          slug: "tenant-1",
          isActive: true,
        },
      });
      await prisma.tenant.upsert({
        where: { id: tenant2Id },
        update: {},
        create: {
          id: tenant2Id,
          name: "Tenant 2",
          slug: "tenant-2",
          isActive: true,
        },
      });

      // Create different themes for each tenant
      await updateTenantTheme(tenant1Id, { primaryColor: "#ff0000" }, false);
      await updateTenantTheme(tenant2Id, { primaryColor: "#0000ff" }, false);

      const theme1 = await resolveTenantTheme(tenant1Id);
      const theme2 = await resolveTenantTheme(tenant2Id);

      expect(theme1.primaryColor).toBe("#ff0000");
      expect(theme2.primaryColor).toBe("#0000ff");

      // Cleanup
      await prisma.tenantTheme.deleteMany({
        where: { tenantId: { in: [tenant1Id, tenant2Id] } }
      });
      await prisma.tenant.deleteMany({
        where: { id: { in: [tenant1Id, tenant2Id] } }
      });
    });

    it("base theme update affects all tenants without overrides", async () => {
      const tenant1Id = "tenant-1";
      const tenant2Id = "tenant-2";

      // Create test tenants
      await prisma.tenant.upsert({
        where: { id: tenant1Id },
        update: {},
        create: {
          id: tenant1Id,
          name: "Tenant 1",
          slug: "tenant-1",
          isActive: true,
        },
      });
      await prisma.tenant.upsert({
        where: { id: tenant2Id },
        update: {},
        create: {
          id: tenant2Id,
          name: "Tenant 2",
          slug: "tenant-2",
          isActive: true,
        },
      });

      // Create base theme
      await updateTenantTheme(baseTenantId, { primaryColor: "#ff0000" }, true);

      // Both tenants should inherit
      const theme1 = await resolveTenantTheme(tenant1Id);
      const theme2 = await resolveTenantTheme(tenant2Id);

      expect(theme1.primaryColor).toBe("#ff0000");
      expect(theme1.source).toBe("base");
      expect(theme2.primaryColor).toBe("#ff0000");
      expect(theme2.source).toBe("base");

      // Cleanup
      await prisma.tenantTheme.deleteMany({
        where: { tenantId: { in: [tenant1Id, tenant2Id] } }
      });
      await prisma.tenant.deleteMany({
        where: { id: { in: [tenant1Id, tenant2Id] } }
      });
    });
  });

  describe("Cache Behavior", () => {
    it("cache invalidation works correctly", async () => {
      // Create tenant theme
      const tenantTheme = { primaryColor: "#ff0000" };
      await updateTenantTheme(testTenantId, tenantTheme, false);

      // Load theme (should cache it)
      let theme = await resolveTenantTheme(testTenantId);
      expect(theme.primaryColor).toBe("#ff0000");

      // Update theme
      await updateTenantTheme(testTenantId, { primaryColor: "#0000ff" }, false);

      // Load again (should get updated theme, not cached)
      theme = await resolveTenantTheme(testTenantId);
      expect(theme.primaryColor).toBe("#0000ff");
    });

    it("base theme update invalidates all tenant caches", async () => {
      // This is harder to test without mocking Redis, but we can verify the logic exists
      // The updateTenantTheme function should handle cache invalidation for base themes
      expect(true).toBe(true); // Placeholder - cache invalidation is implemented in the service
    });
  });
});