# Performance Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate serial DB queries, add Redis response caching for dashboard/analytics, and optimize the Next.js bundle.

**Architecture:** Shared `api-cache.ts` utility (read-through Redis cache with transparent fallback) applied to two hot API routes; query parallelism fixes in three routes; raw SQL replaces N+1 loop in analytics; Next.js config enables compression and tree-shaking.

**Tech Stack:** Next.js 16, Prisma 6, ioredis, TypeScript, PostgreSQL (Neon)

**Spec:** `docs/superpowers/specs/2026-04-08-performance-optimization-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/lib/cache/api-cache.ts` | **Create** | Shared Redis read-through cache utility |
| `src/app/api/dashboard/metrics/route.js` | Modify | Parallelize getCreditBalance; wrap in getCached |
| `src/app/api/customers/route.js` | Modify | Parallelize count+findMany; invalidate on POST |
| `src/app/api/customers/[customerId]/route.js` | Modify | Invalidate cache on PATCH/DELETE |
| `src/app/api/customers/batch/route.js` | Modify | Invalidate cache after bulk write |
| `src/app/api/customers/delete-all/route.js` | Modify | Invalidate cache after delete |
| `src/app/api/analytics/enhanced/route.js` | Modify | Replace N+1 with raw SQL; wrap in getCached |
| `next.config.mjs` | Modify | Enable compress + optimizePackageImports |
| `package.json` | Modify | Add @next/bundle-analyzer, cross-env, analyze script |

---

## Task 1: Create the `api-cache.ts` utility

**Files:**
- Create: `src/lib/cache/api-cache.ts`
- Create: `src/lib/cache/__tests__/api-cache.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/cache/__tests__/api-cache.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// Default mock — cache miss (get returns null)
vi.mock("ioredis", () => ({
  default: vi.fn().mockImplementation(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue("OK"),
    del: vi.fn().mockResolvedValue(1),
    disconnect: vi.fn(),
  })),
}));

// Must import AFTER mock is set up
const { getCached, invalidateCache } = await import("@/lib/cache/api-cache");

describe("api-cache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls fetcher on cache miss (DISABLE_REDIS fallthrough)", async () => {
    // DISABLE_REDIS=true is set in vitest config — exercises the transparent fallthrough path
    const fetcher = vi.fn().mockResolvedValue({ count: 42 });
    const result = await getCached("test:key", 60, fetcher);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(result).toEqual({ count: 42 });
  });

  it("returns cached value and skips fetcher when Redis has the key", async () => {
    // Reset modules to get a fresh singleton; re-import without DISABLE_REDIS
    vi.resetModules();
    delete process.env.DISABLE_REDIS;

    vi.doMock("ioredis", () => ({
      default: vi.fn().mockImplementation(() => ({
        connect: vi.fn().mockResolvedValue(undefined),
        get: vi.fn().mockResolvedValue(JSON.stringify({ count: 99 })),
        set: vi.fn().mockResolvedValue("OK"),
        del: vi.fn().mockResolvedValue(1),
        disconnect: vi.fn(),
      })),
    }));

    const { getCached: getCachedFresh } = await import("@/lib/cache/api-cache");
    const fetcher = vi.fn().mockResolvedValue({ count: 0 });
    const result = await getCachedFresh("test:key", 60, fetcher);

    expect(fetcher).not.toHaveBeenCalled();
    expect(result).toEqual({ count: 99 });

    // Restore for subsequent tests
    process.env.DISABLE_REDIS = "true";
    vi.resetModules();
  });

  it("invalidateCache does not throw when called", async () => {
    await expect(invalidateCache("metrics:tenant1")).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npm test -- src/lib/cache/__tests__/api-cache.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/lib/cache/api-cache.ts`**

```typescript
import Redis from "ioredis";

let redisClient: Redis | null = null;
let redisUnavailableUntil = 0;

async function getRedisClient(): Promise<Redis | null> {
  if (process.env.DISABLE_REDIS === "true") return null;
  if (Date.now() < redisUnavailableUntil) return null;
  if (redisClient) return redisClient;

  try {
    redisClient = new Redis({
      host: process.env.REDIS_HOST || "127.0.0.1",
      port: Number(process.env.REDIS_PORT || 6379),
      password: process.env.REDIS_PASSWORD || undefined,
      maxRetriesPerRequest: 1,
      lazyConnect: true,
    });
    await redisClient.connect();
    return redisClient;
  } catch {
    redisUnavailableUntil = Date.now() + 30_000;
    if (redisClient) {
      try { redisClient.disconnect(); } catch {}
    }
    redisClient = null;
    return null;
  }
}

export async function getCached<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>
): Promise<T> {
  const redis = await getRedisClient();

  if (redis) {
    try {
      const cached = await redis.get(key);
      if (cached) return JSON.parse(cached) as T;
    } catch {}
  }

  const value = await fetcher();

  if (redis) {
    try {
      await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
    } catch {}
  }

  return value;
}

export async function invalidateCache(...keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  const redis = await getRedisClient();
  if (!redis) return;
  try {
    await redis.del(...keys);
  } catch {}
}
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
npm test -- src/lib/cache/__tests__/api-cache.test.ts
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/cache/api-cache.ts src/lib/cache/__tests__/api-cache.test.ts
git commit -m "feat: add shared Redis read-through cache utility"
```

---

## Task 2: Fix `dashboard/metrics` — parallelize + cache

**Files:**
- Modify: `src/app/api/dashboard/metrics/route.js`

Current problem: `getCreditBalance` runs serially after `Promise.all` completes. No caching.

- [ ] **Step 1: Update `route.js`**

Replace the `GET` handler in `src/app/api/dashboard/metrics/route.js`:

```javascript
import { CustomerStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getTenantContext, requireSession, hasRole } from "@/lib/server/auth-guard";
import { getCreditBalance } from "@/lib/credits/credit-service";
import { getCached } from "@/lib/cache/api-cache";

const PIPELINE_STATUSES = [
  "NEW", "CALL_PENDING", "CALLING", "INTERESTED", "FOLLOW_UP",
  "CONVERTED", "NOT_INTERESTED", "DO_NOT_CALL", "CALL_FAILED", "RETRY_SCHEDULED",
];

export async function GET(request) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  if (!hasRole(auth.session, ["ADMIN", "SALES"])) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const tenant = getTenantContext(auth.session, request);
    const tenantId = tenant.tenantId;
    if (!tenantId) {
      return Response.json({ error: "Tenant context required." }, { status: 400 });
    }

    const url = new URL(request.url);
    const includePipeline = url.searchParams.get("pipeline") === "1";

    // Include pipeline flag in key — pipeline and non-pipeline responses have different shapes
    const data = await getCached(`metrics:${tenantId}:${includePipeline ? '1' : '0'}`, 60, async () => {
      const baseQueries = [
        prisma.customer.count({ where: { tenantId, archivedAt: null } }),
        prisma.customer.count({ where: { tenantId, status: CustomerStatus.INTERESTED, archivedAt: null } }),
        prisma.customer.count({ where: { tenantId, status: CustomerStatus.FOLLOW_UP, archivedAt: null } }),
        prisma.callLog.count({ where: { tenantId } }),
        getCreditBalance(tenantId).catch(() => null),
      ];

      if (includePipeline) {
        baseQueries.push(
          prisma.customer.groupBy({
            by: ["status"],
            where: { tenantId, archivedAt: null },
            _count: true,
          })
        );
      }

      const results = await Promise.all(baseQueries);
      const [totalCustomers, interestedCustomers, followUps, totalCalls, creditBalanceRaw] = results;
      const creditBalance = creditBalanceRaw;

      const response = {
        metrics: { totalCustomers, interestedCustomers, followUps, totalCalls },
        credits: creditBalance
          ? {
              available:            creditBalance.available,
              planCredits:          creditBalance.planCredits,
              purchasedCredits:     creditBalance.purchasedCredits,
              planCreditsAllocated: creditBalance.planCreditsAllocated,
              planResetNextAt:      creditBalance.planResetNextAt,
            }
          : null,
      };

      if (includePipeline && results[5]) {
        const pipelineMap = {};
        for (const s of PIPELINE_STATUSES) pipelineMap[s] = 0;
        for (const row of results[5]) pipelineMap[row.status] = row._count;
        response.pipeline = pipelineMap;
      }

      return response;
    });

    return Response.json(data);
  } catch (error) {
    console.warn("[api/dashboard/metrics] Failed to load metrics.", error);
    return Response.json(
      {
        metrics: { totalCustomers: 0, interestedCustomers: 0, followUps: 0, totalCalls: 0 },
        degraded: true,
        error: "Database unavailable",
      },
      { status: 503 }
    );
  }
}
```

> **Note:** `getCreditBalance` moved to index 4 inside `Promise.all`, pipeline groupBy is now at index 5 (changed from `results[4]` to `results[5]`).

- [ ] **Step 2: Run full test suite to verify no regressions**

```bash
npm test
```

Expected: all previously passing tests still pass.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/dashboard/metrics/route.js
git commit -m "perf: parallelize getCreditBalance and cache dashboard metrics 60s"
```

---

## Task 3: Fix `customers GET` — parallelize count+findMany

**Files:**
- Modify: `src/app/api/customers/route.js`

Current problem: `count` runs first, then `findMany` runs after. Two serial round-trips.

- [ ] **Step 1: Update the GET handler in `src/app/api/customers/route.js`**

Replace the `try` block inside the `GET` handler (lines 48–89):

```javascript
  try {
    const [total, customers] = await Promise.all([
      prisma.customer.count({ where }),
      prisma.customer.findMany({
        where,
        include: {
          calls: {
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (safePage - 1) * safePageSize,
        take: safePageSize,
      }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / safePageSize));
    // Clamp currentPage for the response so callers always get a valid page number,
    // even though the DB skip used the raw safePage (returns empty array for out-of-range).
    const currentPage = Math.min(safePage, totalPages);

    const serializedCustomers = customers.map(c => ({
      ...c,
      loanAmount: c.loanAmount != null ? Number(c.loanAmount) : null,
      monthlyIncome: c.monthlyIncome != null ? Number(c.monthlyIncome) : null,
    }));

    return Response.json({
      customers: serializedCustomers,
      pagination: {
        page: currentPage,
        pageSize: safePageSize,
        total,
        totalPages,
      },
    });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      console.warn("[api/customers] Database unavailable; returning degraded response.");
      return databaseUnavailableResponse();
    }
    throw error;
  }
```

> **Note:** Both queries run in parallel using the raw `safePage` for `skip`. Out-of-range requests return an empty results array. The `pagination.page` in the response is clamped to `totalPages` for backward compatibility — callers always get a valid page reference.

- [ ] **Step 2: Add cache invalidation to the `POST` handler**

Add `invalidateCache` import at the top of the file:

```javascript
import { invalidateCache } from "@/lib/cache/api-cache";
```

In the `POST` handler, after each successful response (before `return Response.json({ customer })`), add cache bust. There are two success paths — the reactivation update and the new create. Add invalidation to both:

```javascript
// After prisma.customer.update (reactivation path):
invalidateCache(`metrics:${tenantId}:0`, `metrics:${tenantId}:1`).catch(() => {});
return Response.json({ customer });

// After prisma.customer.create (new customer path):
invalidateCache(`metrics:${tenantId}:0`, `metrics:${tenantId}:1`).catch(() => {});
return Response.json({ customer });
```

- [ ] **Step 3: Run full test suite**

```bash
npm test
```

Expected: all previously passing tests still pass.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/customers/route.js
git commit -m "perf: parallelize customers count+findMany; invalidate metrics cache on create"
```

---

## Task 4: Fix `analytics/enhanced` — replace N+1 with raw SQL + cache

**Files:**
- Modify: `src/app/api/analytics/enhanced/route.js`

Current problem: Up to 10 separate `prisma.customer.count` queries for campaign interested counts.

- [ ] **Step 1: Update `route.js`**

Add the `getCached` import at the top:

```javascript
import { getCached } from "@/lib/cache/api-cache";
```

Replace the `interestedCounts` N+1 block (lines 107–117) with a single raw SQL query. Replace from `// Interested counts per campaign` through `);` with:

```javascript
    // Interested counts per campaign — single raw SQL query instead of N+1
    const interestedMap = {};
    if (campaignIds.length > 0) {
      const interestedRows = await prisma.$queryRaw`
        SELECT cj."campaignId"::text AS "campaignId", COUNT(DISTINCT c.id)::int AS count
        FROM "CampaignJob" cj
        JOIN "Customer" c ON cj."customerId" = c.id
        WHERE cj."campaignId" = ANY(${campaignIds})
          AND c.status = 'INTERESTED'
          AND c."tenantId" = ${tenantId}
          AND c."archivedAt" IS NULL
        GROUP BY cj."campaignId"
      `;
      for (const row of interestedRows) {
        interestedMap[row.campaignId] = row.count;
      }
    }
```

Then update the `campaignStats` map builder to use `interestedMap` instead of `interestedCounts[i]`:

```javascript
    const campaignStats = campaigns.map((c) => {
      const counts = jobCountMap[c.id] || { total: 0, completed: 0, failed: 0 };
      const interestedForCampaign = interestedMap[c.id] || 0;
      const conversionRate =
        counts.total > 0
          ? (((counts.completed + interestedForCampaign) / counts.total) * 100).toFixed(1)
          : "0.0";
      return {
        id: c.id,
        name: c.name,
        status: c.status,
        totalCalls: counts.total,
        completed: counts.completed,
        failed: counts.failed,
        interested: interestedForCampaign,
        conversionRate,
      };
    });
```

Finally, wrap the data-fetching body in `getCached`. Move line 28 (`const since`) and all code from line 31 through line 196 inside the closure. The existing `result` object at line 174 becomes the closure's return value:

```javascript
    const { searchParams } = new URL(request.url);
    const range = resolveRange(searchParams.get("range"));

    const result = await getCached(`analytics:${tenantId}:${range}`, 120, async () => {
      // Line 28 moved inside (since depends on range, must be inside the closure):
      const since = new Date(Date.now() - range * 24 * 60 * 60 * 1000);

      // Lines 31–37: campaigns fetch — unchanged
      // Lines 39–104: Promise.all (10 parallel queries) — unchanged
      // Lines 107–117: DELETE this block entirely (replaced by interestedMap raw SQL above)
      // Lines 119–196: jobCountMap, campaignStats, agentLeaderboard, result object — unchanged

      return result; // the `result` object built at line 174
    });

    return Response.json(result);
```

The `try/catch` at lines 15 and 199–202 stays in place, wrapping the whole block including the `getCached` call.

- [ ] **Step 2: Run full test suite**

```bash
npm test
```

Expected: all previously passing tests still pass.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/analytics/enhanced/route.js
git commit -m "perf: replace N+1 interested counts with raw SQL; cache analytics 120s"
```

---

## Task 5: Add cache invalidation to batch + delete-all

**Files:**
- Modify: `src/app/api/customers/batch/route.js`
- Modify: `src/app/api/customers/[customerId]/route.js`
- Modify: `src/app/api/customers/delete-all/route.js`

- [ ] **Step 1: Update `batch/route.js`**

Add import at top:

```javascript
import { invalidateCache } from "@/lib/cache/api-cache";
```

After each successful `return Response.json(...)` in the `POST` handler, bust the cache. Both the `DELETE` action and `UPDATE_STATUS` action need it:

```javascript
    if (parsed.action === "DELETE") {
      const result = await prisma.customer.updateMany({ ... });
      invalidateCache(`metrics:${tenantId}:0`, `metrics:${tenantId}:1`).catch(() => {});
      return Response.json({ ok: true, action: "DELETE", count: result.count });
    }

    if (parsed.action === "UPDATE_STATUS") {
      if (!parsed.status) { ... }
      const result = await prisma.customer.updateMany({ ... });
      invalidateCache(`metrics:${tenantId}:0`, `metrics:${tenantId}:1`).catch(() => {});
      return Response.json({ ok: true, action: "UPDATE_STATUS", count: result.count });
    }
```

- [ ] **Step 2: Update `[customerId]/route.js`**

Add import at top:

```javascript
import { invalidateCache } from "@/lib/cache/api-cache";
```

In `PATCH` handler, before `return Response.json({ customer })` (the success response):

```javascript
    invalidateCache(`metrics:${tenantId}:0`, `metrics:${tenantId}:1`).catch(() => {});
    return Response.json({ customer });
```

In `DELETE` handler, before `return Response.json({ success: true })`:

```javascript
    invalidateCache(`metrics:${tenantId}:0`, `metrics:${tenantId}:1`).catch(() => {});
    return Response.json({ success: true });
```

- [ ] **Step 3: Update `delete-all/route.js`**

Add import at top:

```javascript
import { invalidateCache } from "@/lib/cache/api-cache";
```

After the successful `$transaction`, before `return Response.json({ message: ... })`:

```javascript
    invalidateCache(`metrics:${tenantId}:0`, `metrics:${tenantId}:1`).catch(() => {});
    return Response.json({ message: "All customer data deleted.", deleted: { ... } });
```

- [ ] **Step 4: Run full test suite**

```bash
npm test
```

Expected: all previously passing tests still pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/customers/batch/route.js src/app/api/customers/[customerId]/route.js src/app/api/customers/delete-all/route.js
git commit -m "perf: invalidate metrics cache on all customer write endpoints"
```

---

## Task 6: Bundle optimization

**Files:**
- Modify: `next.config.mjs`
- Modify: `package.json`

- [ ] **Step 1: Update `next.config.mjs`**

Replace the entire file:

```javascript
import bundleAnalyzer from "@next/bundle-analyzer";

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  compress: true,
  experimental: {
    optimizePackageImports: ["lucide-react", "xlsx"],
  },
};

export default withBundleAnalyzer(nextConfig);
```

- [ ] **Step 2: Install dependencies**

```bash
npm install --save-dev @next/bundle-analyzer cross-env
```

- [ ] **Step 3: Add `analyze` script to `package.json`**

In the `"scripts"` section, add after the `"test"` line:

```json
"analyze": "cross-env ANALYZE=true next build",
```

- [ ] **Step 4: Verify build succeeds**

```bash
npm run build 2>&1 | tail -20
```

Expected: build completes without errors.

- [ ] **Step 5: Run full test suite**

```bash
npm test
```

Expected: all previously passing tests still pass.

- [ ] **Step 6: Commit**

```bash
git add next.config.mjs package.json package-lock.json
git commit -m "perf: enable gzip compression, optimizePackageImports, and bundle analyzer"
```

---

## Final Verification

- [ ] **Run full test suite one last time**

```bash
npm test
```

Expected: 569+ passed, 0 failed, 18 skipped.

- [ ] **Verify TypeScript is clean**

```bash
npx tsc --noEmit
```

Expected: no errors.
