export const ACTIONABLE_INTENTS = new Set(["interested", "follow_up", "call_back_later", "converted"]);

const INTENT_ALIASES = new Map([
  ["followup", "follow_up"],
  ["follow_up_needed", "follow_up"],
  ["follow_up_required", "follow_up"],
  ["follow_up_requested", "follow_up"],
  ["callback", "call_back_later"],
  ["call_back", "call_back_later"],
  ["callback_later", "call_back_later"],
  ["call_me_back", "call_back_later"],
  ["call_me_back_later", "call_back_later"],
  ["notinterested", "not_interested"],
  ["dont_call", "do_not_call"],
  ["do_not_contact", "do_not_call"],
  ["dnc", "do_not_call"],
]);

export function canonicalizeIntent(intent) {
  const normalized = String(intent || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");

  if (!normalized) {
    return "";
  }

  return INTENT_ALIASES.get(normalized) || normalized;
}

export function isActionableIntent(intent) {
  return ACTIONABLE_INTENTS.has(canonicalizeIntent(intent));
}