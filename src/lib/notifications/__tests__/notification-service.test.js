import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock prisma — must be declared before imports that use it
vi.mock("@/lib/prisma", () => ({
  prisma: {
    inAppNotification: {
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";
import {
  createNotification,
  getNotifications,
  getUnreadCount,
  markRead,
  markAllRead,
} from "@/lib/notifications/notification-service";

const TENANT = "tenant_notif_1";
const USER = "user_notif_1";
const NOTIF_ID = "notif_1";

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── createNotification ──────────────────────────────────

describe("createNotification", () => {
  it("calls prisma.create with correct tenantId, type, title, body, link, and userId", async () => {
    prisma.inAppNotification.create.mockResolvedValue({ id: NOTIF_ID });

    await createNotification(TENANT, {
      userId: USER,
      type: "CALL_COMPLETED",
      title: "Call done",
      body: "Your call finished.",
      link: "/calls/123",
    });

    expect(prisma.inAppNotification.create).toHaveBeenCalledOnce();
    const { data } = prisma.inAppNotification.create.mock.calls[0][0];
    expect(data.tenantId).toBe(TENANT);
    expect(data.userId).toBe(USER);
    expect(data.type).toBe("CALL_COMPLETED");
    expect(data.title).toBe("Call done");
    expect(data.body).toBe("Your call finished.");
    expect(data.link).toBe("/calls/123");
  });

  it("returns the created notification record", async () => {
    const record = { id: NOTIF_ID, tenantId: TENANT };
    prisma.inAppNotification.create.mockResolvedValue(record);

    const result = await createNotification(TENANT, {
      userId: USER,
      type: "SYSTEM",
      title: "Hello",
      body: "World",
    });

    expect(result).toBe(record);
  });

  it("sets userId to null when no userId is provided (tenant-wide notification)", async () => {
    prisma.inAppNotification.create.mockResolvedValue({ id: NOTIF_ID });

    await createNotification(TENANT, {
      type: "SYSTEM",
      title: "Tenant alert",
      body: "All admins see this.",
    });

    const { data } = prisma.inAppNotification.create.mock.calls[0][0];
    expect(data.userId).toBeNull();
  });

  it("sets link and metadata to null when not provided", async () => {
    prisma.inAppNotification.create.mockResolvedValue({ id: NOTIF_ID });

    await createNotification(TENANT, {
      userId: USER,
      type: "SYSTEM",
      title: "No link",
      body: "Body text",
    });

    const { data } = prisma.inAppNotification.create.mock.calls[0][0];
    expect(data.link).toBeNull();
    expect(data.metadata).toBeNull();
  });
});

// ─── getNotifications ────────────────────────────────────

describe("getNotifications", () => {
  it("queries with OR: [{ userId }, { userId: null }] for correct tenant scoping", async () => {
    prisma.inAppNotification.findMany.mockResolvedValue([]);

    await getNotifications(TENANT, USER);

    expect(prisma.inAppNotification.findMany).toHaveBeenCalledOnce();
    const { where } = prisma.inAppNotification.findMany.mock.calls[0][0];
    expect(where.tenantId).toBe(TENANT);
    expect(where.OR).toEqual([{ userId: USER }, { userId: null }]);
  });

  it("orders by createdAt desc and respects default limit of 30", async () => {
    prisma.inAppNotification.findMany.mockResolvedValue([]);

    await getNotifications(TENANT, USER);

    const call = prisma.inAppNotification.findMany.mock.calls[0][0];
    expect(call.orderBy).toEqual({ createdAt: "desc" });
    expect(call.take).toBe(30);
  });

  it("respects a custom limit", async () => {
    prisma.inAppNotification.findMany.mockResolvedValue([]);

    await getNotifications(TENANT, USER, { limit: 10 });

    const call = prisma.inAppNotification.findMany.mock.calls[0][0];
    expect(call.take).toBe(10);
  });

  it("does not add isRead filter when unreadOnly is false (default)", async () => {
    prisma.inAppNotification.findMany.mockResolvedValue([]);

    await getNotifications(TENANT, USER);

    const { where } = prisma.inAppNotification.findMany.mock.calls[0][0];
    expect(where.isRead).toBeUndefined();
  });

  it("adds isRead: false filter when unreadOnly is true", async () => {
    prisma.inAppNotification.findMany.mockResolvedValue([]);

    await getNotifications(TENANT, USER, { unreadOnly: true });

    const { where } = prisma.inAppNotification.findMany.mock.calls[0][0];
    expect(where.isRead).toBe(false);
  });

  it("returns the array from prisma", async () => {
    const notifications = [{ id: "n1" }, { id: "n2" }];
    prisma.inAppNotification.findMany.mockResolvedValue(notifications);

    const result = await getNotifications(TENANT, USER);

    expect(result).toBe(notifications);
  });
});

// ─── getUnreadCount ──────────────────────────────────────

describe("getUnreadCount", () => {
  it("queries count with tenantId, OR user/tenant-wide scope, and isRead: false", async () => {
    prisma.inAppNotification.count.mockResolvedValue(5);

    await getUnreadCount(TENANT, USER);

    expect(prisma.inAppNotification.count).toHaveBeenCalledOnce();
    const { where } = prisma.inAppNotification.count.mock.calls[0][0];
    expect(where.tenantId).toBe(TENANT);
    expect(where.OR).toEqual([{ userId: USER }, { userId: null }]);
    expect(where.isRead).toBe(false);
  });

  it("returns the integer count from prisma", async () => {
    prisma.inAppNotification.count.mockResolvedValue(7);

    const result = await getUnreadCount(TENANT, USER);

    expect(result).toBe(7);
  });

  it("returns zero when there are no unread notifications", async () => {
    prisma.inAppNotification.count.mockResolvedValue(0);

    const result = await getUnreadCount(TENANT, USER);

    expect(result).toBe(0);
  });
});

// ─── markRead ────────────────────────────────────────────

describe("markRead", () => {
  it("calls updateMany with the notification id and tenantId in the where clause", async () => {
    prisma.inAppNotification.updateMany.mockResolvedValue({ count: 1 });

    await markRead(NOTIF_ID, TENANT);

    expect(prisma.inAppNotification.updateMany).toHaveBeenCalledOnce();
    const { where } = prisma.inAppNotification.updateMany.mock.calls[0][0];
    expect(where.id).toBe(NOTIF_ID);
    expect(where.tenantId).toBe(TENANT);
  });

  it("sets isRead: true in the update data", async () => {
    prisma.inAppNotification.updateMany.mockResolvedValue({ count: 1 });

    await markRead(NOTIF_ID, TENANT);

    const { data } = prisma.inAppNotification.updateMany.mock.calls[0][0];
    expect(data.isRead).toBe(true);
  });

  it("returns the updateMany result from prisma", async () => {
    const result = { count: 1 };
    prisma.inAppNotification.updateMany.mockResolvedValue(result);

    const returned = await markRead(NOTIF_ID, TENANT);

    expect(returned).toBe(result);
  });
});

// ─── markAllRead ─────────────────────────────────────────

describe("markAllRead", () => {
  it("calls updateMany scoped to tenant with OR: [{ userId }, { userId: null }]", async () => {
    prisma.inAppNotification.updateMany.mockResolvedValue({ count: 3 });

    await markAllRead(TENANT, USER);

    expect(prisma.inAppNotification.updateMany).toHaveBeenCalledOnce();
    const { where } = prisma.inAppNotification.updateMany.mock.calls[0][0];
    expect(where.tenantId).toBe(TENANT);
    expect(where.OR).toEqual([{ userId: USER }, { userId: null }]);
  });

  it("only targets unread notifications by including isRead: false in where clause", async () => {
    prisma.inAppNotification.updateMany.mockResolvedValue({ count: 3 });

    await markAllRead(TENANT, USER);

    const { where } = prisma.inAppNotification.updateMany.mock.calls[0][0];
    expect(where.isRead).toBe(false);
  });

  it("sets isRead: true in the update data", async () => {
    prisma.inAppNotification.updateMany.mockResolvedValue({ count: 3 });

    await markAllRead(TENANT, USER);

    const { data } = prisma.inAppNotification.updateMany.mock.calls[0][0];
    expect(data.isRead).toBe(true);
  });

  it("returns the updateMany result from prisma", async () => {
    const result = { count: 3 };
    prisma.inAppNotification.updateMany.mockResolvedValue(result);

    const returned = await markAllRead(TENANT, USER);

    expect(returned).toBe(result);
  });
});
