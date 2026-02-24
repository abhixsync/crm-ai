import { TELEPHONY_OPERATIONS } from "@/lib/telephony/telephony-contract";
import { resolveTelephonyAdapter } from "@/lib/telephony/provider-router";

function sanitizeProvider(provider) {
  return {
    id: provider.id,
    name: provider.name,
    type: provider.type,
    enabled: provider.enabled,
    isActive: provider.isActive,
    priority: provider.priority,
  };
}

export async function runTelephonyConnectivityCheck(provider) {
  const start = Date.now();

  if (!provider?.enabled) {
    return {
      ok: false,
      provider: sanitizeProvider(provider),
      latencyMs: 0,
      error: "Provider is disabled. Enable it before testing connectivity.",
    };
  }

  try {
    const adapter = resolveTelephonyAdapter(provider.type);

    const result = await adapter.run({
      operation: TELEPHONY_OPERATIONS.CHECK_CONNECTION,
      payload: {},
      config: provider,
    });

    return {
      ok: true,
      provider: sanitizeProvider(provider),
      latencyMs: Date.now() - start,
      message: result?.message || `${provider.type} connectivity verified.`,
      preview: result?.message || "OK",
    };
  } catch (error) {
    return {
      ok: false,
      provider: sanitizeProvider(provider),
      latencyMs: Date.now() - start,
      error: error?.message || "Connectivity check failed.",
    };
  }
}
