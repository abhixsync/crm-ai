import { describe, it, expect, vi, beforeEach } from "vitest";

// Default mock — cache miss (get returns null)
vi.mock("ioredis", () => ({
  default: vi.fn().mockImplementation(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue("OK"),
    del: vi.fn().mockResolvedValue(1),
    disconnect: vi.fn(),
    on: vi.fn(),
  })),
}));

// Must import AFTER mock is set up
const { getCached, invalidateCache } = await import("@/lib/cache/api-cache");

describe("api-cache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls fetcher when DISABLE_REDIS=true (fallthrough)", async () => {
    // vitest.config.mjs sets DISABLE_REDIS=true globally — verifies transparent fallthrough
    const fetcher = vi.fn().mockResolvedValue({ count: 42 });
    const result = await getCached("test:key", 60, fetcher);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(result).toEqual({ count: 42 });
  });

  it("invalidateCache does not throw when called", async () => {
    await expect(invalidateCache("metrics:tenant1")).resolves.toBeUndefined();
  });
});

describe("api-cache — cache hit path (Redis enabled)", () => {
  it("returns cached value and skips fetcher when Redis has the key", async () => {
    // Isolate this test with its own module instance to avoid polluting module singleton
    vi.resetModules();
    const savedDisableRedis = process.env.DISABLE_REDIS;
    delete process.env.DISABLE_REDIS;

    vi.doMock("ioredis", () => ({
      default: vi.fn().mockImplementation(() => ({
        connect: vi.fn().mockResolvedValue(undefined),
        get: vi.fn().mockResolvedValue(JSON.stringify({ count: 99 })),
        set: vi.fn().mockResolvedValue("OK"),
        del: vi.fn().mockResolvedValue(1),
        disconnect: vi.fn(),
        on: vi.fn(),
      })),
    }));

    const { getCached: getCachedFresh } = await import("@/lib/cache/api-cache");
    const fetcher = vi.fn().mockResolvedValue({ count: 0 });
    const result = await getCachedFresh("test:key", 60, fetcher);

    expect(fetcher).not.toHaveBeenCalled();
    expect(result).toEqual({ count: 99 });

    // Restore
    if (savedDisableRedis !== undefined) {
      process.env.DISABLE_REDIS = savedDisableRedis;
    }
    vi.resetModules();
  });
});
