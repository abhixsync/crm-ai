import { AiProviderType, AiProviderStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createOpenAIEngine } from "@/lib/ai/adapters/openai-adapter";
import { createClaudeEngine } from "@/lib/ai/adapters/claude-adapter";
import { createGroqEngine } from "@/lib/ai/adapters/groq-adapter";
import { createHttpEngine } from "@/lib/ai/adapters/http-adapter";
import { createDialogflowEngine } from "@/lib/ai/adapters/dialogflow-adapter";
import { createGeminiEngine } from "@/lib/ai/adapters/gemini-adapter";
import { AIEngineRegistry } from "@/lib/ai/engine-registry";
import { createEngineInput } from "@/lib/ai/engine-contract";

const registry = new AIEngineRegistry();
registry.register(AiProviderType.OPENAI, createOpenAIEngine());
registry.register(AiProviderType.CLAUDE, createClaudeEngine());
registry.register(AiProviderType.GROQ, createGroqEngine());
registry.register(AiProviderType.DIALOGFLOW, createDialogflowEngine());
registry.register(AiProviderType.RASA, createHttpEngine("rasa-engine"));
registry.register(AiProviderType.GENERIC_HTTP, createHttpEngine("generic-http-engine"));
registry.register(AiProviderType.GEMINI, createGeminiEngine());

function normalizeProvider(config) {
  return {
    id: config.id,
    name: config.name,
    type: config.type,
    endpoint: config.endpoint,
    apiKey: config.apiKey,
    model: config.model,
    priority: config.priority,
    status: config.status,
    timeoutMs: config.timeoutMs,
    metadata: config.metadata || null,
  };
}

const STATUS_ORDER = { [AiProviderStatus.ACTIVE]: 0, [AiProviderStatus.STANDBY]: 1, [AiProviderStatus.DISABLED]: 2 };

function sortProviders(providers) {
  return [...providers].sort((left, right) => {
    const statusDiff = (STATUS_ORDER[left.status] ?? 1) - (STATUS_ORDER[right.status] ?? 1);
    if (statusDiff !== 0) return statusDiff;
    if (left.priority !== right.priority) return left.priority - right.priority;
    return left.name.localeCompare(right.name);
  });
}

async function resolveProviders() {
  const configs = await prisma.aiProviderConfig.findMany({
    where: { status: { in: [AiProviderStatus.ACTIVE, AiProviderStatus.STANDBY] } },
  });

  const providers = sortProviders(configs.map(normalizeProvider));

  if (providers.length > 0) {
    return providers;
  }

  // Fallback chain: Gemini (fast/cheap) → Groq (free) → Claude (free tier) → OpenAI
  if (process.env.GOOGLE_AI_API_KEY) {
    return [
      {
        id: "implicit-gemini",
        name: "Implicit Gemini",
        type: AiProviderType.GEMINI,
        endpoint: null,
        apiKey: process.env.GOOGLE_AI_API_KEY,
        model: "gemini-2.0-flash",
        priority: 1,
        status: AiProviderStatus.ACTIVE,
        timeoutMs: 12000,
        metadata: null,
      },
    ];
  }

  if (process.env.GROQ_API_KEY) {
    return [
      {
        id: "implicit-groq",
        name: "Implicit Groq",
        type: AiProviderType.GROQ,
        endpoint: null,
        apiKey: process.env.GROQ_API_KEY,
        model: "llama-3.1-8b-instant",
        priority: 1,
        status: AiProviderStatus.ACTIVE,
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
        status: AiProviderStatus.ACTIVE,
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
      status: AiProviderStatus.ACTIVE,
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
                : provider.type === AiProviderType.GEMINI
                  ? "Gemini AI adapter"
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
  console.log(`\n[provider-router] runAIWithFailover called — task: ${task}, activeOnly: ${activeOnly}`);
  const providers = await resolveProviders();
  console.log(`[provider-router] Resolved ${providers.length} provider(s):`, providers.map(p => `${p.name}(${p.type}, status=${p.status})`).join(', '));
  const candidates = activeOnly
    ? (() => {
        const active = providers.find((provider) => provider.status === AiProviderStatus.ACTIVE);
        if (!active) {
          return providers;
        }

        // Active provider goes first, then fallback to remaining standby providers.
        return [active, ...providers.filter((provider) => provider.id !== active.id)];
      })()
    : providers;
  console.log(`[provider-router] Using ${candidates.length} candidate(s):`, candidates.map(c => c.name).join(', '));
  const errors = [];

  for (const provider of candidates) {
    try {
      console.log(`[provider-router] Trying provider: ${provider.name} (${provider.type}, model=${provider.model})`);
      const result = await callProvider(provider, task, payload);
      console.log(`[provider-router] ✅ ${provider.name} succeeded for ${task}`);
      console.log(`[provider-router] Result:`, JSON.stringify(result).substring(0, 300));
      return {
        provider,
        result,
        attempted: candidates.map((candidate) => candidate.name),
        errors,
      };
    } catch (error) {
      console.error(`[provider-router] ❌ ${provider.name} failed:`, error?.message);
      errors.push({
        providerId: provider.id,
        providerName: provider.name,
        message: error?.message || "Unknown provider error",
      });
    }
  }

  const message = errors[0]?.message || "No AI providers are available.";
  console.error(`[provider-router] ❌ All providers failed. Errors:`, JSON.stringify(errors));
  const failure = new Error(`AI routing failed. ${message}`);
  failure.details = errors;
  throw failure;
}
