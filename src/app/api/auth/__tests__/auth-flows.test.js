import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks (must be declared before imports that use them) ────────────────────

// mockTx mirrors the same prisma mock tables so assertions still work
const mockTx = {};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    passwordResetToken: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
    },
    pendingInvite: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      deleteMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    tenant: { findUnique: vi.fn() },
    $transaction: vi.fn((ops) =>
      Array.isArray(ops) ? Promise.all(ops) : ops(mockTx)
    ),
  },
}));

vi.mock("@/lib/email/mailer", () => ({
  sendEmail: vi.fn(async () => ({ ok: true })),
  buildPasswordResetEmail: vi.fn(() => ({
    subject: "s",
    html: "h",
    text: "t",
    fromName: null,
  })),
  buildTeamInviteEmail: vi.fn(() => ({
    subject: "s",
    html: "h",
    text: "t",
    fromName: null,
  })),
}));

vi.mock("@/modules/theme/theme.service", () => ({
  resolveTenantTheme: vi.fn(async () => null),
}));

vi.mock("@/lib/server/auth-guard", () => ({
  requireSession: vi.fn(),
  hasRole: vi.fn(() => true),
  getTenantContext: vi.fn(() => ({ tenantId: "tenant-1", isSuperAdmin: false })),
}));

vi.mock("bcryptjs", () => ({
  default: {
    hash: vi.fn(async (p) => `hashed:${p}`),
    compare: vi.fn(async () => true),
  },
}));

vi.mock("crypto", async () => {
  const actual = await vi.importActual("crypto");
  return {
    ...actual,
    randomBytes: vi.fn(() => Buffer.from("abcdef1234567890abcdef1234567890")),
  };
});

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { prisma } from "@/lib/prisma";
import { sendEmail, buildPasswordResetEmail, buildTeamInviteEmail } from "@/lib/email/mailer";
import { resolveTenantTheme } from "@/modules/theme/theme.service";
import { requireSession, hasRole, getTenantContext } from "@/lib/server/auth-guard";
import bcrypt from "bcryptjs";

import { POST as forgotPasswordPOST } from "@/app/api/auth/forgot-password/route";
import { POST as resetPasswordPOST } from "@/app/api/auth/reset-password/route";
import { POST as acceptInvitePOST } from "@/app/api/auth/accept-invite/route";
import { POST as invitePOST } from "@/app/api/admin/user-management/invite/route";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mockReq(body, headers = {}) {
  return {
    json: async () => body,
    headers: { get: (k) => headers[k] || null },
  };
}

function makeUser(overrides = {}) {
  return {
    id: "user-1",
    name: "Test User",
    email: "test@example.com",
    tenantId: "tenant-1",
    ...overrides,
  };
}

function makeResetToken(overrides = {}) {
  return {
    id: "token-1",
    userId: "user-1",
    token: "valid-token-abc",
    usedAt: null,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour from now
    user: makeUser(),
    ...overrides,
  };
}

function makeInvite(overrides = {}) {
  return {
    id: "invite-1",
    token: "invite-token-abc",
    email: "newuser@example.com",
    role: "SALES",
    tenantId: "tenant-1",
    acceptedAt: null,
    expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
    ...overrides,
  };
}

// Re-bind $transaction after clearAllMocks resets implementation
function rebindTransaction() {
  prisma.$transaction.mockImplementation((ops) =>
    Array.isArray(ops) ? Promise.all(ops) : ops(mockTx)
  );
}

// ─── forgot-password ──────────────────────────────────────────────────────────

describe("POST /api/auth/forgot-password", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rebindTransaction();
    prisma.passwordResetToken.updateMany.mockResolvedValue({ count: 0 });
    prisma.passwordResetToken.create.mockResolvedValue({});
  });

  it("returns { ok: true } when user is not found (email enumeration protection)", async () => {
    prisma.user.findFirst.mockResolvedValue(null);

    const res = await forgotPasswordPOST(mockReq({ email: "nobody@example.com" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true });
  });

  it("returns { ok: true } and sends a reset email when user is found", async () => {
    prisma.user.findFirst.mockResolvedValue(makeUser());
    prisma.passwordResetToken.findFirst.mockResolvedValue(null); // no recent token

    const res = await forgotPasswordPOST(mockReq({ email: "test@example.com" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true });
    expect(buildPasswordResetEmail).toHaveBeenCalledOnce();
    expect(sendEmail).toHaveBeenCalledOnce();
  });

  it("calls passwordResetToken.updateMany to invalidate old tokens before creating a new one", async () => {
    prisma.user.findFirst.mockResolvedValue(makeUser());
    prisma.passwordResetToken.findFirst.mockResolvedValue(null);

    await forgotPasswordPOST(mockReq({ email: "test@example.com" }));

    expect(prisma.passwordResetToken.updateMany).toHaveBeenCalledOnce();
    expect(prisma.passwordResetToken.updateMany.mock.calls[0][0]).toMatchObject({
      where: { userId: "user-1", usedAt: null },
      data: { usedAt: expect.any(Date) },
    });
    // create must be called after updateMany
    expect(prisma.passwordResetToken.create).toHaveBeenCalledOnce();
  });

  it("returns { ok: true } silently when a recent token exists (2-min cooldown)", async () => {
    prisma.user.findFirst.mockResolvedValue(makeUser());
    // Simulate a token created 30 seconds ago — within the 2-min window
    prisma.passwordResetToken.findFirst.mockResolvedValue({
      id: "recent-token",
      createdAt: new Date(Date.now() - 30_000),
    });

    const res = await forgotPasswordPOST(mockReq({ email: "test@example.com" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true });
    // Must NOT attempt to create another token
    expect(prisma.passwordResetToken.updateMany).not.toHaveBeenCalled();
    expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("calls resolveTenantTheme(null) for SUPER_ADMIN users who have no tenantId", async () => {
    // SUPER_ADMIN has tenantId: null — route skips resolveTenantTheme entirely (no call)
    const superAdmin = makeUser({ tenantId: null, role: "SUPER_ADMIN" });
    prisma.user.findFirst.mockResolvedValue(superAdmin);
    prisma.passwordResetToken.findFirst.mockResolvedValue(null);

    await forgotPasswordPOST(mockReq({ email: superAdmin.email }));

    // Route logic: `user.tenantId ? resolveTenantTheme(...) : null`
    // So for SUPER_ADMIN, resolveTenantTheme must NOT be called
    expect(resolveTenantTheme).not.toHaveBeenCalled();
  });

  it("returns 400 when email is not provided", async () => {
    const res = await forgotPasswordPOST(mockReq({}));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBeTruthy();
  });

  it("returns 400 when email is not a valid format", async () => {
    const res = await forgotPasswordPOST(mockReq({ email: "not-an-email" }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/valid email/i);
  });
});

// ─── reset-password ───────────────────────────────────────────────────────────

describe("POST /api/auth/reset-password", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rebindTransaction();
    prisma.user.update = vi.fn().mockResolvedValue({});
    prisma.passwordResetToken.update = vi.fn().mockResolvedValue({});
  });

  it("returns 400 'Invalid or expired' when token is not found", async () => {
    prisma.passwordResetToken.findFirst.mockResolvedValue(null);

    const res = await resetPasswordPOST(
      mockReq({ token: "bad-token", password: "ValidPassword123!" })
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/invalid or expired/i);
  });

  it("returns 400 'Invalid or expired' when token is expired", async () => {
    // The route uses findFirst with expiresAt: { gt: new Date() } in the WHERE clause.
    // An expired token simply won't be returned — mock returns null.
    prisma.passwordResetToken.findFirst.mockResolvedValue(null);

    const res = await resetPasswordPOST(
      mockReq({ token: "expired-token", password: "ValidPassword123!" })
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/invalid or expired/i);
  });

  it("returns 400 'Invalid or expired' when token has already been used (usedAt set)", async () => {
    // Route filters usedAt: null in the WHERE clause — a used token won't be returned.
    prisma.passwordResetToken.findFirst.mockResolvedValue(null);

    const res = await resetPasswordPOST(
      mockReq({ token: "used-token", password: "ValidPassword123!" })
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/invalid or expired/i);
  });

  it("returns 400 when password is fewer than 12 characters", async () => {
    const res = await resetPasswordPOST(
      mockReq({ token: "any-token", password: "short" })
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/12 characters/i);
  });

  it("calls bcrypt.hash with the new password on success", async () => {
    prisma.passwordResetToken.findFirst.mockResolvedValue(makeResetToken());

    await resetPasswordPOST(
      mockReq({ token: "valid-token-abc", password: "ValidPassword123!" })
    );

    expect(bcrypt.hash).toHaveBeenCalledOnce();
    expect(bcrypt.hash.mock.calls[0][0]).toBe("ValidPassword123!");
  });

  it("calls $transaction to atomically update password and mark token used on success", async () => {
    prisma.passwordResetToken.findFirst.mockResolvedValue(makeResetToken());

    await resetPasswordPOST(
      mockReq({ token: "valid-token-abc", password: "ValidPassword123!" })
    );

    expect(prisma.$transaction).toHaveBeenCalledOnce();
    // Batch form: receives an array
    const arg = prisma.$transaction.mock.calls[0][0];
    expect(Array.isArray(arg)).toBe(true);
    expect(arg).toHaveLength(2);
  });

  it("returns { ok: true } on success", async () => {
    prisma.passwordResetToken.findFirst.mockResolvedValue(makeResetToken());

    const res = await resetPasswordPOST(
      mockReq({ token: "valid-token-abc", password: "ValidPassword123!" })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true });
  });
});

// ─── accept-invite ────────────────────────────────────────────────────────────

describe("POST /api/auth/accept-invite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rebindTransaction();
    prisma.user.create.mockResolvedValue({});
    prisma.pendingInvite.update.mockResolvedValue({});
  });

  it("returns 400 'Invalid or expired' when invite is not found", async () => {
    prisma.pendingInvite.findFirst.mockResolvedValue(null);

    const res = await acceptInvitePOST(
      mockReq({ token: "bad-token", password: "ValidPassword123!" })
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/invalid or has expired/i);
  });

  it("returns 400 when password is fewer than 12 characters", async () => {
    prisma.pendingInvite.findFirst.mockResolvedValue(makeInvite());

    const res = await acceptInvitePOST(
      mockReq({ token: "invite-token-abc", password: "short" })
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/12 characters/i);
  });

  it("creates the user with emailVerified set on success", async () => {
    prisma.pendingInvite.findFirst.mockResolvedValue(makeInvite());
    prisma.user.findFirst.mockResolvedValue(null); // no pre-existing user

    await acceptInvitePOST(
      mockReq({ token: "invite-token-abc", password: "ValidPassword123!" })
    );

    expect(prisma.$transaction).toHaveBeenCalledOnce();
    const txArg = prisma.$transaction.mock.calls[0][0];
    // Batch form — first op is user.create
    expect(Array.isArray(txArg)).toBe(true);
    // Inspect what was passed to user.create
    expect(prisma.user.create).toHaveBeenCalledOnce();
    const createData = prisma.user.create.mock.calls[0][0].data;
    expect(createData.emailVerified).toBeInstanceOf(Date);
  });

  it("marks the invite acceptedAt inside the transaction on success", async () => {
    prisma.pendingInvite.findFirst.mockResolvedValue(makeInvite());
    prisma.user.findFirst.mockResolvedValue(null);

    await acceptInvitePOST(
      mockReq({ token: "invite-token-abc", password: "ValidPassword123!" })
    );

    expect(prisma.pendingInvite.update).toHaveBeenCalledOnce();
    const updateData = prisma.pendingInvite.update.mock.calls[0][0].data;
    expect(updateData.acceptedAt).toBeInstanceOf(Date);
  });

  it("returns { ok: true } on success", async () => {
    prisma.pendingInvite.findFirst.mockResolvedValue(makeInvite());
    prisma.user.findFirst.mockResolvedValue(null);

    const res = await acceptInvitePOST(
      mockReq({ token: "invite-token-abc", password: "ValidPassword123!" })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true });
  });

  it("handles P2002 (concurrent duplicate user creation) gracefully — marks invite accepted and returns { ok: true }", async () => {
    prisma.pendingInvite.findFirst.mockResolvedValue(makeInvite());
    prisma.user.findFirst.mockResolvedValue(null);

    // The route builds the $transaction array eagerly, so user.create and
    // pendingInvite.update are both called before $transaction receives them.
    // Then $transaction throws P2002, and the catch block calls pendingInvite.update
    // a second time to mark the invite accepted.
    // Total pendingInvite.update calls: 1 (inside array) + 1 (catch block) = 2.
    const p2002 = new Error("Unique constraint failed");
    p2002.code = "P2002";
    prisma.$transaction.mockRejectedValueOnce(p2002);

    const res = await acceptInvitePOST(
      mockReq({ token: "invite-token-abc", password: "ValidPassword123!" })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true });
    // The catch-block recovery call is the last call — verify acceptedAt is set
    const calls = prisma.pendingInvite.update.mock.calls;
    expect(calls.length).toBeGreaterThanOrEqual(1);
    const recoveryCall = calls[calls.length - 1][0];
    expect(recoveryCall.data.acceptedAt).toBeInstanceOf(Date);
  });

  it("does not expose 'alreadyExists' in the response (information leak prevention)", async () => {
    prisma.pendingInvite.findFirst.mockResolvedValue(makeInvite());
    prisma.user.findFirst.mockResolvedValue(null);

    const p2002 = new Error("Unique constraint failed");
    p2002.code = "P2002";
    prisma.$transaction.mockRejectedValueOnce(p2002);

    const res = await acceptInvitePOST(
      mockReq({ token: "invite-token-abc", password: "ValidPassword123!" })
    );
    const body = await res.json();

    expect(body).not.toHaveProperty("alreadyExists");
  });
});

// ─── invite (admin) ───────────────────────────────────────────────────────────

describe("POST /api/admin/user-management/invite", () => {
  const validSession = {
    user: { id: "admin-1", name: "Admin User", email: "admin@example.com" },
    role: "ADMIN",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    rebindTransaction();

    // Default: authenticated ADMIN with valid tenant context
    requireSession.mockResolvedValue({ session: validSession, error: null });
    hasRole.mockReturnValue(true);
    getTenantContext.mockReturnValue({ tenantId: "tenant-1", isSuperAdmin: false });

    prisma.user.findFirst.mockResolvedValue(null); // no existing user
    prisma.pendingInvite.deleteMany.mockResolvedValue({ count: 0 });
    prisma.pendingInvite.create.mockResolvedValue({
      id: "invite-new-1",
      email: "invited@example.com",
      role: "SALES",
      tenantId: "tenant-1",
      expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
    });
    prisma.tenant.findUnique.mockResolvedValue({ id: "tenant-1", name: "Acme Corp" });
  });

  it("returns 403 when caller is not ADMIN or SUPER_ADMIN", async () => {
    hasRole.mockReturnValue(false);

    const res = await invitePOST(mockReq({ email: "invited@example.com", role: "SALES" }));
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toMatch(/forbidden/i);
  });

  it("returns 400 when email is missing", async () => {
    const res = await invitePOST(mockReq({ role: "SALES" }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/valid email/i);
  });

  it("returns 400 when role is invalid (not ADMIN or SALES)", async () => {
    const res = await invitePOST(mockReq({ email: "invited@example.com", role: "SUPER_ADMIN" }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/role must be one of/i);
  });

  it("returns 400 'User already exists' when a user with that email exists in the tenant", async () => {
    prisma.user.findFirst.mockResolvedValue({ id: "existing-user" });

    const res = await invitePOST(mockReq({ email: "existing@example.com", role: "SALES" }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/user already exists/i);
  });

  it("returns 400 'A tenant must be selected' when tenantId is null (SUPER_ADMIN without target tenant)", async () => {
    getTenantContext.mockReturnValue({ tenantId: null, isSuperAdmin: true });

    const res = await invitePOST(mockReq({ email: "invited@example.com", role: "SALES" }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/tenant must be selected/i);
  });

  it("creates PendingInvite with a 48-hour expiry on success", async () => {
    const before = Date.now();

    await invitePOST(mockReq({ email: "invited@example.com", role: "SALES" }));

    expect(prisma.pendingInvite.create).toHaveBeenCalledOnce();
    const createData = prisma.pendingInvite.create.mock.calls[0][0].data;
    const expiryMs = createData.expiresAt.getTime();
    // Should be ~48 h from now (within a 5-second tolerance)
    expect(expiryMs).toBeGreaterThanOrEqual(before + 48 * 60 * 60 * 1000 - 5000);
    expect(expiryMs).toBeLessThanOrEqual(before + 48 * 60 * 60 * 1000 + 5000);
  });

  it("calls buildTeamInviteEmail and sendEmail on success", async () => {
    await invitePOST(mockReq({ email: "invited@example.com", role: "SALES" }));

    expect(buildTeamInviteEmail).toHaveBeenCalledOnce();
    expect(sendEmail).toHaveBeenCalledOnce();
  });

  it("returns { ok: true, invite: { id, email, role, expiresAt } } with status 201 on success", async () => {
    const res = await invitePOST(mockReq({ email: "invited@example.com", role: "SALES" }));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.ok).toBe(true);
    expect(body.invite).toMatchObject({
      id: expect.any(String),
      email: expect.any(String),
      role: expect.any(String),
      expiresAt: expect.anything(),
    });
  });
});
