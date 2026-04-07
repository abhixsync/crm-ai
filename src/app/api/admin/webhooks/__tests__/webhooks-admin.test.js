import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks (must be declared before imports) ──────────────────────────────────

vi.mock("@/lib/prisma", () => ({
  prisma: {
    webhookConfig: {
      findMany:   vi.fn(),
      findFirst:  vi.fn(),
      create:     vi.fn(),
      update:     vi.fn(),
      deleteMany: vi.fn(),
    },
    webhookLog: {
      findFirst: vi.fn(),
      findMany:  vi.fn(),
    },
  },
}));

vi.mock("@/lib/server/auth-guard", () => ({
  requireSession: vi.fn(async () => ({
    session: {
      user: { id: "user1" },
      role: "ADMIN",
      tenantId: "t1",
    },
    error: null,
  })),
  hasRole: vi.fn(() => true),
  getTenantContext: vi.fn(() => ({ tenantId: "t1", isSuperAdmin: false })),
}));

vi.mock("@/lib/webhooks/webhook-delivery", () => ({
  deliverWebhook: vi.fn(),
}));

vi.mock("@/lib/server/database-error", () => ({
  isDatabaseUnavailable:       vi.fn(() => false),
  databaseUnavailableResponse: vi.fn(() =>
    Response.json({ error: "db_unavailable" }, { status: 503 })
  ),
}));

// ─── Imports ──────────────────────────────────────────────────────────────────

import { prisma }          from "@/lib/prisma";
import { deliverWebhook }  from "@/lib/webhooks/webhook-delivery";

import { GET,  POST }             from "@/app/api/admin/webhooks/route.js";
import { PATCH, DELETE }          from "@/app/api/admin/webhooks/[id]/route.js";
import { POST as testPost }       from "@/app/api/admin/webhooks/[id]/test/route.js";
import { POST as retryPost }      from "@/app/api/admin/webhooks/[id]/retry/route.js";
import { GET  as logsGet }        from "@/app/api/admin/webhooks/[id]/logs/route.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TENANT_ID  = "t1";
const WEBHOOK_ID = "wh1";
const LOG_ID     = "log1";

const idParams = { params: Promise.resolve({ id: WEBHOOK_ID }) };

function makeWebhook(overrides = {}) {
  return {
    id:        WEBHOOK_ID,
    tenantId:  TENANT_ID,
    name:      "My Webhook",
    url:       "https://example.com/hook",
    events:    ["call.completed"],
    secret:    null,
    enabled:   true,
    logs:      [],
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeLog(overrides = {}) {
  return {
    id:           LOG_ID,
    webhookId:    WEBHOOK_ID,
    tenantId:     TENANT_ID,
    event:        "call.completed",
    payload:      { payload: { customerId: "c1" } },
    success:      true,
    statusCode:   200,
    response:     "OK",
    attemptCount: 1,
    createdAt:    new Date().toISOString(),
    ...overrides,
  };
}

function jsonRequest(method, body, url = "http://localhost/api/admin/webhooks") {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(body),
  });
}

// ─── beforeEach ───────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();

  prisma.webhookConfig.findMany.mockResolvedValue([makeWebhook()]);
  prisma.webhookConfig.findFirst.mockResolvedValue(makeWebhook());
  prisma.webhookConfig.create.mockResolvedValue(makeWebhook());
  prisma.webhookConfig.update.mockResolvedValue(makeWebhook({ enabled: false }));
  prisma.webhookConfig.deleteMany.mockResolvedValue({ count: 1 });

  prisma.webhookLog.findFirst.mockResolvedValue(makeLog());
  prisma.webhookLog.findMany.mockResolvedValue([makeLog()]);

  deliverWebhook.mockResolvedValue(makeLog());
});

// ═════════════════════════════════════════════════════════════════════════════
// GET /api/admin/webhooks — list
// ═════════════════════════════════════════════════════════════════════════════

describe("GET /api/admin/webhooks", () => {
  it("returns the webhook list for the tenant", async () => {
    const req = new Request("http://localhost/api/admin/webhooks");
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.webhooks).toHaveLength(1);
    expect(body.webhooks[0].id).toBe(WEBHOOK_ID);
  });

  it("queries only the caller's tenant", async () => {
    const req = new Request("http://localhost/api/admin/webhooks");
    await GET(req);

    expect(prisma.webhookConfig.findMany).toHaveBeenCalledOnce();
    const callArg = prisma.webhookConfig.findMany.mock.calls[0][0];
    expect(callArg.where.tenantId).toBe(TENANT_ID);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// POST /api/admin/webhooks — create
// ═════════════════════════════════════════════════════════════════════════════

describe("POST /api/admin/webhooks", () => {
  it("creates and returns a webhook when name, url and events are valid", async () => {
    const req = jsonRequest("POST", {
      name:   "My Webhook",
      url:    "https://example.com/hook",
      events: ["call.completed"],
    });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.webhook.id).toBe(WEBHOOK_ID);
    expect(prisma.webhookConfig.create).toHaveBeenCalledOnce();
  });

  it("returns 400 when name is missing", async () => {
    const req = jsonRequest("POST", {
      url:    "https://example.com/hook",
      events: ["call.completed"],
    });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/name/i);
  });

  it("returns 400 when url is missing", async () => {
    const req = jsonRequest("POST", {
      name:   "My Webhook",
      events: ["call.completed"],
    });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/url/i);
  });

  it("returns 400 when events array is empty", async () => {
    const req = jsonRequest("POST", {
      name:   "My Webhook",
      url:    "https://example.com/hook",
      events: [],
    });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/event/i);
  });

  it("returns 400 when events is not an array", async () => {
    const req = jsonRequest("POST", {
      name:   "My Webhook",
      url:    "https://example.com/hook",
      events: "call.completed",
    });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/event/i);
  });

  it("returns 400 when url is not a valid URL", async () => {
    const req = jsonRequest("POST", {
      name:   "My Webhook",
      url:    "not-a-valid-url",
      events: ["call.completed"],
    });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid url/i);
  });

  it("passes secret to prisma when provided", async () => {
    const req = jsonRequest("POST", {
      name:   "Secure Hook",
      url:    "https://example.com/hook",
      events: ["call.completed"],
      secret: "mysecret",
    });
    await POST(req);

    const createData = prisma.webhookConfig.create.mock.calls[0][0].data;
    expect(createData.secret).toBe("mysecret");
  });

  it("stores null secret when not provided", async () => {
    const req = jsonRequest("POST", {
      name:   "No Secret Hook",
      url:    "https://example.com/hook",
      events: ["call.completed"],
    });
    await POST(req);

    const createData = prisma.webhookConfig.create.mock.calls[0][0].data;
    expect(createData.secret).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// PATCH /api/admin/webhooks/[id] — update
// ═════════════════════════════════════════════════════════════════════════════

describe("PATCH /api/admin/webhooks/[id]", () => {
  it("toggles enabled to false and returns the updated webhook", async () => {
    const req = jsonRequest("PATCH", { enabled: false });
    const res = await PATCH(req, idParams);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.webhook.enabled).toBe(false);

    const updateArg = prisma.webhookConfig.update.mock.calls[0][0];
    expect(updateArg.data.enabled).toBe(false);
    expect(updateArg.where.id).toBe(WEBHOOK_ID);
  });

  it("toggles enabled to true", async () => {
    prisma.webhookConfig.update.mockResolvedValue(makeWebhook({ enabled: true }));
    const req = jsonRequest("PATCH", { enabled: true });
    const res = await PATCH(req, idParams);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.webhook.enabled).toBe(true);
  });

  it("returns 404 when webhook does not belong to tenant", async () => {
    prisma.webhookConfig.findFirst.mockResolvedValue(null);
    const req = jsonRequest("PATCH", { enabled: false });
    const res = await PATCH(req, idParams);

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Not found");
  });

  it("updates name and url fields when provided", async () => {
    const req = jsonRequest("PATCH", {
      name: "Renamed Hook",
      url:  "https://new.example.com/hook",
    });
    await PATCH(req, idParams);

    const updateData = prisma.webhookConfig.update.mock.calls[0][0].data;
    expect(updateData.name).toBe("Renamed Hook");
    expect(updateData.url).toBe("https://new.example.com/hook");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// DELETE /api/admin/webhooks/[id] — remove
// ═════════════════════════════════════════════════════════════════════════════

describe("DELETE /api/admin/webhooks/[id]", () => {
  it("deletes the webhook and returns ok: true", async () => {
    const req = new Request("http://localhost/api/admin/webhooks/wh1", {
      method: "DELETE",
    });
    const res = await DELETE(req, idParams);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);

    expect(prisma.webhookConfig.deleteMany).toHaveBeenCalledOnce();
    const deleteArg = prisma.webhookConfig.deleteMany.mock.calls[0][0];
    expect(deleteArg.where).toMatchObject({ id: WEBHOOK_ID, tenantId: TENANT_ID });
  });

  it("returns 404 when no rows were deleted", async () => {
    prisma.webhookConfig.deleteMany.mockResolvedValue({ count: 0 });
    const req = new Request("http://localhost/api/admin/webhooks/wh1", {
      method: "DELETE",
    });
    const res = await DELETE(req, idParams);

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Not found");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// POST /api/admin/webhooks/[id]/test — fire test delivery
// ═════════════════════════════════════════════════════════════════════════════

describe("POST /api/admin/webhooks/[id]/test", () => {
  it("calls deliverWebhook with the webhook.test event", async () => {
    const req = new Request("http://localhost/api/admin/webhooks/wh1/test", {
      method: "POST",
    });
    const res = await testPost(req, idParams);

    expect(res.status).toBe(200);
    expect(deliverWebhook).toHaveBeenCalledOnce();

    const [webhookArg, eventArg, payloadArg] = deliverWebhook.mock.calls[0];
    expect(webhookArg.id).toBe(WEBHOOK_ID);
    expect(eventArg).toBe("webhook.test");
    expect(payloadArg).toMatchObject({
      message:     "This is a test delivery from CRM AI.",
      webhookId:   WEBHOOK_ID,
      webhookName: "My Webhook",
    });
  });

  it("returns the delivery log in the response", async () => {
    const req = new Request("http://localhost/api/admin/webhooks/wh1/test", {
      method: "POST",
    });
    const res = await testPost(req, idParams);
    const body = await res.json();

    expect(body.log).toBeDefined();
    expect(body.log.id).toBe(LOG_ID);
  });

  it("returns 404 when webhook does not exist for tenant", async () => {
    prisma.webhookConfig.findFirst.mockResolvedValue(null);
    const req = new Request("http://localhost/api/admin/webhooks/wh1/test", {
      method: "POST",
    });
    const res = await testPost(req, idParams);

    expect(res.status).toBe(404);
    expect(deliverWebhook).not.toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// POST /api/admin/webhooks/[id]/retry — replay a log entry
// ═════════════════════════════════════════════════════════════════════════════

describe("POST /api/admin/webhooks/[id]/retry", () => {
  it("returns 400 when logId is not provided", async () => {
    const req = jsonRequest("POST", {});
    const res = await retryPost(req, idParams);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/logId/i);
    expect(deliverWebhook).not.toHaveBeenCalled();
  });

  it("calls deliverWebhook with the original log event and payload", async () => {
    const originalLog = makeLog({
      event:   "call.completed",
      payload: { payload: { customerId: "c1" } },
    });
    prisma.webhookLog.findFirst.mockResolvedValue(originalLog);

    const req = jsonRequest("POST", { logId: LOG_ID });
    const res = await retryPost(req, idParams);

    expect(res.status).toBe(200);
    expect(deliverWebhook).toHaveBeenCalledOnce();

    const [webhookArg, eventArg, payloadArg] = deliverWebhook.mock.calls[0];
    expect(webhookArg.id).toBe(WEBHOOK_ID);
    expect(eventArg).toBe("call.completed");
    // route extracts payload.payload when nested
    expect(payloadArg).toEqual({ customerId: "c1" });
  });

  it("returns the new delivery log in the response", async () => {
    const req = jsonRequest("POST", { logId: LOG_ID });
    const res = await retryPost(req, idParams);
    const body = await res.json();

    expect(body.log).toBeDefined();
    expect(body.log.id).toBe(LOG_ID);
  });

  it("returns 404 when the original log entry is not found", async () => {
    prisma.webhookLog.findFirst.mockResolvedValue(null);

    const req = jsonRequest("POST", { logId: "nonexistent" });
    const res = await retryPost(req, idParams);

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/log entry/i);
    expect(deliverWebhook).not.toHaveBeenCalled();
  });

  it("returns 404 when the webhook itself is not found", async () => {
    prisma.webhookConfig.findFirst.mockResolvedValue(null);

    const req = jsonRequest("POST", { logId: LOG_ID });
    const res = await retryPost(req, idParams);

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/webhook/i);
    expect(deliverWebhook).not.toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// GET /api/admin/webhooks/[id]/logs — paginated log list
// ═════════════════════════════════════════════════════════════════════════════

describe("GET /api/admin/webhooks/[id]/logs", () => {
  it("returns the log list for the webhook", async () => {
    const req = new Request(
      "http://localhost/api/admin/webhooks/wh1/logs"
    );
    const res = await logsGet(req, idParams);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.logs).toHaveLength(1);
    expect(body.logs[0].id).toBe(LOG_ID);
  });

  it("queries only logs belonging to the correct webhook and tenant", async () => {
    const req = new Request(
      "http://localhost/api/admin/webhooks/wh1/logs"
    );
    await logsGet(req, idParams);

    const callArg = prisma.webhookLog.findMany.mock.calls[0][0];
    expect(callArg.where).toMatchObject({
      webhookId: WEBHOOK_ID,
      tenantId:  TENANT_ID,
    });
  });

  it("uses default limit of 20 when not specified", async () => {
    const req = new Request(
      "http://localhost/api/admin/webhooks/wh1/logs"
    );
    await logsGet(req, idParams);

    const callArg = prisma.webhookLog.findMany.mock.calls[0][0];
    expect(callArg.take).toBe(20);
  });

  it("respects a custom limit query parameter", async () => {
    const req = new Request(
      "http://localhost/api/admin/webhooks/wh1/logs?limit=5"
    );
    await logsGet(req, idParams);

    const callArg = prisma.webhookLog.findMany.mock.calls[0][0];
    expect(callArg.take).toBe(5);
  });

  it("caps the limit at 100", async () => {
    const req = new Request(
      "http://localhost/api/admin/webhooks/wh1/logs?limit=999"
    );
    await logsGet(req, idParams);

    const callArg = prisma.webhookLog.findMany.mock.calls[0][0];
    expect(callArg.take).toBe(100);
  });

  it("returns 404 when the webhook does not belong to the tenant", async () => {
    prisma.webhookConfig.findFirst.mockResolvedValue(null);
    const req = new Request(
      "http://localhost/api/admin/webhooks/wh1/logs"
    );
    const res = await logsGet(req, idParams);

    expect(res.status).toBe(404);
    expect(prisma.webhookLog.findMany).not.toHaveBeenCalled();
  });
});
