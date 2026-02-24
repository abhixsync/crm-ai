import { AiProviderType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createOpenAIEngine } from "@/lib/ai/adapters/openai-adapter";
import { createHttpEngine } from "@/lib/ai/adapters/http-adapter";
import { createDialogflowEngine } from "@/lib/ai/adapters/dialogflow-adapter";
import { AIEngineRegistry } from "@/lib/ai/engine-registry";
import { createEngineInput } from "@/lib/ai/engine-contract";

const registry = new AIEngineRegistry();
registry.register(AiProviderType.OPENAI, createOpenAIEngine());
registry.register(AiProviderType.DIALOGFLOW, createDialogflowEngine());
registry.register(AiProviderType.RASA, createHttpEngine("rasa-engine"));
registry.register(AiProviderType.GENERIC_HTTP, createHttpEngine("generic-http-engine"));

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

function sortProviders(providers) {
  return [...providers].sort((left, right) => {
    if (left.isActive !== right.isActive) {
      return left.isActive ? -1 : 1;
    }

    if (left.priority !== right.priority) {
      return left.priority - right.priority;
    }

    return left.name.localeCompare(right.name);
  });
}

async function resolveProviders() {
  const configs = await prisma.aiProviderConfig.findMany({
    where: { enabled: true },
  });

  const providers = sortProviders(configs.map(normalizeProvider));

  if (providers.length > 0) {
    return providers;
  }

  return [
    {
      id: "implicit-openai",
      name: "Implicit OpenAI",
      type: AiProviderType.OPENAI,
      endpoint: null,
      apiKey: process.env.OPENAI_API_KEY || "",
      model: "gpt-4.1-mini",
      priority: 1,
      enabled: true,
      isActive: true,
      timeoutMs: 12000,
      metadata: null,
    },
  ];
}

export async function getProviderFailoverOrder() {
  return resolveProviders();
}

async function callProvider(provider, task, payload) {
  const engine = registry.resolve(provider.type);
  const input = createEngineInput({ task, payload });

  const engineConfig = {
    ...provider,
    providerLabel:
      provider.type === AiProviderType.DIALOGFLOW
        ? "Dialogflow adapter"
        : provider.type === AiProviderType.RASA
          ? "Rasa adapter"
          : provider.type === AiProviderType.GENERIC_HTTP
            ? "Generic HTTP adapter"
            : "OpenAI adapter",
  };

  const output = await engine.run({
    task,
    input,
    config: engineConfig,
  });

  return output.result;
}

export async function runAIWithFailover({ task, payload }) {
  const providers = await resolveProviders();
  const errors = [];

  for (const provider of providers) {
    try {
      const result = await callProvider(provider, task, payload);
      return {
        provider,
        result,
        attempted: providers.map((candidate) => candidate.name),
        errors,
      };
    } catch (error) {
      errors.push({
        providerId: provider.id,
        providerName: provider.name,
        message: error?.message || "Unknown provider error",
      });
    }
  }

  const message = errors[0]?.message || "No AI providers are available.";
  const failure = new Error(`AI routing failed. ${message}`);
  failure.details = errors;
  throw failure;
}
