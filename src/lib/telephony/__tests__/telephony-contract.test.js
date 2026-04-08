import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Twilio SDK mock — must be hoisted before adapter import ──────────────────
// Use a stable singleton client so tests can reference mockCallsCreate directly
// without chasing twilio.mock.results (which is wiped by vi.clearAllMocks).
const mockCallsCreate = vi.fn();
const mockAccountsFetch = vi.fn();

vi.mock("twilio", () => ({
  default: vi.fn(() => ({
    calls: {
      create: mockCallsCreate,
    },
    api: {
      accounts: vi.fn(() => ({
        fetch: mockAccountsFetch,
      })),
    },
  })),
}));

import twilio from "twilio";
import { createTwilioAdapter } from "@/lib/telephony/adapters/twilio-adapter";
import { createVonageAdapter } from "@/lib/telephony/adapters/vonage-adapter";
import { createPlivoAdapter } from "@/lib/telephony/adapters/plivo-adapter";
import { TELEPHONY_OPERATIONS } from "@/lib/telephony/telephony-contract";

const VALID_PAYLOAD = {
  to: "+15551234567",
  from: "+15559876543",
  fromNumber: "+15559876543",
  script: "Hello",
};

// ─── Twilio ───────────────────────────────────────────────────────────────────

describe("TwilioAdapter — status mapping via mapStatus()", () => {
  let adapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = createTwilioAdapter();
  });

  // The adapter exposes mapStatus directly (via createTelephonyAdapter wrapper)
  it("maps 'queued' to INITIATED", () => {
    expect(adapter.mapStatus("queued")).toBe("INITIATED");
  });

  it("maps 'ringing' to INITIATED", () => {
    expect(adapter.mapStatus("ringing")).toBe("INITIATED");
  });

  it("maps 'initiated' to INITIATED", () => {
    expect(adapter.mapStatus("initiated")).toBe("INITIATED");
  });

  it("maps 'in-progress' to ANSWERED", () => {
    expect(adapter.mapStatus("in-progress")).toBe("ANSWERED");
  });

  it("maps 'answered' to ANSWERED", () => {
    expect(adapter.mapStatus("answered")).toBe("ANSWERED");
  });

  it("maps 'completed' to COMPLETED", () => {
    expect(adapter.mapStatus("completed")).toBe("COMPLETED");
  });

  it("maps 'no-answer' to NO_ANSWER", () => {
    expect(adapter.mapStatus("no-answer")).toBe("NO_ANSWER");
  });

  it("maps 'busy' to NO_ANSWER", () => {
    expect(adapter.mapStatus("busy")).toBe("NO_ANSWER");
  });

  it("maps 'canceled' to NO_ANSWER", () => {
    expect(adapter.mapStatus("canceled")).toBe("NO_ANSWER");
  });

  it("maps 'failed' to FAILED", () => {
    expect(adapter.mapStatus("failed")).toBe("FAILED");
  });

  it("maps an unknown status string to INITIATED (fallback)", () => {
    expect(adapter.mapStatus("some-unknown-status")).toBe("INITIATED");
  });

  it("maps null/undefined to INITIATED (fallback)", () => {
    expect(adapter.mapStatus(null)).toBe("INITIATED");
    expect(adapter.mapStatus(undefined)).toBe("INITIATED");
  });

  it("is case-insensitive — 'Completed' maps to COMPLETED", () => {
    expect(adapter.mapStatus("Completed")).toBe("COMPLETED");
  });
});

describe("TwilioAdapter — initiateCall status propagation", () => {
  let adapter;

  beforeEach(() => {
    vi.clearAllMocks();
    // Provide real credentials so the adapter goes past the mock-mode branch
    process.env.TWILIO_ACCOUNT_SID = "ACtest";
    process.env.TWILIO_AUTH_TOKEN = "tokentest";
    process.env.TWILIO_FROM_NUMBER = "+15559876543";
    adapter = createTwilioAdapter();
  });

  afterEach(() => {
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
    delete process.env.TWILIO_FROM_NUMBER;
  });

  async function callWithStatus(providerStatus) {
    mockCallsCreate.mockResolvedValue({ sid: "CA123", status: providerStatus });
    return adapter.run({
      operation: TELEPHONY_OPERATIONS.INITIATE_CALL,
      payload: VALID_PAYLOAD,
    });
  }

  it("returns status INITIATED when Twilio reports 'queued'", async () => {
    const result = await callWithStatus("queued");
    expect(result.status).toBe("INITIATED");
  });

  it("returns status ANSWERED when Twilio reports 'in-progress'", async () => {
    const result = await callWithStatus("in-progress");
    expect(result.status).toBe("ANSWERED");
  });

  it("returns status COMPLETED when Twilio reports 'completed'", async () => {
    const result = await callWithStatus("completed");
    expect(result.status).toBe("COMPLETED");
  });

  it("returns status NO_ANSWER when Twilio reports 'no-answer'", async () => {
    const result = await callWithStatus("no-answer");
    expect(result.status).toBe("NO_ANSWER");
  });

  it("returns status NO_ANSWER when Twilio reports 'busy'", async () => {
    const result = await callWithStatus("busy");
    expect(result.status).toBe("NO_ANSWER");
  });

  it("returns status FAILED when Twilio reports 'failed'", async () => {
    const result = await callWithStatus("failed");
    expect(result.status).toBe("FAILED");
  });

  it("returns status INITIATED for an unknown Twilio status (fallback)", async () => {
    const result = await callWithStatus("weird-future-status");
    expect(result.status).toBe("INITIATED");
  });
});

describe("TwilioAdapter — mock mode when credentials are missing", () => {
  let adapter;

  beforeEach(() => {
    vi.clearAllMocks();
    // Ensure env vars are absent
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
    delete process.env.TWILIO_FROM_NUMBER;
    delete process.env.TWILIO_CALLER_ID;
    adapter = createTwilioAdapter();
  });

  it("returns providerLabel 'twilio-mock' when credentials are missing", async () => {
    const result = await adapter.run({
      operation: TELEPHONY_OPERATIONS.INITIATE_CALL,
      payload: { to: "+15551234567" },
    });
    expect(result.providerLabel).toBe("twilio-mock");
  });

  it("returns status INITIATED in mock mode", async () => {
    const result = await adapter.run({
      operation: TELEPHONY_OPERATIONS.INITIATE_CALL,
      payload: { to: "+15551234567" },
    });
    expect(result.status).toBe("INITIATED");
  });

  it("returns a providerCallId that starts with 'mock-' in mock mode", async () => {
    const result = await adapter.run({
      operation: TELEPHONY_OPERATIONS.INITIATE_CALL,
      payload: { to: "+15551234567" },
    });
    expect(result.providerCallId).toMatch(/^mock-\d+$/);
  });

  it("does not call the twilio SDK in mock mode", async () => {
    await adapter.run({
      operation: TELEPHONY_OPERATIONS.INITIATE_CALL,
      payload: { to: "+15551234567" },
    });
    expect(twilio).not.toHaveBeenCalled();
  });
});

describe("TwilioAdapter — E.164 validation", () => {
  let adapter;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TWILIO_ACCOUNT_SID = "ACtest";
    process.env.TWILIO_AUTH_TOKEN = "tokentest";
    process.env.TWILIO_FROM_NUMBER = "+15559876543";
    adapter = createTwilioAdapter();
  });

  afterEach(() => {
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
    delete process.env.TWILIO_FROM_NUMBER;
  });

  it("throws with E.164 message when 'to' number is not E.164", async () => {
    await expect(
      adapter.run({
        operation: TELEPHONY_OPERATIONS.INITIATE_CALL,
        payload: { to: "555", fromNumber: "+15559876543" },
      })
    ).rejects.toThrow(/E\.164/);
  });
});

describe("TwilioAdapter — contract return shape", () => {
  let adapter;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TWILIO_ACCOUNT_SID = "ACtest";
    process.env.TWILIO_AUTH_TOKEN = "tokentest";
    process.env.TWILIO_FROM_NUMBER = "+15559876543";
    adapter = createTwilioAdapter();
    mockCallsCreate.mockResolvedValue({ sid: "CA_shape_test", status: "queued" });
  });

  afterEach(() => {
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
    delete process.env.TWILIO_FROM_NUMBER;
  });

  it("return value always contains providerCallId, status, providerLabel, metadata", async () => {
    const result = await adapter.run({
      operation: TELEPHONY_OPERATIONS.INITIATE_CALL,
      payload: VALID_PAYLOAD,
    });
    expect(result).toHaveProperty("providerCallId");
    expect(result).toHaveProperty("status");
    expect(result).toHaveProperty("providerLabel");
    expect(result).toHaveProperty("metadata");
  });

  it("providerCallId matches the sid returned by Twilio", async () => {
    const result = await adapter.run({
      operation: TELEPHONY_OPERATIONS.INITIATE_CALL,
      payload: VALID_PAYLOAD,
    });
    expect(result.providerCallId).toBe("CA_shape_test");
  });

  it("providerLabel is 'twilio'", async () => {
    const result = await adapter.run({
      operation: TELEPHONY_OPERATIONS.INITIATE_CALL,
      payload: VALID_PAYLOAD,
    });
    expect(result.providerLabel).toBe("twilio");
  });
});

// ─── Vonage ───────────────────────────────────────────────────────────────────

describe("VonageAdapter — status mapping via mapStatus()", () => {
  let adapter;

  beforeEach(() => {
    adapter = createVonageAdapter();
  });

  it("maps 'started' to INITIATED", () => {
    expect(adapter.mapStatus("started")).toBe("INITIATED");
  });

  it("maps 'ringing' to INITIATED", () => {
    expect(adapter.mapStatus("ringing")).toBe("INITIATED");
  });

  it("maps 'initiated' to INITIATED", () => {
    expect(adapter.mapStatus("initiated")).toBe("INITIATED");
  });

  it("maps 'answered' to ANSWERED", () => {
    expect(adapter.mapStatus("answered")).toBe("ANSWERED");
  });

  it("maps 'in-progress' to ANSWERED", () => {
    expect(adapter.mapStatus("in-progress")).toBe("ANSWERED");
  });

  it("maps 'completed' to COMPLETED", () => {
    expect(adapter.mapStatus("completed")).toBe("COMPLETED");
  });

  it("maps 'timeout' to NO_ANSWER", () => {
    expect(adapter.mapStatus("timeout")).toBe("NO_ANSWER");
  });

  it("maps 'busy' to NO_ANSWER", () => {
    expect(adapter.mapStatus("busy")).toBe("NO_ANSWER");
  });

  it("maps 'unanswered' to NO_ANSWER", () => {
    expect(adapter.mapStatus("unanswered")).toBe("NO_ANSWER");
  });

  it("maps 'rejected' to NO_ANSWER", () => {
    expect(adapter.mapStatus("rejected")).toBe("NO_ANSWER");
  });

  it("maps 'failed' to FAILED", () => {
    expect(adapter.mapStatus("failed")).toBe("FAILED");
  });

  it("maps an unknown status string to INITIATED (fallback)", () => {
    expect(adapter.mapStatus("some-unknown-status")).toBe("INITIATED");
  });
});

describe("VonageAdapter — throws when credentials are missing", () => {
  let adapter;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.VONAGE_APPLICATION_ID;
    delete process.env.VONAGE_PRIVATE_KEY;
    delete process.env.VONAGE_FROM_NUMBER;
    adapter = createVonageAdapter();
  });

  it("throws when applicationId is missing", async () => {
    await expect(
      adapter.run({
        operation: TELEPHONY_OPERATIONS.INITIATE_CALL,
        payload: { to: "+15551234567", callbackUrl: "https://example.com/ncco" },
        config: { metadata: { privateKey: "key", fromNumber: "+15559876543" } },
      })
    ).rejects.toThrow(/applicationId/);
  });

  it("throws when privateKey is missing", async () => {
    await expect(
      adapter.run({
        operation: TELEPHONY_OPERATIONS.INITIATE_CALL,
        payload: { to: "+15551234567", callbackUrl: "https://example.com/ncco" },
        config: { metadata: { applicationId: "app-id", fromNumber: "+15559876543" } },
      })
    ).rejects.toThrow(/privateKey/);
  });

  it("throws when fromNumber is missing", async () => {
    await expect(
      adapter.run({
        operation: TELEPHONY_OPERATIONS.INITIATE_CALL,
        payload: { to: "+15551234567", callbackUrl: "https://example.com/ncco" },
        config: { metadata: { applicationId: "app-id", privateKey: "key" } },
      })
    ).rejects.toThrow(/fromNumber/);
  });
});

describe("VonageAdapter — initiateCall contract shape via fetch mock", () => {
  let adapter;
  let fetchSpy;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = createVonageAdapter();

    // Minimal valid Vonage credentials (RSA private key is needed for JWT signing;
    // use a real test key pair would be complex — instead we mock fetch so the JWT
    // signing path is exercised but the network call is intercepted)
    fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ uuid: "vonage-uuid-001" }),
    });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  // Vonage needs a real RSA private key to sign the JWT; generate a minimal one inline
  // using Node's crypto so we don't hardcode a static key in the repo.
  async function callVonageWithRealKey() {
    const { generateKeyPairSync } = await import("crypto");
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const pem = privateKey.export({ type: "pkcs8", format: "pem" });

    return adapter.run({
      operation: TELEPHONY_OPERATIONS.INITIATE_CALL,
      payload: {
        to: "+15551234567",
        callbackUrl: "https://example.com/ncco",
      },
      config: {
        metadata: {
          applicationId: "test-app-id",
          privateKey: pem,
          fromNumber: "+15559876543",
        },
      },
    });
  }

  it("return value contains providerCallId, status, providerLabel, metadata", async () => {
    const result = await callVonageWithRealKey();
    expect(result).toHaveProperty("providerCallId");
    expect(result).toHaveProperty("status");
    expect(result).toHaveProperty("providerLabel");
    expect(result).toHaveProperty("metadata");
  });

  it("providerCallId is the uuid from the Vonage response", async () => {
    const result = await callVonageWithRealKey();
    expect(result.providerCallId).toBe("vonage-uuid-001");
  });

  it("providerLabel is 'vonage'", async () => {
    const result = await callVonageWithRealKey();
    expect(result.providerLabel).toBe("vonage");
  });

  it("status is always INITIATED (Vonage does not report final status at call creation)", async () => {
    const result = await callVonageWithRealKey();
    expect(result.status).toBe("INITIATED");
  });

  it("throws when Vonage API returns a non-ok response", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ title: "Unauthorized", detail: "Invalid credentials" }),
    });
    await expect(callVonageWithRealKey()).rejects.toThrow(/Unauthorized|Invalid credentials|Vonage call initiation failed/);
  });
});

// ─── Plivo ────────────────────────────────────────────────────────────────────

describe("PlivoAdapter — status mapping via mapStatus()", () => {
  let adapter;

  beforeEach(() => {
    adapter = createPlivoAdapter();
  });

  it("maps 'queued' to INITIATED", () => {
    expect(adapter.mapStatus("queued")).toBe("INITIATED");
  });

  it("maps 'ringing' to INITIATED", () => {
    expect(adapter.mapStatus("ringing")).toBe("INITIATED");
  });

  it("maps 'initiated' to INITIATED", () => {
    expect(adapter.mapStatus("initiated")).toBe("INITIATED");
  });

  it("maps 'in-progress' to ANSWERED", () => {
    expect(adapter.mapStatus("in-progress")).toBe("ANSWERED");
  });

  it("maps 'answered' to ANSWERED", () => {
    expect(adapter.mapStatus("answered")).toBe("ANSWERED");
  });

  it("maps 'completed' to COMPLETED", () => {
    expect(adapter.mapStatus("completed")).toBe("COMPLETED");
  });

  it("maps 'busy' to NO_ANSWER", () => {
    expect(adapter.mapStatus("busy")).toBe("NO_ANSWER");
  });

  it("maps 'no-answer' to NO_ANSWER", () => {
    expect(adapter.mapStatus("no-answer")).toBe("NO_ANSWER");
  });

  // Plivo uses 'cancelled' (double-l), not 'canceled'
  it("maps 'cancelled' to NO_ANSWER", () => {
    expect(adapter.mapStatus("cancelled")).toBe("NO_ANSWER");
  });

  it("maps 'failed' to FAILED", () => {
    expect(adapter.mapStatus("failed")).toBe("FAILED");
  });

  it("maps an unknown status string to INITIATED (fallback)", () => {
    expect(adapter.mapStatus("some-unknown-status")).toBe("INITIATED");
  });
});

describe("PlivoAdapter — throws when credentials are missing", () => {
  let adapter;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.PLIVO_AUTH_ID;
    delete process.env.PLIVO_AUTH_TOKEN;
    delete process.env.PLIVO_FROM_NUMBER;
    adapter = createPlivoAdapter();
  });

  it("throws when authId/authToken/fromNumber are all absent", async () => {
    await expect(
      adapter.run({
        operation: TELEPHONY_OPERATIONS.INITIATE_CALL,
        payload: {
          to: "+15551234567",
          callbackUrl: "https://example.com/answer",
        },
      })
    ).rejects.toThrow(/authId|authToken|fromNumber/);
  });
});

describe("PlivoAdapter — throws when callbackUrl is missing", () => {
  let adapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = createPlivoAdapter();
  });

  it("throws when callbackUrl is not provided", async () => {
    await expect(
      adapter.run({
        operation: TELEPHONY_OPERATIONS.INITIATE_CALL,
        payload: { to: "+15551234567" },
        config: {
          metadata: {
            authId: "plivo-auth-id",
            authToken: "plivo-auth-token",
            fromNumber: "+15559876543",
          },
        },
      })
    ).rejects.toThrow(/callbackUrl/);
  });
});

describe("PlivoAdapter — initiateCall contract shape via fetch mock", () => {
  let adapter;
  let fetchSpy;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = createPlivoAdapter();
    fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ request_uuid: "plivo-req-uuid-001", message: "call fired" }),
    });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  const PLIVO_CONFIG = {
    metadata: {
      authId: "plivo-auth-id",
      authToken: "plivo-auth-token",
      fromNumber: "+15559876543",
    },
  };

  const PLIVO_PAYLOAD = {
    to: "+15551234567",
    callbackUrl: "https://example.com/answer",
  };

  it("return value contains providerCallId, status, providerLabel, metadata", async () => {
    const result = await adapter.run({
      operation: TELEPHONY_OPERATIONS.INITIATE_CALL,
      payload: PLIVO_PAYLOAD,
      config: PLIVO_CONFIG,
    });
    expect(result).toHaveProperty("providerCallId");
    expect(result).toHaveProperty("status");
    expect(result).toHaveProperty("providerLabel");
    expect(result).toHaveProperty("metadata");
  });

  it("providerCallId is request_uuid from the Plivo response", async () => {
    const result = await adapter.run({
      operation: TELEPHONY_OPERATIONS.INITIATE_CALL,
      payload: PLIVO_PAYLOAD,
      config: PLIVO_CONFIG,
    });
    expect(result.providerCallId).toBe("plivo-req-uuid-001");
  });

  it("providerLabel is 'plivo'", async () => {
    const result = await adapter.run({
      operation: TELEPHONY_OPERATIONS.INITIATE_CALL,
      payload: PLIVO_PAYLOAD,
      config: PLIVO_CONFIG,
    });
    expect(result.providerLabel).toBe("plivo");
  });

  it("status is always INITIATED (Plivo does not report final status at call creation)", async () => {
    const result = await adapter.run({
      operation: TELEPHONY_OPERATIONS.INITIATE_CALL,
      payload: PLIVO_PAYLOAD,
      config: PLIVO_CONFIG,
    });
    expect(result.status).toBe("INITIATED");
  });

  it("throws when Plivo API returns a non-ok response", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "Bad credentials" }),
    });
    await expect(
      adapter.run({
        operation: TELEPHONY_OPERATIONS.INITIATE_CALL,
        payload: PLIVO_PAYLOAD,
        config: PLIVO_CONFIG,
      })
    ).rejects.toThrow(/Bad credentials|Plivo call initiation failed/);
  });

  it("throws E.164 error when 'to' number cannot be normalised to E.164", async () => {
    await expect(
      adapter.run({
        operation: TELEPHONY_OPERATIONS.INITIATE_CALL,
        payload: { to: "555", callbackUrl: "https://example.com/answer" },
        config: PLIVO_CONFIG,
      })
    ).rejects.toThrow(/E\.164/);
  });
});

// ─── Contract: unsupported operation ─────────────────────────────────────────

describe("Adapter contract — unsupported operation throws", () => {
  it("TwilioAdapter throws for an unknown operation", async () => {
    const adapter = createTwilioAdapter();
    await expect(
      adapter.run({ operation: "UNKNOWN_OP", payload: {} })
    ).rejects.toThrow(/Unsupported telephony operation/);
  });

  it("VonageAdapter throws for an unknown operation", async () => {
    const adapter = createVonageAdapter();
    await expect(
      adapter.run({ operation: "UNKNOWN_OP", payload: {} })
    ).rejects.toThrow(/Unsupported telephony operation/);
  });

  it("PlivoAdapter throws for an unknown operation", async () => {
    const adapter = createPlivoAdapter();
    await expect(
      adapter.run({ operation: "UNKNOWN_OP", payload: {} })
    ).rejects.toThrow(/Unsupported telephony operation/);
  });
});
