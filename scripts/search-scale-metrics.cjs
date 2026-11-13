const assert = require('node:assert/strict');
function percentile(values, proportion) {
  assert.ok(values.length > 0 && values.every(n => Number.isFinite(n) && n >= 0));
  assert.ok(proportion > 0 && proportion <= 1);
  const sorted = [...values].sort((a,b) => a-b);
  return sorted[Math.ceil(sorted.length * proportion)-1];
}
function summarize(samples, expectedCount, budgetMs = 1000) {
  const durations = samples.map(s => s.elapsedMs);
  const failures = samples.filter(s => !s.correct).length;
  const p95Ms = durations.length ? percentile(durations, 0.95) : null;
  return { samples: samples.length, expectedSamples: expectedCount, failures, p95Ms,
    maxMs: durations.length ? Math.max(...durations) : null, budgetMs,
    passed: samples.length === expectedCount && failures === 0 && p95Ms !== null && p95Ms <= budgetMs };
}
module.exports = { percentile, summarize };
