/*
 * Stress test for timeline and amount extraction signals.
 * Run: node scripts/tests/stress-timeline-signal.cjs
 */

(async () => {
  const { detectIntent, extractLoanDetails } = await import('../../src/modules/loan-assistant/intent-detector.js');

  const runs = Number.parseInt(process.env.STRESS_RUNS || '120', 10);

  const checks = [
    () => extractLoanDetails('Need loan by tomorrow').timeline === 'immediate',
    () => detectIntent('Need loan by tomorrow').intent === 'interested',
    () => extractLoanDetails('Need this within one week').timeline === 'within_week',
    () => extractLoanDetails('I need 50 lacs').amount === 5000000,
    () => extractLoanDetails('loan amount is 50000, today').amount === 50000,
  ];

  let failures = 0;
  let totalChecks = 0;

  for (let index = 0; index < runs; index += 1) {
    for (const check of checks) {
      totalChecks += 1;
      if (!check()) {
        failures += 1;
      }
    }
  }

  const summary = {
    script: 'stress-timeline-signal',
    runs,
    checksPerRun: checks.length,
    totalChecks,
    failures,
    passed: failures === 0,
  };

  console.log(JSON.stringify(summary, null, 2));
  if (failures > 0) {
    process.exit(1);
  }
})();
