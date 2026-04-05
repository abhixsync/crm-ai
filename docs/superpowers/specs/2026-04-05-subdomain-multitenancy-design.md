---
title: Subdomain Multi-Tenancy
date: 2026-04-05
tags:
  - architecture
  - multi-tenancy
  - domains
  - auth
status: approved
aliases:
  - Tenant Subdomains
  - Custom Domain Routing
---

# Subdomain Multi-Tenancy

Enable every tenant to be served from their own dedicated subdomain (`valuelabs.wrenforge.com`) and optionally a custom domain (`crm.valuelabs.com`), with tenant-locked authentication and automatic SSL.

> [!abstract] Summary
> Single Vercel deployment. Middleware resolves hostname → tenant on every request using `@neondatabase/serverless` (Edge-compatible) with an in-process Map cache. Login is tenant-locked. Custom domains registered via Vercel Domains API with CNAME verification. SUPER_ADMIN always accesses via `app.wrenforge.com`.

---

## Architecture Overview

```
valuelabs.wrenforge.com   →  Vercel wildcard *.wrenforge.com  →  Next.js app
crm.valuelabs.com         →  CNAME → cname.vercel-dns.com     →  same Next.js app
app.wrenforge.com         →  platform domain (SUPER_ADMIN)    →  same Next.js app
```

Every request hits the same Next.js instance. The middleware reads the `host` header, resolves it to a tenant, and injects `x-resolved-tenant-id` + `x-resolved-tenant-slug` before any page or API route runs.

> [!warning] Deployment constraint
> `trustHost: true` in NextAuth is safe **only** when deployed behind Vercel's routing layer (which validates the Host header against registered domains). If the app is ever self-hosted or moved off Vercel, this must be replaced with explicit per-domain `NEXTAUTH_URL` or a reverse proxy that validates Host headers.

---

## Section 1: Database Schema

### Changes to `Tenant` model

```prisma
model Tenant {
  // ... all existing fields unchanged ...
  slug                 String    @unique
  customDomain         String?   @unique
  customDomainVerified Boolean   @default(false)
  customDomainAddedAt  DateTime?
}
```

> [!note]
> The `slug` field already exists in the schema and seed. This section formalises its role as the subdomain identifier and adds the custom domain fields.

### Slug rules

- Pattern: `^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$` (1–63 chars, allows single-char slugs like `ai`)
- Auto-generated from tenant `name` on creation: lowercase, non-alphanumeric → `-`, deduplicated hyphens
- Collision resolution: append `-2`, `-3`, etc.
- Minimum generated length: 3 chars (pad short names with a suffix if needed)
- Editable by SUPER_ADMIN only after creation

### Reserved slugs (blocked)

`app`, `www`, `api`, `admin`, `mail`, `support`, `help`, `status`, `blog`, `assets`, `static`, `auth`

### Migration for existing tenants

Prisma migration adds the columns. A post-migration script auto-generates `slug` for every existing tenant from `name`. Demo tenant slug updated from `demo-crm` to `demo` in the seed.

---

## Section 2: Middleware — Hostname → Tenant Resolution

> [!warning] Edge Runtime constraint
> Next.js middleware runs in the **Edge Runtime**. Neither Prisma Client nor `ioredis` are compatible. Tenant resolution uses `@neondatabase/serverless` (HTTP driver, Edge-compatible) for DB queries and an in-process `Map` for caching. No Redis dependency in middleware.

### Cache strategy (two tiers)

| Tier | Mechanism | TTL | Notes |
|---|---|---|---|
| 1st | In-process `Map` in middleware | 60 s | Works even with `DISABLE_REDIS=true` |
| 2nd | Not used in middleware | — | Redis caching remains in app-layer services only |

The in-process cache is sufficient for Edge Workers on Vercel — the same worker instance handles many sequential requests before being recycled.

### Resolution logic

```
host === "app.wrenforge.com" OR host === "www.wrenforge.com"
  → www redirects to app.wrenforge.com (301)
  → app: no tenant injected; SUPER_ADMIN domain; continue

host ends with ".wrenforge.com"
  → extract subdomain slug
  → check in-process Map cache
  → if miss → neon SQL: SELECT id, slug, name FROM "Tenant" WHERE slug = $1 LIMIT 1
  → if found → cache 60 s, inject x-resolved-tenant-id + x-resolved-tenant-slug
  → if not found → return 404

host is anything else (custom domain)
  → check in-process Map cache
  → if miss → neon SQL: SELECT id, slug, name FROM "Tenant" WHERE "customDomain" = $1 AND "customDomainVerified" = true LIMIT 1
  → if found → cache 60 s, inject headers
  → if not found → return 404
```

### Injected headers (renamed to avoid collision with existing SUPER_ADMIN switcher)

| Header | Value |
|---|---|
| `x-resolved-tenant-id` | Tenant UUID from DB |
| `x-resolved-tenant-slug` | e.g. `valuelabs` |

> [!important] Header naming
> The existing codebase uses `X-Tenant-ID` as a **client-sent** header for SUPER_ADMIN tenant switching (`auth-guard.js`, `tenant-switcher-provider.js`). The middleware-injected headers use the distinct prefix `x-resolved-*` to avoid ambiguity. `getTenantContext()` continues to read `X-Tenant-ID` for SUPER_ADMIN override; it also reads `x-resolved-tenant-id` as a fallback for regular users.

### Middleware bypass list (no tenant resolution)

```
/_next/*
/favicon.ico
/theme/*
/api/auth/*          (NextAuth internal routes)
/api/cron/*          (cron jobs called externally)
/api/calls/webhook   (telephony callbacks — tenant resolved from payload)
/api/billing/*/webhook  (payment callbacks — tenant resolved from payload)
/robots.txt
/sitemap.xml
```

### Cache invalidation

In-process Map entries expire by TTL (60 s). No explicit invalidation needed — stale entries expire within 60 seconds of a slug or domain change.

---

## Section 3: Auth — Tenant-locked Login

### NextAuth config changes

```js
export const authOptions = {
  trustHost: true,   // safe on Vercel — see deployment constraint note above
  // ... rest unchanged
}
```

### Login page data flow

```
middleware injects x-resolved-tenant-id, x-resolved-tenant-slug
  → src/app/login/page.js (server component)
      import { headers } from 'next/headers'
      const tenantId = headers().get('x-resolved-tenant-id')
      const tenantSlug = headers().get('x-resolved-tenant-slug')
      → renders <LoginForm tenantId={tenantId} tenantSlug={tenantSlug} theme={...} />

  → src/app/login/login-form.js (client component)
      receives tenantId as prop
      passes to NextAuth: signIn("credentials", { email, password, tenantId, redirect: false })

  → authOptions credentials schema adds:
      tenantId: { label: "Tenant", type: "text" }
```

Theme system auto-loads that tenant's branding via `tenantId` — no extra work required.

### `CredentialsProvider.authorize()` changes

```js
async authorize(credentials) {
  const identifier = credentials.email?.trim().toLowerCase();
  const { password, tenantId } = credentials;

  const user = await db.user.findFirst({
    where: { OR: [{ email: identifier }, { username: identifier }] }
  });

  if (!user || !verifyPassword(password, user.password)) {
    throw new Error("Invalid credentials");
  }

  // SUPER_ADMIN bypasses tenant check — logs in from app.wrenforge.com only
  if (user.role !== "SUPER_ADMIN") {
    if (!tenantId || user.tenantId !== tenantId) {
      throw new Error("You don't have access to this workspace.");
    }
  }

  return buildSession(user);
}
```

### SUPER_ADMIN flow

SUPER_ADMIN logs in exclusively at `app.wrenforge.com`. That domain has no tenant injection — middleware skips it. After login, they use the existing tenant switcher (`X-Tenant-ID` header) to manage any tenant. Visiting a tenant subdomain while logged in as SUPER_ADMIN redirects to `app.wrenforge.com`.

---

## Section 3b: Registration Flow

Registration remains on `app.wrenforge.com` only:

1. User visits `app.wrenforge.com/register`
2. Registration creates Tenant + User + generates slug (existing logic, unchanged)
3. Post-registration: redirect to `https://{slug}.wrenforge.com/login?welcome=1` (not `/dashboard`)
4. A "Welcome" query param on the login page shows: *"Your workspace is ready at [slug].wrenforge.com — bookmark this URL"*
5. Registration page is inaccessible from tenant subdomains (middleware returns 404 for unknown tenants; known tenants don't show a register link)

---

## Section 4: Custom Domain Flow

### Step-by-step

1. Tenant ADMIN enters `crm.valuelabs.com` in Settings → Domain
2. API validates format, checks uniqueness, stores in DB (`customDomainVerified: false`)
3. API calls Vercel Domains API:
   ```
   POST https://api.vercel.com/v9/projects/{VERCEL_PROJECT_ID}/domains
   Authorization: Bearer {VERCEL_TOKEN}
   { "name": "crm.valuelabs.com" }
   ```
4. UI shows admin the CNAME record:
   ```
   crm.valuelabs.com  CNAME  cname.vercel-dns.com
   ```
5. Admin UI has a **"Check Now"** button for on-demand DNS verification (in addition to cron)
6. Daily cron job checks unverified domains (DNS lookup → CNAME resolves → mark verified)
7. Vercel auto-provisions SSL via Let's Encrypt once CNAME is live
8. In-process cache is populated on the first verified request

### On-demand verification endpoint

```
POST /api/admin/domains/verify
Body: { domain: "crm.valuelabs.com" }
Auth: ADMIN role, own tenant only
```

Performs DNS lookup, updates `customDomainVerified` if CNAME resolves.

### New env vars required

| Var | Purpose |
|---|---|
| `VERCEL_TOKEN` | Vercel API personal access token |
| `VERCEL_PROJECT_ID` | Vercel project ID for this app |

### Removing a custom domain

1. Delete `customDomain` + `customDomainVerified` from DB
2. Call `DELETE /v9/projects/{projectId}/domains/{domain}` on Vercel API
3. In-process cache expires within 60 s

---

## Section 5: Admin UI

### SUPER_ADMIN — Tenant Management page

- "Subdomain" field on create/edit tenant form
- Live preview: `[slug].wrenforge.com`
- Slug uniqueness validated on blur via authenticated API (SUPER_ADMIN only — prevents slug enumeration)
- Reserved slug list enforced server-side

### Tenant ADMIN — Settings page — new "Domain" section

- Read-only subdomain display: `valuelabs.wrenforge.com`
- Custom domain input + save button
- After save: CNAME record displayed in copyable code block
- Verification badge: `Pending DNS` / `Verified`
- "Check Now" button → calls `/api/admin/domains/verify`
- Remove custom domain button (with confirmation modal)

---

## Section 6: Webhook & Cron Routing

> [!important]
> Telephony and billing webhooks arrive with `Host: app.wrenforge.com` (or a Vercel internal hostname). They must **not** go through tenant resolution — they already resolve tenant from payload (`customerId`, `callLogId`, Stripe metadata, etc.).

All webhook endpoints and cron routes are in the middleware bypass list (see Section 2). No changes needed to webhook handlers.

---

## Section 7: Migration & Rollout

### DB migration steps

1. Add `customDomain`, `customDomainVerified`, `customDomainAddedAt` to `Tenant` (slug already exists)
2. Run migration: `npm run db:migrate`
3. Seed updated for demo tenant slug alignment

### Rollout order

1. Add `*.wrenforge.com` wildcard to Vercel project domains (Vercel dashboard)
2. Add `VERCEL_TOKEN` + `VERCEL_PROJECT_ID` to environment variables
3. Deploy — existing `app.wrenforge.com` users are completely unaffected
4. SUPER_ADMIN assigns/confirms slugs for all tenants via Tenant Management UI
5. Tenants notified to use `[slug].wrenforge.com` going forward

> [!warning] Breaking change for existing tenant users
> Once deployed, tenant users must log in via `[slug].wrenforge.com`. Logging in at `app.wrenforge.com` will return a generic 404 (no tenant context). Communicate this to tenants before go-live. Consider a grace-period redirect.

---

## Section 8: Security Summary

| Concern | Mitigation |
|---|---|
| Cross-tenant session leakage | Cookies scoped to exact hostname (no wildcard `.wrenforge.com` cookie). Intentional — no cross-subdomain SSO. |
| Host header spoofing | Vercel validates Host against registered domains before routing; `trustHost: true` is safe in this context only. |
| Tenant impersonation at login | `tenantId` checked against user's DB record in `authorize()`. |
| Slug squatting / enumeration | Reserved slug blocklist server-side; slug validation endpoint requires SUPER_ADMIN auth. |
| Custom domain takeover | Domain only active after CNAME verification; unverified domains return 404. |
| Webhook tenant confusion | Webhook routes excluded from middleware tenant resolution; resolve from payload. |
| SUPER_ADMIN cross-tenant access | SUPER_ADMIN locked to `app.wrenforge.com`; visiting tenant subdomain redirects there. |

---

## Files to Create / Modify

| File | Change |
|---|---|
| `prisma/schema.prisma` | Add `customDomain`, `customDomainVerified`, `customDomainAddedAt` to `Tenant` (slug exists) |
| `prisma/seed.js` | Align demo tenant slug to `demo`, ensure seed is migration-safe |
| `src/middleware.js` | Full rewrite — hostname resolution with neon HTTP driver + Map cache + existing role checks |
| `src/lib/auth.js` | Add `trustHost: true`; add `tenantId` to credentials schema; update `authorize()` |
| `src/app/login/page.js` | Read `x-resolved-tenant-id` from headers, pass to LoginForm |
| `src/app/login/login-form.js` | Accept `tenantId` prop, include in `signIn()` credentials |
| `src/app/register/page.js` | Post-registration redirect to `{slug}.wrenforge.com/login?welcome=1` |
| `src/app/api/admin/domains/route.js` | New — custom domain CRUD + Vercel API calls |
| `src/app/api/admin/domains/verify/route.js` | New — on-demand DNS verification |
| `src/app/api/cron/subscription-expiry/route.js` | Add daily domain verification sweep |
| `src/lib/server/auth-guard.js` | Update `getTenantContext()` to read `x-resolved-tenant-id` as fallback |
| `src/components/modern/settings-view.js` | Add Domain section for tenant ADMIN |
| `src/components/modern/tenants-view.js` | Add slug field to tenant create/edit |
| `src/lib/tenant/slug.js` | New — slug generation, validation, uniqueness check, reserved-word blocking utilities |
| `src/app/api/auth/register/route.js` | Refactor to use shared `slug.js` for slug generation (adds reserved-word check); redirect to `https://{slug}.wrenforge.com/login?welcome=1` post-registration |
| `src/lib/tenant/domain.js` | New — Vercel Domains API wrapper |
| `.env.example` | Add `VERCEL_TOKEN`, `VERCEL_PROJECT_ID` |
