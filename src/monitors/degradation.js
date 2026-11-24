// Partial WAN degradation from stored ping packet counts (AGT-422).
//
// evaluateDegradation() is a pure function: same samples, policy and clock in,
// same decision out. It sends nothing; it only reads ping checks the ping
// monitor already stored. getDegradationStatus() wires it to the database,
// config and the existing outage state machine.
//
// States:
//   outage       an outage is active in the existing outage state machine
//                (that logic is unchanged and always wins)
//   insufficient fewer than `minTargets` targets have fresh, well-covered
//                samples in the window; absent or stale data is never healthy
//   degraded     at least `minTargets` covered targets each lost MORE than
//                `lossThresholdPercent` of packets over the window
//   healthy      otherwise

const STATES = ['healthy', 'degraded', 'outage', 'insufficient'];

const DEFAULT_POLICY = {
  windowMinutes: 30,
  lossThresholdPercent: 5,
  // null = same as lossThresholdPercent (no hysteresis).
  recoveryLossThresholdPercent: null,
  minTargets: 2,
  minCoverage: 0.9,
  staleAfterIntervals: 3,
};

function normalizePolicy(raw = {}) {
  const policy = { ...DEFAULT_POLICY };
  for (const key of Object.keys(DEFAULT_POLICY)) {
    if (raw[key] !== undefined && raw[key] !== null) policy[key] = raw[key];
  }
  // The recovery threshold can never be above the entry threshold: clamp it.
  if (policy.recoveryLossThresholdPercent == null || policy.recoveryLossThresholdPercent > policy.lossThresholdPercent) {
    policy.recoveryLossThresholdPercent = policy.lossThresholdPercent;
  }
  return policy;
}

// lost/sent > threshold%, in exact arithmetic on integer counts so a window at
// exactly the threshold (e.g. 3 of 60 = 5%) is never pushed over by float error.
function lossExceeds(lost, sent, thresholdPercent) {
  return sent > 0 && lost * 100 > thresholdPercent * sent;
}

/**
 * @param {object} input
 * @param {Array<{timestamp:number,target:string,sent:number,received:number}>} input.samples
 * @param {Array<{host:string,name?:string}>} input.targets configured ping targets
 * @param {number} input.now unix ms
 * @param {number} input.intervalMs configured ping interval
 * @param {object} [input.policy]
 * @param {boolean} [input.activeOutage]
 * @param {string|null} [input.previousState] last decision, for recovery hysteresis
 * @param {boolean} [input.pingEnabled]
 */
function evaluateDegradation({
  samples = [],
  targets = [],
  now,
  intervalMs,
  policy: rawPolicy,
  activeOutage = false,
  previousState = null,
  pingEnabled = true,
}) {
  const policy = normalizePolicy(rawPolicy);
  const windowMs = policy.windowMinutes * 60_000;
  const windowStart = now - windowMs;
  const expectedSamples = Math.max(1, Math.floor(windowMs / intervalMs));
  const staleAfterMs = policy.staleAfterIntervals * intervalMs;
  // Hysteresis only while already degraded; any other previous state
  // (including insufficient or outage) evaluates against the main threshold.
  const holding = previousState === 'degraded';
  const activeThreshold = holding ? policy.recoveryLossThresholdPercent : policy.lossThresholdPercent;

  const byTarget = new Map(targets.map((t) => [t.host, []]));
  for (const s of samples) {
    if (!byTarget.has(s.target)) continue; // target no longer configured
    if (!(s.timestamp > windowStart && s.timestamp <= now)) continue;
    if (!Number.isInteger(s.sent) || !Number.isInteger(s.received)) continue;
    if (s.sent <= 0 || s.received < 0 || s.received > s.sent) continue;
    byTarget.get(s.target).push(s);
  }

  const targetResults = targets.map((t) => {
    const rows = byTarget.get(t.host);
    let sent = 0;
    let received = 0;
    let lastSampleAt = null;
    for (const r of rows) {
      sent += r.sent;
      received += r.received;
      if (lastSampleAt === null || r.timestamp > lastSampleAt) lastSampleAt = r.timestamp;
    }
    const lost = sent - received;
    const coverage = Math.min(1, rows.length / expectedSamples);
    const stale = lastSampleAt === null || now - lastSampleAt > staleAfterMs;
    const covered = !stale && coverage >= policy.minCoverage;
    return {
      target: t.host,
      name: t.name || t.host,
      samples: rows.length,
      expectedSamples,
      coverage,
      sent,
      received,
      lossRatio: sent > 0 ? lost / sent : null,
      lastSampleAt,
      stale,
      covered,
      overThreshold: covered && lossExceeds(lost, sent, activeThreshold),
    };
  });

  const covered = targetResults.filter((t) => t.covered);
  const coveredSent = covered.reduce((sum, t) => sum + t.sent, 0);
  const coveredReceived = covered.reduce((sum, t) => sum + t.received, 0);
  const degradedTargets = covered.filter((t) => t.overThreshold).length;

  let state;
  let reason;
  if (activeOutage) {
    state = 'outage';
    reason = 'active_outage';
  } else if (!pingEnabled) {
    state = 'insufficient';
    reason = 'ping_disabled';
  } else if (targets.length < policy.minTargets) {
    state = 'insufficient';
    reason = 'too_few_targets';
  } else if (covered.length < policy.minTargets) {
    state = 'insufficient';
    reason = 'insufficient_coverage';
  } else if (degradedTargets >= policy.minTargets) {
    state = 'degraded';
    reason = 'loss_over_threshold';
  } else {
    state = 'healthy';
    reason = 'loss_within_threshold';
  }

  return {
    state,
    reason,
    evaluatedAt: now,
    windowSeconds: windowMs / 1000,
    lossThresholdPercent: policy.lossThresholdPercent,
    recoveryLossThresholdPercent: policy.recoveryLossThresholdPercent,
    minTargets: policy.minTargets,
    minCoverage: policy.minCoverage,
    coveredTargets: covered.length,
    degradedTargets,
    // Loss across all covered targets (sum lost / sum sent); null with none.
    windowLossRatio: coveredSent > 0 ? (coveredSent - coveredReceived) / coveredSent : null,
    targets: targetResults,
  };
}

// Last decision, for hysteresis. On globalThis for the same reason as the
// outage counters: server.js and each bundled API route load separate copies.
const state = globalThis.__outpostDegradationState ??= { previousState: null };

function getDegradationStatus(now = Date.now()) {
  // Required lazily so the pure function above has no DB/config dependency.
  const db = require('../storage/database');
  const { getConfig } = require('../config');
  const config = getConfig();
  const ping = config.monitors?.ping || {};
  const policy = normalizePolicy(config.degradation);
  const windowMs = policy.windowMinutes * 60_000;
  const samples = db.getPingCounts(now - windowMs, now).map((r) => ({
    timestamp: r.timestamp,
    target: r.target,
    sent: r.packets_sent,
    received: r.packets_received,
  }));
  const result = evaluateDegradation({
    samples,
    targets: ping.targets || [],
    now,
    intervalMs: (ping.intervalSeconds || 60) * 1000,
    policy,
    activeOutage: !!db.getActiveOutage(),
    previousState: state.previousState,
    pingEnabled: ping.enabled !== false,
  });
  state.previousState = result.state;
  return result;
}

function resetDegradationState() {
  state.previousState = null;
}

// Prometheus series for the /api/metrics route. Label values are bounded: the
// state enum, plus configured ping targets (at most CONSTRAINTS.ping.maxTargets).
/**
 * @param {ReturnType<typeof evaluateDegradation>} status
 * @returns {Array<{name: string, help: string, type: string,
 *   samples: Array<{labels: Record<string, string>, value: number}>}>}
 */
function degradationMetrics(status) {
  const series = [
    {
      name: 'outpost_wan_degradation_state',
      help: 'WAN state from windowed packet loss: 1 for the current state, 0 for the others',
      type: 'gauge',
      samples: STATES.map((s) => ({ labels: { state: s }, value: status.state === s ? 1 : 0 })),
    },
    {
      name: 'outpost_wan_window_loss_ratio',
      help: 'Packet loss ratio (0-1) across covered ping targets over the degradation window',
      type: 'gauge',
      samples: status.windowLossRatio == null ? [] : [{ labels: {}, value: status.windowLossRatio }],
    },
    {
      name: 'outpost_wan_window_covered_targets',
      help: 'Ping targets with fresh, sufficient samples in the degradation window',
      type: 'gauge',
      samples: [{ labels: {}, value: status.coveredTargets }],
    },
    {
      name: 'outpost_wan_window_seconds',
      help: 'Length of the degradation window in seconds',
      type: 'gauge',
      samples: [{ labels: {}, value: status.windowSeconds }],
    },
    {
      name: 'outpost_wan_loss_threshold_ratio',
      help: 'Window loss ratio above which a covered target counts as degraded',
      type: 'gauge',
      samples: [{ labels: {}, value: status.lossThresholdPercent / 100 }],
    },
    {
      name: 'outpost_ping_window_loss_ratio',
      help: 'Packet loss ratio (0-1) per ping target over the degradation window',
      type: 'gauge',
      samples: status.targets
        .filter((t) => t.lossRatio != null)
        .map((t) => ({ labels: { target: t.target, name: t.name }, value: t.lossRatio })),
    },
    {
      name: 'outpost_ping_window_coverage_ratio',
      help: 'Fraction (0-1) of expected ping checks with packet counts in the degradation window',
      type: 'gauge',
      samples: status.targets.map((t) => ({ labels: { target: t.target, name: t.name }, value: t.coverage })),
    },
  ];
  return series;
}

module.exports = {
  STATES,
  DEFAULT_POLICY,
  normalizePolicy,
  evaluateDegradation,
  getDegradationStatus,
  resetDegradationState,
  degradationMetrics,
};
