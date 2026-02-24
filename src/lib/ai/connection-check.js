import OpenAI from "openai";
import { AiProviderType } from "@prisma/client";
import { createOpenAIEngine } from "@/lib/ai/adapters/openai-adapter";
import { createHttpEngine } from "@/lib/ai/adapters/http-adapter";
import { createDialogflowEngine } from "@/lib/ai/adapters/dialogflow-adapter";
import { AIEngineRegistry } from "@/lib/ai/engine-registry";
import { AI_TASKS, createEngineInput } from "@/lib/ai/engine-contract";

const registry = new AIEngineRegistry();
registry.register(AiProviderType.OPENAI, createOpenAIEngine());
registry.register(AiProviderType.DIALOGFLOW, createDialogflowEngine());
registry.register(AiProviderType.RASA, createHttpEngine("rasa-engine"));
registry.register(AiProviderType.GENERIC_HTTP, createHttpEngine("generic-http-engine"));

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

async function testOpenAIProvider(provider) {
  const apiKey = String(provider.apiKey || process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) {
    throw new Error("OpenAI API key is missing. Set provider apiKey or OPENAI_API_KEY.");
  }

  const client = new OpenAI({ apiKey });
  const model = String(provider.model || "gpt-4.1-mini").trim() || "gpt-4.1-mini";

  const completion = await client.responses.create({
    model,
    input: "Reply with exactly: OK",
  });

  const preview = String(completion.output_text || "").trim() || "(empty response)";
  return {
    message: "OpenAI request succeeded.",
    preview: preview.slice(0, 120),
  };
}

async function testWithEngine(provider) {
  const engine = registry.resolve(provider.type);
  const input = createEngineInput({
    task: AI_TASKS.CALL_SUMMARY,
    payload: {
      transcript: "Connectivity check transcript.",
      metadata: {
        source: "admin-connectivity-check",
      },
    },
  });

  const output = await engine.run({
    task: AI_TASKS.CALL_SUMMARY,
    input,
    config: provider,
  });

  const summary = String(output?.result?.summary || "").trim();

  return {
    message: `${provider.type} request succeeded.`,
    preview: summary ? summary.slice(0, 120) : "(no summary preview)",
  };
}

export async function runProviderConnectivityCheck(provider) {
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
    const result =
      provider.type === AiProviderType.OPENAI
        ? await testOpenAIProvider(provider)
        : await testWithEngine(provider);

    return {
      ok: true,
      provider: sanitizeProvider(provider),
      latencyMs: Date.now() - start,
      ...result,
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
