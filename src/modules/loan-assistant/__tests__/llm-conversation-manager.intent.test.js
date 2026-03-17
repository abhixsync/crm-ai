import { beforeEach, describe, expect, it, vi } from "vitest";
import { CONVERSATION_STAGES } from "@/modules/loan-assistant/system-prompt.js";
import { LLMConversationManager } from "@/modules/loan-assistant/llm-conversation-manager.js";
import { detectLanguageStyleFromText } from "@/lib/ai/language-style.js";
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

  it("answers maximum amount questions with a contextual explanation", async () => {
    runAIWithFailover.mockResolvedValue({
      provider: { name: "mock-provider" },
      result: {
        reply: "What approximate amount are you planning for?",
      },
    });

    const manager = new LLMConversationManager(
      {
        id: "c-6",
        name: "Test Customer",
      },
      "Test Finance",
      "Priya"
    );

    manager.callMeta.intent = "interested";
    manager.currentStage = CONVERSATION_STAGES.PITCH;
    manager.extractedData = {
      loanType: "business_loan",
      amount: null,
      timeline: null,
      employmentType: null,
    };
    manager.conversationHistory.push({
      role: "ai",
      message: "What approximate amount are you planning for?",
      timestamp: new Date(),
    });

    const reply = await manager.generateAIResponse("maximum you can provide");

    expect(reply.toLowerCase()).toContain("maximum amount");
    // After acknowledging maximum, should ask for the next missing detail (timeline)
    expect(reply.toLowerCase()).toContain("kab tak");
  });

  it("acknowledges repetition complaints and moves to the next missing detail", async () => {
    runAIWithFailover.mockResolvedValue({
      provider: { name: "mock-provider" },
      result: {
        reply: "What approximate amount are you planning for?",
      },
    });

    const manager = new LLMConversationManager(
      {
        id: "c-7",
        name: "Test Customer",
      },
      "Test Finance",
      "Priya"
    );

    manager.callMeta.intent = "interested";
    manager.currentStage = CONVERSATION_STAGES.PITCH;
    manager.extractedData = {
      loanType: "business_loan",
      amount: 10000000,
      timeline: null,
      employmentType: null,
    };
    manager.conversationHistory.push({
      role: "ai",
      message: "What approximate amount are you planning for?",
      timestamp: new Date(),
    });

    const reply = await manager.generateAIResponse("you already asked me this question before");

    expect(reply.toLowerCase()).toContain("will not repeat");
    expect(reply.toLowerCase()).toContain("by when do you need");
  });

  it("treats short proceed confirmations as consent to continue from the current step", async () => {
    runAIWithFailover.mockResolvedValue({
      provider: { name: "mock-provider" },
      result: {
        reply: "Please continue.",
      },
    });

    const manager = new LLMConversationManager(
      {
        id: "c-8",
        name: "Test Customer",
      },
      "Test Finance",
      "Priya"
    );

    manager.callMeta.intent = "interested";
    manager.currentStage = CONVERSATION_STAGES.PITCH;
    manager.extractedData = {
      loanType: "business_loan",
      amount: null,
      timeline: null,
      employmentType: null,
    };

    const reply = await manager.generateAIResponse("please do");

    expect(reply.toLowerCase()).toContain("continue");
    expect(reply.toLowerCase()).toContain("amount");
  });

  it("does not let provider callback intent override hindi proceed confirmation", async () => {
    runAIWithFailover.mockResolvedValue({
      provider: { name: "mock-provider" },
      result: {
        intent: "call_back_later",
        summary: "Customer said to do it later.",
        nextAction: "Schedule a callback.",
      },
    });

    const manager = new LLMConversationManager(
      {
        id: "c-9",
        name: "Test Customer",
      },
      "Test Finance",
      "Priya"
    );

    manager.currentStage = CONVERSATION_STAGES.OPENING;

    const result = await manager.processCustomerResponse("theek hai kar lete hain");

    expect(result.intent).toBe("interested");
    expect(result.shouldEnd).toBe(false);
    expect(result.nextStage).toBe(CONVERSATION_STAGES.DISCOVERY);
  });

  it("asks the customer to repeat when the response is too unclear to understand", async () => {
    const manager = new LLMConversationManager(
      {
        id: "c-10",
        name: "Test Customer",
      },
      "Test Finance",
      "Priya"
    );

    manager.currentStage = CONVERSATION_STAGES.PITCH;

    const result = await manager.processCustomerResponse("umm");
    const reply = await manager.generateAIResponse("umm");

    expect(result.intent).toBe("neutral");
    expect(result.shouldEnd).toBe(false);
    expect(result.nextStage).toBe(CONVERSATION_STAGES.PITCH);
    expect(result.reasoning).toContain("clarification_required");
    expect(reply.toLowerCase()).toContain("samajh nahi paayi");
    expect(reply.toLowerCase()).toContain("dobara");
    expect(runAIWithFailover).not.toHaveBeenCalled();
  });

  it("asks for repeat in hindi roman when a low-information hindi turn is unclear", async () => {
    const manager = new LLMConversationManager(
      {
        id: "c-11",
        name: "Test Customer",
      },
      "Test Finance",
      "Priya"
    );

    manager.currentStage = CONVERSATION_STAGES.PITCH;

    const result = await manager.processCustomerResponse("hmm ji");
    const reply = await manager.generateAIResponse("hmm ji");

    expect(result.intent).toBe("neutral");
    expect(result.shouldEnd).toBe(false);
    expect(result.reasoning).toContain("clarification_required");
    expect(reply.toLowerCase()).toContain("samajh nahi paayi");
    expect(reply.toLowerCase()).toContain("dobara");
    expect(runAIWithFailover).not.toHaveBeenCalled();
  });

  it("blocks provider do_not_call when customer said 'kara do maximum se maximum kara do'", async () => {
    runAIWithFailover.mockResolvedValue({
      provider: { name: "mock-provider" },
      result: {
        intent: "do_not_call",
        summary: "Customer wants to stop calls.",
        nextAction: "Close conversation.",
      },
    });

    const manager = new LLMConversationManager(
      {
        id: "c-12",
        name: "Test Customer",
      },
      "Test Finance",
      "Priya"
    );

    manager.currentStage = CONVERSATION_STAGES.DISCOVERY;

    const result = await manager.processCustomerResponse("kara do maximum se maximum kara do");

    expect(result.intent).toBe("interested");
    expect(result.shouldEnd).toBe(false);
  });

  it("blocks provider do_not_call when customer provided a loan amount", async () => {
    runAIWithFailover.mockResolvedValue({
      provider: { name: "mock-provider" },
      result: {
        intent: "do_not_call",
        summary: "Customer wants to stop calls.",
        nextAction: "Close conversation.",
      },
    });

    const manager = new LLMConversationManager(
      {
        id: "c-13",
        name: "Test Customer",
      },
      "Test Finance",
      "Priya"
    );

    manager.callMeta.intent = "interested";
    manager.currentStage = CONVERSATION_STAGES.QUALIFICATION;

    const result = await manager.processCustomerResponse("5000000");

    expect(result.intent).toBe("interested");
    expect(result.shouldEnd).toBe(false);
  });

  it("opens conversation in hinglish by default", () => {
    const manager = new LLMConversationManager(
      {
        id: "c-14",
        name: "Rahul",
      },
      "Test Finance",
      "Priya"
    );

    const greeting = manager.getOpeningGreeting();

    expect(greeting.toLowerCase()).toContain("namaste");
    expect(greeting).toContain("Rahul");
  });

  it("classifies hindi 'no need' as not_interested and closes", async () => {
    runAIWithFailover.mockResolvedValue({
      provider: { name: "mock-provider" },
      result: {
        intent: "neutral",
        summary: "Customer says no need.",
        nextAction: "Continue pitch.",
      },
    });

    const manager = new LLMConversationManager(
      {
        id: "c-15",
        name: "Test Customer",
      },
      "Test Finance",
      "Priya"
    );

    manager.callMeta.intent = "interested";
    manager.currentStage = CONVERSATION_STAGES.PITCH;

    const result = await manager.processCustomerResponse("achya, muje to abhi kuch khaas jrurt nhi h");

    expect(result.intent).toBe("not_interested");
    expect(result.shouldEnd).toBe(true);
    expect(result.nextStage).toBe(CONVERSATION_STAGES.CLOSING);
  });

  it("classifies hindi 'na hi lu' as not_interested and closes", async () => {
    runAIWithFailover.mockResolvedValue({
      provider: { name: "mock-provider" },
      result: {
        intent: "neutral",
        summary: "Customer is thinking.",
        nextAction: "Continue pitch.",
      },
    });

    const manager = new LLMConversationManager(
      {
        id: "c-16",
        name: "Test Customer",
      },
      "Test Finance",
      "Priya"
    );

    manager.callMeta.intent = "interested";
    manager.currentStage = CONVERSATION_STAGES.PITCH;

    const result = await manager.processCustomerResponse("m to abhi soch raha hu, na hi lu");

    expect(result.intent).toBe("not_interested");
    expect(result.shouldEnd).toBe(true);
    expect(result.nextStage).toBe(CONVERSATION_STAGES.CLOSING);
  });

  // --- Language signal stability regressions ---

  it("does not flip language from Hindi to English on a single ambiguous English-ish turn", () => {
    const manager = new LLMConversationManager(
      { id: "c-lang-1", name: "Hindi User" },
      "Test Finance",
      "Priya"
    );

    // Start with strong Hindi signal
    manager.updateLanguageSignal("haan ji mujhe batao kya karna hai");
    expect(manager.getLanguageSignal().style).toBe("hindi");

    // Customer says something English-ish but short/ambiguous
    manager.updateLanguageSignal("okay sure");
    // Should NOT switch to English — previous Hindi signal is stronger
    expect(manager.getLanguageSignal().style).not.toBe("english");
  });

  it("stays in Hindi when customer keeps speaking Hindi across many turns", () => {
    const manager = new LLMConversationManager(
      { id: "c-lang-2", name: "Consistent Hindi Speaker" },
      "Test Finance",
      "Priya"
    );

    const hindiPhrases = [
      "haan ji batao",
      "mujhe loan chahiye",
      "kitna milega",
      "aap batao kya karna hai",
      "theek hai samjha",
    ];

    for (const phrase of hindiPhrases) {
      manager.updateLanguageSignal(phrase);
    }

    const signal = manager.getLanguageSignal();
    expect(["hindi", "hinglish"]).toContain(signal.style);
    expect(signal.style).not.toBe("english");
  });

  it("transcript windowing caps at 50 turns", () => {
    const manager = new LLMConversationManager(
      { id: "c-wind", name: "Chatty Customer" },
      "Test Finance",
      "Priya"
    );

    // Push 60 turns
    for (let i = 0; i < 60; i++) {
      manager.conversationHistory.push({
        role: i % 2 === 0 ? "customer" : "ai",
        message: `Turn ${i}`,
        timestamp: new Date(),
      });
    }

    const transcript = manager.getTranscriptText();
    const lines = transcript.split("\n");
    expect(lines.length).toBe(50);
    // First line should be turn 10 (60-50), not turn 0
    expect(lines[0]).toContain("Turn 10");
  });

  it("UNKNOWN fallback defaults to Hinglish not English", () => {
    const manager = new LLMConversationManager(
      { id: "c-unk", name: "Unknown Lang" },
      "Test Finance",
      "Priya"
    );

    // Force UNKNOWN signal
    manager.callMeta.languageSignal = {
      style: "unknown",
      script: "unknown",
      confidence: 0,
    };

    // getLanguageText should prefer hinglish over english for UNKNOWN
    const text = manager.getLanguageText({
      english: "Hello",
      hinglish: "Hello ji",
      defaultText: null,
    });
    expect(text).toBe("Hello ji");
  });

  it("detects 'jyada se jyada kara do' as Hindi not English", () => {
    const phrases = [
      "jyada se jyada kara do",
      "jitna maximum ho jaye utna kara do",
      "haan to meri profile ke according jo maximum ho ja",
      "kara do jo maximum ho",
      "jaldi se jaldi",
    ];

    for (const phrase of phrases) {
      const signal = detectLanguageStyleFromText(phrase);
      expect(signal.style, `"${phrase}" should not be English`).not.toBe("english");
    }
  });

  it("acknowledges 'maximum kara do' and moves past amount question", async () => {
    runAIWithFailover.mockResolvedValue({
      provider: { name: "mock-provider" },
      result: {
        reply: "What approximate amount are you planning for?",
      },
    });

    const manager = new LLMConversationManager(
      { id: "c-max", name: "Max Customer" },
      "Test Finance",
      "Priya"
    );

    manager.callMeta.intent = "interested";
    manager.currentStage = CONVERSATION_STAGES.PITCH;
    manager.extractedData = {
      loanType: "home_loan",
      amount: null,
      timeline: null,
      employmentType: null,
    };

    const reply = await manager.generateAIResponse("jyada se jyada kara do");

    // Should acknowledge maximum and move to next detail (timeline), not ask for amount again
    expect(reply.toLowerCase()).toContain("maximum");
    expect(reply.toLowerCase()).not.toContain("approx amount kitna");
    expect(manager.extractedData.amount).toBe("MAXIMUM");
  });
});
