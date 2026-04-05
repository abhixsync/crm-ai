---
title: Identity Config — De-hardcode Site & Tenant Identity
date: 2026-04-05
tags:
  - design
  - identity
  - multi-tenant
  - theme
status: approved
---

# Identity Config — De-hardcode Site & Tenant Identity

## Overview

Remove all hardcoded identity strings from the codebase and replace them with a DB-driven, 3-tier configurable system. This covers four areas: app brand, loan assistant agent identity, email branding, and trial copy.

> [!important] Design Decision
> Identity fields are added to `TenantTheme` (not a new model) to reuse the existing 3-tier inheritance, Redis cache, and admin UI infrastructure. `emailFromAddress` is intentionally excluded from tenant configuration (SMTP spoofing risk).

---

## Scope

### In Scope
- App brand name and tagline (`brandName`, `brandTagline`)
- Email sender display name (`emailFromName`)
- Loan assistant agent name, company name, advisor name fallbacks
- Both system prompt files (module-level demo + production unified prompt)
- Email template accent color (inject from resolved theme)
- Email `from` display name (thread `emailFromName` into `sendEmail()`)
- Razorpay checkout brand name and accent color
- Trial copy (read `trialDays` + plan name from `PlanDefinition`)
- Theme editor admin UI section for identity fields

### Out of Scope
- `emailFromAddress` — stays env-only (`SMTP_FROM`) to prevent SMTP spoofing
- Language default (`"hinglish"`) — already configurable via `tenant.loanAssistantLanguage`
- Agent gender description in prompt (separate concern, out of scope)
- Static UI copy (navigation labels, form placeholders, generic error messages)
- `"super-admin"` tenant slug — intentional system constant
- `login-form.js` `NEXT_PUBLIC_APP_NAME` usage — intentional: pre-auth page has no tenant context

---

## Architecture

### Resolution Hierarchy (enforced everywhere)

```
tenant TenantTheme.brandName
  → base TenantTheme.brandName (isBaseTheme=true, tenantId=null)
    → NEXT_PUBLIC_APP_NAME env var
      → "CRM AI"  (hard fallback, never shown in production)
```

- `NEXT_PUBLIC_APP_NAME` is used **only** for pre-auth / unauthenticated pages and error states
- DB-resolved theme takes precedence everywhere a tenant context is available
- `null` on a tenant record means "inherit from parent tier" (same as existing deepMerge behavior)
- `""` (empty string) is treated as a value override — UI must save `null` when clearing a field

---

## Data Layer

### Schema Changes — `TenantTheme`

Add 3 new nullable columns:

```prisma
brandName         String?   // e.g. "Acme Finance" — null = inherit from base/system
brandTagline      String?   // e.g. "Smart Loans, Faster" — null = inherit
emailFromName     String?   // e.g. "Acme Finance Team" — null = falls back to brandName at send time
```

> [!warning] Save null, not empty string
> The admin UI must save `null` (not `""`) when a field is cleared. Empty string `""` overrides the parent with a blank value; `null` inherits. Validate on the API route: if value is `""`, save as `null`.

### `SYSTEM_THEME_DEFAULT` additions (`src/core/theme/system-defaults.ts`)

```ts
brandName: "CRM AI",
brandTagline: "AI Sales Platform",
emailFromName: null,
```

> [!note] `as const` conflict
> `SYSTEM_THEME_DEFAULT` uses `as const`. The new nullable fields conflict with the const assertion narrowing. Use an explicit type annotation or add `as unknown as string | null` cast for these fields. Alternatively, remove `as const` and type the object explicitly.

### `EditableTheme` type additions

```ts
brandName: string | null;
brandTagline: string | null;
emailFromName: string | null;
```

### `theme.service.ts` — Manual Field Additions Required

> [!warning] Four locations in theme.service.ts need manual updates
> The service manually maps fields in two places. All 3 new fields must be added to each:
> 1. `MUTABLE_SYSTEM_DEFAULT` object (near top of file) — add all 3 fields
> 2. `baseThemeTokens` manual construction — add all 3 fields from the resolved base theme row
> 3. Confirm new fields are NOT added to `BASE_THEME_ONLY` set (they must be tenant-overridable)
> 4. `ThemeTokens` type — add all 3 fields

### `getBaseBrandName()` utility

Add to `theme.service.ts`:

```ts
export async function getBaseBrandName(): Promise<string> {
  // resolveTenantTheme(null) resolves the base theme (isBaseTheme=true) via existing cache
  const resolved = await resolveTenantTheme(null);
  return resolved?.brandName || process.env.NEXT_PUBLIC_APP_NAME || "CRM AI";
}
```

Used by loan assistant API routes as the final company name fallback.

### Migration

Single migration adding 3 nullable columns to `TenantTheme`. All new columns are nullable with no default — existing rows get `null`, which correctly inherits from the base/system tier. Low-risk, fully reversible by dropping the 3 columns.

**Seed file**: No seed changes needed — `null` columns on the seeded base theme row correctly inherit from `SYSTEM_THEME_DEFAULT` which provides `brandName: "CRM AI"`.

### Prisma Schema Defaults for Loan Assistant Fields

`Tenant.aiAgentName` currently has `@default("Priya")` and `Tenant.loanAssistantHumanAdvisorName` has `@default("John Doe")` in the schema. These schema defaults mean new tenants get "Priya" in the DB — making the runtime fallback `"Your Advisor"` effectively dead code for the agent name.

**Decision**: Change these schema defaults to neutral values:
- `aiAgentName @default("Your Advisor")`
- `loanAssistantHumanAdvisorName @default("Our Advisor")`

Include in the same migration as the `TenantTheme` column additions. Update the seed file `aiAgentName` value for the demo tenant accordingly.

---

## Loan Assistant Identity

### Problem

**Two separate files** hardcode agent/company identity. Both must be fixed:

1. `src/modules/loan-assistant/system-prompt.js` — used by the demo UI conversation manager
2. `src/lib/ai/system-prompt.js` — the **production path** used by the unified call-turn builder (`buildUnifiedCallTurnPrompt`) for all AI provider calls via the provider router

Fixing only the demo file while leaving the production path hardcoded defeats the purpose.

### Fix — `src/modules/loan-assistant/system-prompt.js`

```js
// Before
export const LOAN_ASSISTANT_SYSTEM_PROMPT = `You are Priya Sharma from FinServe Loans...`;

// After
export function buildSystemPrompt({ agentName, companyName }) {
  return `You are ${agentName}, a professional loan consultant from ${companyName}...`;
}
```

### Fix — `src/modules/loan-assistant/index.js`

Update re-export to avoid breaking change:

```js
// Remove: export { LOAN_ASSISTANT_SYSTEM_PROMPT } from './system-prompt.js'
// Add:
export { buildSystemPrompt } from './system-prompt.js';
```

> [!warning] Preserve all other exports from `system-prompt.js`
> `system-prompt.js` also exports `CONVERSATION_STAGES`, `EMPLOYMENT_TYPES`, `LOAN_TYPES`, and `INTENT_TYPES`. These are imported by `llm-conversation-manager.js` and other consumers. Do NOT remove or rename them — only replace `LOAN_ASSISTANT_SYSTEM_PROMPT` with `buildSystemPrompt`.

### Fix — `src/lib/ai/system-prompt.js` (production path)

`CORE_PROMPT_TEMPLATE` already uses `{HUMAN_ADVISOR_NAME}` as a brace placeholder replaced via string substitution at runtime. Add `{AGENT_NAME}` and `{COMPANY_NAME}` placeholders **in the same brace-substitution pattern** (not JS template literals).

> [!warning] Also fix the hardcoded example in CONFUSION RECOVERY
> Around line 87 of `src/lib/ai/system-prompt.js` there is an example response hardcoded as: `"Maafi chahungi, main Priya hoon FinServe Loans se..."`. This **must also** be replaced with `{AGENT_NAME}` and `{COMPANY_NAME}` placeholders — an executor who only updates the header identity line will miss this.

Update `buildUnifiedCallTurnPrompt()` to accept `agentName` and `companyName` from the call payload and inject them via the same substitution mechanism as `{HUMAN_ADVISOR_NAME}`. The call payload already carries `companyName` and `aiAgentName` from the API route — thread them through.

### Fix — `llm-conversation-manager.js`

`getSystemPrompt()` calls `buildSystemPrompt({ agentName: this.aiAgentName, companyName: this.companyName })`.

### Fix — Fallback Chain in API Routes

Both `voice-conversation/route.js` and `conversation/route.js`:

```js
const resolvedBaseBrandName = await getBaseBrandName(); // from theme.service.ts

const companyName = tenant.loanAssistantCompanyName || tenant.name || resolvedBaseBrandName;
const aiAgentName = tenant.aiAgentName              || "Your Advisor";
const advisorName = tenant.loanAssistantHumanAdvisorName || "Our Advisor";
```

> [!note]
> "FinServe Loans", "Priya Sharma", and "John Doe" fallbacks are removed entirely.

### Fix — Test File

`src/modules/loan-assistant/__tests__/llm-conversation-manager.intent.test.js` constructs the manager with positional args `("Test Finance", "Priya")`. Verify the constructor signature is unchanged — only `getSystemPrompt()` changes internally. No test changes expected, but confirm after implementation.

---

## Email Branding

### Problem

1. All 4 email builder functions use `APP_NAME = "CRM AI"` (env/hardcoded) for the sender display name and H1 heading
2. Accent color `#1DE9A8` is hardcoded in all 4 email templates
3. `emailFromName` stored in DB has no path to the actual email `from` header
4. Trial copy hardcodes `"30-day Pro trial"` and `"Pro"` plan name

### Fix — `sendEmail()` function signature

```js
// Before
async function sendEmail({ to, subject, html })

// After
async function sendEmail({ to, subject, html, fromName = null })
// from field: fromName ? `"${fromName}" <${FROM}>` : FROM
```

This is the mechanism by which `emailFromName` controls the actual email sender display name.

### Fix — Email Builder Signatures (corrected)

```js
// Actual existing signatures + options param added as last argument:
buildVerificationEmail(name, token, { brandName, primaryColor } = {})
buildTrialWelcomeEmail(name, trialEndsAt, { brandName, primaryColor, fromName } = {})
buildTrialExpiryWarningEmail(name, trialEndsAt, daysLeft, { brandName, primaryColor, fromName } = {})
buildPaymentConfirmationEmail(name, invoice, { brandName, primaryColor, fromName } = {})
// invoice = { amountPaid, currency, plan, createdAt } — 2nd param unchanged
```

Internal defaults when not provided:
```js
const resolvedBrandName = brandName || APP_NAME;
const resolvedColor     = primaryColor || "#1DE9A8";
```

Builders return an object `{ subject, html, fromName }` which `sendEmail` consumes.

### Fix — Call Sites (all 5)

All call sites resolve tenant theme before calling:

```js
const theme = await resolveTenantTheme(tenantId); // from src/modules/theme/theme.service.ts
const emailCtx = {
  brandName:    theme.emailFromName || theme.brandName,
  primaryColor: theme.primaryColor,
  fromName:     theme.emailFromName || theme.brandName,
};
```

**Call sites requiring update:**
1. `src/app/api/auth/register/route.js` — verification email on registration
2. `src/app/api/auth/verify-email/route.js` — re-send verification
3. `src/lib/subscription/trial-cron.js` — trial warning + expiry emails
4. `src/app/api/billing/stripe/webhook/route.js` — payment confirmation
5. `src/app/api/billing/razorpay/webhook/route.js` — payment confirmation

### Fix — Trial Copy

Replace `"30-day Pro trial"` and `"Pro trial"` with dynamic values:

```js
const proPlan = await prisma.planDefinition.findFirst({ where: { name: "PRO" } });
const trialLabel = `${proPlan.trialDays}-day ${proPlan.name} trial`;
// e.g. "30-day PRO trial"
```

Use `trialLabel` in all email templates where trial copy appears.

### Email `from` Address

Stays as `SMTP_FROM` env var — **not tenant-configurable**. `emailFromName` controls the display name only. The SMTP envelope sender is unchanged.

---

## Trial Copy — Client Side

### `register-form.js`

Server component parent (`register/page.js`) fetches `trialDays` and passes as prop:

```js
// register/page.js (server component)
import { prisma } from "@/lib/prisma";
const proPlan = await prisma.planDefinition.findFirst({ where: { name: "PRO" } });
return <RegisterForm trialDays={proPlan?.trialDays ?? 30} />;
```

`register-form.js` uses `props.trialDays` instead of hardcoded `30`.

### `verify-email/page.js`

> [!note] No change needed
> `verify-email/page.js` is a `"use client"` component using `useSearchParams()`. Its only trial-related text is `"Your Pro trial is now active"` — no hardcoded day count. No changes required for trial copy. If the plan name "Pro" needs de-hardcoding in future, that is a separate task.

---

## UI Branding

### `layout.js`

- Replace `"Loan Enterprise CRM"` with `process.env.NEXT_PUBLIC_APP_NAME || "CRM AI"` (unauthenticated fallback)
- Read `brandName` + `brandTagline` from resolved theme for authenticated context

### `modern-shell.js`

- `displayBrand` fallback: `theme?.brandName || process.env.NEXT_PUBLIC_APP_NAME || "CRM AI"`
- `displaySub` fallback: `theme?.brandTagline || ""`
- No structural change needed; theme object already passed as prop

### `billing-view.js`

- Server parent passes `brandName` and `primaryColor` as props (resolved from tenant theme)
- Razorpay options: `name: brandName`, `theme: { color: primaryColor }`

---

## Admin UI — Theme Editor

Add **"Identity"** section to `theme-editor.js` (rendered in both `mode: "global"` and `mode: "tenant"`):

| Field | Label | Placeholder | Save behavior |
|-------|-------|-------------|---------------|
| `brandName` | Brand Name | Inherited from base | Empty → save `null` |
| `brandTagline` | Brand Tagline | Inherited from base | Empty → save `null` |
| `emailFromName` | Email Sender Name | Falls back to Brand Name | Empty → save `null` |

- **Global mode** (SUPER_ADMIN): sets base theme — affects all tenants without override
- **Tenant mode** (ADMIN/SUPER_ADMIN): sets per-tenant override

The theme editor's save action calls `PUT /api/admin/theme` which already invalidates the Redis cache for the affected tenant. No additional cache invalidation work needed.

---

## Files Modified

| File | Change |
|------|--------|
| `prisma/schema.prisma` | +3 nullable columns on `TenantTheme` |
| `src/core/theme/system-defaults.ts` | +3 fields in `SYSTEM_THEME_DEFAULT` + `EditableTheme` + `ThemeTokens` types; handle `as const` conflict |
| `src/modules/theme/theme.service.ts` | +3 fields in `MUTABLE_SYSTEM_DEFAULT`, `baseThemeTokens`, `ThemeTokens` type; add `getBaseBrandName()` export |
| `src/modules/loan-assistant/system-prompt.js` | Static constant → `buildSystemPrompt({ agentName, companyName })` function |
| `src/modules/loan-assistant/index.js` | Update re-export: remove `LOAN_ASSISTANT_SYSTEM_PROMPT`, add `buildSystemPrompt` |
| `src/modules/loan-assistant/llm-conversation-manager.js` | Call `buildSystemPrompt()` in `getSystemPrompt()` |
| `src/lib/ai/system-prompt.js` | Add `{AGENT_NAME}` + `{COMPANY_NAME}` placeholders to `CORE_PROMPT_TEMPLATE`; update `buildUnifiedCallTurnPrompt()` signature |
| `src/app/api/loan-assistant/voice-conversation/route.js` | Fix fallback chain using `getBaseBrandName()`; remove hardcoded names |
| `src/app/api/loan-assistant/conversation/route.js` | Fix fallback chain using `getBaseBrandName()`; remove hardcoded names |
| `src/lib/email/mailer.js` | Add `fromName` to `sendEmail()`; add branding context params to 4 builders; use `PlanDefinition.trialDays` + plan name |
| `src/app/api/auth/register/route.js` | Resolve tenant theme; pass branding context to mailer |
| `src/app/api/auth/verify-email/route.js` | Resolve tenant theme; pass branding context to mailer |
| `src/lib/subscription/trial-cron.js` | Resolve tenant theme per subscription; pass branding context to mailer |
| `src/app/api/billing/stripe/webhook/route.js` | Resolve tenant theme; pass branding context to mailer |
| `src/app/api/billing/razorpay/webhook/route.js` | Resolve tenant theme; pass branding context to mailer |
| `src/app/layout.js` | Fix unauthenticated default title; use resolved theme for brand fields |
| `src/components/shells/modern/modern-shell.js` | Fix `displayBrand`/`displaySub` fallbacks |
| `src/components/modern/billing-view.js` | Accept `brandName` + `primaryColor` props; inject into Razorpay options |
| `src/app/register/register-form.js` | Accept `trialDays` prop; use instead of hardcoded `30` |
| `src/app/register/page.js` | Fetch `PlanDefinition.trialDays`; pass as prop to `RegisterForm` |
| `src/components/modern/theme-editor.js` | Add Identity section with 3 fields; clear → `null` logic |

---

## Testing Checklist

- [ ] Base theme `brandName` set → all tenants without override show it in UI, emails, and loan assistant
- [ ] Tenant override set → only that tenant shows override
- [ ] Tenant override cleared (null saved, not "") → falls back to base theme value
- [ ] Loan assistant with no tenant config uses platform `brandName`, not "FinServe Loans"
- [ ] **Production prompt path** (`buildUnifiedCallTurnPrompt`) uses injected agent name + company, not hardcoded
- [ ] Demo path (`buildSystemPrompt`) uses injected values
- [ ] `index.js` re-export of `buildSystemPrompt` works; no consumer imports `LOAN_ASSISTANT_SYSTEM_PROMPT`
- [ ] Email `from` header shows `"Acme Finance" <noreply@crm.local>` when `emailFromName` is set
- [ ] Email sent to tenant user uses `emailFromName` and `primaryColor`
- [ ] Trial copy in email matches `PlanDefinition.trialDays` + plan name
- [ ] Register form receives correct `trialDays` from server component
- [ ] Razorpay modal shows tenant `brandName` and `primaryColor`
- [ ] Clearing a field in theme editor saves `null`, not `""`
- [ ] `MUTABLE_SYSTEM_DEFAULT` includes all 3 new fields
- [ ] `baseThemeTokens` in theme.service.ts includes all 3 new fields
- [ ] New fields are NOT in `BASE_THEME_ONLY` exclusion set
- [ ] All 5 email call sites pass branding context
- [ ] Existing loan-assistant intent tests still pass after `buildSystemPrompt` refactor
