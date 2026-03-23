# CRM AI — Project Guide

## What Is This

Enterprise multi-tenant CRM with AI-powered calling, subscription billing, and white-label theming. Built on **Next.js 16 App Router** + **Prisma 6** + **PostgreSQL (Neon)** + **NextAuth.js v4 (JWT)**.

Branch: `ui-change` | Working dir: `c:/Work/Learn/crm-ai`

---

## Quick Commands

```bash
npm run dev            # Start dev server
npm run build          # Production build
npm run db:push        # Push schema changes (no migration)
npm run db:migrate     # Create + apply migration
npm run db:seed        # Seed defaults (upsert-safe)
npx tsc --noEmit       # Type-check without build
npm run test           # Vitest
```

---

## Architecture

### Multi-Tenant Model

Every resource is scoped to a `Tenant`. SUPER_ADMIN has `tenantId: null` and can access all tenants.

**Session shape** (JWT):
```
{ userId, role, tenantId, isPrimaryOwner, isSuspended, emailVerified }
```

**Roles**: `SUPER_ADMIN` (platform-level), `ADMIN` (tenant owner), `SALES` (agent). Custom roles via `RoleDefinition` model.

### File Patterns

| Layer | Pattern | Example |
|-------|---------|---------|
| Page stub | `src/app/admin/<page>/page.js` | Server component, checks session, renders view |
| View component | `src/components/modern/<page>-view.js` | `"use client"`, receives `user` prop |
| API route | `src/app/api/<resource>/route.js` | `GET`, `POST` etc exports |
| Lib/service | `src/lib/<domain>/*.js` | Business logic, no request handling |
| Core module | `src/modules/<domain>/*.ts` | Theme system, loan assistant |

### Path Alias

`@/*` maps to `src/*` (tsconfig.json).

---

## Styling Rules

**CSS approach**: `modern-shell.css` with CSS custom properties. No Tailwind config file — Tailwind v4 via PostCSS for utility classes only.

**Theme toggle**: `[data-ui-theme="dark"]` / `[data-ui-theme="light"]` on `<html>`.

| Variable prefix | Purpose |
|-----------------|---------|
| `--ms-bg*` | Background layers (`--ms-bg`, `--ms-bg2`, `--ms-bg3`) |
| `--ms-text*` | Text colors (`--ms-text`, `--ms-text2`, `--ms-text3`) |
| `--ms-border*` | Border colors |
| `--ms-accent` | Brand accent (dark: `#1DE9A8`, light: `#059669`) |
| `--ms-surface` | Card/surface background |

**Key CSS classes**:
- `.ms-pane` — Main content area. Provides `padding: 24px` + `gap: 20px`. **Views must NOT add their own padding wrapper.**
- `.ms-card` — Card container. **No default padding** — add your own inside.
- `.ms-tbl` — Table styling.
- `.ms-btn`, `.ms-btn-primary` — Buttons.
- `.ms-metrics` — Metric/stat cards.
- `.ms-input`, `.ms-field-label` — Form elements.

**Dark palette**: `#0B0A0F` bg, `#1DE9A8` accent, warm violet borders.
**Light palette**: `#F2EFE9` bg, `#059669` accent, warm cream.

---

## Navigation (modern-shell.js)

6 sections with role-based visibility:

**Main** (all users): Dashboard, Customers, Manual Review, Call Logs, Analytics
**Main** (ADMIN+): Campaigns, Follow-ups, Lead Uploads, Audit Logs
**Pipeline** (ADMIN+): Deals, Messages
**AI Engine** (ADMIN+): Automation Health, AI Call Demo, AI Config, Intent Training, DNC
**Config** (ADMIN+): Teams, Settings, Webhooks, Billing
**Theme** (ADMIN+): Modular Theme
**Superadmin** (SUPER_ADMIN only): Global Theme, Roles & Permissions, Subscription Config, Plan Management

Nav key → route mapping lives in `getActiveKey()` and `getPageTitle()` in `modern-shell.js`.

---

## Auth & Guards

| File | Exports | Purpose |
|------|---------|---------|
| `src/lib/auth.js` | `authOptions` | NextAuth config, CredentialsProvider |
| `src/lib/server/auth-guard.js` | `requireSession()`, `hasRole()`, `getTenantContext()` | Request-level auth |
| `src/lib/subscription/plan-guard.js` | `getPlanGuard(tenantId)` | Plan enforcement (5-min TTL cache) |
| `src/middleware.js` | — | Route protection (ADMIN/SUPER_ADMIN routes) |

**Plan guard usage**:
```js
const guard = await getPlanGuard(tenantId);
guard.assertCanAddCustomer();       // throws 402 if over limit
guard.assertHasFeature("hasTeams"); // throws 402 if not in plan
const summary = guard.toClientSummary(); // { plan, status, limits, usage }
```

---

## Subscription & Billing

**Plans**: FREE / PLUS ($9) / PRO ($29, 30-day trial) / MAX ($79)
**Statuses**: TRIALING → ACTIVE → PAST_DUE → EXPIRED/CANCELLED/SUSPENDED
**Grace period**: 7 days (data readable, writes blocked)
**Billing providers**: Stripe (USD) + Razorpay (INR)

| File | Purpose |
|------|---------|
| `src/lib/subscription/subscription-service.js` | `createTrialSubscription()`, `upgradePlan()`, `downgradeToFree()` |
| `src/lib/subscription/trial-cron.js` | Expiry + warning emails (7/3/1 day) |
| `src/lib/billing/stripe.js` | Stripe checkout + webhooks |
| `src/lib/billing/razorpay.js` | Razorpay subscriptions + webhooks |

**Cron**: `POST /api/cron/subscription-expiry` (secured via `x-cron-secret` header)

---

## Theme System

3-tier inheritance: **System Default → Base Theme (global) → Tenant Override**

| File | Purpose |
|------|---------|
| `src/core/theme/system-defaults.ts` | Hard fallback values (never null) |
| `src/core/theme/theme-utils.ts` | CSS variable generation, WCAG contrast |
| `src/core/theme/ThemeProvider.tsx` | React context + CSS injection |
| `src/modules/theme/theme.service.ts` | Resolution, Redis caching (10-min TTL), CRUD |
| `src/modules/theme/theme.controller.ts` | API layer |
| `src/components/modern/theme-editor.js` | UI editor (mode: "global" or "tenant") |

**Default brand assets** live in `public/theme/defaults/`:
- `logo.svg`, `favicon.svg`, `login-background.svg`, `application-background.svg`
- Referenced by system defaults; all tenants get them unless they upload custom assets.

**Theme APIs**:
- `GET /api/theme/active` — resolved theme for current tenant (auth required)
- `GET /api/theme/public` — public fields (no auth, used by login page)
- `PUT /api/admin/theme` — update theme (global or tenant)
- `POST /api/admin/theme/assets` — upload brand assets
- `POST /api/theme/reset` — reset tenant override to base

---

## AI & Telephony

**AI providers**: OpenAI, Claude, Groq, Dialogflow, Generic HTTP
**Telephony providers**: Twilio, Vonage, Plivo

Both use **priority-based fallback routing** — if primary fails, next provider is tried.

| Directory | Purpose |
|-----------|---------|
| `src/lib/ai/` | AI engine contract, provider router, adapters (5) |
| `src/lib/telephony/` | Telephony contract, provider router, adapters (3) |
| `src/lib/journey/` | Campaign orchestration, state transitions, retry policy |
| `src/modules/loan-assistant/` | Voice-based loan inquiry assistant |

---

## Email

`src/lib/email/mailer.js` — Nodemailer with SMTP config from env. Silently skips if SMTP not configured.

Templates: `buildVerificationEmail()`, `buildTrialWelcomeEmail()`, `buildTrialExpiryWarningEmail()`, `buildPaymentConfirmationEmail()`

---

## i18n

`src/lib/i18n/languages.js` — 9 languages (EN, HI, ES, FR, DE, PT, AR, ZH, JA).
`t("nav.dashboard")` returns translated string, falls back to key.
Language stored in localStorage (`ms-ui-lang`) + persisted to DB for admins.

---

## Database

### Key Models (35+ models in schema.prisma)

**Core**: Tenant, User, RoleDefinition, Customer, CallLog, Campaign, CampaignJob, Deal
**CRM**: FollowUpTask, ManualReview, CustomerActivity, AiScoringHistory, ConversationSession
**Messaging**: MessageLog (SMS/WhatsApp/Email), Document
**Config**: AutomationSetting, CallScheduleConfig, WebhookConfig, AiProviderConfig, TelephonyProviderConfig, AiSystemPrompt
**Subscription**: PlanDefinition, TenantSubscription, SubscriptionInvoice, UsageRecord, SubscriptionConfig
**Theme**: TenantTheme
**Organization**: Team, TeamMember, Tag, CustomerTag, DncRegistry
**Audit**: UserManagementAuditLog, WebhookLog, CustomerTransition, LeadUpload, InAppNotification, AnalyticsSnapshot

### Key Enums

`UserRole` (SUPER_ADMIN, ADMIN, SALES), `CustomerStatus` (10 states), `CallStatus` (6 states), `SubscriptionPlan` (FREE/PLUS/PRO/MAX), `SubscriptionStatus` (6 states), `DealStage` (6 stages), `MessageChannel` (SMS/WHATSAPP/EMAIL)

### Seeded Data

- Super admin: `lucifer.shukla@crm.local` / `123456` (SUPER_ADMIN, no tenant)
- Demo admin: `admin@crm.local` / `Admin@123` (ADMIN, demo tenant, PRO trial)
- 4 plan definitions, global AI/telephony providers, subscription config

---

## API Routes (50+ endpoints)

### Auth
`POST /api/auth/[...nextauth]`, `POST /api/auth/register`, `GET /api/auth/verify-email`

### Customers
`GET|POST /api/customers`, `GET|PUT|DELETE /api/customers/[id]`, `POST /api/customers/batch`, `POST /api/customers/delete-all`

### Calls
`POST /api/calls/trigger`, `GET|PUT /api/calls/[id]`, `GET /api/calls/history`, `POST /api/calls/webhook`, `POST /api/calls/demo`

### Campaigns & Automation
`GET|POST /api/calls/automation/jobs`, `POST /api/calls/automation/run`, `GET /api/calls/automation/health`

### Leads
`POST /api/leads/upload`

### Billing
`POST /api/billing/checkout`, `POST /api/billing/stripe/webhook`, `POST /api/billing/razorpay/webhook`

### Admin
`GET|PUT /api/admin/settings`, `GET|POST /api/admin/user-management/users`, `GET|POST /api/admin/ai-providers`, `GET|POST /api/admin/telephony-providers`, `GET|POST|PUT /api/admin/ai-system-prompt`, `GET|POST /api/admin/plans`, `GET /api/admin/health`

### Theme
`PUT /api/admin/theme`, `POST /api/admin/theme/assets`, `GET /api/theme/active`, `GET /api/theme/public`, `POST /api/theme/reset`

### Dashboard & Subscription
`GET /api/dashboard/metrics`, `GET /api/subscription/summary`

### Cron
`POST /api/cron/subscription-expiry`, `POST /api/cron/ai-campaign`

---

## Environment Variables

### Required
- `DATABASE_URL` — PostgreSQL connection
- `NEXTAUTH_SECRET` — JWT secret
- `NEXTAUTH_URL` — Auth callback URL

### AI (at least one)
- `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GROQ_API_KEY`

### Telephony (at least one)
- `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` + `TWILIO_FROM_NUMBER`
- `VONAGE_APPLICATION_ID` + `VONAGE_PRIVATE_KEY` + `VONAGE_FROM_NUMBER`

### Email (optional)
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`

### Billing (optional)
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`

### Cron
- `CRON_SECRET` — Secures cron endpoints

### Redis (optional)
- `DISABLE_REDIS=true` — Skip Redis in dev

---

## UI Components (src/components/ui/)

8 custom primitives (no shadcn/ui dependency):
`Button`, `Input`, `Card`, `Badge`, `Modal`, `Select`, `Table`, `Loader`

All styled via CSS variables for theme compatibility.

---

## Key Dependencies

Next.js 16, React 19, Prisma 6.16, NextAuth 4, Stripe 20, Razorpay 2.9, BullMQ 5, Anthropic SDK, OpenAI SDK, Groq SDK, Twilio, Zod 4, Sonner, XLSX, Lucide, TailwindCSS 4
