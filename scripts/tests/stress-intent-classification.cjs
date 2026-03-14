/*
 * Stress test for loan intent classification.
 * Run: node scripts/tests/stress-intent-classification.cjs
 */

(async () => {
  const { detectIntent } = await import('../../src/modules/loan-assistant/intent-detector.js');

  const runs = Number.parseInt(process.env.STRESS_RUNS || '120', 10);
  const scenarios = [
    { message: 'sure', expected: 'interested' },
    { message: 'home loan', expected: 'interested' },
    { message: 'not interested', expected: 'not_interested' },
    { message: 'call back later', expected: 'call_back_later' },
    { message: "it's quite late for a call", expected: 'call_back_later' },
    { message: 'call me after 10 please', expected: 'call_back_later', expectedCallbackTime: 'after 10' },
    { message: '10 baje ke baad call karna', expected: 'call_back_later', expectedCallbackTime: 'after 10' },
    { message: 'abhi nahi, subah call karna', expected: 'call_back_later', expectedCallbackTime: 'tomorrow morning' },
    { message: 'कल सुबह कॉल करना', expected: 'call_back_later', expectedCallbackTime: 'tomorrow morning' },
    { message: 'कल शाम बात करना', expected: 'call_back_later', expectedCallbackTime: 'tomorrow evening' },
    { message: 'dont call me', expected: 'do_not_call' },
    { message: 'I need this by tomorrow', expected: 'interested' },
  ];

  let failures = 0;
  let totalChecks = 0;
  const failureSamples = [];

  for (let index = 0; index < runs; index += 1) {
    for (const scenario of scenarios) {
      totalChecks += 1;
      const result = detectIntent(scenario.message);
      if (result.intent !== scenario.expected) {
        failures += 1;
        if (failureSamples.length < 10) {
          failureSamples.push({
            message: scenario.message,
            expectedIntent: scenario.expected,
            actualIntent: result.intent,
            actualCallbackTime: result?.details?.callbackTime || null,
          });
        }
        continue;
      }

      if (
        scenario.expectedCallbackTime &&
        result?.details?.callbackTime !== scenario.expectedCallbackTime
      ) {
        failures += 1;
        if (failureSamples.length < 10) {
          failureSamples.push({
            message: scenario.message,
            expectedIntent: scenario.expected,
            actualIntent: result.intent,
            expectedCallbackTime: scenario.expectedCallbackTime,
            actualCallbackTime: result?.details?.callbackTime || null,
          });
        }
      }
    }
  }

  const summary = {
    script: 'stress-intent-classification',
    runs,
    scenarios: scenarios.length,
    totalChecks,
    failures,
    passed: failures === 0,
    failureSamples,
  };

  console.log(JSON.stringify(summary, null, 2));
  if (failures > 0) {
    process.exit(1);
  }
})();
