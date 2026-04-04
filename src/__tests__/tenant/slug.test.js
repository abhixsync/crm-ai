import { describe, it, expect, vi } from "vitest";
import { slugify, isReservedSlug, isValidSlug, ensureUniqueSlug } from "@/lib/tenant/slug";

describe("slugify", () => {
  it("lowercases and replaces spaces with hyphens", () => {
    expect(slugify("Value Labs")).toBe("value-labs");
  });
  it("removes special characters", () => {
    expect(slugify("Acme Corp!")).toBe("acme-corp");
  });
  it("collapses multiple hyphens", () => {
    expect(slugify("Foo  --  Bar")).toBe("foo-bar");
  });
  it("trims leading/trailing hyphens", () => {
    expect(slugify("---hello---")).toBe("hello");
  });
  it("truncates to 63 chars", () => {
    expect(slugify("a".repeat(100))).toHaveLength(63);
  });
  it("handles single character names", () => {
    expect(slugify("A")).toBe("a");
  });
});

describe("isReservedSlug", () => {
  it("blocks reserved words", () => {
    expect(isReservedSlug("app")).toBe(true);
    expect(isReservedSlug("www")).toBe(true);
    expect(isReservedSlug("api")).toBe(true);
    expect(isReservedSlug("admin")).toBe(true);
  });
  it("allows normal slugs", () => {
    expect(isReservedSlug("valuelabs")).toBe(false);
    expect(isReservedSlug("acme")).toBe(false);
  });
});

describe("isValidSlug", () => {
  it("accepts valid slugs", () => {
    expect(isValidSlug("valuelabs")).toBe(true);
    expect(isValidSlug("value-labs")).toBe(true);
    expect(isValidSlug("ai")).toBe(true);
    expect(isValidSlug("a")).toBe(true);
  });
  it("rejects uppercase", () => {
    expect(isValidSlug("ValueLabs")).toBe(false);
  });
  it("rejects spaces", () => {
    expect(isValidSlug("value labs")).toBe(false);
  });
  it("rejects leading/trailing hyphens", () => {
    expect(isValidSlug("-valuelabs")).toBe(false);
    expect(isValidSlug("valuelabs-")).toBe(false);
  });
  it("rejects empty string", () => {
    expect(isValidSlug("")).toBe(false);
  });
  it("rejects strings over 63 chars", () => {
    expect(isValidSlug("a".repeat(64))).toBe(false);
  });
});

describe("ensureUniqueSlug", () => {
  it("returns base slug when no collision", async () => {
    const mockPrisma = { tenant: { findUnique: vi.fn().mockResolvedValue(null) } };
    expect(await ensureUniqueSlug(mockPrisma, "valuelabs")).toBe("valuelabs");
  });
  it("appends -2 on first collision", async () => {
    const mockPrisma = {
      tenant: {
        findUnique: vi.fn()
          .mockResolvedValueOnce({ id: "existing" })
          .mockResolvedValue(null),
      },
    };
    expect(await ensureUniqueSlug(mockPrisma, "valuelabs")).toBe("valuelabs-2");
  });
  it("appends -3 on two collisions", async () => {
    const mockPrisma = {
      tenant: {
        findUnique: vi.fn()
          .mockResolvedValueOnce({ id: "a" })
          .mockResolvedValueOnce({ id: "b" })
          .mockResolvedValue(null),
      },
    };
    expect(await ensureUniqueSlug(mockPrisma, "valuelabs")).toBe("valuelabs-3");
  });
});
