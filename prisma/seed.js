const {
  PrismaClient,
  UserRole,
  AiProviderType,
  AiProviderStatus,
  TelephonyProviderType,
  SubscriptionPlan,
} = require("@prisma/client");

const prisma = new PrismaClient();

// ─── SUBSCRIPTION CONFIG (global settings) ──────────────

async function seedSubscriptionConfig() {
  const configs = [
    { key: "trial_days",        value: 30 },
    { key: "grace_period_days", value: 7 },
    { key: "stripe_enabled",    value: false },
    { key: "razorpay_enabled",  value: false },
    { key: "currency",          value: "INR" },
    { key: "credit_init_fee",              value: 2 },
    { key: "credit_per_minute",            value: 1 },
    { key: "credit_reserve_amount",        value: 20 },
    { key: "credit_low_warning_pct",       value: 20 },
    { key: "credit_low_warning_pct_2",     value: 5 },
    { key: "credit_purchased_expiry_days", value: 365 },
    { key: "credit_reserve_timeout_hours", value: 2 },
  ];

  for (const { key, value } of configs) {
    await prisma.subscriptionConfig.upsert({
      where:  { key },
      update: { value },
      create: { key, value },
    });
  }
  console.log("✓ SubscriptionConfig seeded");
}

// ─── CREDIT PACKS ────────────────────────────────────────

async function seedCreditPacks() {
  const packs = [
    { name: "Micro",           credits: 100,   bonusCredits: 0, priceInr: 49,   priceUsd: 0.60,  isRecurring: false, sortOrder: 1 },
    { name: "Starter",         credits: 300,   bonusCredits: 0, priceInr: 149,  priceUsd: 2.00,  isRecurring: false, sortOrder: 2 },
    { name: "Standard",        credits: 1000,  bonusCredits: 0, priceInr: 399,  priceUsd: 5.00,  isRecurring: false, sortOrder: 3 },
    { name: "Pro Pack",        credits: 3000,  bonusCredits: 0, priceInr: 999,  priceUsd: 12.00, isRecurring: false, sortOrder: 4 },
    { name: "Power Pack",      credits: 10000, bonusCredits: 0, priceInr: 2999, priceUsd: 36.00, isRecurring: false, sortOrder: 5 },
    { name: "Basic Add-on",    credits: 500,   bonusCredits: 0, priceInr: 199,  priceUsd: 2.50,  isRecurring: true,  billingCycle: "MONTHLY", sortOrder: 6 },
    { name: "Standard Add-on", credits: 2000,  bonusCredits: 0, priceInr: 699,  priceUsd: 8.50,  isRecurring: true,  billingCycle: "MONTHLY", sortOrder: 7 },
  ];

  for (const pack of packs) {
    const existing = await prisma.creditPack.findFirst({ where: { name: pack.name } });
    if (!existing) {
      await prisma.creditPack.create({ data: pack });
    }
  }
  console.log("✓ CreditPacks seeded");
}

// ─── PLAN DEFINITIONS ───────────────────────────────────

async function seedPlanDefinitions() {
  const plans = [
    {
      plan: SubscriptionPlan.FREE,
      name: "Free",
      description: "Get started — no credit card required.",
      monthlyPriceUsd: 0,   annualPriceUsd: 0,
      monthlyPriceInr: 0,   annualPriceInr: 0,
      annualDiscountPct: 0,
      maxUsers: 1,          maxCustomers: 100,
      creditsPerMonth: 100,
      maxAiCallsPerMonth: -1, maxLeadUploadsPerMonth: 10,
      maxWebhooks: 0,        maxCustomFields: 0,
      maxTeams: 0,           maxStorageMb: 0,
      hasAiCalling: false,   hasAdvancedAnalytics: false,
      hasManualReview: false, hasDncRegistry: false,
      hasTeams: false,       hasMultiChannel: false,
      hasDealPipeline: false, hasIntentTraining: false,
      hasCustomAiPrompts: false, hasCustomProviders: false,
      hasWhiteLabel: false,  hasApiAccess: false,
      hasAiCallDemo: false,  hasDocuments: false,
      hasConversationMemory: false, hasWebhooks: false,
      hasCustomFields: false, hasCampaigns: false,
      trialDays: 0, isPublic: true, sortOrder: 1,
    },
    {
      plan: SubscriptionPlan.PLUS,
      name: "Plus",
      description: "For small teams getting serious about outreach.",
      monthlyPriceUsd: 9,   annualPriceUsd: 86.40,     // 20% off = $7.20/mo
      monthlyPriceInr: 299, annualPriceInr: 2999,       // ₹249.92/mo
      annualDiscountPct: 20,
      maxUsers: 3,           maxCustomers: 1000,
      creditsPerMonth: 200,
      maxAiCallsPerMonth: -1, maxLeadUploadsPerMonth: 50,
      maxWebhooks: 1,        maxCustomFields: 5,
      maxTeams: 0,           maxStorageMb: 512,        // 500 MB
      hasAiCalling: true,    hasAdvancedAnalytics: false,
      hasManualReview: true,  hasDncRegistry: true,
      hasTeams: false,       hasMultiChannel: false,
      hasDealPipeline: false, hasIntentTraining: false,
      hasCustomAiPrompts: false, hasCustomProviders: false,
      hasWhiteLabel: false,  hasApiAccess: false,
      hasAiCallDemo: true,   hasDocuments: true,
      hasConversationMemory: false, hasWebhooks: true,
      hasCustomFields: true,  hasCampaigns: true,
      trialDays: 0, isPublic: true, sortOrder: 2, badge: "Popular",
    },
    {
      plan: SubscriptionPlan.PRO,
      name: "Pro",
      description: "Full AI CRM power for growing businesses.",
      monthlyPriceUsd: 29,   annualPriceUsd: 278.40,    // 20% off = $23.20/mo
      monthlyPriceInr: 499,  annualPriceInr: 3999,       // ₹333.25/mo
      annualDiscountPct: 20,
      maxUsers: 10,          maxCustomers: 10000,
      creditsPerMonth: 500,
      maxAiCallsPerMonth: -1, maxLeadUploadsPerMonth: 100,
      maxWebhooks: 5,        maxCustomFields: 20,
      maxTeams: 5,           maxStorageMb: 10240,         // 10 GB
      hasAiCalling: true,    hasAdvancedAnalytics: true,
      hasManualReview: true,  hasDncRegistry: true,
      hasTeams: true,        hasMultiChannel: true,
      hasDealPipeline: true,  hasIntentTraining: false,
      hasCustomAiPrompts: true, hasCustomProviders: false,
      hasWhiteLabel: true,   hasApiAccess: false,
      hasAiCallDemo: true,   hasDocuments: true,
      hasConversationMemory: true, hasWebhooks: true,
      hasCustomFields: true,  hasCampaigns: true,
      trialDays: 30, isPublic: true, sortOrder: 3, badge: "Best Value",
    },
    {
      plan: SubscriptionPlan.MAX,
      name: "Max",
      description: "Unlimited scale + custom AI/telephony providers for enterprises.",
      monthlyPriceUsd: 79,   annualPriceUsd: 758.40,    // 20% off = $63.20/mo
      monthlyPriceInr: 799,  annualPriceInr: 5999,       // ₹499.92/mo
      annualDiscountPct: 20,
      maxUsers: -1,          maxCustomers: -1,
      creditsPerMonth: 1000,
      maxAiCallsPerMonth: -1, maxLeadUploadsPerMonth: -1,
      maxWebhooks: -1,       maxCustomFields: -1,
      maxTeams: -1,          maxStorageMb: -1,
      hasAiCalling: true,    hasAdvancedAnalytics: true,
      hasManualReview: true,  hasDncRegistry: true,
      hasTeams: true,        hasMultiChannel: true,
      hasDealPipeline: true,  hasIntentTraining: true,
      hasCustomAiPrompts: true, hasCustomProviders: true,
      hasWhiteLabel: true,   hasApiAccess: true,
      hasAiCallDemo: true,   hasDocuments: true,
      hasConversationMemory: true, hasWebhooks: true,
      hasCustomFields: true,  hasCampaigns: true,
      trialDays: 0, isPublic: true, sortOrder: 4,
    },
  ];

  for (const plan of plans) {
    await prisma.planDefinition.upsert({
      where:  { plan: plan.plan },
      update: plan,
      create: plan,
    });
  }
  console.log("✓ PlanDefinitions seeded (FREE / PLUS / PRO / MAX)");
}

// ─── SUPER ADMIN USER (no tenant) ────────────────────────

const SUPER_ADMIN_EMAIL = "shuklaji88as@gmail.com";

async function seedSuperAdmin() {
  // Support migrating from old email — find by either address
  const existing = await prisma.user.findFirst({
    where: { OR: [{ email: SUPER_ADMIN_EMAIL }, { email: "lucifer.shukla@crm.local" }] },
  });

  if (!existing) {
    // passwordHash: null → credential login blocked, Google OAuth auto-link enabled
    await prisma.user.create({
      data: {
        tenantId: null,
        email: SUPER_ADMIN_EMAIL,
        name: "Super Admin",
        passwordHash: null,
        role: UserRole.SUPER_ADMIN,
        isPrimaryOwner: true,
        emailVerified: new Date(),
      },
    });
  } else {
    // Update email + clear passwordHash so Google OAuth auto-link works
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        email: SUPER_ADMIN_EMAIL,
        name: "Super Admin",
        passwordHash: null,
        tenantId: null,
        role: UserRole.SUPER_ADMIN,
      },
    });
  }

  console.log(`✓ Super admin seeded  (${SUPER_ADMIN_EMAIL}) — Google OAuth only, no tenant`);
}

// ─── AI PROVIDERS ────────────────────────────────────────

async function seedAiProviders() {
  const providers = [
    {
      // Primary: free, fast, excellent Hinglish quality
      name: "Groq AI", type: AiProviderType.GROQ,
      model: "llama-3.3-70b-versatile", apiKey: process.env.GROQ_API_KEY || null,
      priority: 1, status: AiProviderStatus.ACTIVE,
    },
    {
      // Fallback 1: very cheap ($0.10/1M), great multilingual Hindi support
      name: "Gemini AI", type: AiProviderType.GEMINI,
      model: "gemini-2.0-flash", apiKey: process.env.GOOGLE_AI_API_KEY || null,
      priority: 2, status: AiProviderStatus.STANDBY,
    },
    {
      // Fallback 2: ultra-fast Groq 8b for high-load periods
      name: "OpenAI", type: AiProviderType.OPENAI,
      model: "gpt-4.1-mini", apiKey: process.env.OPENAI_API_KEY || null,
      priority: 3, status: AiProviderStatus.STANDBY,
    },
    {
      name: "Claude AI", type: AiProviderType.CLAUDE,
      model: "claude-sonnet-4-6", apiKey: process.env.ANTHROPIC_API_KEY || null,
      priority: 4, status: AiProviderStatus.STANDBY,
    },
    {
      name: "Dialogflow AI", type: AiProviderType.DIALOGFLOW,
      endpoint: "https://dialogflow.googleapis.com/v2",
      model: "dialogflow-es", priority: 5, status: AiProviderStatus.STANDBY,
    },
    {
      name: "Generic HTTP", type: AiProviderType.GENERIC_HTTP,
      endpoint: null, model: null,
      priority: 6, status: AiProviderStatus.DISABLED,
    },
  ];

  for (const p of providers) {
    const existing = await prisma.aiProviderConfig.findFirst({ where: { tenantId: null, name: p.name } });
    if (existing) {
      await prisma.aiProviderConfig.update({
        where: { id: existing.id },
        data: { type: p.type, model: p.model ?? null, endpoint: p.endpoint ?? null, priority: p.priority },
      });
    } else {
      await prisma.aiProviderConfig.create({ data: { ...p, tenantId: null } });
    }
  }
  console.log("✓ AI providers seeded (OpenAI / Claude / Groq / Gemini / Dialogflow / Generic HTTP)");
}

// ─── TELEPHONY PROVIDERS ─────────────────────────────────

async function seedTelephonyProviders() {
  const providers = [
    {
      name: "Twilio", type: TelephonyProviderType.TWILIO,
      priority: 1, enabled: true, isActive: true,
      metadata: {
        accountSid: process.env.TWILIO_ACCOUNT_SID || null,
        authToken:  process.env.TWILIO_AUTH_TOKEN  || null,
        fromNumber: process.env.TWILIO_FROM_NUMBER || null,
        callerId:   process.env.TWILIO_CALLER_ID   || null,
      },
    },
    {
      name: "Vonage", type: TelephonyProviderType.VONAGE,
      priority: 2, enabled: true, isActive: false,
      metadata: {
        applicationId: process.env.VONAGE_APPLICATION_ID || null,
        privateKey:    process.env.VONAGE_PRIVATE_KEY    || null,
        fromNumber:    process.env.VONAGE_FROM_NUMBER    || null,
      },
    },
    {
      name: "Plivo", type: TelephonyProviderType.PLIVO,
      priority: 3, enabled: true, isActive: false,
      metadata: {
        authId:    process.env.PLIVO_AUTH_ID    || null,
        authToken: process.env.PLIVO_AUTH_TOKEN || null,
        fromNumber: process.env.PLIVO_FROM_NUMBER || null,
      },
    },
    {
      name: "Exotel", type: TelephonyProviderType.EXOTEL,
      priority: 4, enabled: true, isActive: false,
      metadata: {
        accountSid: null,
        apiKey:     null,
        apiToken:   null,
        fromNumber: null,
      },
    },
  ];

  for (const p of providers) {
    const existing = await prisma.telephonyProviderConfig.findFirst({ where: { tenantId: null, name: p.name } });
    if (existing) {
      await prisma.telephonyProviderConfig.update({
        where: { id: existing.id },
        data: { type: p.type, priority: p.priority, metadata: p.metadata },
      });
    } else {
      await prisma.telephonyProviderConfig.create({ data: { ...p, tenantId: null } });
    }
  }
  console.log("✓ Telephony providers seeded (Twilio / Vonage / Plivo / Exotel)");
}

// ─── MAIN ────────────────────────────────────────────────

async function main() {
  console.log("Seeding database...\n");

  // Order matters: configs and plans first, then tenants that reference plans
  await seedSubscriptionConfig();
  await seedCreditPacks();
  await seedPlanDefinitions();
  await seedSuperAdmin();
  await seedAiProviders();
  await seedTelephonyProviders();

  console.log("\nDone.");
}

main()
  .then(async () => { await prisma.$disconnect(); })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
