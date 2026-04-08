---
title: Performance Optimization Design
date: 2026-04-08
tags:
  - performance
  - caching
  - backend
status: approved
---

# Performance Optimization Design

## Overview

Three-area performance pass: query parallelism, Redis response caching, and bundle optimization. No architectural changes — targeted fixes to the highest-impact hot paths.

---

## Area 1: Query Parallelism

Fix serial DB calls in three routes. No new infrastructure required.

### `GET /api/dashboard/metrics`

**Problem:** `getCreditBalance(tenantId)` runs serially after `Promise.all` completes.

**Fix:** Add `getCreditBalance` to the existing `Promise.all` alongside the four existing queries. Wrap it with `.catch(() => null)` to preserve graceful degradation if the credit service is unavailable — a credit failure must not reject the entire `Promise.all`.

### `GET /api/customers`

**Problem:** `prisma.customer.count` runs first, then `prisma.customer.findMany` runs after.

**Fix:** Run both in `Promise.all` using the unclamped `safePage` for the `skip` offset. Post-resolution, derive `totalPages` and `currentPage` from the resolved count. Behavioral note: out-of-bounds page requests (e.g. `?page=999` when only 5 pages exist) will return an empty results array rather than clamping to the last page. The `totalPages` in the response allows the client to self-correct. This is acceptable behavior and matches common REST pagination conventions.

### `GET /api/analytics/enhanced`

**Problem:** After the main `Promise.all`, up to 10 separate `prisma.customer.count` queries run for campaign interested counts — one per campaign.

**Fix:** Replace the N+1 loop with a single `prisma.$queryRaw` call:

```sql
SELECT cj."campaignId", COUNT(DISTINCT c.id)::int AS count
FROM "CampaignJob" cj
JOIN "Customer" c ON cj."customerId" = c.id
WHERE cj."campaignId" = ANY($1)
  AND c.status = 'INTERESTED'
  AND c."tenantId" = $2
  AND c."archivedAt" IS NULL
GROUP BY cj."campaignId"
```

> [!note] Why not `groupBy`
> Prisma `groupBy` does not support relation filters in its `where` clause — filtering by a related model's field is not available. Raw SQL is required here.

Result is a map of `{ [campaignId]: count }` built in JS, replacing the `interestedCounts` array. Skipped entirely if `campaignIds.length === 0`.

---

## Area 2: Redis Response Caching

### Shared Cache Utility

New file: `src/lib/cache/api-cache.ts`

```ts
getCached<T>(key: string, ttlSeconds: number, fetcher: () => Promise<T>): Promise<T>
invalidateCache(...keys: string[]): Promise<void>
```

- Uses the existing `ioredis` client pattern from `theme.service.ts` (same `getRedisClient()` helper or equivalent)
- If Redis is unavailable, `getCached` falls through to `fetcher` transparently — no errors surfaced to callers
- Stores JSON-serialized responses with `EX` TTL

### Cache Targets

| Route | Cache Key | TTL | Invalidated by |
|-------|-----------|-----|----------------|
| `GET /api/dashboard/metrics` | `metrics:{tenantId}` | 60s | POST /customers, PATCH/DELETE /customers/[id], POST /customers/batch, DELETE /customers/delete-all |
| `GET /api/analytics/enhanced` | `analytics:{tenantId}:{range}` | 120s | — (time-based only; analytics data is historical) |

### Not Cached

- `GET /api/customers` — reps work this list directly; must be fresh
- `GET /api/customers/[id]` — same
- All write endpoints — no caching

### Cache Invalidation on Write

The following endpoints call `invalidateCache(`metrics:${tenantId}`)` after a successful DB write. Fire-and-forget — a cache miss on the next request is acceptable.

| Endpoint | Trigger |
|----------|---------|
| `POST /api/customers` | New customer created |
| `PATCH /api/customers/[id]` | Customer updated |
| `DELETE /api/customers/[id]` | Customer deleted |
| `POST /api/customers/batch` | Bulk status update or bulk archive |
| `DELETE /api/customers/delete-all` | All customers deleted for tenant |

---

## Area 3: Bundle Optimization

### `next.config.mjs` changes

```js
const nextConfig = {
  compress: true,
  experimental: {
    optimizePackageImports: ["lucide-react", "xlsx"],
  },
};
```

`optimizePackageImports` tells Next.js to tree-shake these packages at build time, avoiding full barrel imports. `compress` enables gzip for all responses.

### Bundle Analyzer

Add `@next/bundle-analyzer` and `cross-env` as dev dependencies:

```json
"analyze": "cross-env ANALYZE=true next build"
```

`cross-env` is required for Windows compatibility (inline `VAR=value` syntax does not work on Windows). Not wired into CI — manual use only for tracking bundle size over time.

---

## Error Handling

- Redis unavailable → cache utility falls through to DB (same as theme service pattern)
- Raw SQL for analytics → parameterised query, no injection risk; empty `campaignIds` skips the query entirely
- All existing error handling in routes is preserved

## Testing

No existing unit tests cover `GET /api/dashboard/metrics`, `GET /api/analytics/enhanced`, or `GET /api/customers` (main list). New tests should be added as follow-up work. For this implementation:

- Manually verify `customers GET` returns correct pagination with the parallelized approach
- Manually verify `analytics/enhanced` campaign interested counts match previous output
- Run `npm run analyze` before and after to confirm bundle size reduction

## Files Changed

| File | Change |
|------|--------|
| `src/lib/cache/api-cache.ts` | New — shared Redis cache utility |
| `src/app/api/dashboard/metrics/route.js` | Parallelize credit balance |
| `src/app/api/customers/route.js` | Parallelize count + findMany; invalidate cache on write |
| `src/app/api/customers/[customerId]/route.js` | Invalidate cache on PATCH/DELETE |
| `src/app/api/customers/batch/route.js` | Invalidate cache after bulk write |
| `src/app/api/customers/delete-all/route.js` | Invalidate cache after delete |
| `src/app/api/analytics/enhanced/route.js` | Fix N+1 with raw SQL; add response caching |
| `next.config.mjs` | Add compress + optimizePackageImports |
| `package.json` | Add @next/bundle-analyzer + cross-env dev deps + analyze script |
