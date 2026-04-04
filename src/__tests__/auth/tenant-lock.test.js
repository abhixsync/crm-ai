import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { authOptions } from "@/lib/auth";

const TENANT_A = "tenant-uuid-aaa";
const TENANT_B = "tenant-uuid-bbb";

const mockUser = (overrides = {}) => ({
  id: "user-1",
  name: "Test User",
  email: "user@test.com",
  passwordHash: "$2a$10$hashedpassword",
  role: "SALES",
  tenantId: TENANT_A,
  isActive: true,
  isSuspended: false,
  isPrimaryOwner: false,
  emailVerified: null,
  ...overrides,
});

vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findFirst: vi.fn() } },
}));

vi.mock("bcryptjs", () => ({
  default: { compare: vi.fn() },
}));

describe("authorize() tenant lock", () => {
  let authorize;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(bcrypt.compare).mockResolvedValue(true);
    authorize = authOptions.providers[0].options.authorize;
  });

  it("allows login when tenantId matches", async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue(mockUser());
    const result = await authorize({ email: "user@test.com", password: "pass", tenantId: TENANT_A });
    expect(result).not.toBeNull();
    expect(result.tenantId).toBe(TENANT_A);
  });

  it("rejects login when tenantId does not match", async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue(mockUser());
    await expect(
      authorize({ email: "user@test.com", password: "pass", tenantId: TENANT_B })
    ).rejects.toThrow("ACCESS_DENIED_TENANT");
  });

  it("rejects login when no tenantId provided for non-SUPER_ADMIN", async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue(mockUser());
    await expect(
      authorize({ email: "user@test.com", password: "pass", tenantId: "" })
    ).rejects.toThrow("ACCESS_DENIED_TENANT");
  });

  it("allows SUPER_ADMIN login without tenantId check", async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue(mockUser({ role: "SUPER_ADMIN", tenantId: null }));
    const result = await authorize({ email: "admin@test.com", password: "pass", tenantId: "" });
    expect(result).not.toBeNull();
  });
});
