import Redis from "ioredis";
import { getRedisOptions } from "@/lib/redis/options";
import { LLMConversationManager } from "@/modules/loan-assistant/llm-conversation-manager.js";
import { ConversationManager } from "@/modules/loan-assistant/conversation-manager.js";

const SESSION_TTL_SECONDS = 2 * 60 * 60; // 2 hours
const KEY_PREFIX = "loan_session:";

const memoryStore = new Map(); // fallback if Redis unavailable

let redisClient = null;
let redisUnavailableUntil = 0;

async function getRedis() {
  if (process.env.DISABLE_REDIS === "true") return null;
  if (Date.now() < redisUnavailableUntil) return null;
  if (redisClient) return redisClient;
  try {
    redisClient = new Redis(getRedisOptions({ maxRetriesPerRequest: 1, lazyConnect: true }));
    await redisClient.connect();
    return redisClient;
  } catch {
    redisUnavailableUntil = Date.now() + 30000;
    if (redisClient) { try { redisClient.disconnect(); } catch {} }
    redisClient = null;
    return null;
  }
}

function serializeLLMManager(manager) {
  return JSON.stringify({
    __type: "LLMConversationManager",
    customerProfile:     manager.customerProfile,
    companyName:         manager.companyName,
    aiAgentName:         manager.aiAgentName,
    callbackPhone:       manager.callbackPhone,
    humanAdvisorName:    manager.humanAdvisorName,
    tenantLanguage:      manager.tenantLanguage,
    conversationHistory: manager.conversationHistory,
    currentStage:        manager.currentStage,
    extractedData:       manager.extractedData,
    callMeta:            manager.callMeta,
  });
}

function deserializeLLMManager(s) {
  const manager = new LLMConversationManager(
    s.customerProfile,
    s.companyName,
    s.aiAgentName,
    s.callbackPhone,
    s.humanAdvisorName,
    s.tenantLanguage
  );
  manager.conversationHistory = s.conversationHistory || [];
  manager.currentStage        = s.currentStage;
  manager.extractedData       = s.extractedData;
  manager.callMeta            = s.callMeta;
  return manager;
}

function serializeConversationManager(manager) {
  return JSON.stringify({
    __type: "ConversationManager",
    customerProfile:     manager.customerProfile,
    companyName:         manager.companyName,
    conversationHistory: manager.conversationHistory,
    currentStage:        manager.currentStage,
    extractedData:       manager.extractedData,
    callMeta:            manager.callMeta,
  });
}

function deserializeConversationManager(s) {
  const manager = new ConversationManager(s.customerProfile, s.companyName);
  manager.conversationHistory = s.conversationHistory || [];
  manager.currentStage        = s.currentStage;
  manager.extractedData       = s.extractedData;
  manager.callMeta            = s.callMeta;
  return manager;
}

function serialize(manager) {
  if (manager instanceof LLMConversationManager) {
    return serializeLLMManager(manager);
  }
  return serializeConversationManager(manager);
}

function deserialize(json) {
  const s = JSON.parse(json);
  if (s.__type === "LLMConversationManager") {
    return deserializeLLMManager(s);
  }
  return deserializeConversationManager(s);
}

export async function getSession(sessionId) {
  const key = `${KEY_PREFIX}${sessionId}`;
  try {
    const redis = await getRedis();
    if (redis) {
      const raw = await redis.get(key);
      return raw ? deserialize(raw) : null;
    }
  } catch {}
  return memoryStore.get(sessionId) ?? null;
}

export async function setSession(sessionId, manager) {
  const key = `${KEY_PREFIX}${sessionId}`;
  try {
    const redis = await getRedis();
    if (redis) {
      await redis.setex(key, SESSION_TTL_SECONDS, serialize(manager));
      return;
    }
  } catch {}
  memoryStore.set(sessionId, manager);
}

export async function deleteSession(sessionId) {
  const key = `${KEY_PREFIX}${sessionId}`;
  try {
    const redis = await getRedis();
    if (redis) {
      await redis.del(key);
      return;
    }
  } catch {}
  memoryStore.delete(sessionId);
}
