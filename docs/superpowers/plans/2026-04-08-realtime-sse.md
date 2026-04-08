---
title: Real-Time SSE Implementation Plan
date: 2026-04-08
tags:
  - realtime
  - sse
  - redis
  - plan
---

# Real-Time SSE Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add real-time push to the dashboard and notification bell using SSE + Redis Pub/Sub, replacing the 60s polling interval, without adding any latency to existing request paths.

**Architecture:** Write endpoints fire-and-forget `publishEvent(tenantId, event)` after their existing `invalidateCache` calls. A new `GET /api/events` SSE route subscribes to `realtime:{tenantId}` on Redis and streams events to the browser. A module-level `EventSource` singleton in `useSSE.ts` ensures one connection per tab; components call `useSSEEvent(type, handler)` to subscribe.

**Tech Stack:** ioredis (already installed), Next.js ReadableStream, native browser EventSource, Vitest

**Spec:** `docs/superpowers/specs/2026-04-08-realtime-sse-design.md`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/lib/events/event-publisher.ts` | Create | Redis pub client + subscriber factory |
| `src/lib/events/__tests__/event-publisher.test.ts` | Create | Unit tests |
| `src/app/api/events/route.ts` | Create | SSE endpoint with auth + cleanup |
| `src/hooks/useSSE.ts` | Create | Singleton EventSource hook |
| `src/app/api/dashboard/metrics/route.js` | Modify | Add `activeCalls` parallel query (index 5) |
| `src/app/api/calls/webhook/route.js` | Modify | Add `createNotification` + 3x `publishEvent` in `finishCall` |
| `src/app/api/customers/route.js` | Modify | Add `publishEvent` after both `invalidateCache` calls |
| `src/app/api/customers/[customerId]/route.js` | Modify | Add `publishEvent` after PATCH + DELETE `invalidateCache` |
| `src/app/api/customers/batch/route.js` | Modify | Add `publishEvent` after both `invalidateCache` calls |
| `src/app/api/customers/delete-all/route.js` | Modify | Add `publishEvent` after `invalidateCache` |
| `src/app/api/leads/upload/route.js` | Modify | Add `invalidateCache` + `publishEvent` before success return |
| `src/components/notifications/NotificationBell.js` | Modify | Replace `setInterval` with `useSSEEvent` |
| `src/components/modern/dashboard-view.js` | Modify | Add active-calls tile + `useSSEEvent` subscriptions |

---

## Task 1: Event Publisher

**Files:**
- Create: `src/lib/events/event-publisher.ts`
- Create: `src/lib/events/__tests__/event-publisher.test.ts`

> [!note] Redis connection pattern
> Use identical config to `src/lib/cache/api-cache.ts`: `REDIS_HOST || "127.0.0.1"`, `REDIS_PORT || 6379`, `REDIS_PASSWORD`. `DISABLE_REDIS=true` → return null immediately. Do NOT use REDIS_URL or KV_URL — they don't exist in this codebase.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/events/__tests__/event-publisher.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("publishEvent — DISABLE_REDIS=true", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.DISABLE_REDIS = "true";
  });
  afterEach(() => {
    delete process.env.DISABLE_REDIS;
  });

  it("resolves without throwing when Redis is disabled", async () => {
    const { publishEvent } = await import("../event-publisher");
    await expect(publishEvent("tenant-1", { type: "metrics:update" })).resolves.toBeUndefined();
  });
});

describe("createRedisSubscriber — DISABLE_REDIS=true", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.DISABLE_REDIS = "true";
  });
  afterEach(() => {
    delete process.env.DISABLE_REDIS;
  });

  it("returns null when Redis is disabled", async () => {
    const { createRedisSubscriber } = await import("../event-publisher");
    expect(createRedisSubscriber()).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
npx vitest run src/lib/events/__tests__/event-publisher.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/lib/events/event-publisher.ts`**

```ts
import Redis from "ioredis";

let pubClient: Redis | null = null;

function getPublisher(): Redis | null {
  if (process.env.DISABLE_REDIS === "true") return null;
  if (pubClient && pubClient.status !== "end" && pubClient.status !== "close") {
    return pubClient;
  }
  pubClient = new Redis({
    host: process.env.REDIS_HOST || "127.0.0.1",
    port: Number(process.env.REDIS_PORT || 6379),
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: 1,
    lazyConnect: false,
  });
  pubClient.on("error", () => {
    pubClient = null;
  });
  return pubClient;
}

export async function publishEvent(
  tenantId: string,
  event: { type: string; payload?: unknown }
): Promise<void> {
  const client = getPublisher();
  if (!client) return;
  try {
    await client.publish(`realtime:${tenantId}`, JSON.stringify(event));
  } catch {
    // Fire-and-forget — never surface errors to callers
  }
}

export function createRedisSubscriber(): Redis | null {
  if (process.env.DISABLE_REDIS === "true") return null;
  const client = new Redis({
    host: process.env.REDIS_HOST || "127.0.0.1",
    port: Number(process.env.REDIS_PORT || 6379),
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: 1,
  });
  client.on("error", () => {});
  return client;
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
npx vitest run src/lib/events/__tests__/event-publisher.test.ts
```

Expected: PASS (2 tests). ioredis is never instantiated when DISABLE_REDIS=true.

- [ ] **Step 5: Commit**

```bash
git add src/lib/events/event-publisher.ts src/lib/events/__tests__/event-publisher.test.ts
git commit -m "feat: add event-publisher with Redis pub/sub client"
```

---

## Task 2: SSE Endpoint

**Files:**
- Create: `src/app/api/events/route.ts`

> [!note] No test in this task
> The SSE route requires a live HTTP connection and ReadableStream — not practical in unit tests. Auth guard and response headers are verified manually in Task 9. Integration coverage is deferred to follow-up.

> [!warning] `force-dynamic` is required
> Without `export const dynamic = "force-dynamic"`, Next.js will cache the GET response and the SSE stream will not work.

- [ ] **Step 1: Create `src/app/api/events/route.ts`**

```ts
export const dynamic = "force-dynamic";

import { requireSession, getTenantContext } from "@/lib/server/auth-guard";
import { createRedisSubscriber } from "@/lib/events/event-publisher";

export async function GET(request: Request) {
  const auth = await requireSession();
  if (auth.error) return new Response("Unauthorized", { status: 401 });

  const tenant = getTenantContext(auth.session, request);
  const tenantId = tenant?.tenantId;
  if (!tenantId) return new Response("Tenant required", { status: 400 });

  const channel = `realtime:${tenantId}`;
  const subscriber = createRedisSubscriber();

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();

      // 30s keepalive ping — prevents proxy timeouts
      const pingTimer = setInterval(() => {
        try { controller.enqueue(enc.encode(": ping\n\n")); } catch {}
      }, 30_000);

      // 5-minute safety valve — browser EventSource auto-reconnects
      const safetyTimer = setTimeout(async () => {
        await cleanup();
        try { controller.close(); } catch {}
      }, 5 * 60 * 1000);

      async function cleanup() {
        clearInterval(pingTimer);
        clearTimeout(safetyTimer);
        if (subscriber) {
          try { await subscriber.unsubscribe(channel); } catch {}
          try { await subscriber.quit(); } catch {}
        }
      }

      if (subscriber) {
        await subscriber.subscribe(channel);
        subscriber.on("message", (_ch: string, message: string) => {
          try {
            controller.enqueue(enc.encode(`data: ${message}\n\n`));
          } catch {}
        });
      }

      // Cleanup on client disconnect
      request.signal.addEventListener("abort", async () => {
        await cleanup();
        try { controller.close(); } catch {}
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/events/route.ts
git commit -m "feat: add SSE endpoint GET /api/events"
```

---

## Task 3: useSSE Hook

**Files:**
- Create: `src/hooks/useSSE.ts`

> [!note] No `src/hooks/` directory yet
> Create it — it does not exist. The `useSSE.ts` file lives here alongside any future client hooks.

> [!note] Module-level singleton
> `es` and `listeners` are module-level variables. This guarantees one `EventSource` per browser tab regardless of how many components call `useSSEEvent`. This is intentional — do not move them inside the hook function.

- [ ] **Step 1: Create `src/hooks/useSSE.ts`**

```ts
"use client";

import { useEffect } from "react";

// Module-level singleton — one EventSource per browser tab
let es: EventSource | null = null;
const listeners = new Map<string, Set<() => void>>();

function getOrCreate(): EventSource {
  if (es && es.readyState !== EventSource.CLOSED) return es;

  // Stale closed instance — reset before creating fresh one
  es = null;
  listeners.clear();

  const instance = new EventSource("/api/events");

  instance.onmessage = (event: MessageEvent) => {
    try {
      const { type } = JSON.parse(event.data) as { type: string };
      listeners.get(type)?.forEach((h) => h());
    } catch {}
  };

  instance.onerror = () => {
    if (instance.readyState === EventSource.CLOSED) {
      // Permanent close (e.g. 401 after logout) — reset so next mount reconnects
      es = null;
      listeners.clear();
    }
    // Transient errors: browser auto-reconnects; do nothing
  };

  es = instance;
  return instance;
}

/**
 * Subscribe to a named SSE event type.
 * `handler` is called with no arguments — it should trigger a refetch, not read event payload.
 * Pass a stable callback (useCallback or module-level function) to avoid re-registration on every render.
 */
export function useSSEEvent(type: string, handler: () => void): void {
  useEffect(() => {
    getOrCreate();
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type)!.add(handler);
    return () => {
      listeners.get(type)?.delete(handler);
    };
  }, [type, handler]);
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useSSE.ts
git commit -m "feat: add useSSEEvent singleton hook"
```

---

## Task 4: Dashboard Metrics — activeCalls

**Files:**
- Modify: `src/app/api/dashboard/metrics/route.js`

> [!warning] Index shift — do not miss this
> Inserting `activeCalls` at index 5 shifts pipeline groupBy to index 6. There is an existing `results[5]` reference on the pipeline block (around line 67). It **must** be changed to `results[6]` or the pipeline display will silently read an integer instead of an array.

- [ ] **Step 1: Add `activeCalls` query at index 5 in `baseQueries`**

In `src/app/api/dashboard/metrics/route.js`, the `baseQueries` array currently has 5 elements (indices 0–4). Add a new entry at the end of the base array, before `if (includePipeline)`:

```js
const baseQueries = [
  prisma.customer.count({ where: { tenantId, archivedAt: null } }),
  prisma.customer.count({ where: { tenantId, status: CustomerStatus.INTERESTED, archivedAt: null } }),
  prisma.customer.count({ where: { tenantId, status: CustomerStatus.FOLLOW_UP, archivedAt: null } }),
  prisma.callLog.count({ where: { tenantId } }),
  getCreditBalance(tenantId).catch(() => null),  // index 4
  prisma.customer.count({ where: { tenantId, status: CustomerStatus.CALLING, archivedAt: null } }),  // index 5 — active calls
];
```

- [ ] **Step 2: Update destructuring to include `activeCalls`**

```js
const [totalCustomers, interestedCustomers, followUps, totalCalls, creditBalance, activeCalls] = results;
```

- [ ] **Step 3: Add `activeCalls` to the response metrics object**

```js
const response = {
  metrics: { totalCustomers, interestedCustomers, followUps, totalCalls, activeCalls },
  credits: creditBalance ? { ... } : null,
};
```

- [ ] **Step 4: Fix `results[5]` → `results[6]` for pipeline data**

Find the block `if (includePipeline && results[5])` — change it to `results[6]`:

```js
if (includePipeline && results[6]) {
  const pipelineMap = {};
  for (const s of PIPELINE_STATUSES) pipelineMap[s] = 0;
  for (const row of results[6]) pipelineMap[row.status] = row._count;
  response.pipeline = pipelineMap;
}
```

- [ ] **Step 5: Verify with type-check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/dashboard/metrics/route.js
git commit -m "feat: add activeCalls metric to dashboard metrics endpoint"
```

---

## Task 5: Webhook — In-App Notification + SSE Events

**Files:**
- Modify: `src/app/api/calls/webhook/route.js`

> [!note] Where to insert
> Add the new calls at the end of `finishCall()`, after the existing `notifyAdvisorForCallLog` block (currently lines 193–200). All three calls are fire-and-forget.

- [ ] **Step 1: Add imports at top of file**

Add to the existing import block in `src/app/api/calls/webhook/route.js`:

```js
import { createNotification } from "@/lib/notifications/notification-service";
import { publishEvent } from "@/lib/events/event-publisher";
```

- [ ] **Step 2: Add fire-and-forget calls at end of `finishCall()`**

After the `notifyAdvisorForCallLog` block (after the `else` branch that logs `advisorNotification.channels`), add:

```js
// In-app notification — fire-and-forget
createNotification(callLog.tenantId, {
  type: "CALL_COMPLETED",
  title: "Call completed",
  body: analysis.summary || "A call has ended.",
  link: "/admin/calls",
}).catch(() => {});

// SSE events — fire-and-forget; never block call completion
publishEvent(callLog.tenantId, { type: "metrics:update" }).catch(() => {});
publishEvent(callLog.tenantId, { type: "notification:new" }).catch(() => {});
publishEvent(callLog.tenantId, { type: "call:status", payload: { status: mappedStatus } }).catch(() => {});
```

Note: use `callLog.tenantId` — `tenantId` from the outer scope is already set to `callLog.tenantId` at this point, so either works. `mappedStatus` is computed earlier in `finishCall`.

- [ ] **Step 3: Verify with type-check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/calls/webhook/route.js
git commit -m "feat: emit in-app notification and SSE events on call completion"
```

---

## Task 6: Customer Write Routes — publishEvent

**Files:**
- Modify: `src/app/api/customers/route.js`
- Modify: `src/app/api/customers/[customerId]/route.js`
- Modify: `src/app/api/customers/batch/route.js`
- Modify: `src/app/api/customers/delete-all/route.js`

> [!note] Pattern for all four files
> Add `import { publishEvent } from "@/lib/events/event-publisher";` at the top of each file.
> After every existing `invalidateCache(...)` call, add on the next line:
> `publishEvent(tenantId, { type: "metrics:update" }).catch(() => {});`
> Do not change any other code.

- [ ] **Step 1: `customers/route.js` — add import + publishEvent after both invalidateCache calls**

Add import at top:
```js
import { publishEvent } from "@/lib/events/event-publisher";
```

Line 154 area (reactivate path):
```js
invalidateCache(`metrics:${tenantId}:0`, `metrics:${tenantId}:1`).catch(() => {});
publishEvent(tenantId, { type: "metrics:update" }).catch(() => {});
return Response.json({ customer });
```

Line 182 area (create path):
```js
invalidateCache(`metrics:${tenantId}:0`, `metrics:${tenantId}:1`).catch(() => {});
publishEvent(tenantId, { type: "metrics:update" }).catch(() => {});
return Response.json({ customer });
```

- [ ] **Step 2: `customers/[customerId]/route.js` — add import + publishEvent after both invalidateCache calls**

Add import at top:
```js
import { publishEvent } from "@/lib/events/event-publisher";
```

Line 109 area (PATCH success):
```js
invalidateCache(`metrics:${tenantId}:0`, `metrics:${tenantId}:1`).catch(() => {});
publishEvent(tenantId, { type: "metrics:update" }).catch(() => {});
return Response.json({ customer });
```

Line 156 area (DELETE success):
```js
invalidateCache(`metrics:${tenantId}:0`, `metrics:${tenantId}:1`).catch(() => {});
publishEvent(tenantId, { type: "metrics:update" }).catch(() => {});
return Response.json({ success: true });
```

- [ ] **Step 3: `customers/batch/route.js` — add import + publishEvent after both invalidateCache calls**

Add import at top:
```js
import { publishEvent } from "@/lib/events/event-publisher";
```

Line 50 area (DELETE/archive path):
```js
invalidateCache(`metrics:${tenantId}:0`, `metrics:${tenantId}:1`).catch(() => {});
publishEvent(tenantId, { type: "metrics:update" }).catch(() => {});
return Response.json({ ... });
```

Line 66 area (UPDATE_STATUS path):
```js
invalidateCache(`metrics:${tenantId}:0`, `metrics:${tenantId}:1`).catch(() => {});
publishEvent(tenantId, { type: "metrics:update" }).catch(() => {});
return Response.json({ ok: true, action: "UPDATE_STATUS", count: result.count });
```

- [ ] **Step 4: `customers/delete-all/route.js` — add import + publishEvent**

Add import at top:
```js
import { publishEvent } from "@/lib/events/event-publisher";
```

Line 37 area:
```js
invalidateCache(`metrics:${tenantId}:0`, `metrics:${tenantId}:1`).catch(() => {});
publishEvent(tenantId, { type: "metrics:update" }).catch(() => {});
return Response.json({ ... });
```

- [ ] **Step 5: Type-check all four files**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/customers/route.js src/app/api/customers/\[customerId\]/route.js src/app/api/customers/batch/route.js src/app/api/customers/delete-all/route.js
git commit -m "feat: publish metrics:update SSE event from all customer write routes"
```

---

## Task 7: Leads Upload — Fix Cache Staleness + publishEvent

**Files:**
- Modify: `src/app/api/leads/upload/route.js`

> [!note] Two problems fixed in one place
> This route already imports `createNotification` (line 8) but has no `invalidateCache`. The dashboard cache goes stale after every lead upload. Fix: add both `invalidateCache` and `publishEvent` before the success `return Response.json(...)` — they go between the existing `createNotification(...)` call and the return.

- [ ] **Step 1: Add imports**

Add to existing imports at top of `src/app/api/leads/upload/route.js`:

```js
import { invalidateCache } from "@/lib/cache/api-cache";
import { publishEvent } from "@/lib/events/event-publisher";
```

- [ ] **Step 2: Add invalidateCache + publishEvent before the success return**

Find the block (around lines 186–194):
```js
createNotification(tenantId, {
  // ...
}).catch(() => {});

return Response.json({
  // ...
});
```

Insert between them:
```js
createNotification(tenantId, {
  // ... (existing, unchanged)
}).catch(() => {});

invalidateCache(`metrics:${tenantId}:0`, `metrics:${tenantId}:1`).catch(() => {});
publishEvent(tenantId, { type: "metrics:update" }).catch(() => {});

return Response.json({
  // ... (existing, unchanged)
});
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/leads/upload/route.js
git commit -m "fix: invalidate metrics cache + publish SSE event after lead upload"
```

---

## Task 8: NotificationBell — Replace Polling with SSE

**Files:**
- Modify: `src/components/notifications/NotificationBell.js`

> [!note] What changes
> Remove the `setInterval(fetchCount, 60000)` polling effect (lines 37–41). Keep the initial `fetchCount()` on mount. Add `useSSEEvent('notification:new', fetchCount)` — this calls `fetchCount` immediately when a new notification arrives via SSE.

> [!note] `fetchCount` is already stable
> It is wrapped in `useCallback` at line 13, so it is safe to pass directly to `useSSEEvent` without causing re-registration loops.

- [ ] **Step 1: Add `useSSEEvent` import**

In `src/components/notifications/NotificationBell.js`, add to imports:

```js
import { useSSEEvent } from "@/hooks/useSSE";
```

- [ ] **Step 2: Replace the polling effect**

Find and remove this entire `useEffect` block (lines 37–41):
```js
useEffect(() => {
  fetchCount();
  const id = setInterval(fetchCount, 60000);
  return () => clearInterval(id);
}, [fetchCount]);
```

Replace it with:
```js
// Initial fetch on mount
useEffect(() => {
  fetchCount();
}, [fetchCount]);

// Real-time push — refetch immediately when a notification arrives
useSSEEvent("notification:new", fetchCount);
```

- [ ] **Step 3: Verify no `setInterval` remains**

```bash
grep -n "setInterval" src/components/notifications/NotificationBell.js
```

Expected: no output (setInterval fully removed).

- [ ] **Step 4: Commit**

```bash
git add src/components/notifications/NotificationBell.js
git commit -m "feat: replace 60s notification polling with SSE push"
```

---

## Task 9: Dashboard View — Active Calls Stat + SSE Subscriptions

**Files:**
- Modify: `src/components/modern/dashboard-view.js`

> [!note] Three changes in one file
> 1. Wrap the existing metrics fetch in a stable `useCallback` named `refetchMetrics`
> 2. Subscribe to `metrics:update` and `call:status` events via `useSSEEvent`
> 3. Add an "Active Calls" tile to the `.ms-metrics` grid

- [ ] **Step 1: Add `useCallback` to the existing imports**

`dashboard-view.js` already imports `useCallback, useEffect, useState`. If `useCallback` is not already imported, add it.

- [ ] **Step 2: Add `useSSEEvent` import**

```js
import { useSSEEvent } from "@/hooks/useSSE";
```

- [ ] **Step 3: Wire SSE subscriptions using the existing fetch callback**

`dashboard-view.js` already has a `fetchDashboardData` function wrapped in `useCallback` with `[]` deps (around line 106). It already calls `fetch("/api/dashboard/metrics?pipeline=1")` and updates metrics state. Reuse it directly — no refactoring needed.

After the existing `useEffect` that calls `fetchDashboardData`, add:

```js
useSSEEvent("metrics:update", fetchDashboardData);
useSSEEvent("call:status", fetchDashboardData);
```

Both events trigger the same action: refetch metrics. No need for separate handlers. `fetchDashboardData` is already a stable `useCallback` reference so it will not cause re-registration loops.

- [ ] **Step 4: Add Active Calls tile to the `.ms-metrics` grid**

Find the `.ms-metrics` div (around line 165) containing the existing metric tiles. Add an "Active Calls" tile alongside the existing ones:

```jsx
<div className="ms-m-tile">
  <div className="ms-m-tile-lbl">Active Calls</div>
  <div className="ms-m-tile-val">{(metrics.activeCalls ?? 0).toLocaleString()}</div>
</div>
```

Place it after the "Total Calls" tile and before "Follow-Ups" — or at the end of the grid, whichever fits the layout. Use `?? 0` so it shows `0` gracefully if the API hasn't returned it yet (e.g. during loading).

- [ ] **Step 5: Verify with type-check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/modern/dashboard-view.js
git commit -m "feat: add active-calls metric tile and SSE-driven dashboard refetch"
```

---

## Final Verification

- [ ] **Run full test suite**

```bash
npm test
```

Expected: all tests pass, 0 failures.

- [ ] **Start dev server and verify manually**

```bash
npm run dev
```

Manual checks:
1. Log in as `admin@crm.local` / `Admin@123`
2. Open browser DevTools → Network tab → filter by `events`
3. Confirm `GET /api/events` appears with `Content-Type: text/event-stream` and stays open
4. Open a second tab — confirm only one SSE connection appears (singleton)
5. Create a customer → dashboard metrics should update within 1–2 seconds without page refresh
6. Check NotificationBell — no `setInterval` in DevTools → Performance
7. Confirm Active Calls tile shows `0` (or current CALLING count)

- [ ] **Verify no latency added to write paths**

In DevTools → Network, create a customer and check the `POST /api/customers` response time. It should be unchanged from before — `publishEvent` is fire-and-forget and does not extend the response.

- [ ] **Verify DISABLE_REDIS graceful degradation**

Add `DISABLE_REDIS=true` to `.env.local`, restart dev server.

- Confirm app loads normally
- Confirm `GET /api/events` returns a streaming response (pings only)
- Confirm no console errors

- [ ] **Final commit (if any cleanup)**

```bash
git add -p
git commit -m "chore: real-time SSE feature complete"
```
