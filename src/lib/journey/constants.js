import { CustomerStatus } from "@prisma/client";

export const TERMINAL_STATES = new Set([CustomerStatus.DO_NOT_CALL, CustomerStatus.CONVERTED]);

export const DISPOSITION_TO_STATUS = {
  interested: CustomerStatus.INTERESTED,
  not_interested: CustomerStatus.NOT_INTERESTED,
  follow_up: CustomerStatus.FOLLOW_UP,
  call_back_later: CustomerStatus.FOLLOW_UP,
  converted: CustomerStatus.CONVERTED,
  do_not_call: CustomerStatus.DO_NOT_CALL,
  failed: CustomerStatus.CALL_FAILED,
};

export const ELIGIBLE_AUTOMATION_STATES = new Set([
  CustomerStatus.NEW,
  CustomerStatus.FOLLOW_UP,
  CustomerStatus.RETRY_SCHEDULED,
]);

export const AUTOMATION_DEFAULTS = {
  maxRetries: 3,
  batchSize: 25,
  concurrency: 5,
  dailyCap: 200,
  workingHoursStart: 9,
  workingHoursEnd: 19,
  timezone: "Asia/Kolkata",
  eligibleStatuses: [
    CustomerStatus.NEW,
    CustomerStatus.FOLLOW_UP,
    CustomerStatus.RETRY_SCHEDULED,
  ],
};

export const AUTOMATION_STATUS_OPTIONS = [
  CustomerStatus.NEW,
  CustomerStatus.CALL_PENDING,
  CustomerStatus.CALLING,
  CustomerStatus.INTERESTED,
  CustomerStatus.NOT_INTERESTED,
  CustomerStatus.FOLLOW_UP,
  CustomerStatus.CONVERTED,
  CustomerStatus.CALL_FAILED,
  CustomerStatus.RETRY_SCHEDULED,
  CustomerStatus.DO_NOT_CALL,
];

export const RETRYABLE_FAILURE_CODES = new Set([
  "telephony_failure",
  "ai_timeout",
  "no_answer",
  "busy",
  "network_error",
  "failed",
]);

export function isTerminalState(status) {
  return TERMINAL_STATES.has(status);
}

export function toIntentLabel(intent) {
  return String(intent || "UNKNOWN").toUpperCase();
}
