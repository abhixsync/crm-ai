import { describe, expect, it } from "vitest";
import { CustomerStatus } from "@prisma/client";
import { isEligibleForAutomation } from "@/lib/journey/campaign-eligibility";
import {
  DISPOSITION_TO_STATUS,
  isTerminalState,
  RETRYABLE_FAILURE_CODES,
} from "@/lib/journey/constants";
import { calculateBackoffMs } from "@/lib/journey/retry-policy";

describe("journey automation behavior", () => {
  const settings = {
    enabled: true,
    maxRetries: 3,
    eligibleStatuses: [CustomerStatus.NEW, CustomerStatus.FOLLOW_UP, CustomerStatus.RETRY_SCHEDULED],
  };

  it("customer creation status NEW is eligible for automation", () => {
    const customer = {
      archivedAt: null,
      status: CustomerStatus.NEW,
      inActiveCall: false,
      retryCount: 0,
      maxRetries: 3,
    };

    expect(isEligibleForAutomation(customer, settings)).toBe(true);
  });

  it("manual call states are not terminal and can transition", () => {
    expect(isTerminalState(CustomerStatus.CALLING)).toBe(false);
    expect(isTerminalState(CustomerStatus.CALL_FAILED)).toBe(false);
  });

  it("do-not-call and converted are terminal", () => {
    expect(isTerminalState(CustomerStatus.DO_NOT_CALL)).toBe(true);
    expect(isTerminalState(CustomerStatus.CONVERTED)).toBe(true);
  });

  it("AI classification maps to required customer states", () => {
    expect(DISPOSITION_TO_STATUS.interested).toBe(CustomerStatus.INTERESTED);
    expect(DISPOSITION_TO_STATUS.not_interested).toBe(CustomerStatus.NOT_INTERESTED);
    expect(DISPOSITION_TO_STATUS.follow_up).toBe(CustomerStatus.FOLLOW_UP);
    expect(DISPOSITION_TO_STATUS.call_back_later).toBe(CustomerStatus.FOLLOW_UP);
    expect(DISPOSITION_TO_STATUS.converted).toBe(CustomerStatus.CONVERTED);
    expect(DISPOSITION_TO_STATUS.do_not_call).toBe(CustomerStatus.DO_NOT_CALL);
    expect(DISPOSITION_TO_STATUS.failed).toBe(CustomerStatus.CALL_FAILED);
  });

  it("retry policy uses exponential backoff", () => {
    expect(calculateBackoffMs(1)).toBe(2 * 60 * 1000);
    expect(calculateBackoffMs(2)).toBe(4 * 60 * 1000);
    expect(calculateBackoffMs(3)).toBe(8 * 60 * 1000);
  });

  it("DNC is ineligible for future automation", () => {
    const customer = {
      archivedAt: null,
      status: CustomerStatus.DO_NOT_CALL,
      inActiveCall: false,
      retryCount: 0,
      maxRetries: 3,
    };

    expect(isEligibleForAutomation(customer, settings)).toBe(false);
  });

  it("status must be included in configured eligibleStatuses", () => {
    const customer = {
      archivedAt: null,
      status: CustomerStatus.INTERESTED,
      inActiveCall: false,
      retryCount: 0,
      maxRetries: 3,
    };

    expect(isEligibleForAutomation(customer, settings)).toBe(false);
    expect(
      isEligibleForAutomation(customer, {
        ...settings,
        eligibleStatuses: [...settings.eligibleStatuses, CustomerStatus.INTERESTED],
      })
    ).toBe(true);
  });

  it("retry failure whitelist includes required cases", () => {
    expect(RETRYABLE_FAILURE_CODES.has("telephony_failure")).toBe(true);
    expect(RETRYABLE_FAILURE_CODES.has("ai_timeout")).toBe(true);
    expect(RETRYABLE_FAILURE_CODES.has("no_answer")).toBe(true);
    expect(RETRYABLE_FAILURE_CODES.has("busy")).toBe(true);
    expect(RETRYABLE_FAILURE_CODES.has("network_error")).toBe(true);
  });
});
