require('./setup');
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const db = require('../src/storage/database');
const { updateConfig, reloadConfig } = require('../src/config');
const { packetCounts } = require('../src/monitors/ping');
const { checkOutageConditions, getOutageStatus, resetCounters } = require('../src/monitors/outage');
const {
  getDegradationStatus, advanceDegradationState, resetDegradationState,
} = require('../src/monitors/degradation');

const A = { host: '192.0.2.10', name: 'Target A' };
const B = { host: '198.51.100.20', name: 'Target B' };
const MIN = 60_000;
let now = 1_800_000_000_000;

test.mock.method(console, 'log', () => {});

before(() => {
  updateConfig({ monitors: { ping: { targets: [A, B], intervalSeconds: 60 } } });
  reloadConfig();
});
beforeEach(() => {
  // Each test gets its own stretch of time, so earlier rows fall out of the window.
  now += 24 * 60 * MIN;
  resetDegradationState();
  resetCounters();
});
after(() => db.close());

function store(target, i, { sent = 3, received = 3, success = true, counts = true } = {}) {
  db.insertPing({
    timestamp: now - i * MIN, target: target.host, targetName: target.name,
    rttMin: 10, rttAvg: 11, rttMax: 12,
    packetLoss: (100 * (sent - received)) / sent, success,
    packetsSent: counts ? sent : null, packetsReceived: counts ? received : null,
  });
}

test('packetCounts reads the ping summary line (iputils and busybox)', () => {
  assert.deepStrictEqual(
    packetCounts({ output: '3 packets transmitted, 2 received, 33.3333% packet loss, time 2003ms', packetLoss: '33.333' }, 3),
    { packetsSent: 3, packetsReceived: 2 });
  assert.deepStrictEqual(
    packetCounts({ output: '5 packets transmitted, 5 packets received, 0% packet loss', packetLoss: '0.000' }, 3),
    { packetsSent: 5, packetsReceived: 5 });
});

test('packetCounts falls back to loss x packet count, else unknown', () => {
  assert.deepStrictEqual(packetCounts({ output: 'unknown', packetLoss: '33.333' }, 3), { packetsSent: 3, packetsReceived: 2 });
  assert.deepStrictEqual(packetCounts({ output: 'unknown', packetLoss: 'unknown' }, 3), { packetsSent: null, packetsReceived: null });
  // An impossible summary is ignored rather than trusted.
  assert.deepStrictEqual(
    packetCounts({ output: '3 packets transmitted, 4 received', packetLoss: 'unknown' }, 3),
    { packetsSent: null, packetsReceived: null });
});

test('the migration adds nullable packet count columns', () => {
  const cols = db.db.prepare('PRAGMA table_info(ping_results)').all().map((c) => c.name);
  assert.ok(cols.includes('packets_sent'));
  assert.ok(cols.includes('packets_received'));
});

test('partial loss on checks marked alive is degraded, from stored counts', () => {
  for (let i = 0; i < 30; i++) {
    store(A, i, { received: 2, success: true });
    store(B, i, { received: 2, success: true });
  }
  const status = getDegradationStatus(now);
  assert.strictEqual(status.state, 'degraded');
  assert.strictEqual(status.coveredTargets, 2);
  assert.ok(Math.abs(status.windowLossRatio - 1 / 3) < 1e-12);
});

test('rows without packet counts (written before the upgrade) are not counted as healthy', () => {
  for (let i = 0; i < 30; i++) {
    store(A, i, { counts: false });
    store(B, i, { counts: false });
  }
  const status = getDegradationStatus(now);
  assert.deepStrictEqual([status.state, status.reason], ['insufficient', 'insufficient_coverage']);
});

test('status output shape is stable', () => {
  for (let i = 0; i < 30; i++) {
    store(A, i);
    store(B, i);
  }
  const status = getDegradationStatus(now);
  assert.strictEqual(status.state, 'healthy');
  assert.deepStrictEqual(Object.keys(status).sort(), [
    'coveredTargets', 'degradedTargets', 'evaluatedAt', 'lossThresholdPercent', 'minCoverage', 'minTargets',
    'reason', 'recoveryLossThresholdPercent', 'state', 'targets', 'windowLossRatio', 'windowSeconds',
  ]);
  assert.deepStrictEqual(Object.keys(status.targets[0]).sort(), [
    'coverage', 'covered', 'expectedSamples', 'lastSampleAt', 'lossRatio', 'name', 'overThreshold', 'received',
    'samples', 'sent', 'stale', 'target',
  ]);
  assert.deepStrictEqual(status.targets.map((t) => t.target), [A.host, B.host]);
});

test('outage precedence and the existing outage state machine are unchanged', () => {
  for (let i = 0; i < 30; i++) {
    store(A, i);
    store(B, i);
  }
  const fail = [{ success: false }];
  const ok = [{ success: true }];
  checkOutageConditions(fail, ok);
  checkOutageConditions(fail, ok);
  const started = checkOutageConditions(fail, ok);
  assert.strictEqual(started.action, 'started');
  assert.deepStrictEqual(Object.keys(getOutageStatus()).sort(),
    ['activeOutage', 'consecutivePingFailures', 'consecutivePingSuccesses', 'inOutage']);
  assert.strictEqual(getDegradationStatus(now).state, 'outage');

  checkOutageConditions(ok, ok);
  assert.strictEqual(checkOutageConditions(ok, ok).action, 'ended');
  // Back to the window decision once the outage ends (clean data here).
  assert.strictEqual(getDegradationStatus(now).state, 'healthy');
});

test('hysteresis state is advanced by the scheduler path only', () => {
  updateConfig({ degradation: { recoveryLossThresholdPercent: 2 } });
  reloadConfig();
  try {
    // 4% window loss (12 of 300 packets): under the 5% entry threshold, over 2% recovery.
    const fourPct = (from) => {
      for (let k = 0; k < 30; k++) {
        const received = k < 12 ? 9 : 10;
        store(A, from + k, { sent: 10, received });
        store(B, from + k, { sent: 10, received });
      }
    };
    fourPct(0);
    assert.strictEqual(advanceDegradationState(now).state, 'healthy');

    // One heavy check on both targets a minute later tips the window over 5%.
    store(A, -1, { sent: 10, received: 0 });
    store(B, -1, { sent: 10, received: 0 });
    assert.strictEqual(advanceDegradationState(now + MIN).state, 'degraded');

    // Thirty minutes on, the heavy check has aged out and the window is back to 4%:
    // still degraded, because 4% is over the 2% recovery threshold.
    fourPct(-31);
    const t2 = now + 31 * MIN;
    assert.strictEqual(getDegradationStatus(t2).state, 'degraded');
    assert.strictEqual(advanceDegradationState(t2).state, 'degraded');
    // Without the remembered state the same window is healthy.
    resetDegradationState();
    assert.strictEqual(getDegradationStatus(t2).state, 'healthy');
  } finally {
    updateConfig({ degradation: { recoveryLossThresholdPercent: null } });
    reloadConfig();
  }
});

test('API reads are side-effect free: repeated GETs never change the outcome', () => {
  updateConfig({ degradation: { recoveryLossThresholdPercent: 2 } });
  reloadConfig();
  try {
    // Scheduler: a heavy window makes the state degraded and remembers it.
    for (let k = 0; k < 30; k++) {
      store(A, k, { sent: 10, received: k < 12 ? 7 : 10 }); // 36 of 300 = 12%
      store(B, k, { sent: 10, received: k < 12 ? 7 : 10 });
    }
    assert.strictEqual(advanceDegradationState(now).state, 'degraded');

    // Later, the window is 4%: held degraded by hysteresis (2% recovery threshold).
    for (let k = 0; k < 30; k++) {
      store(A, -31 + k, { sent: 10, received: k < 12 ? 9 : 10 });
      store(B, -31 + k, { sent: 10, received: k < 12 ? 9 : 10 });
    }
    const t2 = now + 31 * MIN;
    const first = getDegradationStatus(t2);
    assert.strictEqual(first.state, 'degraded');

    // Reads that would decide differently (no data far in the future: insufficient)
    // must not reset the remembered state for later reads.
    for (let i = 0; i < 5; i++) {
      assert.strictEqual(getDegradationStatus(t2 + 24 * 60 * MIN).state, 'insufficient');
      assert.deepStrictEqual(getDegradationStatus(t2), first);
    }
  } finally {
    updateConfig({ degradation: { recoveryLossThresholdPercent: null } });
    reloadConfig();
  }
});
