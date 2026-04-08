---
title: Real-Time SSE Design
date: 2026-04-08
tags:
  - realtime
  - sse
  - redis
  - backend
  - frontend
status: approved
---

# Real-Time SSE Design

## Overview

Add real-time push to the dashboard and notification bell using Server-Sent Events (SSE) + Redis Pub/Sub. No polling, no WebSockets, no new infrastructure beyond the existing Redis instance.

Three event types in scope:

| Event | Trigger | Browser reaction |
|---|---|---|
| `metrics:update` | Any customer write (6 routes) | Dashboard refetches `/api/dashboard/metrics` |
| `call:status` | Call finalized in webhook | Dashboard refetches metrics (active-calls counter updates) |
| `notification:new` | Call finalized in webhook | NotificationBell refetches unread count |

---

## Architecture

```
Write path:
  POST/PATCH/DELETE /api/customers/* ──┐
  POST /api/calls/webhook ─────────────┤──▶ publishEvent(tenantId, event)
                                       │         │
                                       │         ▼
                                       │   Redis Pub/Sub
                                       │   channel: "realtime:{tenantId}"
                                       │         │
Read path:                             │         ▼
  browser EventSource ─────────────────┘   GET /api/events (SSE)
       │                                         │
       ▼                                         ▼
  useSSEEvent(type, handler)            subscriber.on('message') → stream
```

**Single connection guarantee:** `useSSE.ts` uses a module-level `EventSource` singleton. No matter how many components call `useSSEEvent`, the browser opens exactly one SSE connection per tab.

**Redis client isolation:** `event-publisher.ts` owns its own `ioredis` instance for publishing. The SSE route creates a new dedicated subscriber per connection (required — subscribed clients cannot send other commands). Neither shares the private client in `api-cache.ts`.

**DISABLE_REDIS=true:** `publishEvent` silently no-ops. The SSE route streams 30s keepalive pings but no events. Components work correctly — they just don't receive real-time updates (acceptable in dev without Redis).

---

## New Files

### `src/lib/events/event-publisher.ts`

Exports two functions:

**`publishEvent(tenantId: string, event: { type: string; payload?: unknown }): Promise<void>`**
- Publishes JSON to Redis channel `realtime:{tenantId}`
- Own `ioredis` client — not the api-cache private client
- Fire-and-forget: never throws (catches internally)
- No-ops silently when `DISABLE_REDIS=true`

**`createRedisSubscriber(): Redis | null`**
- Returns a fresh dedicated `ioredis` client for SSE subscriptions
- Returns `null` when `DISABLE_REDIS=true`
- Caller owns lifecycle: must call `unsubscribe()` + `quit()` on cleanup
- Registers silent `on('error', () => {})` to prevent unhandled exceptions

Redis connection uses the same config pattern as all other clients in the codebase (`api-cache.ts`, `theme.service.ts`, `session-store.js`, `ai-campaign-queue.js`) — fallback to localhost when no host is configured:
```ts
new Redis({
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: Number(process.env.REDIS_PORT || 6379),
  password: process.env.REDIS_PASSWORD || undefined,
})
```
If Redis is unreachable, the `on('error', () => {})` handler silently discards the error. `publishEvent` catches any publish errors internally. This matches the existing pattern — no-op only on `DISABLE_REDIS=true`, not on missing host.

### `src/app/api/events/route.ts`

SSE endpoint. Streams Redis messages to the browser.

```
GET /api/events
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
```

**Behaviour:**
- `export const dynamic = 'force-dynamic'` — required to prevent Next.js caching
- Auth via `requireSession()` + `getTenantContext()` — returns 401/400 on failure
- Calls `createRedisSubscriber()` to get a dedicated client
- If subscriber is null (DISABLE_REDIS): returns a stream that emits only 30s pings
- Subscribes to channel `realtime:{tenantId}`
- On Redis message: enqueues `data: {message}\n\n` to the `ReadableStream`
- Keepalive: enqueues `: ping\n\n` every 30 seconds via `setInterval`
- Cleanup on `request.signal.abort`: `clearInterval(pingTimer)` → `subscriber.unsubscribe()` → `subscriber.quit()` → `controller.close()`
- Safety timeout: after 5 minutes, proactively close the connection (same cleanup sequence). Browser EventSource auto-reconnects, creating a fresh subscriber. This prevents resource leaks if `request.signal` never fires due to infrastructure quirks.

> [!note] Cleanup is critical
> Each SSE connection holds a dedicated Redis subscriber client. Both the abort handler and the 5-minute safety timeout must run cleanup — missing either leaks Redis connections.

### `src/hooks/useSSE.ts`

Client hook providing real-time event subscriptions without creating multiple connections.

**Module-level state (singleton):**
```ts
let es: EventSource | null = null;
const listeners = new Map<string, Set<() => void>>();
```

**`useSSEEvent(type: string, handler: () => void): void`**
- On mount: if `es` is null or `es.readyState === CLOSED`, set `es = null` then create a new `EventSource`. This handles post-logout re-login where the old connection got a 401 and closed permanently.
- Registers handler in listener map for the given event type
- On unmount: removes handler from set
- `es.onmessage`: parses `{ type, payload }`, calls all handlers registered for that type
- `es.onerror`: if `es.readyState === CLOSED`, set `es = null` and `listeners.clear()` so the next mount creates a fresh connection. Otherwise silent — EventSource auto-reconnects natively.

> [!tip] Handler stability
> Callers should pass stable callbacks (defined with `useCallback` or defined outside the component) to avoid `useEffect` re-runs causing duplicate registrations.

---

## Modified Files

### `src/app/api/dashboard/metrics/route.js`

Add `activeCalls` count to `baseQueries` (index 5, always present, before pipeline groupBy):

```js
prisma.customer.count({
  where: { tenantId, status: CustomerStatus.CALLING, archivedAt: null },
}),  // index 5 — active calls
```

When pipeline is included, groupBy shifts to index 6.

Destructure: `const [totalCustomers, interestedCustomers, followUps, totalCalls, creditBalance, activeCalls] = results;`

Add to response: `metrics: { totalCustomers, interestedCustomers, followUps, totalCalls, activeCalls }`

> [!warning] Pipeline index shift
> The existing `if (includePipeline && results[5])` block (current line 67) must be updated to `results[6]` — it reads the pipeline groupBy array. After inserting `activeCalls` at index 5, the groupBy is at index 6. Missing this causes `results[5]` (an integer) to be iterated as a pipeline array, silently breaking the pipeline display.

The cache key already includes the pipeline flag (`metrics:{tenantId}:0` / `metrics:{tenantId}:1`) so no cache key change is needed.

### `src/app/api/calls/webhook/route.js`

In `finishCall()`, after the existing `notifyAdvisorForCallLog` block, add three fire-and-forget calls:

```js
// In-app notification — fire-and-forget
createNotification(tenantId, {
  type: 'CALL_COMPLETED',
  title: 'Call completed',
  body: analysis.summary || `Call with customer ${customerId} has ended.`,
  link: '/admin/calls',
}).catch(() => {});

// Push SSE events — fire-and-forget
publishEvent(tenantId, { type: 'metrics:update' }).catch(() => {});
publishEvent(tenantId, { type: 'notification:new' }).catch(() => {});
publishEvent(tenantId, { type: 'call:status', payload: { status: mappedStatus } }).catch(() => {});
```

`tenantId` is available from `callLog.tenantId`. `mappedStatus` is already computed before this point in `finishCall`.

Import additions: `createNotification` from `@/lib/notifications/notification-service`, `publishEvent` from `@/lib/events/event-publisher`.

### `src/app/api/customers/route.js`

After the existing `invalidateCache(...)` calls on both POST success paths (reactivated archived customer + new customer creation), add:

```js
publishEvent(tenantId, { type: 'metrics:update' }).catch(() => {});
```

### `src/app/api/customers/[customerId]/route.js`

After `invalidateCache(...)` in the PATCH handler and the DELETE handler:

```js
publishEvent(tenantId, { type: 'metrics:update' }).catch(() => {});
```

### `src/app/api/customers/batch/route.js`

After `invalidateCache(...)` in both the `DELETE` (bulk archive) and `UPDATE_STATUS` paths:

```js
publishEvent(tenantId, { type: 'metrics:update' }).catch(() => {});
```

### `src/app/api/customers/delete-all/route.js`

After `invalidateCache(...)` before the success return:

```js
publishEvent(tenantId, { type: 'metrics:update' }).catch(() => {});
```

### `src/app/api/leads/upload/route.js`

This route performs bulk customer upserts and is the sixth customer-write path. It currently lacks `invalidateCache` (meaning cached dashboard metrics are already stale after uploads). Add both together after the upload loop completes successfully:

```js
invalidateCache(`metrics:${tenantId}:0`, `metrics:${tenantId}:1`).catch(() => {});
publishEvent(tenantId, { type: 'metrics:update' }).catch(() => {});
```

Import `invalidateCache` from `@/lib/cache/api-cache` and `publishEvent` from `@/lib/events/event-publisher`.

### `src/components/notifications/NotificationBell.js`

**Remove** the 60-second polling interval (lines 37–41):

```js
// Remove this entire effect:
useEffect(() => {
  fetchCount();
  const id = setInterval(fetchCount, 60000);
  return () => clearInterval(id);
}, [fetchCount]);
```

**Replace with:**

```js
// Initial fetch on mount
useEffect(() => { fetchCount(); }, [fetchCount]);

// Real-time push — refetch on new notification
useSSEEvent('notification:new', fetchCount);
```

`fetchCount` is already wrapped in `useCallback` so it is stable — safe to pass to `useSSEEvent` without causing re-registration loops.

### `src/components/modern/dashboard-view.js`

Two additions:

**1. Real-time metric refetch:**

Define a stable refetch callback and subscribe to both events:

```js
const refetchMetrics = useCallback(() => {
  // re-call the same fetch that populates dashboard metrics state
}, [/* same deps as initial fetch */]);

useSSEEvent('metrics:update', refetchMetrics);
useSSEEvent('call:status', refetchMetrics);
```

**2. Active Calls metric card:**

Add an "Active Calls" stat to the metrics grid alongside the existing cards, displaying `metrics.activeCalls`. Style consistently with existing `.ms-metrics` cards. Show `0` when undefined (graceful degradation).

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| Redis unavailable (publish) | `publishEvent` catches and discards — cache already invalidated, DB is source of truth |
| Redis unavailable (subscribe) | `createRedisSubscriber()` returns null; SSE route sends pings only; no events delivered |
| `createNotification` fails | `.catch(() => {})` — call completion not affected; notification silently skipped |
| EventSource network error | Browser auto-reconnects; singleton re-initializes on next mount cycle |
| SSE auth failure | 401/400 returned; EventSource will not retry on 4xx (correct behaviour) |
| DISABLE_REDIS=true | Full graceful degradation: no pub/sub, pings-only SSE stream, no events |
| Events missed during disconnect | Not recovered — events carry no `id:` field and the server maintains no buffer. Acceptable because all handlers trigger a fresh `fetch()` rather than applying an incremental diff. A missed event only delays the update until the next event arrives. If reliable delivery is ever needed, add `id:` fields and a short server-side event buffer. |

---

## Testing

**Unit — `event-publisher.ts`:**
- `publishEvent` with DISABLE_REDIS=true: no Redis client created, resolves silently
- `createRedisSubscriber()` with no Redis URL: returns null

**Unit — `useSSE.ts`:**
- Single EventSource created across multiple `useSSEEvent` calls
- Handler called when matching event type arrives
- Handler removed from listener set on unmount

**Integration — `GET /api/events`:**
- Unauthenticated request → 401
- Missing tenant → 400
- Authenticated: response has `Content-Type: text/event-stream`
- With DISABLE_REDIS: stream opens, sends pings, no error

**Regression — NotificationBell:**
- Verify `setInterval` no longer present
- Verify `useSSEEvent` is registered

---

## Files Changed

| File | Change |
|---|---|
| `src/lib/events/event-publisher.ts` | **New** — `publishEvent` + `createRedisSubscriber` |
| `src/app/api/events/route.ts` | **New** — SSE endpoint |
| `src/hooks/useSSE.ts` | **New** — singleton EventSource hook |
| `src/app/api/dashboard/metrics/route.js` | Add `activeCalls` to base metrics |
| `src/app/api/calls/webhook/route.js` | Add `createNotification` + `publishEvent` in `finishCall` |
| `src/app/api/customers/route.js` | Add `publishEvent` after `invalidateCache` |
| `src/app/api/customers/[customerId]/route.js` | Add `publishEvent` after `invalidateCache` |
| `src/app/api/customers/batch/route.js` | Add `publishEvent` after `invalidateCache` |
| `src/app/api/customers/delete-all/route.js` | Add `publishEvent` after `invalidateCache` |
| `src/app/api/leads/upload/route.js` | Add `invalidateCache` + `publishEvent` after upload loop |
| `src/components/notifications/NotificationBell.js` | Replace 60s polling with `useSSEEvent` |
| `src/components/modern/dashboard-view.js` | Add SSE subscriptions + active-calls stat |
