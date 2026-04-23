import { prisma } from "@/lib/prisma";
import { getCached, invalidateCache } from "@/lib/cache/api-cache";
import {
  AUTOMATION_DEFAULTS,
  AUTOMATION_EXECUTION_MODES,
  AUTOMATION_STATUS_OPTIONS,
} from "@/lib/journey/constants";

const SETTING_KEY = "AI_AUTOMATION";

export function isCampaignWorkerEnabled() {
  return String(process.env.ENABLE_CAMPAIGN_WORKER || "")
    .trim()
    .toLowerCase() === "true";
}

export function resolveAutomationExecutionMode(settings) {
  if (isCampaignWorkerEnabled()) {
    return "WORKER";
  }

  return "CRON";
}

function normalizeExecutionMode(mode) {
  if (isCampaignWorkerEnabled()) {
    return "WORKER";
  }

  const normalized = String(mode || AUTOMATION_DEFAULTS.executionMode)
    .trim()
    .toUpperCase();

  if (!AUTOMATION_EXECUTION_MODES.includes(normalized)) {
    return AUTOMATION_DEFAULTS.executionMode;
  }

  return normalized === "WORKER" ? "CRON" : normalized;
}

function normalizeEligibleStatuses(statuses) {
  const allowed = new Set(AUTOMATION_STATUS_OPTIONS);
  const incoming = Array.isArray(statuses) ? statuses : AUTOMATION_DEFAULTS.eligibleStatuses;
  const normalized = incoming
    .map((value) => String(value || "").trim().toUpperCase())
    .filter((value) => allowed.has(value));

  return normalized.length ? Array.from(new Set(normalized)) : [...AUTOMATION_DEFAULTS.eligibleStatuses];
}

function normalizeSettings(value = {}) {
  return {
    executionMode: normalizeExecutionMode(value.executionMode),
    enabled: Boolean(value.enabled),
    maxRetries: Number(value.maxRetries || AUTOMATION_DEFAULTS.maxRetries),
    batchSize: Number(value.batchSize || AUTOMATION_DEFAULTS.batchSize),
    concurrency: Number(value.concurrency || AUTOMATION_DEFAULTS.concurrency),
    dailyCap: Number(value.dailyCap || AUTOMATION_DEFAULTS.dailyCap),
    workingHoursStart: Number(value.workingHoursStart ?? AUTOMATION_DEFAULTS.workingHoursStart),
    workingHoursEnd: Number(value.workingHoursEnd ?? AUTOMATION_DEFAULTS.workingHoursEnd),
    timezone: String(value.timezone || AUTOMATION_DEFAULTS.timezone),
    eligibleStatuses: normalizeEligibleStatuses(value.eligibleStatuses),
  };
}

export async function getAutomationSettings(tenantId) {
  if (!tenantId) return normalizeSettings({});
  return getCached(`automation-settings:${tenantId}`, 60, async () => {
    const record = await prisma.automationSetting.findUnique({
      where: { tenantId_key: { tenantId, key: SETTING_KEY } },
    });
    return normalizeSettings(record?.value || {});
  });
}

export async function upsertAutomationSettings(tenantId, partialSettings) {
  if (!tenantId) throw new Error("tenantId is required for automation settings");
  const current = await getAutomationSettings(tenantId);
  const next = normalizeSettings({ ...current, ...partialSettings });

  const saved = await prisma.automationSetting.upsert({
    where: { tenantId_key: { tenantId, key: SETTING_KEY } },
    create: { tenantId, key: SETTING_KEY, value: next },
    update: { value: next },
  });

  invalidateCache(`automation-settings:${tenantId}`).catch(() => {});
  return normalizeSettings(saved.value || {});
}

export function isWithinWorkingHours(settings, now = new Date()) {
  const hour = now.getHours();
  return hour >= settings.workingHoursStart && hour < settings.workingHoursEnd;
}
