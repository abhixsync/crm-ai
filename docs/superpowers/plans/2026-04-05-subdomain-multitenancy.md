# Subdomain Multi-Tenancy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every tenant gets `tenant.wrenforge.com` + optional custom domain, with tenant-locked login and auto-SSL via Vercel.

**Architecture:** Middleware reads the `host` header on every request, resolves it to a tenant using `@neondatabase/serverless` (Edge-compatible) with an in-process Map cache (60s TTL), and injects `x-resolved-tenant-id` + `x-resolved-tenant-slug` request headers. Login page reads those headers, passes `tenantId` to NextAuth credentials, and `authorize()` rejects mismatched tenants. Custom domains are registered via Vercel Domains API and verified via DNS-over-HTTPS.

**Tech Stack:** Next.js 16 App Router, `@neondatabase/serverless` (Edge SQL), NextAuth v4, Prisma 6 (app-layer only), Vercel Domains API, Cloudflare DNS-over-HTTPS (for verification), Vitest

**Spec:** `docs/superpowers/specs/2026-04-05-subdomain-multitenancy-design.md`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/lib/tenant/slug.js` | Create | Slug generation, validation, reserved-word check |
| `src/lib/tenant/domain.js` | Create | Vercel Domains API wrapper + DNS verification |
| `src/middleware.js` | Rewrite | Hostname → tenant resolution + existing role checks |
| `src/lib/auth.js` | Modify | `trustHost`, `tenantId` credential, tenant-lock in `authorize()` |
| `src/lib/server/auth-guard.js` | Modify | Read `x-resolved-tenant-id` header |
| `src/app/login/page.js` | Modify | Read resolved headers, pass `tenantId` to LoginForm |
| `src/app/login/login-form.js` | Modify | Accept `tenantId` prop, include in `signIn()` call |
| `src/app/api/auth/register/route.js` | Modify | Use shared slug.js; return `slug` in response |
| `src/app/api/admin/domains/route.js` | Create | Custom domain CRUD + Vercel API |
| `src/app/api/admin/domains/verify/route.js` | Create | On-demand DNS verification |
| `src/app/api/cron/subscription-expiry/route.js` | Modify | Add domain verification sweep |
| `src/components/modern/settings-view.js` | Modify | Add Domain section for tenant ADMIN |
| `src/components/modern/tenants-view.js` | Modify | Add slug field to create/edit |
| `prisma/schema.prisma` | Modify | Add `customDomain`, `customDomainVerified`, `customDomainAddedAt` |
| `prisma/seed.js` | Modify | Update demo tenant slug to `demo` |
| `.env.example` | Modify | Add `VERCEL_TOKEN`, `VERCEL_PROJECT_ID` |
| `src/__tests__/tenant/slug.test.js` | Create | Slug utility tests |
| `src/__tests__/tenant/domain.test.js` | Create | Domain verification tests |
| `src/__tests__/auth/tenant-lock.test.js` | Create | authorize() tenant check tests |

---

## Task 1: Install dependency + slug utilities

**Files:**
- Create: `src/lib/tenant/slug.js`
- Create: `src/__tests__/tenant/slug.test.js`

- [ ] **Step 1.1: Install @neondatabase/serverless**

```bash
npm install @neondatabase/serverless
```

Expected: package added to `node_modules`, `package.json` updated.

- [ ] **Step 1.2: Write failing tests for slug utilities**

Create `src/__tests__/tenant/slug.test.js`:

```js
import { describe, it, expect } from "vitest";
import { slugify, isReservedSlug, isValidSlug } from "@/lib/tenant/slug";

describe("slugify", () => {
  it("lowercases and replaces spaces with hyphens", () => {
    expect(slugify("Value Labs")).toBe("value-labs");
  });
  it("removes special characters", () => {
    expect(slugify("Acme Corp!")).toBe("acme-corp");
  });
  it("collapses multiple hyphens", () => {
    expect(slugify("Foo  --  Bar")).toBe("foo-bar");
  });
  it("trims leading/trailing hyphens", () => {
    expect(slugify("---hello---")).toBe("hello");
  });
  it("truncates to 63 chars", () => {
    expect(slugify("a".repeat(100))).toHaveLength(63);
  });
  it("handles single character names", () => {
    expect(slugify("A")).toBe("a");
  });
});

describe("isReservedSlug", () => {
  it("blocks reserved words", () => {
    expect(isReservedSlug("app")).toBe(true);
    expect(isReservedSlug("www")).toBe(true);
    expect(isReservedSlug("api")).toBe(true);
    expect(isReservedSlug("admin")).toBe(true);
  });
  it("allows normal slugs", () => {
    expect(isReservedSlug("valuelabs")).toBe(false);
    expect(isReservedSlug("acme")).toBe(false);
  });
});

describe("isValidSlug", () => {
  it("accepts valid slugs", () => {
    expect(isValidSlug("valuelabs")).toBe(true);
    expect(isValidSlug("value-labs")).toBe(true);
    expect(isValidSlug("ai")).toBe(true);
    expect(isValidSlug("a")).toBe(true);
  });
  it("rejects uppercase", () => {
    expect(isValidSlug("ValueLabs")).toBe(false);
  });
  it("rejects spaces", () => {
    expect(isValidSlug("value labs")).toBe(false);
  });
  it("rejects leading/trailing hyphens", () => {
    expect(isValidSlug("-valuelabs")).toBe(false);
    expect(isValidSlug("valuelabs-")).toBe(false);
  });
  it("rejects empty string", () => {
    expect(isValidSlug("")).toBe(false);
  });
  it("rejects strings over 63 chars", () => {
    expect(isValidSlug("a".repeat(64))).toBe(false);
  });
});
```

- [ ] **Step 1.3: Run tests to confirm they fail**

```bash
npx vitest run src/__tests__/tenant/slug.test.js
```

Expected: FAIL — `@/lib/tenant/slug` not found.

- [ ] **Step 1.4: Implement slug utilities**

Create `src/lib/tenant/slug.js`:

```js
const RESERVED_SLUGS = new Set([
  "app", "www", "api", "admin", "mail", "support",
  "help", "status", "blog", "assets", "static", "auth",
]);

/**
 * Convert a human name to a URL-safe slug.
 * Does NOT check reserved words or uniqueness — call isReservedSlug() and ensureUniqueSlug() separately.
 */
export function slugify(name) {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63) || "tenant";
}

/** True if the slug is in the reserved list. */
export function isReservedSlug(slug) {
  return RESERVED_SLUGS.has(slug.toLowerCase());
}

/** True if the slug matches the allowed pattern. */
export function isValidSlug(slug) {
  if (!slug || typeof slug !== "string") return false;
  if (slug.length > 63) return false;
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(slug);
}

/**
 * Finds a unique slug by appending -2, -3, etc.
 * Requires a Prisma client to check for existing slugs.
 */
export async function ensureUniqueSlug(prisma, base) {
  let slug = base;
  let i = 2;
  while (await prisma.tenant.findUnique({ where: { slug } })) {
    slug = `${base.slice(0, 60)}-${i++}`;
  }
  return slug;
}
```

- [ ] **Step 1.5: Run tests to confirm they pass**

```bash
npx vitest run src/__tests__/tenant/slug.test.js
```

Expected: All tests PASS.

- [ ] **Step 1.6: Commit**

```bash
git add src/lib/tenant/slug.js src/__tests__/tenant/slug.test.js
git commit -m "feat: add tenant slug utilities with reserved-word validation"
```

---

## Task 2: Domain verification utility

**Files:**
- Create: `src/lib/tenant/domain.js`
- Create: `src/__tests__/tenant/domain.test.js`

- [ ] **Step 2.1: Write failing tests**

Create `src/__tests__/tenant/domain.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from "vitest";
import { verifyDomainCname, isValidCustomDomain } from "@/lib/tenant/domain";

describe("isValidCustomDomain", () => {
  it("accepts valid domains", () => {
    expect(isValidCustomDomain("crm.valuelabs.com")).toBe(true);
    expect(isValidCustomDomain("app.company.io")).toBe(true);
  });
  it("rejects wrenforge.com subdomains", () => {
    expect(isValidCustomDomain("valuelabs.wrenforge.com")).toBe(false);
  });
  it("rejects bare domains without subdomain", () => {
    expect(isValidCustomDomain("valuelabs.com")).toBe(true); // allowed
  });
  it("rejects invalid strings", () => {
    expect(isValidCustomDomain("not a domain")).toBe(false);
    expect(isValidCustomDomain("")).toBe(false);
  });
});

describe("verifyDomainCname", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("returns true when CNAME points to vercel", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ Answer: [{ type: 5, data: "cname.vercel-dns.com." }] }),
    }));
    expect(await verifyDomainCname("crm.valuelabs.com")).toBe(true);
  });

  it("returns false when no CNAME record", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ Answer: [] }),
    }));
    expect(await verifyDomainCname("crm.valuelabs.com")).toBe(false);
  });

  it("returns false on fetch error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));
    expect(await verifyDomainCname("crm.valuelabs.com")).toBe(false);
  });
});
```

- [ ] **Step 2.2: Run tests to confirm they fail**

```bash
npx vitest run src/__tests__/tenant/domain.test.js
```

Expected: FAIL — module not found.

- [ ] **Step 2.3: Implement domain utilities**

Create `src/lib/tenant/domain.js`:

```js
const APP_DOMAIN = process.env.NEXT_PUBLIC_APP_DOMAIN || "wrenforge.com";

/** True if the domain is a valid custom domain (not our own subdomain). */
export function isValidCustomDomain(domain) {
  if (!domain || typeof domain !== "string") return false;
  if (domain.endsWith(`.${APP_DOMAIN}`)) return false;
  return /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z]{2,})+$/i.test(domain);
}

/**
 * Verify a domain's CNAME points to Vercel using Cloudflare DNS-over-HTTPS.
 * Works in both Edge Runtime and Node.js.
 */
export async function verifyDomainCname(domain) {
  try {
    const res = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=CNAME`,
      { headers: { Accept: "application/dns-json" } }
    );
    const data = await res.json();
    const cname = data.Answer?.find((r) => r.type === 5);
    return Boolean(cname?.data?.includes("vercel"));
  } catch {
    return false;
  }
}

/** Register a custom domain with this Vercel project. */
export async function addDomainToVercel(domain) {
  if (!process.env.VERCEL_TOKEN || !process.env.VERCEL_PROJECT_ID) {
    throw new Error("VERCEL_TOKEN and VERCEL_PROJECT_ID must be set");
  }
  const res = await fetch(
    `https://api.vercel.com/v9/projects/${process.env.VERCEL_PROJECT_ID}/domains`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.VERCEL_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: domain }),
    }
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error?.message || `Vercel API error ${res.status}`);
  }
  return true;
}

/** Remove a custom domain from this Vercel project. */
export async function removeDomainFromVercel(domain) {
  if (!process.env.VERCEL_TOKEN || !process.env.VERCEL_PROJECT_ID) return;
  await fetch(
    `https://api.vercel.com/v9/projects/${process.env.VERCEL_PROJECT_ID}/domains/${encodeURIComponent(domain)}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${process.env.VERCEL_TOKEN}` },
    }
  );
}
```

- [ ] **Step 2.4: Run tests to confirm they pass**

```bash
npx vitest run src/__tests__/tenant/domain.test.js
```

Expected: All PASS.

- [ ] **Step 2.5: Commit**

```bash
git add src/lib/tenant/domain.js src/__tests__/tenant/domain.test.js
git commit -m "feat: add domain verification and Vercel API utilities"
```

---

## Task 3: DB schema + migration

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `prisma/seed.js`
- Modify: `.env.example`

- [ ] **Step 3.1: Add fields to Tenant model**

In `prisma/schema.prisma`, find the `model Tenant` block and add after the existing `slug` field:

```prisma
  customDomain          String?   @unique
  customDomainVerified  Boolean   @default(false)
  customDomainAddedAt   DateTime?
```

- [ ] **Step 3.2: Run migration**

```bash
npm run db:migrate
```

When prompted for a name, enter: `add_tenant_custom_domain`

Expected: Migration created and applied. `prisma generate` runs automatically.

- [ ] **Step 3.3: Update seed — demo tenant slug**

In `prisma/seed.js`, find the demo tenant upsert (currently uses `slug: "demo-crm"`) and change it to `slug: "demo"`:

```js
// Find the line that looks like:
const tenant = await upsertTenant({ name: "Demo CRM", slug: "demo-crm" ... });
// Change to:
const tenant = await upsertTenant({ name: "Demo CRM", slug: "demo" ... });
```

- [ ] **Step 3.4: Run seed to verify it works**

```bash
npm run db:seed
```

Expected: No errors. Demo tenant now has slug `demo`.

- [ ] **Step 3.5: Add env vars to .env.example**

Add to `.env.example`:

```bash
# Vercel (required for custom domain provisioning)
VERCEL_TOKEN=your_vercel_personal_access_token
VERCEL_PROJECT_ID=your_vercel_project_id
NEXT_PUBLIC_APP_DOMAIN=wrenforge.com
```

- [ ] **Step 3.6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/ prisma/seed.js .env.example
git commit -m "feat: add customDomain fields to Tenant schema, update demo slug to 'demo'"
```

---

## Task 4: Middleware rewrite

**Files:**
- Rewrite: `src/middleware.js`

> The middleware now runs on ALL routes (not just 6 specific ones). It resolves tenant from hostname and injects `x-resolved-tenant-id` into request headers before the existing role checks run.

- [ ] **Step 4.1: Rewrite middleware.js**

Replace the entire content of `src/middleware.js` with:

```js
import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { neon } from "@neondatabase/serverless";

// ─── In-process tenant cache (60s TTL) ───────────────────────────────────────
const _cache = new Map();
function getCached(key) {
  const e = _cache.get(key);
  if (!e) return null;
  if (Date.now() > e.exp) { _cache.delete(key); return null; }
  return e.data;
}
function setCache(key, data) {
  _cache.set(key, { data, exp: Date.now() + 60_000 });
}

// ─── Constants ───────────────────────────────────────────────────────────────
const APP_DOMAIN = process.env.NEXT_PUBLIC_APP_DOMAIN || "wrenforge.com";
const PLATFORM_HOST = `app.${APP_DOMAIN}`;

// Routes that skip tenant resolution entirely
const BYPASS_PREFIXES = [
  "/_next/",
  "/favicon.ico",
  "/theme/",
  "/api/auth/",
  "/api/cron/",
  "/api/calls/webhook",
  "/api/billing/stripe/webhook",
  "/api/billing/razorpay/webhook",
  "/robots.txt",
  "/sitemap.xml",
];

// ─── Tenant resolution via @neondatabase/serverless ──────────────────────────
// Create neon SQL function once at module scope (avoid repeated URL parsing)
const sql = neon(process.env.DATABASE_URL);

async function resolveTenant(host) {
  const cached = getCached(host);
  if (cached) return cached;
  let rows;

  if (host.endsWith(`.${APP_DOMAIN}`)) {
    const slug = host.slice(0, host.length - APP_DOMAIN.length - 1);
    rows = await sql`SELECT id, slug, name FROM "Tenant" WHERE slug = ${slug} LIMIT 1`;
  } else {
    rows = await sql`SELECT id, slug, name FROM "Tenant" WHERE "customDomain" = ${host} AND "customDomainVerified" = true LIMIT 1`;
  }

  const tenant = rows[0] || null;
  if (tenant) setCache(host, tenant);
  return tenant;
}

// ─── Role-based route guards (existing logic) ─────────────────────────────────
async function applyRoleGuards(request, extraHeaders) {
  const { pathname } = request.nextUrl;

  const isUserManagementPage = pathname.startsWith("/admin/user-management");
  const isUserManagementApi  = pathname.startsWith("/api/admin/user-management");
  const isTenantsPage        = pathname.startsWith("/admin/tenants");
  const isTenantsApi         = pathname.startsWith("/api/admin/tenants");
  const isThemePage          = pathname.startsWith("/admin/theme");
  const isThemeApi           = pathname.startsWith("/api/admin/theme");

  const needsCheck = isUserManagementPage || isUserManagementApi ||
                     isTenantsPage || isTenantsApi ||
                     isThemePage || isThemeApi;

  if (!needsCheck) return NextResponse.next({ request: { headers: extraHeaders } });

  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.userId) {
    if (isUserManagementApi || isTenantsApi || isThemeApi) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if ((isTenantsPage || isTenantsApi) && token.role !== "SUPER_ADMIN") {
    if (isTenantsApi) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if ((isUserManagementPage || isUserManagementApi) && !["ADMIN", "SUPER_ADMIN"].includes(token.role)) {
    if (isUserManagementApi) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if ((isThemePage || isThemeApi) && !["ADMIN", "SUPER_ADMIN"].includes(token.role)) {
    if (isThemeApi) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next({ request: { headers: extraHeaders } });
}

// ─── Main middleware ──────────────────────────────────────────────────────────
export async function middleware(request) {
  const { pathname } = request.nextUrl;
  const host = request.headers.get("host") || "";

  // 1. Bypass static/external routes
  if (BYPASS_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // 2. Build mutable header copy to pass resolved tenant context downstream
  const requestHeaders = new Headers(request.headers);

  // 3. Platform host (app.wrenforge.com / localhost) — no tenant injection
  const isPlatformHost =
    host === PLATFORM_HOST ||
    /^localhost(:\d+)?$/.test(host) ||
    /^127\.0\.0\.1(:\d+)?$/.test(host);

  if (isPlatformHost) {
    return applyRoleGuards(request, requestHeaders);
  }

  // 4. www redirect
  if (host === `www.${APP_DOMAIN}`) {
    return NextResponse.redirect(new URL(`https://${PLATFORM_HOST}${pathname}`), 301);
  }

  // 5. Resolve tenant from hostname
  const tenant = await resolveTenant(host);
  if (!tenant) {
    return new NextResponse("Workspace not found", { status: 404 });
  }

  requestHeaders.set("x-resolved-tenant-id", tenant.id);
  requestHeaders.set("x-resolved-tenant-slug", tenant.slug);

  return applyRoleGuards(request, requestHeaders);
}

// Run on all routes except static assets
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

- [ ] **Step 4.2: Verify build passes**

```bash
npx tsc --noEmit
```

Expected: No TypeScript errors.

- [ ] **Step 4.3: Start dev server and verify the platform host still works**

```bash
npm run dev
```

Visit `http://localhost:3002/login` — should load normally (localhost is treated as platform host).

- [ ] **Step 4.4: Commit**

```bash
git add src/middleware.js
git commit -m "feat: rewrite middleware for hostname-based tenant resolution"
```

---

## Task 5: Auth changes — tenant lock

**Files:**
- Modify: `src/lib/auth.js`
- Create: `src/__tests__/auth/tenant-lock.test.js`

- [ ] **Step 5.1: Write failing tests for tenant lock**

Create `src/__tests__/auth/tenant-lock.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from "vitest";

// We test the authorize logic in isolation by extracting it
// The test mocks prisma and bcrypt

const TENANT_A = "tenant-uuid-aaa";
const TENANT_B = "tenant-uuid-bbb";

const mockUser = (overrides = {}) => ({
  id: "user-1",
  name: "Test User",
  email: "user@test.com",
  passwordHash: "$2a$10$hashedpassword",
  role: "SALES",
  tenantId: TENANT_A,
  isActive: true,
  isSuspended: false,
  isPrimaryOwner: false,
  emailVerified: null,
  ...overrides,
});

describe("authorize() tenant lock", () => {
  let authorize;
  let mockPrisma;
  let mockBcrypt;

  beforeEach(async () => {
    mockPrisma = { user: { findFirst: vi.fn() } };
    mockBcrypt = { compare: vi.fn().mockResolvedValue(true) };

    vi.doMock("@/lib/prisma", () => ({ prisma: mockPrisma }));
    vi.doMock("bcryptjs", () => ({ default: mockBcrypt }));

    const mod = await import("@/lib/auth?t=" + Date.now());
    const provider = mod.authOptions.providers[0];
    authorize = provider.authorize;
  });

  it("allows login when tenantId matches", async () => {
    mockPrisma.user.findFirst.mockResolvedValue(mockUser());
    const result = await authorize({ email: "user@test.com", password: "pass", tenantId: TENANT_A });
    expect(result).not.toBeNull();
    expect(result.tenantId).toBe(TENANT_A);
  });

  it("rejects login when tenantId does not match", async () => {
    mockPrisma.user.findFirst.mockResolvedValue(mockUser());
    await expect(
      authorize({ email: "user@test.com", password: "pass", tenantId: TENANT_B })
    ).rejects.toThrow("ACCESS_DENIED_TENANT");
  });

  it("rejects login when no tenantId provided for non-SUPER_ADMIN", async () => {
    mockPrisma.user.findFirst.mockResolvedValue(mockUser());
    await expect(
      authorize({ email: "user@test.com", password: "pass", tenantId: "" })
    ).rejects.toThrow("ACCESS_DENIED_TENANT");
  });

  it("allows SUPER_ADMIN login without tenantId check", async () => {
    mockPrisma.user.findFirst.mockResolvedValue(mockUser({ role: "SUPER_ADMIN", tenantId: null }));
    const result = await authorize({ email: "admin@test.com", password: "pass", tenantId: "" });
    expect(result).not.toBeNull();
  });
});
```

- [ ] **Step 5.2: Run tests to confirm they fail**

```bash
npx vitest run src/__tests__/auth/tenant-lock.test.js
```

Expected: FAIL — `tenantId` field does not exist, no tenant check.

- [ ] **Step 5.3: Update auth.js**

In `src/lib/auth.js`, make these changes:

**Add `trustHost` and `tenantId` credential:**

```js
export const authOptions = {
  trustHost: true,          // ← ADD THIS
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email:    { label: "Email",    type: "text" },
        password: { label: "Password", type: "password" },
        tenantId: { label: "Tenant",   type: "text" },   // ← ADD THIS
      },
```

**Update `authorize()` to add tenant check (add after the `isSuspended` check, before the return):**

```js
        // ─── Tenant lock ───────────────────────────────────
        if (user.role !== "SUPER_ADMIN") {
          const tenantId = credentials.tenantId || null;
          if (!tenantId || user.tenantId !== tenantId) {
            throw new Error("ACCESS_DENIED_TENANT");
          }
        }
```

- [ ] **Step 5.4: Run tests to confirm they pass**

```bash
npx vitest run src/__tests__/auth/tenant-lock.test.js
```

Expected: All PASS.

- [ ] **Step 5.5: Commit**

```bash
git add src/lib/auth.js src/__tests__/auth/tenant-lock.test.js
git commit -m "feat: add tenant-locked login and trustHost to NextAuth"
```

---

## Task 5b: Update auth-guard to read resolved tenant header

**Files:**
- Modify: `src/lib/server/auth-guard.js`

> This is required so that non-SUPER_ADMIN users on tenant subdomains have a working tenant context available to API routes — in addition to the tenantId already baked into their JWT session.

- [ ] **Step 5b.1: Update getTenantContext() in auth-guard.js**

In `src/lib/server/auth-guard.js`, update `getTenantContext()` to also read `x-resolved-tenant-id` as a fallback. Replace the existing function body:

```js
export function getTenantContext(session, request = null) {
  const role = session?.user?.role;
  let tenantId = session?.user?.tenantId || null;
  const isSuperAdmin = role === "SUPER_ADMIN";

  // For SUPER_ADMIN with no session tenant: read X-Tenant-ID (tenant switcher)
  if (isSuperAdmin && !tenantId && request) {
    const headerTenantId =
      request.headers?.get?.("X-Tenant-ID") ||
      request.headers?.get?.("x-tenant-id");
    if (headerTenantId) tenantId = headerTenantId;
  }

  // For regular users: tenantId is in JWT; x-resolved-tenant-id is a consistency
  // reference injected by middleware — useful for routes called from tenant subdomains
  // where session JWT may not yet include tenantId (e.g., first request after login)
  if (!isSuperAdmin && !tenantId && request) {
    const resolved = request.headers?.get?.("x-resolved-tenant-id");
    if (resolved) tenantId = resolved;
  }

  if (!isSuperAdmin && !tenantId) {
    throw new Error("Tenant context missing for non-super admin user.");
  }

  return { tenantId, isSuperAdmin };
}
```

- [ ] **Step 5b.2: Commit**

```bash
git add src/lib/server/auth-guard.js
git commit -m "feat: auth-guard reads x-resolved-tenant-id as fallback for tenant context"
```

---

## Task 5c: Hide register link + guard register page on tenant subdomains

**Files:**
- Modify: `src/app/login/login-form.js`
- Modify: `src/app/register/page.js`

- [ ] **Step 5c.1: Hide "Start free trial" on tenant subdomains**

In `src/app/login/login-form.js`, the `LoginForm` now receives a `tenantId` prop. Wrap the registration link so it only shows when there is no tenant context (i.e., on the platform host):

```jsx
{!tenantId && (
  <div style={{ textAlign: "center", marginTop: 16, fontSize: 13, color: "var(--text-muted, #706C78)" }}>
    Don&apos;t have an account?{" "}
    <Link href="/register" style={{ color: "var(--ms-accent)", textDecoration: "none" }}>
      Start free trial
    </Link>
  </div>
)}
```

- [ ] **Step 5c.2: Guard register page on tenant subdomains**

Convert `src/app/register/page.js` to a server component (or add a server check at the top if it already is). Read the resolved tenant header and redirect to login if present:

```js
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export default async function RegisterPage() {
  const headersList = await headers();
  const tenantId = headersList.get("x-resolved-tenant-id");
  if (tenantId) redirect("/login"); // tenant subdomains can't register

  // ... existing register page content
}
```

- [ ] **Step 5c.3: Commit**

```bash
git add src/app/login/login-form.js src/app/register/page.js
git commit -m "feat: hide register link and guard register page on tenant subdomains"
```

---

## Task 6: Login page — read tenant from headers

**Files:**
- Modify: `src/app/login/page.js`
- Modify: `src/app/login/login-form.js`

- [ ] **Step 6.1: Update login page.js to read resolved headers**

Replace `src/app/login/page.js` with:

```js
import { Suspense } from "react";
import { headers } from "next/headers";
import { getActiveTheme } from "@/modules/theme/theme.service";
import { prisma } from "@/lib/prisma";
import LoginForm from "./login-form";

export default async function LoginPage() {
  const headersList = await headers();
  const tenantId   = headersList.get("x-resolved-tenant-id")   || null;
  const tenantSlug = headersList.get("x-resolved-tenant-slug") || null;

  let theme = {
    loginBackgroundUrl: null, logoUrl: null, themeName: null,
    displayName: null, primaryColor: null, secondaryColor: null,
    accentColor: null, uiLayout: "modern",
  };

  try {
    const active = await getActiveTheme(tenantId);
    let displayName = active?.themeName || null;
    if (active?.tenantId) {
      try {
        const tenant = await prisma.tenant.findUnique({
          where: { id: active.tenantId },
          select: { crmName: true, name: true },
        });
        if (tenant) displayName = tenant.crmName || tenant.name || displayName;
      } catch {}
    }
    theme = {
      displayName,
      themeName: active?.themeName || null,
      primaryColor: active?.primaryColor || null,
      secondaryColor: active?.secondaryColor || null,
      accentColor: active?.accentColor || null,
      loginBackgroundUrl: active?.loginBackgroundUrl || null,
      logoUrl: active?.logoUrl || null,
      uiLayout: active?.uiLayout || "modern",
    };
  } catch {}

  return (
    <Suspense>
      <LoginForm theme={theme} tenantId={tenantId} tenantSlug={tenantSlug} />
    </Suspense>
  );
}
```

- [ ] **Step 6.2: Update login-form.js to pass tenantId in credentials**

In `src/app/login/login-form.js`:

**Change the function signature** from `LoginForm({ theme })` to `LoginForm({ theme, tenantId, tenantSlug })`.

**Update the `signIn` call** (currently around line 31-35):

```js
const result = await signIn("credentials", {
  email: identifier,
  password,
  tenantId: tenantId || "",
  redirect: false,
});
```

**Update the error message** shown when login fails — if the error is `ACCESS_DENIED_TENANT`, show a specific message:

```js
if (result?.error) {
  const msg = result.error === "ACCESS_DENIED_TENANT"
    ? "You don't have access to this workspace."
    : "Invalid username/email or password";
  toast.error(msg);
  setLoading(false);
  return;
}
```

- [ ] **Step 6.3: Verify login still works on localhost**

```bash
npm run dev
```

Visit `http://localhost:3002/login`. Log in with SUPER_ADMIN credentials `lucifer.shukla@crm.local` / `123456`. Should succeed (localhost = platform host, `tenantId` is `null`, SUPER_ADMIN bypasses tenant check).

> **Note:** `admin@crm.local` (demo tenant ADMIN) will no longer work on the platform host after tenant-locking. They must log in at `demo.wrenforge.com`. For local testing, add `127.0.0.1 demo.localhost` to your hosts file and visit `http://demo.localhost:3002/login`.

- [ ] **Step 6.4: Commit**

```bash
git add src/app/login/page.js src/app/login/login-form.js
git commit -m "feat: wire tenant context from middleware headers into login form"
```

---

## Task 7: Registration — use shared slug.js + return slug

**Files:**
- Modify: `src/app/api/auth/register/route.js`

- [ ] **Step 7.1: Update register route**

In `src/app/api/auth/register/route.js`:

**Remove the local `slugify` and `ensureUniqueSlug` functions** (lines 7-22 — the inline versions).

**Add the import at the top:**

```js
import { slugify, isReservedSlug, ensureUniqueSlug } from "@/lib/tenant/slug";
```

**Add reserved-word check** when generating the slug (after `const base = slugify(company)`):

```js
const base = slugify(company);
const safeBase = isReservedSlug(base) ? `${base}-crm` : base;
const slug = await ensureUniqueSlug(prisma, safeBase);
```

**Return `slug` in the success response** so the client can redirect:

```js
return Response.json({ message: "Account created. Please verify your email.", slug }, { status: 201 });
```

- [ ] **Step 7.2: Update register client to redirect to tenant subdomain**

Find the register form component (likely at `src/app/register/page.js` or a form component it uses). After a successful registration API call, add redirect logic:

```js
const data = await res.json();
if (res.ok && data.slug) {
  const appDomain = process.env.NEXT_PUBLIC_APP_DOMAIN || "wrenforge.com";
  window.location.href = `https://${data.slug}.${appDomain}/login?welcome=1`;
} else {
  // existing error handling
}
```

- [ ] **Step 7.3: Handle welcome=1 in login form**

In `src/app/login/login-form.js`, add a separate check for the `welcome` query param alongside the existing `verified` param check in `useEffect`. The existing code reads `searchParams.get("verified")` — add a parallel check for `searchParams.get("welcome")`:

```js
useEffect(() => {
  const verified = searchParams.get("verified");
  if (verified === "success") toast.success("Email verified! You can now sign in.");
  else if (verified === "invalid") toast.error("Verification link is invalid or expired.");
  else if (verified === "already") toast.info("Email already verified — please sign in.");

  // welcome=1 is set after registration redirects to tenant subdomain
  const welcome = searchParams.get("welcome");
  if (welcome === "1") {
    toast.success(`Workspace ready! Bookmark this URL: ${window.location.origin}`);
  }
}, [searchParams]);
```

- [ ] **Step 7.4: Verify build**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 7.5: Commit**

```bash
git add src/app/api/auth/register/route.js src/app/register/
git commit -m "feat: registration uses shared slug.js, redirects to tenant subdomain after signup"
```

---

## Task 8: Custom domain API

**Files:**
- Create: `src/app/api/admin/domains/route.js`
- Create: `src/app/api/admin/domains/verify/route.js`

- [ ] **Step 8.1: Create custom domain CRUD route**

Create `src/app/api/admin/domains/route.js`:

```js
import { requireSession, getTenantContext } from "@/lib/server/auth-guard";
import { prisma } from "@/lib/prisma";
import { isValidCustomDomain, addDomainToVercel, removeDomainFromVercel } from "@/lib/tenant/domain";

// GET — current domain status
export async function GET(request) {
  const { session, error } = await requireSession();
  if (error) return error;
  const { tenantId } = getTenantContext(session, request);

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { slug: true, customDomain: true, customDomainVerified: true, customDomainAddedAt: true },
  });
  return Response.json(tenant);
}

// POST — add/update custom domain
export async function POST(request) {
  const { session, error } = await requireSession();
  if (error) return error;
  const { tenantId, isSuperAdmin } = getTenantContext(session, request);
  if (!["ADMIN", "SUPER_ADMIN"].includes(session.user.role)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { domain } = await request.json();
  if (!domain || !isValidCustomDomain(domain)) {
    return Response.json({ error: "Invalid domain format." }, { status: 400 });
  }

  // Check not already taken by another tenant
  const existing = await prisma.tenant.findFirst({
    where: { customDomain: domain, NOT: { id: tenantId } },
  });
  if (existing) {
    return Response.json({ error: "Domain already in use." }, { status: 409 });
  }

  try {
    await addDomainToVercel(domain);
  } catch (e) {
    // If VERCEL_TOKEN not set (dev), skip silently
    if (!process.env.VERCEL_TOKEN) {
      console.warn("VERCEL_TOKEN not set — skipping Vercel domain registration");
    } else {
      return Response.json({ error: e.message }, { status: 502 });
    }
  }

  await prisma.tenant.update({
    where: { id: tenantId },
    data: { customDomain: domain, customDomainVerified: false, customDomainAddedAt: new Date() },
  });

  return Response.json({
    domain,
    verified: false,
    cname: "cname.vercel-dns.com",
  });
}

// DELETE — remove custom domain
export async function DELETE(request) {
  const { session, error } = await requireSession();
  if (error) return error;
  const { tenantId } = getTenantContext(session, request);
  if (!["ADMIN", "SUPER_ADMIN"].includes(session.user.role)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (tenant?.customDomain) {
    await removeDomainFromVercel(tenant.customDomain).catch(() => {});
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { customDomain: null, customDomainVerified: false, customDomainAddedAt: null },
    });
  }

  return Response.json({ ok: true });
}
```

- [ ] **Step 8.2: Create on-demand verify route**

Create `src/app/api/admin/domains/verify/route.js`:

```js
import { requireSession, getTenantContext } from "@/lib/server/auth-guard";
import { prisma } from "@/lib/prisma";
import { verifyDomainCname } from "@/lib/tenant/domain";

export async function POST(request) {
  const { session, error } = await requireSession();
  if (error) return error;
  const { tenantId } = getTenantContext(session, request);
  if (!["ADMIN", "SUPER_ADMIN"].includes(session.user.role)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant?.customDomain) {
    return Response.json({ error: "No custom domain configured." }, { status: 400 });
  }

  const verified = await verifyDomainCname(tenant.customDomain);

  if (verified && !tenant.customDomainVerified) {
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { customDomainVerified: true },
    });
  }

  return Response.json({ verified, domain: tenant.customDomain });
}
```

- [ ] **Step 8.3: Add domain verification sweep to cron**

First, add this import at the top of `src/app/api/cron/subscription-expiry/route.js` if `prisma` is not already imported there:

```js
import { prisma } from "@/lib/prisma";
import { verifyDomainCname } from "@/lib/tenant/domain";
```

Then at the end of the handler (before the final response), add:

```js
  // ─── Domain verification sweep ───────────────────────────────────────────
  try {
    const unverified = await prisma.tenant.findMany({
      where: { customDomain: { not: null }, customDomainVerified: false },
      select: { id: true, customDomain: true },
    });
    for (const t of unverified) {
      const ok = await verifyDomainCname(t.customDomain);
      if (ok) {
        await prisma.tenant.update({ where: { id: t.id }, data: { customDomainVerified: true } });
      }
    }
  } catch (e) {
    console.error("Domain verification sweep error:", e);
  }
```

- [ ] **Step 8.4: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 8.5: Commit**

```bash
git add src/app/api/admin/domains/ src/app/api/cron/subscription-expiry/route.js
git commit -m "feat: custom domain CRUD API, on-demand verify, cron sweep"
```

---

## Task 9: SUPER_ADMIN tenant slug UI

**Files:**
- Modify: `src/components/modern/tenants-view.js`

- [ ] **Step 9.1: Read current tenants-view.js**

Read `src/components/modern/tenants-view.js` to understand the create/edit form structure before making changes.

- [ ] **Step 9.2: Add slug field to tenant create form**

In the create tenant form, add a slug input below the tenant name field:

```jsx
<div>
  <label className="ms-field-label">Subdomain *</label>
  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
    <input
      className="ms-input"
      value={form.slug || ""}
      onChange={e => {
        const raw = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "");
        setForm(f => ({ ...f, slug: raw }));
      }}
      placeholder="valuelabs"
      maxLength={63}
    />
    <span style={{ color: "var(--ms-text3)", fontSize: 12, whiteSpace: "nowrap" }}>
      .{process.env.NEXT_PUBLIC_APP_DOMAIN || "wrenforge.com"}
    </span>
  </div>
  {form.name && !form.slug && (
    <div style={{ fontSize: 11, color: "var(--ms-text3)", marginTop: 4 }}>
      Will be auto-generated from name
    </div>
  )}
</div>
```

- [ ] **Step 9.3: Auto-generate slug from name**

Where the name field's `onChange` is handled, add slug auto-generation if slug is currently empty:

```js
onChange={e => {
  const name = e.target.value;
  setForm(f => ({
    ...f,
    name,
    // Auto-fill slug only if user hasn't manually set it
    slug: f._slugManuallySet ? f.slug : name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50),
  }));
}}
```

Mark slug as manually set when user types in the slug field:

```js
onChange={e => {
  const raw = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "");
  setForm(f => ({ ...f, slug: raw, _slugManuallySet: true }));
}}
```

- [ ] **Step 9.4: Include slug in create/update API call**

Ensure the form submission includes `slug` in the request body. Find where `fetch('/api/admin/tenants', ...)` is called and add `slug: form.slug` to the body.

- [ ] **Step 9.5: Update the API route to accept slug**

In `src/app/api/admin/tenants/route.js` (or wherever the tenant create/update endpoint is), ensure it reads and validates `slug` from the body. Add:

```js
import { isValidSlug, isReservedSlug, ensureUniqueSlug } from "@/lib/tenant/slug";

// In the POST handler:
if (body.slug) {
  if (!isValidSlug(body.slug)) return Response.json({ error: "Invalid slug format." }, { status: 400 });
  if (isReservedSlug(body.slug)) return Response.json({ error: "This subdomain is reserved." }, { status: 400 });
  tenantData.slug = await ensureUniqueSlug(prisma, body.slug);
}
```

- [ ] **Step 9.6: Verify UI works in dev**

```bash
npm run dev
```

Log in as SUPER_ADMIN (`lucifer.shukla@crm.local` / `123456`). Navigate to the tenants management page. Create a new tenant — verify slug field appears with live preview.

- [ ] **Step 9.7: Commit**

```bash
git add src/components/modern/tenants-view.js src/app/api/admin/tenants/
git commit -m "feat: add slug field with live preview to tenant management UI"
```

---

## Task 10: Tenant ADMIN domain settings UI

**Files:**
- Modify: `src/components/modern/settings-view.js`

- [ ] **Step 10.1: Read current settings-view.js structure**

Read `src/components/modern/settings-view.js` to find where to add the Domain section.

- [ ] **Step 10.2: Add domain state and fetch**

At the top of the `ModernSettingsView` component (or equivalent), add domain state:

```js
const [domainInfo, setDomainInfo] = useState(null);
const [customDomain, setCustomDomain] = useState("");
const [domainSaving, setDomainSaving] = useState(false);
const [domainVerifying, setDomainVerifying] = useState(false);

useEffect(() => {
  fetch("/api/admin/domains")
    .then(r => r.json())
    .then(data => {
      setDomainInfo(data);
      setCustomDomain(data.customDomain || "");
    })
    .catch(() => {});
}, []);
```

- [ ] **Step 10.3: Add Domain section to the settings UI**

Add a new card section (after existing settings cards):

```jsx
<div className="ms-card">
  <div className="ms-card-hd">
    <span className="ms-card-title">Domain</span>
  </div>
  <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
    {/* Subdomain — read only */}
    <div>
      <div className="ms-field-label">Your subdomain</div>
      <div style={{ fontSize: 13, color: "var(--ms-text)", marginTop: 4 }}>
        <a
          href={`https://${domainInfo?.slug}.${process.env.NEXT_PUBLIC_APP_DOMAIN || "wrenforge.com"}`}
          target="_blank" rel="noreferrer"
          style={{ color: "var(--ms-accent)" }}
        >
          {domainInfo?.slug}.{process.env.NEXT_PUBLIC_APP_DOMAIN || "wrenforge.com"}
        </a>
      </div>
    </div>

    {/* Custom domain */}
    <div>
      <div className="ms-field-label">Custom domain <span style={{ color: "var(--ms-text3)", fontWeight: 400 }}>(optional)</span></div>
      <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
        <input
          className="ms-input"
          value={customDomain}
          onChange={e => setCustomDomain(e.target.value)}
          placeholder="crm.yourcompany.com"
          style={{ flex: 1 }}
        />
        <button
          className="ms-btn ms-btn-pri"
          onClick={async () => {
            setDomainSaving(true);
            const res = await fetch("/api/admin/domains", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ domain: customDomain }),
            });
            const data = await res.json();
            setDomainSaving(false);
            if (res.ok) {
              setDomainInfo(d => ({ ...d, customDomain: data.domain, customDomainVerified: false }));
              toast.success("Custom domain saved. Set the CNAME record below.");
            } else {
              toast.error(data.error || "Failed to save domain.");
            }
          }}
          disabled={domainSaving}
        >
          {domainSaving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>

    {/* CNAME instructions + verification */}
    {domainInfo?.customDomain && (
      <div style={{ background: "var(--ms-bg2)", borderRadius: 8, padding: "12px 14px" }}>
        <div style={{ fontSize: 12, color: "var(--ms-text2)", marginBottom: 8 }}>
          Point your DNS CNAME record to:
        </div>
        <code style={{ fontSize: 12, color: "var(--ms-accent)", display: "block", marginBottom: 10 }}>
          {domainInfo.customDomain}  →  CNAME  cname.vercel-dns.com
        </code>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{
            padding: "2px 10px", borderRadius: 99, fontSize: 11, fontWeight: 600,
            background: domainInfo.customDomainVerified ? "#ECFDF5" : "#FFFBEB",
            color: domainInfo.customDomainVerified ? "#065F46" : "#92400E",
          }}>
            {domainInfo.customDomainVerified ? "Verified" : "Pending DNS"}
          </span>
          {!domainInfo.customDomainVerified && (
            <button
              className="ms-btn ms-btn-xs"
              onClick={async () => {
                setDomainVerifying(true);
                const res = await fetch("/api/admin/domains/verify", { method: "POST" });
                const data = await res.json();
                setDomainVerifying(false);
                if (data.verified) {
                  setDomainInfo(d => ({ ...d, customDomainVerified: true }));
                  toast.success("Domain verified! SSL will be provisioned shortly.");
                } else {
                  toast.error("CNAME not detected yet. DNS can take up to 24h to propagate.");
                }
              }}
              disabled={domainVerifying}
            >
              {domainVerifying ? "Checking…" : "Check Now"}
            </button>
          )}
          <button
            className="ms-btn ms-btn-xs"
            style={{ marginLeft: "auto", color: "var(--ms-red)" }}
            onClick={async () => {
              if (!confirm("Remove this custom domain?")) return;
              await fetch("/api/admin/domains", { method: "DELETE" });
              setDomainInfo(d => ({ ...d, customDomain: null, customDomainVerified: false }));
              setCustomDomain("");
              toast.success("Custom domain removed.");
            }}
          >
            Remove
          </button>
        </div>
      </div>
    )}
  </div>
</div>
```

- [ ] **Step 10.4: Test the domain UI**

```bash
npm run dev
```

Log in as `admin@crm.local` / `Admin@123`. Navigate to Settings. Verify the Domain section appears with the subdomain shown.

- [ ] **Step 10.5: Commit**

```bash
git add src/components/modern/settings-view.js
git commit -m "feat: add custom domain management section to settings UI"
```

---

## Task 11: Final verification

- [ ] **Step 11.1: Run full type-check**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 11.2: Run all tests**

```bash
npm run test
```

Expected: All existing tests pass + new slug/domain/auth tests pass.

- [ ] **Step 11.3: Build check**

```bash
npm run build
```

Expected: Build succeeds with no errors.

- [ ] **Step 11.4: Manual smoke test checklist**

On `http://localhost:3002`:
- [ ] Login as SUPER_ADMIN works (platform host, no tenant lock)
- [ ] Login as `lucifer.shukla@crm.local` / `123456` works on platform host (SUPER_ADMIN, no tenant check)
- [ ] `admin@crm.local` login at platform host correctly fails with "You don't have access to this workspace"
- [ ] Tenants view shows slug field on create form
- [ ] Settings view shows Domain section with subdomain and custom domain input

- [ ] **Step 11.5: Add Vercel wildcard domain (manual step — requires Vercel dashboard)**

In Vercel project settings → Domains → Add `*.wrenforge.com` and `app.wrenforge.com`.
Add `VERCEL_TOKEN`, `VERCEL_PROJECT_ID`, `NEXT_PUBLIC_APP_DOMAIN=wrenforge.com` to Vercel environment variables.

- [ ] **Step 11.6: Final commit**

```bash
git add .
git commit -m "feat: subdomain multi-tenancy — complete implementation"
```
