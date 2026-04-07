import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock prisma — must be declared before imports that use it
vi.mock("@/lib/prisma", () => ({
  prisma: {
    webhookLog: { create: vi.fn() },
  },
}));

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { prisma } from "@/lib/prisma";
import { deliverWebhook } from "@/lib/webhooks/webhook-delivery";

// ─── Fixtures ────────────────────────────────────────────

const WEBHOOK = {
  id: "wh_1",
  tenantId: "tenant_1",
  url: "https://example.com/hook",
  secret: null,
};

const WEBHOOK_WITH_SECRET = {
  ...WEBHOOK,
  secret: "supersecret",
};

const EVENT = "call.completed";
const PAYLOAD = { callId: "call_1", duration: 60 };

const STUB_LOG = {
  id: "log_1",
  tenantId: WEBHOOK.tenantId,
  webhookId: WEBHOOK.id,
  event: EVENT,
  success: true,
};

function makeOkResponse(body = "OK") {
  return {
    ok: true,
    status: 200,
    text: vi.fn().mockResolvedValue(body),
  };
}

function makeErrorResponse(status = 500, body = "Internal Server Error") {
  return {
    ok: false,
    status,
    text: vi.fn().mockResolvedValue(body),
  };
}

// ─── Setup ───────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  prisma.webhookLog.create.mockResolvedValue(STUB_LOG);
});

// ─── Tests ───────────────────────────────────────────────

describe("deliverWebhook", () => {
  describe("successful delivery (HTTP 200)", () => {
    it("calls fetch with the correct URL and POST method", async () => {
      mockFetch.mockResolvedValue(makeOkResponse());

      await deliverWebhook(WEBHOOK, EVENT, PAYLOAD);

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe(WEBHOOK.url);
      expect(options.method).toBe("POST");
    });

    it("sends required headers on every request", async () => {
      mockFetch.mockResolvedValue(makeOkResponse());

      await deliverWebhook(WEBHOOK, EVENT, PAYLOAD);

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers["Content-Type"]).toBe("application/json");
      expect(options.headers["X-CRM-Event"]).toBe(EVENT);
      expect(options.headers["User-Agent"]).toBe("CRM-AI-Webhook/1.0");
    });

    it("sends a JSON body containing event, payload, and timestamp", async () => {
      mockFetch.mockResolvedValue(makeOkResponse());

      await deliverWebhook(WEBHOOK, EVENT, PAYLOAD);

      const [, options] = mockFetch.mock.calls[0];
      const parsed = JSON.parse(options.body);
      expect(parsed.event).toBe(EVENT);
      expect(parsed.payload).toEqual(PAYLOAD);
      expect(typeof parsed.timestamp).toBe("string");
    });

    it("creates a log entry with success=true and statusCode=200", async () => {
      mockFetch.mockResolvedValue(makeOkResponse());

      await deliverWebhook(WEBHOOK, EVENT, PAYLOAD);

      expect(prisma.webhookLog.create).toHaveBeenCalledOnce();
      const { data } = prisma.webhookLog.create.mock.calls[0][0];
      expect(data.success).toBe(true);
      expect(data.statusCode).toBe(200);
      expect(data.tenantId).toBe(WEBHOOK.tenantId);
      expect(data.webhookId).toBe(WEBHOOK.id);
      expect(data.event).toBe(EVENT);
    });
  });

  describe("failed delivery (HTTP 500)", () => {
    it("creates a log entry with success=false and statusCode=500", async () => {
      mockFetch.mockResolvedValue(makeErrorResponse(500));

      await deliverWebhook(WEBHOOK, EVENT, PAYLOAD);

      const { data } = prisma.webhookLog.create.mock.calls[0][0];
      expect(data.success).toBe(false);
      expect(data.statusCode).toBe(500);
    });
  });

  describe("network error (fetch throws)", () => {
    it("creates a log entry with success=false and statusCode=null", async () => {
      mockFetch.mockRejectedValue(new Error("ECONNREFUSED"));

      await deliverWebhook(WEBHOOK, EVENT, PAYLOAD);

      const { data } = prisma.webhookLog.create.mock.calls[0][0];
      expect(data.success).toBe(false);
      expect(data.statusCode).toBeNull();
    });

    it("stores the error message in the response field", async () => {
      mockFetch.mockRejectedValue(new Error("ECONNREFUSED"));

      await deliverWebhook(WEBHOOK, EVENT, PAYLOAD);

      const { data } = prisma.webhookLog.create.mock.calls[0][0];
      expect(data.response).toContain("ECONNREFUSED");
    });

    it("falls back to 'Network error' when the thrown value has no message", async () => {
      mockFetch.mockRejectedValue({});

      await deliverWebhook(WEBHOOK, EVENT, PAYLOAD);

      const { data } = prisma.webhookLog.create.mock.calls[0][0];
      expect(data.response).toBe("Network error");
    });
  });

  describe("HMAC signature", () => {
    it("adds X-CRM-Signature header starting with 'sha256=' when secret is set", async () => {
      mockFetch.mockResolvedValue(makeOkResponse());

      await deliverWebhook(WEBHOOK_WITH_SECRET, EVENT, PAYLOAD);

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers["X-CRM-Signature"]).toBeDefined();
      expect(options.headers["X-CRM-Signature"]).toMatch(/^sha256=[0-9a-f]{64}$/);
    });

    it("omits X-CRM-Signature header when no secret is set", async () => {
      mockFetch.mockResolvedValue(makeOkResponse());

      await deliverWebhook(WEBHOOK, EVENT, PAYLOAD);

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers["X-CRM-Signature"]).toBeUndefined();
    });

    it("produces a deterministic signature for the same secret and body", async () => {
      mockFetch.mockResolvedValue(makeOkResponse());

      // Freeze time so timestamp is identical across two calls
      const fixedDate = "2026-04-08T00:00:00.000Z";
      vi.setSystemTime(new Date(fixedDate));

      await deliverWebhook(WEBHOOK_WITH_SECRET, EVENT, PAYLOAD);
      const sig1 = mockFetch.mock.calls[0][1].headers["X-CRM-Signature"];

      mockFetch.mockClear();
      await deliverWebhook(WEBHOOK_WITH_SECRET, EVENT, PAYLOAD);
      const sig2 = mockFetch.mock.calls[0][1].headers["X-CRM-Signature"];

      expect(sig1).toBe(sig2);

      vi.useRealTimers();
    });
  });

  describe("response text truncation", () => {
    it("truncates the response body to 2000 characters when longer", async () => {
      const longBody = "x".repeat(3000);
      mockFetch.mockResolvedValue(makeOkResponse(longBody));

      await deliverWebhook(WEBHOOK, EVENT, PAYLOAD);

      const { data } = prisma.webhookLog.create.mock.calls[0][0];
      expect(data.response).toHaveLength(2000);
      expect(data.response).toBe("x".repeat(2000));
    });

    it("stores the full response body when it is 2000 characters or fewer", async () => {
      const shortBody = "x".repeat(500);
      mockFetch.mockResolvedValue(makeOkResponse(shortBody));

      await deliverWebhook(WEBHOOK, EVENT, PAYLOAD);

      const { data } = prisma.webhookLog.create.mock.calls[0][0];
      expect(data.response).toHaveLength(500);
    });

    it("stores null in the response field when the response body is empty", async () => {
      mockFetch.mockResolvedValue(makeOkResponse(""));

      await deliverWebhook(WEBHOOK, EVENT, PAYLOAD);

      const { data } = prisma.webhookLog.create.mock.calls[0][0];
      expect(data.response).toBeNull();
    });
  });

  describe("return value", () => {
    it("returns the created log entry from prisma", async () => {
      mockFetch.mockResolvedValue(makeOkResponse());

      const result = await deliverWebhook(WEBHOOK, EVENT, PAYLOAD);

      expect(result).toBe(STUB_LOG);
    });
  });
});
