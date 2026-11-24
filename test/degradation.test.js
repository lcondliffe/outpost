require('./setup');
const { test, describe } = require('node:test');
const assert = require('node:assert');
const {
  STATES,
  evaluateDegradation,
  degradationMetrics,
  normalizePolicy,
} = require('../src/monitors/degradation');

// Synthetic, public-safe targets (RFC 5737 documentation addresses).
const A = { host: '192.0.2.10', name: 'Target A' };
const B = { host: '198.51.100.20', name: 'Target B' };
const C = { host: '203.0.113.30', name: 'Target C' };
const NOW = 1_800_000_000_000;
const MIN = 60_000;

// One check per minute for `count` minutes ending at NOW (newest first).
// lost(i) = packets lost in the check i minutes ago.
function checks(target, { count = 30, sent = 3, lost = () => 0, offset = 0 } = {}) {
  return Array.from({ length: count }, (_, k) => {
    const i = k + offset;
    return { timestamp: NOW - i * MIN, target: target.host, sent, received: sent - lost(i) };
  });
}

function evaluate(samples, extra = {}) {
  return evaluateDegradation({ samples, targets: [A, B], now: NOW, intervalMs: MIN, ...extra });
}

describe('policy defaults', () => {
  test('match the homelab rule: >5% over 30 min on 2 targets, no hysteresis', () => {
    const p = normalizePolicy();
    assert.strictEqual(p.windowMinutes, 30);
    assert.strictEqual(p.lossThresholdPercent, 5);
    assert.strictEqual(p.recoveryLossThresholdPercent, 5);
    assert.strictEqual(p.minTargets, 2);
  });

  test('a recovery threshold above the entry threshold is clamped to it', () => {
    assert.strictEqual(normalizePolicy({ lossThresholdPercent: 4, recoveryLossThresholdPercent: 9 }).recoveryLossThresholdPercent, 4);
  });
});

describe('evaluateDegradation', () => {
  test('healthy: full coverage, no loss', () => {
    const r = evaluate([...checks(A), ...checks(B)]);
    assert.strictEqual(r.state, 'healthy');
    assert.strictEqual(r.reason, 'loss_within_threshold');
    assert.strictEqual(r.coveredTargets, 2);
    assert.strictEqual(r.windowLossRatio, 0);
    assert.deepStrictEqual(r.targets.map((t) => [t.samples, t.coverage, t.stale]), [[30, 1, false], [30, 1, false]]);
  });

  test('partial loss counts even though every check got a reply', () => {
    // 1 of 3 packets lost in every check: each check is "alive", window loss is 33%.
    const r = evaluate([...checks(A, { lost: () => 1 }), ...checks(B, { lost: () => 1 })]);
    assert.strictEqual(r.state, 'degraded');
    assert.strictEqual(r.reason, 'loss_over_threshold');
    assert.ok(Math.abs(r.windowLossRatio - 1 / 3) < 1e-12);
  });

  test('exactly 5.0% loss is not degraded; just over is', () => {
    // 30 checks x 10 packets = 300 sent per target. 15 lost = 5.0%, 16 lost > 5%.
    const at = (n) => (i) => (i < n ? 1 : 0);
    const exact = evaluate([...checks(A, { sent: 10, lost: at(15) }), ...checks(B, { sent: 10, lost: at(15) })]);
    assert.strictEqual(exact.targets[0].lossRatio, 0.05);
    assert.strictEqual(exact.state, 'healthy');

    const over = evaluate([...checks(A, { sent: 10, lost: at(16) }), ...checks(B, { sent: 10, lost: at(16) })]);
    assert.strictEqual(over.state, 'degraded');
  });

  test('sustained loss on several targets is degraded', () => {
    const lossy = { lost: (i) => (i % 5 === 0 ? 2 : 0) }; // 12 of 90 packets = 13%
    const r = evaluateDegradation({
      samples: [...checks(A, lossy), ...checks(B, lossy), ...checks(C, lossy)],
      targets: [A, B, C], now: NOW, intervalMs: MIN,
    });
    assert.strictEqual(r.state, 'degraded');
    assert.strictEqual(r.degradedTargets, 3);
  });

  test('loss on a single target is not WAN degradation', () => {
    const r = evaluate([...checks(A, { lost: () => 3 }), ...checks(B)]);
    assert.strictEqual(r.state, 'healthy');
    assert.strictEqual(r.degradedTargets, 1);
    assert.strictEqual(r.targets[0].overThreshold, true);
  });

  test('a missing target means insufficient, not healthy', () => {
    const r = evaluate(checks(A));
    assert.strictEqual(r.state, 'insufficient');
    assert.strictEqual(r.reason, 'insufficient_coverage');
    assert.strictEqual(r.coveredTargets, 1);
    assert.strictEqual(r.targets[1].samples, 0);
    assert.strictEqual(r.targets[1].stale, true);
    assert.strictEqual(r.targets[1].lossRatio, null);
  });

  test('stale samples are insufficient, even when they showed heavy loss', () => {
    // Newest check 4 minutes old with 3-interval staleness; coverage itself is fine.
    const old = { offset: 4, count: 26, lost: () => 3 };
    const r = evaluate([...checks(A, old), ...checks(B, old)], { policy: { minCoverage: 0.5 } });
    assert.strictEqual(r.state, 'insufficient');
    assert.deepStrictEqual(r.targets.map((t) => t.stale), [true, true]);
  });

  test('samples outside the window, malformed counts and unconfigured targets are ignored', () => {
    const outside = { timestamp: NOW - 30 * MIN, target: A.host, sent: 3, received: 0 };
    const future = { timestamp: NOW + MIN, target: A.host, sent: 3, received: 0 };
    const bad = [
      { timestamp: NOW, target: A.host, sent: 3, received: 4 },
      { timestamp: NOW, target: A.host, sent: 0, received: 0 },
      { timestamp: NOW, target: A.host, sent: null, received: null },
    ];
    const removed = checks(C, { lost: () => 3 });
    const r = evaluate([...checks(A), ...checks(B), outside, future, ...bad, ...removed]);
    assert.strictEqual(r.state, 'healthy');
    assert.strictEqual(r.targets.length, 2);
    assert.strictEqual(r.targets[0].samples, 30);
  });

  test('too few configured targets, or ping disabled, is insufficient', () => {
    const single = evaluateDegradation({ samples: checks(A), targets: [A], now: NOW, intervalMs: MIN });
    assert.deepStrictEqual([single.state, single.reason], ['insufficient', 'too_few_targets']);

    const off = evaluate([...checks(A), ...checks(B)], { pingEnabled: false });
    assert.deepStrictEqual([off.state, off.reason], ['insufficient', 'ping_disabled']);

    const relaxed = evaluateDegradation({
      samples: checks(A, { lost: () => 1 }), targets: [A], now: NOW, intervalMs: MIN, policy: { minTargets: 1 },
    });
    assert.strictEqual(relaxed.state, 'degraded');
  });

  test('startup: decides as soon as coverage is reached, with no extra 30-minute wait', () => {
    // 90% coverage of 30 expected checks = 27. Lossy from the first check.
    const lossy = { lost: () => 1 };
    const early = evaluate([...checks(A, { ...lossy, count: 26 }), ...checks(B, { ...lossy, count: 26 })]);
    assert.strictEqual(early.state, 'insufficient');

    // 27 checks: the first one was 26 minutes ago.
    const ready = evaluate([...checks(A, { ...lossy, count: 27 }), ...checks(B, { ...lossy, count: 27 })]);
    assert.strictEqual(ready.state, 'degraded');

    const healthy = evaluate([...checks(A, { count: 27 }), ...checks(B, { count: 27 })]);
    assert.strictEqual(healthy.state, 'healthy');
  });

  test('coverage follows the configured interval', () => {
    // 300 s interval: 6 expected checks in 30 minutes, 90% needs 6 (5.4 rounded up by >=).
    const every5 = (t, count) => Array.from({ length: count }, (_, i) => (
      { timestamp: NOW - i * 5 * MIN, target: t.host, sent: 3, received: 3 }));
    const r5 = evaluateDegradation({ samples: [...every5(A, 6), ...every5(B, 5)], targets: [A, B], now: NOW, intervalMs: 5 * MIN });
    assert.strictEqual(r5.targets[0].expectedSamples, 6);
    assert.strictEqual(r5.state, 'insufficient');
    const r6 = evaluateDegradation({ samples: [...every5(A, 6), ...every5(B, 6)], targets: [A, B], now: NOW, intervalMs: 5 * MIN });
    assert.strictEqual(r6.state, 'healthy');
  });

  test('flapping: one bad check does not flip a healthy window', () => {
    const spike = { lost: (i) => (i === 0 ? 3 : 0) }; // 3 of 90 = 3.3%
    const r = evaluate([...checks(A, spike), ...checks(B, spike)]);
    assert.strictEqual(r.state, 'healthy');
  });

  test('recovery: leaves degraded once window loss is back at or under the threshold', () => {
    // A burst that is ageing out of the window. Losses at i in [lo, hi).
    const burst = (lo, hi) => ({ lost: (i) => (i >= lo && i < hi ? 3 : 0) });
    const during = evaluate([...checks(A, burst(20, 30)), ...checks(B, burst(20, 30))]); // 30 of 90
    assert.strictEqual(during.state, 'degraded');
    const later = evaluate([...checks(A, burst(28, 30)), ...checks(B, burst(28, 30))], { previousState: 'degraded' }); // 6 of 90 = 6.7%
    assert.strictEqual(later.state, 'degraded');
    const recovered = evaluate([...checks(A, burst(29, 30)), ...checks(B, burst(29, 30))], { previousState: 'degraded' }); // 3.3%
    assert.strictEqual(recovered.state, 'healthy');
  });

  test('optional hysteresis holds degraded between the recovery and entry thresholds', () => {
    const policy = { lossThresholdPercent: 5, recoveryLossThresholdPercent: 2 };
    const fourPct = { sent: 10, lost: (i) => (i < 12 ? 1 : 0) }; // 12 of 300 = 4%
    const samples = [...checks(A, fourPct), ...checks(B, fourPct)];
    assert.strictEqual(evaluate(samples, { policy, previousState: 'healthy' }).state, 'healthy');
    assert.strictEqual(evaluate(samples, { policy, previousState: 'degraded' }).state, 'degraded');
    // Insufficient data resets the hold: hysteresis only continues an unbroken degraded run.
    assert.strictEqual(evaluate(samples, { policy, previousState: 'insufficient' }).state, 'healthy');

    const onePct = { sent: 10, lost: (i) => (i < 3 ? 1 : 0) }; // 1%
    assert.strictEqual(evaluate([...checks(A, onePct), ...checks(B, onePct)], { policy, previousState: 'degraded' }).state, 'healthy');
  });

  test('an active outage always wins', () => {
    const clean = evaluate([...checks(A), ...checks(B)], { activeOutage: true });
    assert.deepStrictEqual([clean.state, clean.reason], ['outage', 'active_outage']);
    const empty = evaluate([], { activeOutage: true });
    assert.strictEqual(empty.state, 'outage');
  });
});

describe('degradationMetrics', () => {
  test('one state series per state, exactly one set, bounded labels', () => {
    const status = evaluate([...checks(A, { lost: () => 1 }), ...checks(B, { lost: () => 1 })]);
    const series = degradationMetrics(status);
    const byName = Object.fromEntries(series.map((s) => [s.name, s]));

    const stateSeries = byName.outpost_wan_degradation_state.samples;
    assert.deepStrictEqual(stateSeries.map((s) => s.labels.state), STATES);
    assert.deepStrictEqual(stateSeries.filter((s) => s.value === 1).map((s) => s.labels.state), ['degraded']);

    assert.ok(Math.abs(byName.outpost_wan_window_loss_ratio.samples[0].value - 1 / 3) < 1e-12);
    assert.strictEqual(byName.outpost_wan_window_covered_targets.samples[0].value, 2);
    assert.strictEqual(byName.outpost_wan_window_seconds.samples[0].value, 1800);
    assert.strictEqual(byName.outpost_wan_loss_threshold_ratio.samples[0].value, 0.05);

    for (const name of ['outpost_ping_window_loss_ratio', 'outpost_ping_window_coverage_ratio']) {
      const samples = byName[name].samples;
      assert.strictEqual(samples.length, 2);
      for (const s of samples) assert.deepStrictEqual(Object.keys(s.labels).sort(), ['name', 'target']);
    }
    for (const s of series) {
      assert.match(s.name, /^outpost_[a-z_]+$/);
      assert.strictEqual(s.type, 'gauge');
      for (const sample of s.samples) assert.ok(Number.isFinite(sample.value));
    }
  });

  test('loss ratios are omitted, not reported as 0, when there is no data', () => {
    const series = degradationMetrics(evaluate([]));
    const byName = Object.fromEntries(series.map((s) => [s.name, s]));
    assert.deepStrictEqual(byName.outpost_wan_window_loss_ratio.samples, []);
    assert.deepStrictEqual(byName.outpost_ping_window_loss_ratio.samples, []);
    assert.deepStrictEqual(byName.outpost_ping_window_coverage_ratio.samples.map((s) => s.value), [0, 0]);
    assert.strictEqual(byName.outpost_wan_degradation_state.samples.find((s) => s.value === 1).labels.state, 'insufficient');
  });
});
