# AI Campaign Cron Setup and Alternatives

## Purpose
This document explains the current cron-based AI campaign runtime, expected status behavior (including `SKIPPED` and `attemptsMade`), and alternative execution models if scale changes.

## Current Setup (What runs today)

### Runtime pieces
- Next.js app (admin controls + APIs)
- Cron endpoint trigger: `GET /api/cron/ai-campaign`
- Shared batch runner: `src/lib/journey/automation-runner.js`
- Postgres (Prisma): source of truth for campaign jobs, settings, and customer state

### Main files
- Cron route: `src/app/api/cron/ai-campaign/route.js`
- Batch runner: `src/lib/journey/automation-runner.js`
- Manual run API: `src/app/api/calls/automation/run/route.js`
- Health API: `src/app/api/calls/automation/health/route.js`
- Jobs API: `src/app/api/calls/automation/jobs/route.js`
- Schedule config: `vercel.json`

## Data model summary

### Campaign job statuses
`CampaignJobStatus` enum:
- `QUEUED`
- `ACTIVE`
- `COMPLETED`
- `FAILED`
- `SKIPPED`

### Relevant fields in `CampaignJob`
- `queueJobId` (logical job identity used by the app)
- `status`
- `attemptsMade`
- `reason`
- `result` (JSON details for skip/failure context)
- timestamps: `enqueuedAt`, `startedAt`, `completedAt`, `failedAt`

## End-to-end flow
1. Cron (or manual run) triggers automation batch execution.
2. Batch runner loads active automation settings and eligible customers.
3. Eligible records are processed and job rows are persisted.
4. Job lifecycle updates status to `SKIPPED`, `COMPLETED`, or `FAILED` as appropriate.
5. Cron state (`AI_CAMPAIGN_CRON_STATE`) tracks `lastRunAt` for interval gating and health status.

## Health model
- Health endpoint now reports cron scheduler status from DB state.
- `schedulerOnline` is based on recent `lastRunAt` vs configured interval window.
- Job counts are derived from `campaignJob` grouped by status.

## Why attempts can show 0
- `attemptsMade` reflects retry history, not a human-friendly run counter.
- First successful processing path often remains `0`.
- If a user-facing attempt number is needed, display `attemptsMade + 1`.

## Operational notes
- Local run: `node scripts/run-cron-local.js --once`
- Continuous local schedule: `node scripts/run-cron-local.js --interval=5`
- Optional auth: set `CRON_SECRET` and pass bearer/header secret.
- Runtime interval guard: `CRON_INTERVAL_MINUTES`.

## Alternatives

### 1) Postgres-native polling loop
- Claim and process jobs with SQL locking (`FOR UPDATE SKIP LOCKED`).
- Best when you want no external queue infra and strict DB-only control.

### 2) pg-boss (Postgres-backed queue)
- Queue features (retry/scheduling) on top of Postgres.
- Best when you need richer queue semantics without Redis.

### 3) Managed cloud queue + stateless processors
- Queue service (e.g., SQS) with independent processing layer.
- Best when throughput and reliability requirements become high.

### 4) Workflow engine (Temporal)
- Durable orchestration for complex multi-step journeys.
- Best when flows become long-running with branching and compensations.

## Recommendation
- Keep current cron-first runtime for low-to-moderate volume.
- Move to a queue/workflow engine only when batch duration or concurrency requirements exceed serverless cron constraints.
