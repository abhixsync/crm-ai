import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks (must be declared before imports) ──────────────────────────────────

vi.mock("@/lib/prisma", () => ({
  prisma: {
    customerActivity: { findMany: vi.fn() },
    callLog:          { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/server/auth-guard", () => ({
  requireSession:   vi.fn(),
  hasRole:          vi.fn(() => true),
  getTenantContext: vi.fn(() => ({ tenantId: "t1" })),
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { prisma } from "@/lib/prisma";
import { requireSession, hasRole, getTenantContext } from "@/lib/server/auth-guard";
import { GET } from "@/app/api/customers/[customerId]/activity/route.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CUSTOMER_ID = "cust1";
const TENANT_ID   = "t1";

function makeRequest() {
  return new Request("http://localhost/api/customers/cust1/activity");
}

function makeParams() {
  return { params: Promise.resolve({ customerId: CUSTOMER_ID }) };
}

function makeActivity(overrides = {}) {
  return {
    id:         "act1",
    customerId: CUSTOMER_ID,
    tenantId:   TENANT_ID,
    type:       "NOTE",
    createdAt:  new Date("2026-01-01T10:00:00Z"),
    actor:      { name: "Alice" },
    ...overrides,
  };
}

function makeCall(overrides = {}) {
  return {
    id:         "call1",
    customerId: CUSTOMER_ID,
    tenantId:   TENANT_ID,
    status:     "COMPLETED",
    duration:   60,
    createdAt:  new Date("2026-01-01T09:00:00Z"),
    summary:    "Spoke about loan",
    ...overrides,
  };
}

// ─── beforeEach ───────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();

  // Default: authenticated SALES session
  requireSession.mockResolvedValue({
    session: { userId: "user1", role: "SALES", tenantId: TENANT_ID },
    error:   null,
  });
  hasRole.mockReturnValue(true);
  getTenantContext.mockReturnValue({ tenantId: TENANT_ID });

  // Default prisma stubs
  prisma.customerActivity.findMany.mockResolvedValue([makeActivity()]);
  prisma.callLog.findMany.mockResolvedValue([makeCall()]);
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("GET /api/customers/[customerId]/activity", () => {

  // ── 1. Returns both activities and calls with correct shape ──────────────────
  it("returns correct shape { activities, calls } with data from both prisma queries", async () => {
    const res  = await GET(makeRequest(), makeParams());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toHaveProperty("activities");
    expect(body).toHaveProperty("calls");
    expect(body.activities).toHaveLength(1);
    expect(body.calls).toHaveLength(1);
    expect(body.activities[0].id).toBe("act1");
    expect(body.calls[0].id).toBe("call1");
  });

  // ── 2. Activities scoped to customerId AND tenantId ──────────────────────────
  it("queries customerActivity with where: { customerId, tenantId }", async () => {
    await GET(makeRequest(), makeParams());

    expect(prisma.customerActivity.findMany).toHaveBeenCalledOnce();
    const { where } = prisma.customerActivity.findMany.mock.calls[0][0];
    expect(where).toMatchObject({ customerId: CUSTOMER_ID, tenantId: TENANT_ID });
  });

  // ── 3. Calls scoped to customerId AND tenantId ───────────────────────────────
  it("queries callLog with where: { customerId, tenantId }", async () => {
    await GET(makeRequest(), makeParams());

    expect(prisma.callLog.findMany).toHaveBeenCalledOnce();
    const { where } = prisma.callLog.findMany.mock.calls[0][0];
    expect(where).toMatchObject({ customerId: CUSTOMER_ID, tenantId: TENANT_ID });
  });

  // ── 4. Activities ordered by createdAt desc, take 50 ────────────────────────
  it("fetches activities ordered by createdAt desc with take: 50", async () => {
    await GET(makeRequest(), makeParams());

    const opts = prisma.customerActivity.findMany.mock.calls[0][0];
    expect(opts.orderBy).toMatchObject({ createdAt: "desc" });
    expect(opts.take).toBe(50);
  });

  // ── 5. Calls ordered by createdAt desc, take 10 ──────────────────────────────
  it("fetches calls ordered by createdAt desc with take: 10", async () => {
    await GET(makeRequest(), makeParams());

    const opts = prisma.callLog.findMany.mock.calls[0][0];
    expect(opts.orderBy).toMatchObject({ createdAt: "desc" });
    expect(opts.take).toBe(10);
  });

  // ── 6. Returns 403 when hasRole returns false ─────────────────────────────────
  it("returns 403 when caller does not have ADMIN or SALES role", async () => {
    hasRole.mockReturnValue(false);

    const res  = await GET(makeRequest(), makeParams());
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toMatch(/forbidden/i);
  });

  // ── 7. Returns empty arrays when no data found ────────────────────────────────
  it("returns { activities: [], calls: [] } when no records exist", async () => {
    prisma.customerActivity.findMany.mockResolvedValue([]);
    prisma.callLog.findMany.mockResolvedValue([]);

    const res  = await GET(makeRequest(), makeParams());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ activities: [], calls: [] });
  });

  // ── 8. Returns 400 when tenantId is missing ───────────────────────────────────
  it("returns 400 when getTenantContext returns no tenantId", async () => {
    getTenantContext.mockReturnValue({ tenantId: null });

    const res  = await GET(makeRequest(), makeParams());
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/tenant/i);
  });
});
