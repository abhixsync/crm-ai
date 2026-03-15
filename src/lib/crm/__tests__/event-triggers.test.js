import { describe, expect, it } from "vitest";
import { CRM_EVENT_ACTIONS, evaluateCrmEventDecision } from "@/lib/crm/event-triggers";

describe("crm event trigger decision engine", () => {
  it("books appointment but keeps intent in follow-up stage", () => {
    const decision = evaluateCrmEventDecision({
      transcript: [
        "Agent: I can help with next steps.",
        "Customer: I am interested, please book a demo meeting for tomorrow.",
      ].join("\n"),
      intent: "interested",
      summary: "Customer asked to schedule a demo and move ahead.",
    });

    expect(decision.action).toBe(CRM_EVENT_ACTIONS.BOOK_APPOINTMENT);
    expect(decision.normalizedIntent).toBe("follow_up");
    expect(decision.normalizedIntent).not.toBe("converted");
    expect(decision.triggers.appointment).toBe(true);
  });

  it("prioritizes hard-stop decline over booking signals", () => {
    const decision = evaluateCrmEventDecision({
      transcript: "Customer: Please book a meeting later, but I am not interested.",
      intent: "interested",
      summary: "Customer declined despite initial meeting language.",
    });

    expect(decision.action).toBe(CRM_EVENT_ACTIONS.NOT_INTERESTED);
    expect(decision.normalizedIntent).toBe("not_interested");
    expect(decision.triggers.notInterested).toBe(true);
  });

  it("ignores agent prompts when deciding callback follow-up", () => {
    const decision = evaluateCrmEventDecision({
      transcript: [
        "Agent: By when do you need this loan, this week, this month, or later?",
        "Customer: Business loan chahiye, 1 crore, is month me.",
      ].join("\n"),
      intent: "interested",
      summary: "Customer wants a business loan of 1 crore within this month.",
    });

    expect(decision.action).not.toBe(CRM_EVENT_ACTIONS.CALLBACK_REQUESTED);
    expect(decision.normalizedIntent).toBe("interested");
    expect(decision.triggers.callback).toBe(false);
  });
});
