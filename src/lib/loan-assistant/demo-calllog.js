import { prisma } from '@/lib/prisma';
import { toIntentLabel } from '@/lib/journey/constants';
import { canonicalizeIntent } from '@/lib/journey/intent-normalization';
import { evaluateCrmEventDecision } from '@/lib/crm/event-triggers';
import { normalizePhoneNumber } from '@/lib/telephony/utils';

const E164_PHONE_REGEX = /^\+\d{8,15}$/;

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function splitName(name) {
  const full = String(name || '').trim();
  if (!full) {
    return { firstName: 'Demo', lastName: 'Customer' };
  }

  const parts = full.split(/\s+/);
  const firstName = parts.shift() || 'Demo';
  const lastName = parts.join(' ');

  return {
    firstName,
    lastName,
  };
}

function toNumberOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildFallbackPhone(seed = '') {
  const digitsOnly = String(seed || Date.now()).replace(/\D/g, '');
  const suffix = digitsOnly.slice(-10).padStart(10, '0');
  return `+91${suffix}`;
}

function resolveProfilePhone(customerProfile, seed = '') {
  const candidates = [
    customerProfile?.phone,
    customerProfile?.mobile,
    customerProfile?.phoneNumber,
    customerProfile?.contact_number,
  ];

  for (const candidate of candidates) {
    const normalized = normalizePhoneNumber(candidate);
    if (E164_PHONE_REGEX.test(normalized)) {
      return normalized;
    }
  }

  return buildFallbackPhone(seed);
}

export function transcriptTurnsToText(transcript) {
  return (transcript || [])
    .map((turn) => `${turn.role === 'ai' ? 'Agent' : 'Customer'}: ${turn.message}`)
    .join('\n');
}

export function buildLoanAssistantFallbackSummary({ customerProfile, intent, extractedData }) {
  const customerName = String(customerProfile?.name || customerProfile?.customer_name || 'Customer').trim() || 'Customer';
  const normalizedIntent = canonicalizeIntent(intent) || 'unknown';
  const normalizedExtracted = isPlainObject(extractedData) ? extractedData : {};
  const signals = [
    normalizedExtracted.loanType ? `loan type ${normalizedExtracted.loanType}` : null,
    normalizedExtracted.amount ? `amount ${normalizedExtracted.amount}` : null,
    normalizedExtracted.timeline ? `timeline ${normalizedExtracted.timeline}` : null,
    normalizedExtracted.employmentType ? `employment ${normalizedExtracted.employmentType}` : null,
  ].filter(Boolean);

  return signals.length > 0
    ? `${customerName} ended the loan assistant conversation with intent ${normalizedIntent}. Captured ${signals.join(', ')}.`
    : `${customerName} ended the loan assistant conversation with intent ${normalizedIntent}.`;
}

export function buildLoanAssistantFallbackNextAction(intent) {
  const normalized = canonicalizeIntent(intent);
  if (normalized === 'call_back_later' || normalized === 'busy') {
    return 'Schedule a callback with the customer.';
  }
  if (normalized === 'interested' || normalized === 'converted') {
    return 'Arrange advisor follow-up with the customer.';
  }
  if (normalized === 'not_interested') {
    return 'Mark the lead as not interested and stop outreach.';
  }
  if (normalized === 'do_not_call') {
    return 'Do not contact this customer again.';
  }
  return 'Review the conversation and follow up as needed.';
}

export async function ensureLoanAssistantDemoCustomer({ tenantId, customerProfile, sessionSeed, sourceLabel }) {
  const scopedTenantId = String(tenantId || '').trim();
  if (!scopedTenantId) {
    throw new Error('tenant_id_missing');
  }

  const explicitCustomerId = String(customerProfile?.id || customerProfile?.customerId || '').trim();
  if (explicitCustomerId) {
    const existingById = await prisma.customer.findFirst({
      where: {
        id: explicitCustomerId,
        tenantId: scopedTenantId,
      },
      select: {
        id: true,
        retryCount: true,
      },
    });

    if (existingById) {
      return existingById;
    }
  }

  const resolvedPhone = resolveProfilePhone(customerProfile, sessionSeed);

  const existingByPhone = await prisma.customer.findFirst({
    where: {
      tenantId: scopedTenantId,
      phone: resolvedPhone,
    },
    select: {
      id: true,
      retryCount: true,
    },
  });

  if (existingByPhone) {
    return existingByPhone;
  }

  const { firstName, lastName } = splitName(customerProfile?.name);

  return prisma.customer.create({
    data: {
      tenantId: scopedTenantId,
      firstName,
      lastName: lastName || null,
      phone: resolvedPhone,
      email: customerProfile?.email || null,
      city: customerProfile?.city || null,
      source: sourceLabel || 'Loan Assistant Demo',
      loanType: customerProfile?.loan_interest_type || null,
      loanAmount: toNumberOrNull(customerProfile?.loan_amount),
      monthlyIncome: toNumberOrNull(customerProfile?.monthly_income),
      notes: 'Auto-created from loan assistant demo conversation.',
    },
    select: {
      id: true,
      retryCount: true,
    },
  });
}

export async function createLoanAssistantDemoCallLog({ tenantId, customerId, sessionId, sourceKey, attemptNumber }) {
  const scopedTenantId = String(tenantId || '').trim();
  const scopedCustomerId = String(customerId || '').trim();

  if (!scopedTenantId || !scopedCustomerId) {
    throw new Error('call_log_seed_missing');
  }

  const metadata = {
    source: sourceKey || 'loan_assistant_demo',
    sessionId: String(sessionId || '').trim() || null,
    createdBy: 'loan_assistant_demo',
  };

  const callLog = await prisma.callLog.create({
    data: {
      tenantId: scopedTenantId,
      customerId: scopedCustomerId,
      status: 'INITIATED',
      mode: 'AI',
      attemptNumber: Number.isFinite(Number(attemptNumber)) ? Number(attemptNumber) : 1,
      startedAt: new Date(),
      summary: 'Loan assistant demo conversation started.',
      metadata,
    },
    select: {
      id: true,
      tenantId: true,
    },
  });

  return callLog;
}

export async function finalizeLoanAssistantDemoCallLog({
  callLogId,
  tenantId,
  sessionId,
  sourceKey,
  summary,
  transcript,
  intent,
  nextAction,
  aiProviderUsed,
  durationSecs,
  extractedData,
}) {
  const scopedId = String(callLogId || '').trim();
  const scopedTenantId = String(tenantId || '').trim();

  if (!scopedId || !scopedTenantId) {
    return null;
  }

  const current = await prisma.callLog.findFirst({
    where: {
      id: scopedId,
      tenantId: scopedTenantId,
    },
    select: {
      id: true,
      tenantId: true,
      metadata: true,
      startedAt: true,
    },
  });

  if (!current) {
    return null;
  }

  const aiIntent = canonicalizeIntent(intent) || 'unknown';
  const crmDecision = evaluateCrmEventDecision({
    transcript,
    intent: aiIntent,
    summary,
    metadata: current.metadata,
  });
  const normalizedIntent = canonicalizeIntent(crmDecision.normalizedIntent || aiIntent) || aiIntent;
  const metadata = isPlainObject(current.metadata) ? { ...current.metadata } : {};
  metadata.source = sourceKey || metadata.source || 'loan_assistant_demo';
  if (sessionId) {
    metadata.sessionId = String(sessionId).trim();
  }
  metadata.loanAssistant = {
    ...(isPlainObject(metadata.loanAssistant) ? metadata.loanAssistant : {}),
    finalizedAt: new Date().toISOString(),
    extractedData: isPlainObject(extractedData) ? extractedData : null,
  };
  metadata.crmEventDecision = {
    ...crmDecision,
    source: 'loan_assistant_demo_finalize',
    evaluatedAt: new Date().toISOString(),
  };

  const fallbackDuration = current.startedAt
    ? Math.max(0, Math.round((Date.now() - new Date(current.startedAt).getTime()) / 1000))
    : null;
  const resolvedDuration = Number.isFinite(Number(durationSecs))
    ? Math.max(0, Math.round(Number(durationSecs)))
    : fallbackDuration;

  await prisma.callLog.updateMany({
    where: {
      id: current.id,
      tenantId: current.tenantId,
    },
    data: {
      status: 'COMPLETED',
      summary: String(summary || '').trim() || null,
      transcript: String(transcript || '').trim() || null,
      intent: toIntentLabel(normalizedIntent),
      intentClassification: normalizedIntent,
      nextAction: String(nextAction || crmDecision.recommendedNextAction || '').trim() || null,
      ...(aiProviderUsed ? { aiProviderUsed: String(aiProviderUsed).trim() } : {}),
      ...(resolvedDuration !== null ? { durationSecs: resolvedDuration } : {}),
      endedAt: new Date(),
      metadata,
    },
  });

  return current.id;
}