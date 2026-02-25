# Running Cron Locally

The cron automation is now configured for Vercel cloud deployment, but you can test it locally without deploying.

## Quick Start

### 1. Start the dev server (if not already running)
```bash
npm run dev
```

### 2. In a new terminal, run the local cron runner
```bash
# Simple: run once to test
node scripts/run-cron-local.js --once

# Or run in a loop every 5 minutes (default)
node scripts/run-cron-local.js

# Or customize interval (e.g., every 2 minutes)
node scripts/run-cron-local.js --interval=2
```

## Examples

### Test once with verbose output
```bash
node scripts/run-cron-local.js --once
```

Expected output (first time):
```
[cron-local] Starting AI Campaign Cron Runner
  Base URL: http://localhost:3000
  Interval: 5 minutes
  Auth: Disabled
  Mode: Run once

[2025-01-15T10:30:45.123Z] Calling http://localhost:3000/api/cron/ai-campaign... OK [queued=3, attempted=8]
```

### Run every 15 minutes with auth
```bash
node scripts/run-cron-local.js --interval=15 --secret=my-secret-key
```

### Check help
```bash
node scripts/run-cron-local.js --help
```

## Understanding Output

- **OK [queued=N, attempted=M]** - Batch ran successfully. N customers were queued, M were checked.
- **SKIPPED (interval_not_reached)** - Batch skipped because not enough time has passed since last run (respects `CRON_INTERVAL_MINUTES` env).
- **ERROR [status]** - API returned an error (check logs in dev server).
- **FAILED: message** - Network/connection error.

## Environment Variables

The runner respects these:

| Variable | Default | Purpose |
|---|---|---|
| `BASE_URL` | `http://localhost:3000` | Dev server URL |
| `CRON_SECRET` | (none) | Optional auth secret (from `.env`) |
| `CRON_INTERVAL_MINUTES` | `5` | Min minutes between actual executions (checked by the cron endpoint) |

Example:
```bash
CRON_SECRET="mykey" CRON_INTERVAL_MINUTES=10 node scripts/run-cron-local.js
```

## How It Works

1. **Script** calls `GET /api/cron/ai-campaign` every N minutes
2. **Cron endpoint** checks:
   - Auth header (`x-cron-secret` or Bearer token)
   - Database timestamp to enforce interval gate
   - If interval not met, returns `SKIPPED`
3. **If allowed**, runs batch:
   - Queries all active automations
   - For each customer, checks eligibility
   - Queues eligible ones for outreach
4. **Logs result** to dev server console + returns summary

## Debugging

Watch the dev server logs while running:
```bash
# Terminal 1: dev server with full logs
npm run dev

# Terminal 2: local cron runner
node scripts/run-cron-local.js --interval=1  # fast loop for testing
```

The dev server will show:
- Database queries
- Eligibility checks per customer
- Errors from invalid customer data
- Toast notifications in admin panel

## When You Deploy to Vercel

1. Make sure `.env` includes:
   ```
   CRON_SECRET="your-prod-secret"
   CRON_INTERVAL_MINUTES="5"
   ```

2. The Vercel cron will automatically call `/api/cron/ai-campaign` every 5 minutes as configured in `vercel.json`

3. The cron endpoint will use the same auth + interval logic as local testing

4. Check Vercel Function Logs in dashboard to see execution history

## Troubleshooting

### "Connection refused" error
- Dev server not running. Run `npm run dev` first.

### "AUTH_REDIRECT" or redirect loop  
- The cron endpoint requires `CRON_SECRET` if you've set one. Pass it:
  ```bash
  node scripts/run-cron-local.js --secret=your-secret
  ```

### "interval_not_reached" keeps showing
- You're calling too frequently. Wait until `CRON_INTERVAL_MINUTES` have passed, or increase the interval in the script:
  ```bash
  node scripts/run-cron-local.js --interval=1  # 1 minute
  ```

### Jobs not queuing
- Check automation is enabled: `SELECT * FROM AutomationSetting WHERE key = 'AI_CAMPAIGN_ENABLED'`
- Check daily cap: `SELECT daily_cap_reached_at FROM Automation WHERE id = '...'`
- Check customer eligibility in admin panel (Dashboard > Automation Settings)
