#!/usr/bin/env node

/**
 * Local cron runner for AI campaign automation.
 * 
 * Usage:
 *   node scripts/run-cron-local.js [--interval=5] [--once]
 * 
 * Options:
 *   --interval=N   : Run every N minutes (default 5)
 *   --once         : Run once and exit (default: run forever)
 *   --help         : Show this message
 */

const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

async function main() {
  const args = process.argv.slice(2);
  let intervalMinutes = 5;
  let runOnce = false;
  let baseUrl = process.env.BASE_URL || 'http://localhost:3000';
  let cronSecret = process.env.CRON_SECRET || '';

  for (const arg of args) {
    if (arg === '--help') {
      console.log(`
Local Cron Runner for AI Campaign Automation

Usage:
  node scripts/run-cron-local.js [options]

Options:
  --interval=N    Run every N minutes (default 5, max 1440)
  --once          Run once and exit (default: run forever)
  --url=<url>     Base URL (default: http://localhost:3000)
  --secret=<s>    CRON_SECRET for auth (default: env.CRON_SECRET)
  --help          Show this message

Examples:
  # Run every 5 minutes in a loop
  node scripts/run-cron-local.js

  # Run every 15 minutes
  node scripts/run-cron-local.js --interval=15

  # Run once with auth
  node scripts/run-cron-local.js --once --secret=my-secret

  # Run with custom URL
  node scripts/run-cron-local.js --url=http://localhost:3001 --once
      `);
      process.exit(0);
    }
    if (arg.startsWith('--interval=')) {
      const val = Number(arg.split('=')[1]);
      if (!Number.isNaN(val) && val > 0) {
        intervalMinutes = Math.min(val, 1440);
      }
    }
    if (arg === '--once') {
      runOnce = true;
    }
    if (arg.startsWith('--url=')) {
      baseUrl = arg.split('=')[1];
    }
    if (arg.startsWith('--secret=')) {
      cronSecret = arg.split('=')[1];
    }
  }

  console.log(`[cron-local] Starting AI Campaign Cron Runner`);
  console.log(`  Base URL: ${baseUrl}`);
  console.log(`  Interval: ${intervalMinutes} minutes`);
  console.log(`  Auth: ${cronSecret ? 'Enabled (Bearer token)' : 'Disabled'}`);
  console.log(`  Mode: ${runOnce ? 'Run once' : 'Run forever'}`);
  console.log();

  const run = async () => {
    const url = `${baseUrl}/api/cron/ai-campaign`;
    const headers = {
      'Content-Type': 'application/json',
    };

    if (cronSecret) {
      headers['Authorization'] = `Bearer ${cronSecret}`;
    }

    const timestamp = new Date().toISOString();
    process.stdout.write(`[${timestamp}] Calling ${url}... `);

    try {
      const response = await fetch(url, { headers, method: 'GET' });
      const data = await response.json();

      if (response.ok) {
        if (data.skipped) {
          console.log(`SKIPPED (${data.reason})`);
        } else {
          const queued = data.queued || 0;
          const attempted = data.attempted || 0;
          console.log(`OK [queued=${queued}, attempted=${attempted}]`);
        }
      } else {
        console.log(`ERROR [${response.status}] ${data.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.log(`FAILED: ${error.message}`);
    }
  };

  await run();

  if (runOnce) {
    process.exit(0);
  }

  const intervalMs = intervalMinutes * 60 * 1000;
  console.log(`\n[cron-local] Waiting ${intervalMinutes} minutes until next run...`);
  setInterval(run, intervalMs);
}

main().catch((error) => {
  console.error('[cron-local] Fatal error:', error.message);
  process.exit(1);
});
