import { prisma } from '@/lib/prisma.js';
import { databaseUnavailableResponse, isDatabaseUnavailable } from '@/lib/server/database-error';

const DEFAULT_HUMAN_ADVISOR_NAME = 'John Doe';
const OPTIONAL_ROLLOUT_FIELDS = ['loanAssistantHumanAdvisorName', 'loanAssistantCallbackPhone', 'loanAssistantNotificationEmail', 'loanAssistantLanguage'];
const DATABASE_UNAVAILABLE_COOLDOWN_MS = 15000;
const OPTIONAL_FIELD_PROBE_COOLDOWN_MS = 30000;

const optionalFieldSupport = {
  loanAssistantHumanAdvisorName: true,
  loanAssistantCallbackPhone: true,
  loanAssistantNotificationEmail: true,
  loanAssistantLanguage: true,
};
let optionalFieldSupportInitialized = false;
let optionalFieldSupportLastCheckedAt = 0;

let databaseUnavailableUntil = 0;

function inDatabaseUnavailableCooldown() {
  return Date.now() < databaseUnavailableUntil;
}

function markDatabaseUnavailableCooldown() {
  databaseUnavailableUntil = Date.now() + DATABASE_UNAVAILABLE_COOLDOWN_MS;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withDatabaseRetry(operation, retries = 1) {
  let attempt = 0;
  let lastError;

  while (attempt <= retries) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (!isDatabaseUnavailable(error) || attempt === retries) {
        throw error;
      }

      await sleep(250 * (attempt + 1));
      attempt += 1;
    }
  }

  throw lastError;
}

async function ensureOptionalFieldSupport(force = false) {
  const recentlyChecked = Date.now() - optionalFieldSupportLastCheckedAt < OPTIONAL_FIELD_PROBE_COOLDOWN_MS;

  if (!force && optionalFieldSupportInitialized && recentlyChecked) {
    return;
  }

  try {
    const rows = await withDatabaseRetry(() => prisma.$queryRawUnsafe(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'Tenant'
        AND column_name IN ('loanAssistantHumanAdvisorName', 'loanAssistantCallbackPhone', 'loanAssistantNotificationEmail', 'loanAssistantLanguage')
    `));

    const availableColumns = new Set(
      Array.isArray(rows) ? rows.map((row) => String(row?.column_name || '')) : []
    );

    optionalFieldSupport.loanAssistantHumanAdvisorName = availableColumns.has('loanAssistantHumanAdvisorName');
    optionalFieldSupport.loanAssistantCallbackPhone = availableColumns.has('loanAssistantCallbackPhone');
    optionalFieldSupport.loanAssistantNotificationEmail = availableColumns.has('loanAssistantNotificationEmail');
    optionalFieldSupport.loanAssistantLanguage = availableColumns.has('loanAssistantLanguage');
    optionalFieldSupportInitialized = true;
    optionalFieldSupportLastCheckedAt = Date.now();
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      throw error;
    }

    // If metadata lookup fails, avoid repeatedly probing optional rollout fields.
    optionalFieldSupport.loanAssistantHumanAdvisorName = false;
    optionalFieldSupport.loanAssistantCallbackPhone = false;
    optionalFieldSupport.loanAssistantNotificationEmail = false;
    optionalFieldSupport.loanAssistantLanguage = false;
    optionalFieldSupportInitialized = true;
    optionalFieldSupportLastCheckedAt = Date.now();
  }
}

function isTenantOptionalFieldCompatibilityError(error) {
  const message = String(error?.message || '');
  const code = String(error?.code || '');
  const mentionsOptionalField = OPTIONAL_ROLLOUT_FIELDS.some((field) => message.includes(field));

  if (!mentionsOptionalField) {
    return false;
  }

  if (code === 'P2022') {
    return true;
  }

  return (
    message.includes('Unknown field') ||
    message.includes('Unknown argument') ||
    message.includes('does not exist')
  );
}

function markUnsupportedOptionalFields(error) {
  const message = String(error?.message || '');
  const mentionsHumanAdvisor = message.includes('loanAssistantHumanAdvisorName');
  const mentionsCallbackPhone = message.includes('loanAssistantCallbackPhone');
  const mentionsNotificationEmail = message.includes('loanAssistantNotificationEmail');
  const mentionsLanguage = message.includes('loanAssistantLanguage');

  if (!mentionsHumanAdvisor && !mentionsCallbackPhone && !mentionsNotificationEmail && !mentionsLanguage) {
    optionalFieldSupport.loanAssistantHumanAdvisorName = false;
    optionalFieldSupport.loanAssistantCallbackPhone = false;
    optionalFieldSupport.loanAssistantNotificationEmail = false;
    optionalFieldSupport.loanAssistantLanguage = false;
    optionalFieldSupportInitialized = true;
    optionalFieldSupportLastCheckedAt = Date.now();
    return;
  }

  if (mentionsHumanAdvisor) {
    optionalFieldSupport.loanAssistantHumanAdvisorName = false;
  }

  if (mentionsCallbackPhone) {
    optionalFieldSupport.loanAssistantCallbackPhone = false;
  }

  if (mentionsNotificationEmail) {
    optionalFieldSupport.loanAssistantNotificationEmail = false;
  }

  if (mentionsLanguage) {
    optionalFieldSupport.loanAssistantLanguage = false;
  }

  optionalFieldSupportInitialized = true;
  optionalFieldSupportLastCheckedAt = Date.now();
}

function buildTenantSelect() {
  return {
    id: true,
    name: true,
    loanAssistantCompanyName: true,
    aiAgentName: true,
    ...(optionalFieldSupport.loanAssistantHumanAdvisorName ? { loanAssistantHumanAdvisorName: true } : {}),
    ...(optionalFieldSupport.loanAssistantCallbackPhone ? { loanAssistantCallbackPhone: true } : {}),
    ...(optionalFieldSupport.loanAssistantNotificationEmail ? { loanAssistantNotificationEmail: true } : {}),
    ...(optionalFieldSupport.loanAssistantLanguage ? { loanAssistantLanguage: true } : {}),
  };
}

function pruneUnsupportedOptionalFields(updateData) {
  if (!optionalFieldSupport.loanAssistantHumanAdvisorName) {
    delete updateData.loanAssistantHumanAdvisorName;
  }

  if (!optionalFieldSupport.loanAssistantCallbackPhone) {
    delete updateData.loanAssistantCallbackPhone;
  }

  if (!optionalFieldSupport.loanAssistantNotificationEmail) {
    delete updateData.loanAssistantNotificationEmail;
  }

  if (!optionalFieldSupport.loanAssistantLanguage) {
    delete updateData.loanAssistantLanguage;
  }
}

/**
 * GET /api/tenant/loan-assistant-settings
 * Fetch loan assistant settings for the current tenant
 * 
 * Headers:
 *   X-Tenant-ID: string (tenant ID)
 */
export async function GET(request) {
  try {
    const tenantId = request.headers.get('X-Tenant-ID');

    if (!tenantId) {
      return Response.json(
        { error: 'X-Tenant-ID header is required', success: false },
        { status: 400 }
      );
    }

    if (inDatabaseUnavailableCooldown()) {
      return databaseUnavailableResponse({
        success: false,
        error: 'Database temporarily unavailable. Please retry shortly.',
      });
    }

    await ensureOptionalFieldSupport();

    let tenant;
    let hasHumanAdvisorField = optionalFieldSupport.loanAssistantHumanAdvisorName;
    let hasCallbackPhoneField = optionalFieldSupport.loanAssistantCallbackPhone;
    let hasNotificationEmailField = optionalFieldSupport.loanAssistantNotificationEmail;
    let hasLanguageField = optionalFieldSupport.loanAssistantLanguage;

    try {
      tenant = await withDatabaseRetry(() => prisma.tenant.findUnique({
        where: { id: tenantId },
        select: buildTenantSelect(),
      }));
    } catch (error) {
      if (!isTenantOptionalFieldCompatibilityError(error)) {
        throw error;
      }

      // Backward-compatibility: Prisma client/DB schema can lag during rollout.
      markUnsupportedOptionalFields(error);
      hasHumanAdvisorField = optionalFieldSupport.loanAssistantHumanAdvisorName;
      hasCallbackPhoneField = optionalFieldSupport.loanAssistantCallbackPhone;
      hasNotificationEmailField = optionalFieldSupport.loanAssistantNotificationEmail;
      hasLanguageField = optionalFieldSupport.loanAssistantLanguage;
      tenant = await withDatabaseRetry(() => prisma.tenant.findUnique({
        where: { id: tenantId },
        select: buildTenantSelect(),
      }));
    }

    if (!tenant) {
      return Response.json(
        { error: 'Tenant not found', success: false },
        { status: 404 }
      );
    }

    return Response.json({
      success: true,
      data: {
        tenantId: tenant.id,
        tenantName: tenant.name,
        loanAssistantCompanyName: tenant.loanAssistantCompanyName,
        loanAssistantHumanAdvisorName: hasHumanAdvisorField
          ? (tenant.loanAssistantHumanAdvisorName || DEFAULT_HUMAN_ADVISOR_NAME)
          : DEFAULT_HUMAN_ADVISOR_NAME,
        loanAssistantCallbackPhone: hasCallbackPhoneField ? (tenant.loanAssistantCallbackPhone ?? null) : null,
        loanAssistantNotificationEmail: hasNotificationEmailField ? (tenant.loanAssistantNotificationEmail ?? null) : null,
        loanAssistantLanguage: hasLanguageField ? (tenant.loanAssistantLanguage || 'hinglish') : 'hinglish',
        aiAgentName: tenant.aiAgentName,
        // Resolved company name - use loanAssistantCompanyName, fallback to tenantName
        resolvedCompanyName: tenant.loanAssistantCompanyName || tenant.name,
      },
    });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      markDatabaseUnavailableCooldown();
      return databaseUnavailableResponse({
        success: false,
        error: 'Database temporarily unavailable. Please retry shortly.',
      });
    }

    console.error('Error fetching loan assistant settings:', error);
    return Response.json(
      { error: 'Failed to fetch settings', success: false },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/tenant/loan-assistant-settings
 * Update loan assistant settings for the current tenant
 * 
 * Headers:
 *   X-Tenant-ID: string (tenant ID)
 * 
 * Body:
 *   {
 *     loanAssistantCompanyName?: string
 *     loanAssistantHumanAdvisorName?: string
 *     loanAssistantCallbackPhone?: string
 *     loanAssistantNotificationEmail?: string
 *     loanAssistantLanguage?: string
 *     aiAgentName?: string
 *   }
 */
export async function PUT(request) {
  try {
    const tenantId = request.headers.get('X-Tenant-ID');

    if (!tenantId) {
      return Response.json(
        { error: 'X-Tenant-ID header is required', success: false },
        { status: 400 }
      );
    }

    if (inDatabaseUnavailableCooldown()) {
      return databaseUnavailableResponse({
        success: false,
        error: 'Database temporarily unavailable. Please retry shortly.',
      });
    }

    await ensureOptionalFieldSupport();

    const body = await request.json();
    const {
      loanAssistantCompanyName,
      loanAssistantHumanAdvisorName,
      loanAssistantCallbackPhone,
      loanAssistantNotificationEmail,
      loanAssistantLanguage,
      aiAgentName,
    } = body;

    if (
      loanAssistantHumanAdvisorName !== undefined &&
      !optionalFieldSupport.loanAssistantHumanAdvisorName
    ) {
      await ensureOptionalFieldSupport(true);
    }

    if (
      loanAssistantCallbackPhone !== undefined &&
      !optionalFieldSupport.loanAssistantCallbackPhone
    ) {
      await ensureOptionalFieldSupport(true);
    }

    if (
      loanAssistantNotificationEmail !== undefined &&
      !optionalFieldSupport.loanAssistantNotificationEmail
    ) {
      await ensureOptionalFieldSupport(true);
    }

    if (
      loanAssistantLanguage !== undefined &&
      !optionalFieldSupport.loanAssistantLanguage
    ) {
      await ensureOptionalFieldSupport(true);
    }

    // Validate tenant exists
    const tenant = await withDatabaseRetry(() => prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true },
    }));

    if (!tenant) {
      return Response.json(
        { error: 'Tenant not found', success: false },
        { status: 404 }
      );
    }

    // Build update payload
    const updateData = {};
    if (loanAssistantCompanyName !== undefined) {
      updateData.loanAssistantCompanyName = loanAssistantCompanyName || null;
    }
    if (loanAssistantHumanAdvisorName !== undefined) {
      updateData.loanAssistantHumanAdvisorName = String(loanAssistantHumanAdvisorName || '').trim() || DEFAULT_HUMAN_ADVISOR_NAME;
    }
    if (loanAssistantCallbackPhone !== undefined) {
      updateData.loanAssistantCallbackPhone = loanAssistantCallbackPhone || null;
    }
    if (loanAssistantNotificationEmail !== undefined) {
      updateData.loanAssistantNotificationEmail = String(loanAssistantNotificationEmail || '').trim() || null;
    }
    if (aiAgentName !== undefined) {
      updateData.aiAgentName = aiAgentName;
    }
    if (loanAssistantLanguage !== undefined) {
      const lang = String(loanAssistantLanguage || 'hinglish').trim().toLowerCase();
      const validLangs = ['english', 'hindi', 'hinglish'];
      updateData.loanAssistantLanguage = validLangs.includes(lang) ? lang : 'hinglish';
    }

    let updatedTenant;
    let hasHumanAdvisorField = optionalFieldSupport.loanAssistantHumanAdvisorName;
    let hasCallbackPhoneField = optionalFieldSupport.loanAssistantCallbackPhone;
    let hasNotificationEmailField = optionalFieldSupport.loanAssistantNotificationEmail;
    let hasLanguageField = optionalFieldSupport.loanAssistantLanguage;

    pruneUnsupportedOptionalFields(updateData);

    try {
      updatedTenant = await withDatabaseRetry(() => prisma.tenant.update({
        where: { id: tenantId },
        data: updateData,
        select: buildTenantSelect(),
      }));
    } catch (error) {
      if (!isTenantOptionalFieldCompatibilityError(error)) {
        throw error;
      }

      // Backward-compatibility: drop unsupported rollout fields and persist stable settings.
      markUnsupportedOptionalFields(error);
      hasHumanAdvisorField = optionalFieldSupport.loanAssistantHumanAdvisorName;
      hasCallbackPhoneField = optionalFieldSupport.loanAssistantCallbackPhone;
      hasNotificationEmailField = optionalFieldSupport.loanAssistantNotificationEmail;
      hasLanguageField = optionalFieldSupport.loanAssistantLanguage;
      const fallbackUpdateData = { ...updateData };
      pruneUnsupportedOptionalFields(fallbackUpdateData);

      if (Object.keys(fallbackUpdateData).length === 0) {
        updatedTenant = await withDatabaseRetry(() => prisma.tenant.findUnique({
          where: { id: tenantId },
          select: buildTenantSelect(),
        }));
      } else {
        updatedTenant = await withDatabaseRetry(() => prisma.tenant.update({
          where: { id: tenantId },
          data: fallbackUpdateData,
          select: buildTenantSelect(),
        }));
      }
    }

    return Response.json({
      success: true,
      data: {
        tenantId: updatedTenant.id,
        tenantName: updatedTenant.name,
        loanAssistantCompanyName: updatedTenant.loanAssistantCompanyName,
        loanAssistantHumanAdvisorName: hasHumanAdvisorField
          ? (updatedTenant.loanAssistantHumanAdvisorName || DEFAULT_HUMAN_ADVISOR_NAME)
          : DEFAULT_HUMAN_ADVISOR_NAME,
        loanAssistantCallbackPhone: hasCallbackPhoneField ? (updatedTenant.loanAssistantCallbackPhone ?? null) : null,
        loanAssistantNotificationEmail: hasNotificationEmailField ? (updatedTenant.loanAssistantNotificationEmail ?? null) : null,
        loanAssistantLanguage: hasLanguageField ? (updatedTenant.loanAssistantLanguage || 'hinglish') : 'hinglish',
        aiAgentName: updatedTenant.aiAgentName,
        resolvedCompanyName: updatedTenant.loanAssistantCompanyName || updatedTenant.name,
      },
    });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      markDatabaseUnavailableCooldown();
      return databaseUnavailableResponse({
        success: false,
        error: 'Database temporarily unavailable. Please retry shortly.',
      });
    }

    console.error('Error updating loan assistant settings:', error);
    return Response.json(
      { error: 'Failed to update settings', success: false },
      { status: 500 }
    );
  }
}
