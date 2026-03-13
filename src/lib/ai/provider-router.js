import { AiProviderType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createOpenAIEngine } from "@/lib/ai/adapters/openai-adapter";
import { createClaudeEngine } from "@/lib/ai/adapters/claude-adapter";
import { createGroqEngine } from "@/lib/ai/adapters/groq-adapter";
import { createHttpEngine } from "@/lib/ai/adapters/http-adapter";
import { createDialogflowEngine } from "@/lib/ai/adapters/dialogflow-adapter";
import { AIEngineRegistry } from "@/lib/ai/engine-registry";
import { createEngineInput } from "@/lib/ai/engine-contract";

const registry = new AIEngineRegistry();
registry.register(AiProviderType.OPENAI, createOpenAIEngine());
registry.register(AiProviderType.CLAUDE, createClaudeEngine());
registry.register(AiProviderType.GROQ, createGroqEngine());
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

  // Fallback chain: Groq (free) → Claude (free tier) → OpenAI
  if (process.env.GROQ_API_KEY) {
    return [
      {
        id: "implicit-groq",
        name: "Implicit Groq",
        type: AiProviderType.GROQ,
        endpoint: null,
        apiKey: process.env.GROQ_API_KEY,
        model: "mixtral-8x7b-32768",
        priority: 1,
        enabled: true,
        isActive: true,
        timeoutMs: 12000,
        metadata: null,
      },
    ];
  }

  if (process.env.ANTHROPIC_API_KEY) {
    return [
      {
        id: "implicit-claude",
        name: "Implicit Claude",
        type: AiProviderType.CLAUDE,
        endpoint: null,
        apiKey: process.env.ANTHROPIC_API_KEY,
        model: "claude-3-5-sonnet-20241022",
        priority: 1,
        enabled: true,
        isActive: true,
        timeoutMs: 12000,
        metadata: null,
      },
    ];
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
            : provider.type === AiProviderType.CLAUDE
              ? "Claude AI adapter"
              : provider.type === AiProviderType.GROQ
                ? "Groq AI adapter"
                : "OpenAI adapter",
  };

  const output = await engine.run({
    task,
    input,
    config: engineConfig,
  });

  return output.result;
}

export async function runAIWithFailover({ task, payload, activeOnly = false }) {
  const providers = await resolveProviders();
  const candidates = activeOnly
    ? (() => {
        const active = providers.find((provider) => provider.isActive);
        return active ? [active] : providers.slice(0, 1);
      })()
    : providers;
  const errors = [];

  for (const provider of candidates) {
    try {
      const result = await callProvider(provider, task, payload);
      return {
        provider,
        result,
        attempted: candidates.map((candidate) => candidate.name),
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
