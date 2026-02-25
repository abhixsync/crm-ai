# AI Campaign Worker Setup and Alternatives

## Purpose
This document explains the current AI campaign worker architecture in this project, why some behavior (like attempts showing `0`) is expected, and practical alternatives if this setup is not a good fit.

## Current Setup (What runs today)

### Runtime pieces
- Web app (Next.js): handles admin controls and enqueue APIs.
- Queue producer: enqueues jobs in BullMQ.
- Worker process: consumes queue jobs and executes campaign calls.
- Redis: backing store for BullMQ queue state.
- Postgres (Prisma): system of record for campaign jobs, customer state, call logs, and settings.

### Main files
- Queue config and enqueue: `src/lib/queue/ai-campaign-queue.js`
- Eligibility + enqueue orchestration: `src/lib/journey/enqueue-service.js`
- Worker: `src/workers/ai-campaign-worker.js`
- Automation settings read/write: `src/lib/journey/automation-settings.js`
- Automation APIs:
  - `src/app/api/automation/toggle/route.js`
  - `src/app/api/calls/automation/run/route.js`
  - `src/app/api/calls/automation/jobs/route.js`
  - `src/app/api/calls/automation/health/route.js`
- Campaign job model + status enum: `prisma/schema.prisma`
- Worker start script: `package.json` (`worker:ai-campaign`)

## Data model summary

### Campaign job statuses
`CampaignJobStatus` enum:
- `QUEUED`
- `ACTIVE`
- `COMPLETED`
- `FAILED`
- `SKIPPED`

### Relevant fields in `CampaignJob`
- `queueJobId` (unique queue identity)
- `status`
- `attemptsMade`
- `reason` (enqueue reason)
- `result` (JSON payload including skip/failure details)
- timestamps: `enqueuedAt`, `startedAt`, `completedAt`, `failedAt`

## End-to-end flow
1. Admin enables automation / triggers batch from UI.
2. `POST /api/calls/automation/run` fetches eligible customers within working-hours and daily-cap constraints.
3. `enqueueCustomerIfEligible(...)` validates eligibility and enqueues BullMQ jobs.
4. Campaign jobs are upserted in DB as `QUEUED`.
5. Worker picks a job, marks `ACTIVE`, executes business checks, then:
   - marks `SKIPPED` for expected business-rule skips,
   - marks `COMPLETED` on success,
   - marks `FAILED` on execution failure.
6. Worker heartbeat is written to `automationSetting` key `AI_CAMPAIGN_WORKER_HEARTBEAT` for health monitoring.

## Why attempts show 0
This is expected in the current configuration:
- Queue default is `attempts: 1` in `src/lib/queue/ai-campaign-queue.js`.
- BullMQ `job.attemptsMade` is number of failed attempts before the current run.
- First run therefore has `attemptsMade = 0`.
- With no retries configured (`attempts: 1`), most jobs stay at `0` forever.

If you want human-facing attempt numbers, display `attemptsMade + 1`.

## Current strengths
- Clear separation of API, queueing, and worker execution.
- Durable campaign job audit trail in Postgres.
- Business-rule skip reasons captured in `result.reason`.
- Health endpoint with queue counts and worker heartbeat.

## Current pain points / limitations
- Requires Redis + separate worker process to operate reliably.
- More moving parts for local/dev and deployment.
- Retry semantics can be confusing (`attemptsMade` behavior).
- Potential dual-write complexity (queue state in Redis, business state in Postgres).

## Alternatives

## 1) Postgres-native DB polling worker (no Redis)
Use only Postgres as queue store (`campaignJob` rows as pending work), with one or more worker loops selecting jobs using row locks.

How it works:
- Insert `QUEUED` jobs in DB.
- Worker repeatedly claims jobs with SQL locking (`FOR UPDATE SKIP LOCKED` pattern), sets `ACTIVE`, processes, then updates to terminal status.

Pros:
- Removes Redis dependency.
- Single source of truth (Postgres only).
- Easier local/dev footprint.

Cons:
- You must implement scheduling, retries, and backoff yourself.
- Throughput/scaling needs careful query and lock design.

Best for:
- Teams wanting fewer infra components and moderate queue volume.

## 2) pg-boss (Postgres-backed queue library)
Replace BullMQ with pg-boss, which uses Postgres internally.

Pros:
- Removes Redis while keeping queue abstractions.
- Built-in retries, scheduling, and job lifecycle.
- Good fit since app already depends on Postgres.

Cons:
- Library migration effort from BullMQ API.
- Different operational behavior than BullMQ.

Best for:
- Teams that want queue features without Redis ops.

## 3) Managed cloud queue + stateless workers
Use managed queue services (e.g., AWS SQS + worker) and keep Postgres for campaign state.

Pros:
- High reliability and scalability.
- Offloads queue ops to cloud provider.

Cons:
- Vendor coupling and cloud-specific setup.
- More deployment/permissions complexity.

Best for:
- Production systems needing higher scale and reliability guarantees.

## 4) Workflow engine (Temporal / similar)
Model each campaign execution as a workflow with durable state/retries.

Pros:
- Strong retry/state management and observability.
- Good for complex long-running orchestrations.

Cons:
- Highest complexity and adoption cost.

Best for:
- Complex multi-step automations beyond simple queue jobs.

## Recommendation paths

### Path A (least infra): Move to Postgres-native queueing
Good when Redis and separate worker process are the main pain.

Migration outline:
1. Keep `CampaignJob` as source of work.
2. Replace BullMQ enqueue with DB insert/upsert (`QUEUED`).
3. Add worker claim query with row locking.
4. Preserve existing `SKIPPED/FAILED/COMPLETED` transitions.
5. Keep existing health endpoint, change queue metrics source to DB counts.

### Path B (balanced): Move to pg-boss
Good when you still want queue features (retry/schedule) but no Redis.

Migration outline:
1. Introduce pg-boss setup.
2. Replace `enqueueAICampaignJob` implementation.
3. Replace BullMQ worker with pg-boss handlers.
4. Keep current Prisma `CampaignJob` writes for reporting compatibility.

## Operational checklist (current setup)
- Start app: `npm run dev`
- Start worker separately: `npm run worker:ai-campaign`
- Ensure Redis is reachable (`REDIS_HOST`, `REDIS_PORT`, optional `REDIS_PASSWORD`).
- Ensure DB is reachable (`DATABASE_URL`).
- Monitor:
  - `/api/calls/automation/health`
  - `/api/calls/automation/jobs`

## Notes on status semantics
- `SKIPPED` = expected business-rule skip, not an execution error.
- `FAILED` = execution attempted and failed.
- `attemptsMade` reflects retry history, not human attempt number.

## If you decide to migrate
Keep the `CampaignJob` schema and status contract stable first, then replace queue internals. This minimizes UI/API changes and makes rollback easier.