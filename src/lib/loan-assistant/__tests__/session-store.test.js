import { describe, it, expect, vi, beforeEach } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
// Helper factories
// ─────────────────────────────────────────────────────────────────────────────

function makeLLMState(overrides = {}) {
  return {
    __type: "LLMConversationManager",
    customerProfile: { name: "Priya", monthly_income: 80000 },
    companyName: "TestFinance",
    aiAgentName: "Aria",
    callbackPhone: "9999999999",
    humanAdvisorName: "Rahul",
    tenantLanguage: "en",
    conversationHistory: [{ role: "ai", message: "Hello" }],
    currentStage: "OPENING",
    extractedData: { loanType: "personal", amount: 500000, timeline: null, employmentType: null },
    callMeta: { startTime: new Date().toISOString(), intent: null, confidence: 0 },
    ...overrides,
  };
}

function makeConvState(overrides = {}) {
  return {
    __type: "ConversationManager",
    customerProfile: { name: "Amit" },
    companyName: "DemoFinance",
    conversationHistory: [],
    currentStage: "DISCOVERY",
    extractedData: { loanType: null, amount: null, timeline: null, employmentType: null },
    callMeta: { startTime: new Date().toISOString(), intent: "interested", confidence: 0.9 },
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared mock setup helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns a fresh set of mocked ioredis + manager classes, then dynamically
 * imports session-store so each describe block gets a clean module instance.
 *
 * @param {"ok"|"fail"|"disabled"} redisMode
 *   "ok"       — Redis connects and works normally
 *   "fail"     — Redis.connect() throws (simulates unavailability)
 *   "disabled" — DISABLE_REDIS=true env path
 */
async function loadModule(redisMode) {
  vi.resetModules();

  // --- ioredis mock ---
  const redisMock = {
    connect: vi.fn(),
    get: vi.fn(),
    setex: vi.fn(),
    del: vi.fn(),
    disconnect: vi.fn(),
  };

  if (redisMode === "fail") {
    redisMock.connect.mockRejectedValue(new Error("ECONNREFUSED"));
  } else {
    redisMock.connect.mockResolvedValue(undefined);
  }

  // Default Redis operation stubs (return null — override per test)
  redisMock.get.mockResolvedValue(null);
  redisMock.setex.mockResolvedValue("OK");
  redisMock.del.mockResolvedValue(1);

  const RedisCtor = vi.fn(() => redisMock);

  vi.doMock("ioredis", () => ({ default: RedisCtor }));

  // --- LLMConversationManager mock ---
  // We need a real class so `instanceof` checks in session-store work correctly.
  // The constructor captures the args; we restore the serialized state fields
  // in deserialize so the returned object is testable.
  class MockLLMConversationManager {
    constructor(customerProfile, companyName, aiAgentName, callbackPhone, humanAdvisorName, tenantLanguage) {
      this.customerProfile = customerProfile;
      this.companyName = companyName;
      this.aiAgentName = aiAgentName;
      this.callbackPhone = callbackPhone;
      this.humanAdvisorName = humanAdvisorName;
      this.tenantLanguage = tenantLanguage;
      this.conversationHistory = [];
      this.currentStage = null;
      this.extractedData = null;
      this.callMeta = null;
    }
  }

  class MockConversationManager {
    constructor(customerProfile, companyName) {
      this.customerProfile = customerProfile;
      this.companyName = companyName;
      this.conversationHistory = [];
      this.currentStage = null;
      this.extractedData = null;
      this.callMeta = null;
    }
  }

  vi.doMock("@/modules/loan-assistant/llm-conversation-manager.js", () => ({
    LLMConversationManager: MockLLMConversationManager,
  }));

  vi.doMock("@/modules/loan-assistant/conversation-manager.js", () => ({
    ConversationManager: MockConversationManager,
  }));

  // --- env ---
  if (redisMode === "disabled") {
    process.env.DISABLE_REDIS = "true";
  } else {
    delete process.env.DISABLE_REDIS;
  }

  const storeModule = await import("@/lib/loan-assistant/session-store.js");

  return { storeModule, redisMock, RedisCtor, MockLLMConversationManager, MockConversationManager };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests — Redis available path
// ─────────────────────────────────────────────────────────────────────────────

describe("getSession — Redis available", () => {
  let getSession, redisMock, MockLLMConversationManager, MockConversationManager;

  beforeEach(async () => {
    const loaded = await loadModule("ok");
    getSession = loaded.storeModule.getSession;
    redisMock = loaded.redisMock;
    MockLLMConversationManager = loaded.MockLLMConversationManager;
    MockConversationManager = loaded.MockConversationManager;
  });

  it("returns null when Redis has no entry for the sessionId", async () => {
    redisMock.get.mockResolvedValue(null);
    const result = await getSession("sess-missing");
    expect(result).toBeNull();
  });

  it("calls Redis with the loan_session: prefixed key", async () => {
    redisMock.get.mockResolvedValue(null);
    await getSession("abc123");
    expect(redisMock.get).toHaveBeenCalledWith("loan_session:abc123");
  });

  it("deserializes an LLMConversationManager payload and returns an instance", async () => {
    const state = makeLLMState();
    redisMock.get.mockResolvedValue(JSON.stringify(state));

    const manager = await getSession("sess-llm");

    expect(manager).toBeInstanceOf(MockLLMConversationManager);
    expect(manager.companyName).toBe("TestFinance");
    expect(manager.conversationHistory).toEqual(state.conversationHistory);
    expect(manager.currentStage).toBe("OPENING");
    expect(manager.extractedData).toEqual(state.extractedData);
  });

  it("deserializes a ConversationManager payload and returns an instance", async () => {
    const state = makeConvState();
    redisMock.get.mockResolvedValue(JSON.stringify(state));

    const manager = await getSession("sess-conv");

    expect(manager).toBeInstanceOf(MockConversationManager);
    expect(manager.companyName).toBe("DemoFinance");
    expect(manager.currentStage).toBe("DISCOVERY");
    expect(manager.callMeta.intent).toBe("interested");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests — setSession via Redis
// ─────────────────────────────────────────────────────────────────────────────

describe("setSession — Redis available", () => {
  let setSession, redisMock, MockLLMConversationManager;

  beforeEach(async () => {
    const loaded = await loadModule("ok");
    setSession = loaded.storeModule.setSession;
    redisMock = loaded.redisMock;
    MockLLMConversationManager = loaded.MockLLMConversationManager;
  });

  it("calls setex with the prefixed key and 2-hour TTL", async () => {
    const manager = new MockLLMConversationManager(
      { name: "Test" }, "Co", "Agent", "0000", "Advisor", "en"
    );
    manager.conversationHistory = [];
    manager.currentStage = "OPENING";
    manager.extractedData = {};
    manager.callMeta = {};

    await setSession("sess-set", manager);

    expect(redisMock.setex).toHaveBeenCalledOnce();
    const [key, ttl, payload] = redisMock.setex.mock.calls[0];
    expect(key).toBe("loan_session:sess-set");
    expect(ttl).toBe(7200); // 2 * 60 * 60
    const parsed = JSON.parse(payload);
    expect(parsed.__type).toBe("LLMConversationManager");
    expect(parsed.companyName).toBe("Co");
  });

  it("serializes the manager state into the stored JSON", async () => {
    const manager = new MockLLMConversationManager(
      { name: "Raj" }, "FinCo", "Bot", "1234", "Adv", "hi"
    );
    manager.conversationHistory = [{ role: "customer", message: "haan" }];
    manager.currentStage = "DISCOVERY";
    manager.extractedData = { loanType: "home", amount: 2000000, timeline: null, employmentType: null };
    manager.callMeta = { intent: "interested", confidence: 0.8 };

    await setSession("sess-serial", manager);

    const payload = JSON.parse(redisMock.setex.mock.calls[0][2]);
    expect(payload.conversationHistory).toHaveLength(1);
    expect(payload.currentStage).toBe("DISCOVERY");
    expect(payload.extractedData.loanType).toBe("home");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests — deleteSession via Redis
// ─────────────────────────────────────────────────────────────────────────────

describe("deleteSession — Redis available", () => {
  let deleteSession, redisMock;

  beforeEach(async () => {
    const loaded = await loadModule("ok");
    deleteSession = loaded.storeModule.deleteSession;
    redisMock = loaded.redisMock;
  });

  it("calls Redis del with the prefixed key", async () => {
    await deleteSession("sess-del");
    expect(redisMock.del).toHaveBeenCalledWith("loan_session:sess-del");
  });

  it("does not throw when Redis del resolves 0 (key already absent)", async () => {
    redisMock.del.mockResolvedValue(0);
    await expect(deleteSession("sess-gone")).resolves.toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests — DISABLE_REDIS=true fallback path (in-memory Map)
// ─────────────────────────────────────────────────────────────────────────────

describe("Redis disabled — falls back to in-memory Map", () => {
  let getSession, setSession, deleteSession, MockConversationManager;

  beforeEach(async () => {
    const loaded = await loadModule("disabled");
    getSession = loaded.storeModule.getSession;
    setSession = loaded.storeModule.setSession;
    deleteSession = loaded.storeModule.deleteSession;
    MockConversationManager = loaded.MockConversationManager;
  });

  it("getSession returns null when Map has no entry", async () => {
    const result = await getSession("map-missing");
    expect(result).toBeNull();
  });

  it("setSession stores the manager in Map and getSession retrieves it", async () => {
    const manager = new MockConversationManager({ name: "Sunita" }, "MapCo");
    manager.currentStage = "PITCH";

    await setSession("map-sess", manager);
    const retrieved = await getSession("map-sess");

    expect(retrieved).toBe(manager); // same reference — no serialization in Map path
    expect(retrieved.currentStage).toBe("PITCH");
  });

  it("deleteSession removes the entry from the Map", async () => {
    const manager = new MockConversationManager({ name: "Kiran" }, "Co");
    await setSession("map-del", manager);
    await deleteSession("map-del");

    const result = await getSession("map-del");
    expect(result).toBeNull();
  });

  it("does not attempt to instantiate Redis when DISABLE_REDIS is true", async () => {
    const loaded = await loadModule("disabled");
    // RedisCtor should never have been called
    expect(loaded.RedisCtor).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests — Redis connection failure falls back to in-memory Map
// ─────────────────────────────────────────────────────────────────────────────

describe("Redis unavailable — falls back to in-memory Map", () => {
  let getSession, setSession, deleteSession, redisMock, MockConversationManager;

  beforeEach(async () => {
    const loaded = await loadModule("fail");
    getSession = loaded.storeModule.getSession;
    setSession = loaded.storeModule.setSession;
    deleteSession = loaded.storeModule.deleteSession;
    redisMock = loaded.redisMock;
    MockConversationManager = loaded.MockConversationManager;
  });

  it("getSession returns null when Redis is down and Map is empty", async () => {
    const result = await getSession("fail-missing");
    expect(result).toBeNull();
  });

  it("setSession stores manager in Map when Redis connection fails", async () => {
    const manager = new MockConversationManager({ name: "Dev" }, "FailCo");
    await setSession("fail-sess", manager);

    const retrieved = await getSession("fail-sess");
    expect(retrieved).toBe(manager);
  });

  it("deleteSession removes entry from Map when Redis is down", async () => {
    const manager = new MockConversationManager({ name: "Dev" }, "FailCo");
    await setSession("fail-del", manager);
    await deleteSession("fail-del");

    expect(await getSession("fail-del")).toBeNull();
  });

  it("does not propagate the Redis connection error to the caller", async () => {
    await expect(getSession("fail-no-throw")).resolves.toBeNull();
    await expect(setSession("fail-no-throw", new MockConversationManager({}, "C"))).resolves.toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests — key prefix is always applied
// ─────────────────────────────────────────────────────────────────────────────

describe("key prefix loan_session: is prepended in all Redis operations", () => {
  let getSession, setSession, deleteSession, redisMock, MockLLMConversationManager;

  beforeEach(async () => {
    const loaded = await loadModule("ok");
    getSession = loaded.storeModule.getSession;
    setSession = loaded.storeModule.setSession;
    deleteSession = loaded.storeModule.deleteSession;
    redisMock = loaded.redisMock;
    MockLLMConversationManager = loaded.MockLLMConversationManager;
  });

  it("getSession prefixes the sessionId when reading from Redis", async () => {
    await getSession("XYZ");
    expect(redisMock.get.mock.calls[0][0]).toBe("loan_session:XYZ");
  });

  it("setSession prefixes the sessionId when writing to Redis", async () => {
    const manager = new MockLLMConversationManager({}, "C", "A", "0", "Adv", "en");
    manager.conversationHistory = [];
    manager.currentStage = "OPENING";
    manager.extractedData = {};
    manager.callMeta = {};

    await setSession("XYZ", manager);
    expect(redisMock.setex.mock.calls[0][0]).toBe("loan_session:XYZ");
  });

  it("deleteSession prefixes the sessionId when deleting from Redis", async () => {
    await deleteSession("XYZ");
    expect(redisMock.del.mock.calls[0][0]).toBe("loan_session:XYZ");
  });
});
