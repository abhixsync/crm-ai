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
