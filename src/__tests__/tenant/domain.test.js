import { describe, it, expect, vi, beforeEach } from "vitest";
import { verifyDomainCname, isValidCustomDomain } from "@/lib/tenant/domain";

describe("isValidCustomDomain", () => {
  it("accepts valid domains", () => {
    expect(isValidCustomDomain("crm.valuelabs.com")).toBe(true);
    expect(isValidCustomDomain("app.company.io")).toBe(true);
  });
  it("rejects wrenforge.com subdomains", () => {
    expect(isValidCustomDomain("valuelabs.wrenforge.com")).toBe(false);
  });
  it("allows bare domains", () => {
    expect(isValidCustomDomain("valuelabs.com")).toBe(true);
  });
  it("rejects invalid strings", () => {
    expect(isValidCustomDomain("not a domain")).toBe(false);
    expect(isValidCustomDomain("")).toBe(false);
  });
});

describe("verifyDomainCname", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("returns true when CNAME points to vercel", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ Answer: [{ type: 5, data: "cname.vercel-dns.com." }] }),
    }));
    expect(await verifyDomainCname("crm.valuelabs.com")).toBe(true);
  });

  it("returns false when no CNAME record", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ Answer: [] }),
    }));
    expect(await verifyDomainCname("crm.valuelabs.com")).toBe(false);
  });

  it("returns false on fetch error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));
    expect(await verifyDomainCname("crm.valuelabs.com")).toBe(false);
  });
});
