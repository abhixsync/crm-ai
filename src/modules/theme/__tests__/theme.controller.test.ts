import { describe, expect, it } from "vitest";
import { updateThemeController } from "@/modules/theme/theme.controller";
import { getActiveTheme, getDefaultTheme, invalidateThemeCache } from "@/modules/theme/theme.service";

describe("theme module", () => {
  it("returns forbidden for non-admin on update", async () => {
    const response = await updateThemeController({ user: { role: "SALES", tenantId: "t1" } } as any, {
      primaryColor: "#000000",
    });

    expect(response.status).toBe(403);
  });

  it("returns default fallback theme shape", () => {
    const theme = getDefaultTheme();
    expect(theme).toMatchObject({
      primaryColor: expect.any(String),
      secondaryColor: expect.any(String),
      accentColor: expect.any(String),
    });
  });

  it("loads fallback theme for null tenant", async () => {
    const theme = await getActiveTheme(null);
    expect(theme.source).toBe("default");
    expect(theme.tenantId).toBeNull();
  });

  it("allows cache invalidation call", async () => {
    await expect(invalidateThemeCache("tenant-x")).resolves.toBeUndefined();
  });
});
