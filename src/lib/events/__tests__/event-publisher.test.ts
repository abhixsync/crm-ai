import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("publishEvent — DISABLE_REDIS=true", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.DISABLE_REDIS = "true";
  });
  afterEach(() => {
    delete process.env.DISABLE_REDIS;
  });

  it("resolves without throwing when Redis is disabled", async () => {
    const { publishEvent } = await import("../event-publisher");
    await expect(publishEvent("tenant-1", { type: "metrics:update" })).resolves.toBeUndefined();
  });
});

describe("createRedisSubscriber — DISABLE_REDIS=true", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.DISABLE_REDIS = "true";
  });
  afterEach(() => {
    delete process.env.DISABLE_REDIS;
  });

  it("returns null when Redis is disabled", async () => {
    const { createRedisSubscriber } = await import("../event-publisher");
    expect(createRedisSubscriber()).toBeNull();
  });
});
