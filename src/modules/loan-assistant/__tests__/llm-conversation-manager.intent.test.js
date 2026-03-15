import { beforeEach, describe, expect, it, vi } from "vitest";
import { CONVERSATION_STAGES } from "@/modules/loan-assistant/system-prompt.js";
import { LLMConversationManager } from "@/modules/loan-assistant/llm-conversation-manager.js";
import { runAIWithFailover } from "@/lib/ai/provider-router";

vi.mock("@/lib/ai/provider-router", () => ({
  runAIWithFailover: vi.fn(),
}));

describe("LLMConversationManager intent stability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps interested intent on neutral acknowledgement after qualification", async () => {
    runAIWithFailover.mockResolvedValue({
      provider: { name: "mock-provider" },
      result: {
        intent: "neutral",
        summary: "Customer acknowledged.",
        nextAction: "Proceed with next step.",
      },
    });

    const manager = new LLMConversationManager(
      {
        id: "c-1",
        name: "Test Customer",
      },
      "Test Finance",
      "Priya"
    );

    manager.callMeta.intent = "interested";
    manager.currentStage = CONVERSATION_STAGES.QUALIFICATION;
    manager.extractedData = {
      loanType: "home_loan",
      amount: 5000000,
      timeline: null,
      employmentType: null,
    };

    const result = await manager.processCustomerResponse("alright noted");

    expect(result.intent).toBe("interested");
    expect(result.shouldEnd).toBe(true);
    expect(result.nextStage).toBe(CONVERSATION_STAGES.CLOSING);
    expect(result.reasoning).toContain("prior_interest_persistence_guard");
  });

  it("keeps hindi explanation prompts on the interested path", async () => {
    runAIWithFailover.mockResolvedValue({
      provider: { name: "mock-provider" },
      result: {
        intent: "neutral",
        summary: "Customer asked for an explanation.",
        nextAction: "Explain the loan offering.",
      },
    });

    const manager = new LLMConversationManager(
      {
        id: "c-1b",
        name: "Test Customer",
      },
      "Test Finance",
      "Priya"
    );

    manager.callMeta.intent = "interested";
    manager.currentStage = CONVERSATION_STAGES.PITCH;

    const result = await manager.processCustomerResponse("aap kuch smjhane wale thi");

    expect(result.intent).toBe("interested");
    expect(result.confidence).toBeGreaterThanOrEqual(0.74);
    expect(result.shouldEnd).toBe(false);
    expect(result.nextStage).toBe(CONVERSATION_STAGES.PITCH);
  });

  it("keeps repetition complaints on the interested path instead of dropping to neutral", async () => {
    runAIWithFailover.mockResolvedValue({
      provider: { name: "mock-provider" },
      result: {
        intent: "neutral",
        summary: "Customer said the detail was already shared.",
        nextAction: "Acknowledge and continue.",
      },
    });

    const manager = new LLMConversationManager(
      {
        id: "c-1c",
        name: "Test Customer",
      },
      "Test Finance",
      "Priya"
    );

    manager.callMeta.intent = "interested";
    manager.currentStage = CONVERSATION_STAGES.PITCH;

    const result = await manager.processCustomerResponse("maine aapko bataya hua h");

    expect(result.intent).toBe("interested");
    expect(result.shouldEnd).toBe(false);
    expect(result.nextStage).toBe(CONVERSATION_STAGES.PITCH);
    expect(result.reasoning).toContain("repetition_complaint_guard");
  });

  it("still honors explicit negative response over persistence", async () => {
    runAIWithFailover.mockResolvedValue({
      provider: { name: "mock-provider" },
      result: {
        intent: "neutral",
        summary: "Customer declined.",
        nextAction: "Close conversation.",
      },
    });

    const manager = new LLMConversationManager(
      {
        id: "c-2",
        name: "Test Customer",
      },
      "Test Finance",
      "Priya"
    );

    manager.callMeta.intent = "interested";
    manager.currentStage = CONVERSATION_STAGES.QUALIFICATION;
    manager.extractedData = {
      loanType: "home_loan",
      amount: 5000000,
      timeline: null,
      employmentType: null,
    };

    const result = await manager.processCustomerResponse("not interested");

    expect(result.intent).toBe("not_interested");
    expect(result.shouldEnd).toBe(true);
  });

  it("treats late timing complaint as callback later and apologizes with morning callback", async () => {
    runAIWithFailover.mockResolvedValue({
      provider: { name: "mock-provider" },
      result: {
        intent: "not_interested",
        summary: "Customer says it is late for a call.",
        nextAction: "Close conversation.",
      },
    });

    const manager = new LLMConversationManager(
      {
        id: "c-3",
        name: "Test Customer",
      },
      "Test Finance",
      "Priya"
    );

    const result = await manager.processCustomerResponse("I said it's quite late for a call");
    const closingMessage = await manager.generateAIResponse("I said it's quite late for a call");

    expect(result.intent).toBe("call_back_later");
    expect(result.shouldEnd).toBe(true);
    expect(result.nextStage).toBe(CONVERSATION_STAGES.CLOSING);
    expect(result.reasoning).toContain("late_timing_callback_guard");
    expect(manager.callMeta.callbackTime).toBe("tomorrow morning");
    expect(closingMessage.toLowerCase()).toContain("sorry");
    expect(closingMessage.toLowerCase()).toContain("tomorrow morning");
  });

  it("treats hindi morning callback request as callback later and responds in hindi", async () => {
    runAIWithFailover.mockResolvedValue({
      provider: { name: "mock-provider" },
      result: {
        intent: "neutral",
        summary: "Customer requested a callback tomorrow morning.",
        nextAction: "Close conversation.",
      },
    });

    const manager = new LLMConversationManager(
      {
        id: "c-4",
        name: "Test Customer",
      },
      "Test Finance",
      "Priya"
    );

    const result = await manager.processCustomerResponse("अभी नहीं, कल सुबह कॉल करना");
    const closingMessage = await manager.generateAIResponse("अभी नहीं, कल सुबह कॉल करना");

    expect(result.intent).toBe("call_back_later");
    expect(result.shouldEnd).toBe(true);
    expect(result.extractedData.preferredCallbackTime).toBe("tomorrow morning");
    expect(manager.callMeta.callbackTime).toBe("tomorrow morning");
    expect(closingMessage).toContain("माफ़");
    expect(closingMessage).toContain("कल सुबह");
  });

  it("keeps after-time callback preference from hinglish requests", async () => {
    runAIWithFailover.mockResolvedValue({
      provider: { name: "mock-provider" },
      result: {
        intent: "neutral",
        summary: "Customer requested a callback after 10.",
        nextAction: "Close conversation.",
      },
    });

    const manager = new LLMConversationManager(
      {
        id: "c-5",
        name: "Test Customer",
      },
      "Test Finance",
      "Priya"
    );

    const result = await manager.processCustomerResponse("10 baje ke baad call karna");
    const closingMessage = await manager.generateAIResponse("10 baje ke baad call karna");

    expect(result.intent).toBe("call_back_later");
    expect(result.shouldEnd).toBe(true);
    expect(result.extractedData.preferredCallbackTime).toBe("after 10");
    expect(manager.callMeta.callbackTime).toBe("after 10");
    expect(closingMessage.toLowerCase()).toContain("10 baje ke baad");
  });
});
