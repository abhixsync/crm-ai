import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { neon } from "@neondatabase/serverless";

// ─── CORS ────────────────────────────────────────────────────────────────────
const CORS_ALLOWED_METHODS = "GET, POST, PUT, DELETE, PATCH, OPTIONS";
const CORS_ALLOWED_HEADERS = "Content-Type, Authorization, x-tenant-id, x-cron-secret";
const CORS_MAX_AGE = "86400";

function buildAllowedOrigins() {
  const raw = process.env.ALLOWED_ORIGINS || "";
  if (raw.trim() === "*") return "*";
  const fallback = process.env.NEXTAUTH_URL || "";
  const list = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (list.length === 0 && fallback) list.push(fallback);
  return new Set(list);
}

const ALLOWED_ORIGINS = buildAllowedOrigins();

function getCorsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": CORS_ALLOWED_METHODS,
    "Access-Control-Allow-Headers": CORS_ALLOWED_HEADERS,
    "Access-Control-Max-Age": CORS_MAX_AGE,
  };
}

function isAllowedOrigin(origin) {
  if (!origin) return false;
  if (ALLOWED_ORIGINS === "*") return true;
  if (ALLOWED_ORIGINS instanceof Set && ALLOWED_ORIGINS.has(origin)) return true;
  // Allow any subdomain of APP_DOMAIN (tenant white-label subdomains)
  try {
    const { hostname } = new URL(origin);
    if (hostname === APP_DOMAIN || hostname.endsWith(`.${APP_DOMAIN}`)) return true;
  } catch {}
  return false;
}

// ─── In-process tenant cache (60s TTL) ───────────────────────────────────────
const _cache = new Map();
function getCached(key) {
  const e = _cache.get(key);
  if (!e) return null;
  if (Date.now() > e.exp) { _cache.delete(key); return null; }
  return e.data;
}
const CACHE_MAX_SIZE = 5000;

function setCache(key, data) {
  if (_cache.size >= CACHE_MAX_SIZE) {
    // Evict oldest 20% of entries
    const evictCount = Math.floor(CACHE_MAX_SIZE * 0.2);
    let i = 0;
    for (const k of _cache.keys()) {
      if (i++ >= evictCount) break;
      _cache.delete(k);
    }
  }
  _cache.set(key, { data, exp: Date.now() + 60_000 });
}

// ─── Rate limiting for auth endpoints ─────────────────────────────────────
const authRateMap = new Map(); // ip → { count, resetAt }
const AUTH_RATE_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const AUTH_RATE_MAX = 20; // 20 attempts per window

function checkAuthRateLimit(ip) {
  const now = Date.now();
  const entry = authRateMap.get(ip);
  if (!entry || now > entry.resetAt) {
    authRateMap.set(ip, { count: 1, resetAt: now + AUTH_RATE_WINDOW_MS });
    return true;
  }
  entry.count++;
  if (entry.count > AUTH_RATE_MAX) return false;
  return true;
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
const sql = neon(process.env.DATABASE_URL);

async function resolveTenant(host) {
  const cached = getCached(host);
  if (cached) return cached;
  let rows;

  if (host.endsWith(`.${APP_DOMAIN}`)) {
    const slug = host.slice(0, host.length - APP_DOMAIN.length - 1);
    rows = await sql`SELECT id, slug, name FROM "Tenant" WHERE slug = ${slug} AND "isActive" = true LIMIT 1`;
  } else {
    rows = await sql`SELECT id, slug, name FROM "Tenant" WHERE "customDomain" = ${host} AND "customDomainVerified" = true AND "isActive" = true LIMIT 1`;
  }

  const tenant = rows[0] || null;
  if (tenant) setCache(host, tenant);
  return tenant;
}

// ─── Role-based route guards (existing logic) ─────────────────────────────────
async function applyRoleGuards(request, extraHeaders) {
  const { pathname } = request.nextUrl;

  // Block pending Google signup users from navigating anywhere except /auth/
  if (!pathname.startsWith("/auth/") && !pathname.startsWith("/api/auth/") && !pathname.startsWith("/api/")) {
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    if (token?.pendingGoogleSignup === true) {
      return NextResponse.redirect(new URL("/auth/complete-signup", request.url));
    }
  }

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

// ─── CSP nonce builder ────────────────────────────────────────────────────────
function buildCspHeader(nonce) {
  return [
    "default-src 'self'",
    `script-src 'nonce-${nonce}' 'strict-dynamic' https: 'unsafe-inline'`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob:",
    "connect-src 'self' https:",
    "frame-ancestors 'self'",
  ].join("; ");
}

// ─── Main middleware ──────────────────────────────────────────────────────────
export async function middleware(request) {
  const { pathname } = request.nextUrl;
  const host = request.headers.get("host") || "";

  // Generate a unique nonce per request (Web Crypto API — Edge Runtime compatible)
  const nonce = crypto.randomUUID();

  // Helper: apply CSP response header carrying the per-request nonce
  function withCsp(res) {
    res.headers.set("Content-Security-Policy", buildCspHeader(nonce));
    return res;
  }

  // 1a. Rate limit auth endpoints (must run before bypass)
  if (pathname.startsWith("/api/auth/") && request.method === "POST") {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      || request.headers.get("x-real-ip")
      || "unknown";
    if (!checkAuthRateLimit(ip)) {
      return withCsp(
        new NextResponse("Too Many Requests", {
          status: 429,
          headers: { "Retry-After": "900" },
        }),
      );
    }
  }

  // 1b. CORS — applies to all /api/ paths (OPTIONS preflight + header injection)
  // Resolved CORS headers are stored here and merged into every NextResponse
  // that passes through the rest of this middleware.
  let corsResponseHeaders = null;

  if (pathname.startsWith("/api/")) {
    const origin = request.headers.get("origin");

    if (request.method === "OPTIONS") {
      // Preflight: respond immediately
      if (!origin) return withCsp(new Response(null, { status: 204 }));
      if (!isAllowedOrigin(origin)) {
        return withCsp(Response.json({ error: "Forbidden" }, { status: 403 }));
      }
      return withCsp(new Response(null, { status: 204, headers: getCorsHeaders(origin) }));
    }

    // Non-OPTIONS cross-origin: enforce origin and stash headers for later
    if (origin) {
      if (!isAllowedOrigin(origin)) {
        return withCsp(Response.json({ error: "Forbidden" }, { status: 403 }));
      }
      corsResponseHeaders = getCorsHeaders(origin);
    }
  }

  // Helper: wrap a NextResponse with any pending CORS response headers + CSP
  function withCors(res) {
    if (corsResponseHeaders) {
      for (const [k, v] of Object.entries(corsResponseHeaders)) {
        res.headers.set(k, v);
      }
    }
    return withCsp(res);
  }

  // 1c. Bypass static/external routes (skips tenant resolution)
  if (BYPASS_PREFIXES.some((p) => pathname.startsWith(p))) {
    return withCors(NextResponse.next());
  }

  // 2. Build mutable header copy to pass resolved tenant context downstream
  const requestHeaders = new Headers(request.headers);
  // Forward nonce to server components so they can apply it to inline scripts
  requestHeaders.set("x-nonce", nonce);

  // 3. Platform host (app.wrenforge.com / localhost) — no tenant injection
  const isPlatformHost =
    host === PLATFORM_HOST ||
    /^localhost(:\d+)?$/.test(host) ||
    /^127\.0\.0\.1(:\d+)?$/.test(host);

  if (isPlatformHost) {
    return withCors(await applyRoleGuards(request, requestHeaders));
  }

  // 4. www redirect
  if (host === `www.${APP_DOMAIN}`) {
    return NextResponse.redirect(new URL(`https://${PLATFORM_HOST}${pathname}`), 301);
  }

  // 5. Resolve tenant from hostname
  const tenant = await resolveTenant(host);
  if (!tenant) {
    return withCors(new NextResponse("Workspace not found", { status: 404 }));
  }

  requestHeaders.set("x-resolved-tenant-id", tenant.id);
  requestHeaders.set("x-resolved-tenant-slug", tenant.slug);

  return withCors(await applyRoleGuards(request, requestHeaders));
}

// Run on all routes except static assets
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
