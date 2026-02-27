import { describe, expect, it } from "vitest";
import { resolveResponsiveAsset } from "@/core/theme/useThemeAsset";

describe("resolveResponsiveAsset", () => {
  const variants = {
    mobile: "/m.png",
    tablet: "/t.png",
    desktop: "/d.png",
  };

  it("selects mobile for small screens", () => {
    expect(resolveResponsiveAsset(variants, 375, "/fallback.png")).toBe("/m.png");
  });

  it("selects tablet for medium screens", () => {
    expect(resolveResponsiveAsset(variants, 800, "/fallback.png")).toBe("/t.png");
  });

  it("selects desktop for large screens", () => {
    expect(resolveResponsiveAsset(variants, 1280, "/fallback.png")).toBe("/d.png");
  });

  it("falls back safely when no variant exists", () => {
    expect(resolveResponsiveAsset({}, 1280, "/fallback.png")).toBe("/fallback.png");
  });
});
