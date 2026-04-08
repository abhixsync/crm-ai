import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks (must be declared before imports) ──────────────────────────────────

vi.mock("@/lib/prisma", () => ({
  prisma: {
    customer: {
      updateMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/server/auth-guard", () => ({
  requireSession: vi.fn(),
  hasRole: vi.fn(),
  getTenantContext: vi.fn(),
}));

vi.mock("@/lib/server/database-error", () => ({
  isDatabaseUnavailable: vi.fn(() => false),
  databaseUnavailableResponse: vi.fn(() =>
    Response.json({ degraded: true, error: "Database unavailable" }, { status: 503 })
  ),
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { prisma } from "@/lib/prisma";
import { requireSession, hasRole, getTenantContext } from "@/lib/server/auth-guard";
import { POST } from "@/app/api/customers/batch/route.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeReq(body) {
  return new Request("http://localhost/api/customers/batch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const ADMIN_SESSION = {
  user: { id: "user-1", name: "Admin" },
  role: "ADMIN",
  tenantId: "t1",
};

// ─── beforeEach ───────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();

  // Default: authenticated ADMIN with valid tenant context
  requireSession.mockResolvedValue({ session: ADMIN_SESSION, error: null });
  hasRole.mockReturnValue(true);
  getTenantContext.mockReturnValue({ tenantId: "t1" });

  // Default: updateMany returns 2 updated rows
  prisma.customer.updateMany.mockResolvedValue({ count: 2 });
});

// ─── UPDATE_STATUS ────────────────────────────────────────────────────────────

describe("POST /api/customers/batch — UPDATE_STATUS", () => {

  // 1. Happy path
  it("returns { ok: true, action: 'UPDATE_STATUS', count: 2 } when valid status is provided", async () => {
    const res = await POST(makeReq({
      action: "UPDATE_STATUS",
      customerIds: ["c1", "c2"],
      status: "INTERESTED",
    }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, action: "UPDATE_STATUS", count: 2 });
  });

  // 2. Missing status field
  it("returns 400 when status field is omitted", async () => {
    const res = await POST(makeReq({
      action: "UPDATE_STATUS",
      customerIds: ["c1", "c2"],
    }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBeTruthy();
  });

  // 3. Invalid status value
  it("returns 400 when status is not a valid CustomerStatus enum value", async () => {
    const res = await POST(makeReq({
      action: "UPDATE_STATUS",
      customerIds: ["c1"],
      status: "INVALID_STATUS",
    }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBeTruthy();
  });

  // 4. Tenant scope — archivedAt: null filter must be present
  it("calls updateMany with archivedAt: null to exclude archived customers", async () => {
    await POST(makeReq({
      action: "UPDATE_STATUS",
      customerIds: ["c1", "c2"],
      status: "FOLLOW_UP",
    }));

    expect(prisma.customer.updateMany).toHaveBeenCalledOnce();
    const callArg = prisma.customer.updateMany.mock.calls[0][0];
    expect(callArg.where).toMatchObject({
      tenantId: "t1",
      archivedAt: null,
    });
  });

  // 5. DELETE regression — still works after UPDATE_STATUS was added
  it("DELETE action still soft-deletes customers and returns { ok: true, action: 'DELETE' }", async () => {
    prisma.customer.updateMany.mockResolvedValue({ count: 3 });

    const res = await POST(makeReq({
      action: "DELETE",
      customerIds: ["c1", "c2", "c3"],
    }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ ok: true, action: "DELETE", count: 3 });

    const callArg = prisma.customer.updateMany.mock.calls[0][0];
    expect(callArg.data).toMatchObject({
      archivedAt: expect.any(Date),
      status: "DO_NOT_CALL",
    });
  });

  // 6. Empty customerIds
  it("returns 400 when customerIds array is empty", async () => {
    const res = await POST(makeReq({
      action: "UPDATE_STATUS",
      customerIds: [],
      status: "NEW",
    }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBeTruthy();
  });

  // 7. Zero matching customers
  it("returns { ok: true, count: 0 } when no customers match (all archived or wrong tenant)", async () => {
    prisma.customer.updateMany.mockResolvedValue({ count: 0 });

    const res = await POST(makeReq({
      action: "UPDATE_STATUS",
      customerIds: ["c-ghost"],
      status: "CONVERTED",
    }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, action: "UPDATE_STATUS", count: 0 });
  });

  // 8. Non-ADMIN user (SALES role)
  it("returns 403 when caller has SALES role", async () => {
    hasRole.mockReturnValue(false);

    const res = await POST(makeReq({
      action: "UPDATE_STATUS",
      customerIds: ["c1"],
      status: "NEW",
    }));
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toMatch(/forbidden/i);
  });
});
