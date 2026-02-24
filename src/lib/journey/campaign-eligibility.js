import { CustomerStatus } from "@prisma/client";
import { AUTOMATION_DEFAULTS, isTerminalState } from "@/lib/journey/constants";

export function isEligibleForAutomation(customer, settings) {
  if (!customer || customer.archivedAt) return false;
  if (!settings?.enabled) return false;
  const eligibleStatuses = new Set(settings?.eligibleStatuses || AUTOMATION_DEFAULTS.eligibleStatuses);
  if (!eligibleStatuses.has(customer.status)) return false;
  if (customer.status === CustomerStatus.DO_NOT_CALL) return false;
  if (isTerminalState(customer.status)) return false;
  if (customer.inActiveCall) return false;
  if (customer.retryCount >= (settings.maxRetries || customer.maxRetries || 3)) return false;
  return true;
}
