import { TelephonyProviderType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { TELEPHONY_OPERATIONS } from "@/lib/telephony/telephony-contract";
import { TelephonyRegistry } from "@/lib/telephony/telephony-registry";
import { createTwilioAdapter } from "@/lib/telephony/adapters/twilio-adapter";
import { createVonageAdapter } from "@/lib/telephony/adapters/vonage-adapter";
import { createPlivoAdapter } from "@/lib/telephony/adapters/plivo-adapter";
import { logTelephony, redactedPhone } from "@/lib/telephony/logger";

const registry = new TelephonyRegistry();
registry.register(TelephonyProviderType.TWILIO, createTwilioAdapter());
registry.register(TelephonyProviderType.VONAGE, createVonageAdapter());
registry.register(TelephonyProviderType.PLIVO, createPlivoAdapter());

function sortProviders(providers) {
  return [...providers].sort((left, right) => {
    if (left.isActive !== right.isActive) return left.isActive ? -1 : 1;
    if (left.priority !== right.priority) return left.priority - right.priority;
    return left.name.localeCompare(right.name);
  });
}

function prioritizeProviders(providers, preferredType) {
  if (!preferredType) return providers;

  const normalizedPreferredType = String(preferredType).trim().toUpperCase();
  if (!normalizedPreferredType) return providers;

  const preferred = providers.filter(
    (provider) => String(provider.type || "").toUpperCase() === normalizedPreferredType
  );
  const others = providers.filter(
    (provider) => String(provider.type || "").toUpperCase() !== normalizedPreferredType
  );

  return [...preferred, ...others];
}

function normalizeProvider(config) {
  return {
    id: config.id,
    name: config.name,
    type: config.type,
    endpoint: config.endpoint,
    apiKey: config.apiKey,
    model: config.model,
    priority: config.priority,
    enabled: config.enabled,
    isActive: config.isActive,
    timeoutMs: config.timeoutMs,
    metadata: config.metadata || null,
  };
}

async function resolveProviders() {
  const configs = await prisma.telephonyProviderConfig.findMany({
    where: { enabled: true },
  });

  const providers = sortProviders(configs.map(normalizeProvider));

  if (providers.length > 0) {
    return providers;
  }

  return [
    {
      id: "implicit-twilio",
      name: "Implicit Twilio",
      type: TelephonyProviderType.TWILIO,
      endpoint: null,
      apiKey: process.env.TWILIO_AUTH_TOKEN || null,
      model: null,
      priority: 1,
      enabled: true,
      isActive: true,
      timeoutMs: 12000,
      metadata: {
        accountSid: process.env.TWILIO_ACCOUNT_SID || null,
        fromNumber: process.env.TWILIO_FROM_NUMBER || null,
      },
    },
  ];
}

async function callProvider(provider, payload) {
  const adapter = registry.resolve(provider.type);

  return adapter.run({
    operation: TELEPHONY_OPERATIONS.INITIATE_CALL,
    payload,
    config: provider,
  });
}

export async function getTelephonyFailoverOrder() {
  return resolveProviders();
}

export async function initiateTelephonyCallWithFailover(payload) {
  const providers = prioritizeProviders(await resolveProviders(), payload?.preferredProviderType);
  const errors = [];

  logTelephony("info", "telephony.failover.start", {
    providers: providers.map((provider) => ({
      id: provider.id,
      name: provider.name,
      type: provider.type,
      priority: provider.priority,
      isActive: provider.isActive,
      enabled: provider.enabled,
    })),
    to: redactedPhone(payload?.to),
  });

  for (const provider of providers) {
    try {
      logTelephony("info", "telephony.provider.attempt", {
        providerId: provider.id,
        providerName: provider.name,
        providerType: provider.type,
        to: redactedPhone(payload?.to),
      });

      const result = await callProvider(provider, payload);

      logTelephony("info", "telephony.provider.success", {
        providerId: provider.id,
        providerName: provider.name,
        providerType: provider.type,
        providerCallId: result?.providerCallId || "",
        status: result?.status || "",
      });

      return {
        provider,
        result,
        attempted: providers.map((candidate) => candidate.name),
        errors,
      };
    } catch (error) {
      logTelephony("warn", "telephony.provider.failure", {
        providerId: provider.id,
        providerName: provider.name,
        providerType: provider.type,
        message: error?.message || "Unknown telephony provider error",
      });

      errors.push({
        providerId: provider.id,
        providerName: provider.name,
        providerType: provider.type,
        message: error?.message || "Unknown telephony provider error",
      });
    }
  }

  const message = errors[0]?.message || "No telephony providers are available.";
  logTelephony("error", "telephony.failover.exhausted", {
    message,
    errors,
    to: redactedPhone(payload?.to),
  });

  const failure = new Error(`Telephony routing failed. ${message}`);
  failure.details = errors;
  throw failure;
}

export function mapTelephonyStatus(providerType, providerStatus) {
  try {
    const adapter = registry.resolve(providerType || TelephonyProviderType.TWILIO);
    return adapter.mapStatus(providerStatus);
  } catch {
    const status = String(providerStatus || "").toLowerCase();

    if (["completed"].includes(status)) return "COMPLETED";
    if (["failed"].includes(status)) return "FAILED";
    if (["busy", "no-answer", "no_answer", "cancelled", "canceled"].includes(status)) {
      return "NO_ANSWER";
    }
    if (["answered", "in-progress", "in_progress"].includes(status)) return "ANSWERED";

    return "INITIATED";
  }
}

export function resolveTelephonyAdapter(providerType) {
  return registry.resolve(providerType);
}
