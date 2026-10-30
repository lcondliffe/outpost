const { loadConfig } = require('./config');

// Shared mutable state. Like the monitors, this module is instantiated once by
// server.js and again inside each Next.js API route bundle, so state lives on
// globalThis to keep the queue and cooldowns shared.
const state = globalThis.__outpostAlertState ??= {
  queue: [],
  lastSent: {},
  suppressedOutageIds: new Set(),
  slowSpeedtests: 0,
  degradedPings: 0,
};

// ponytail: in-memory queue, lost on process restart; persist to SQLite if that matters
const MAX_QUEUE = 100;
const SEND_TIMEOUT_MS = 10000;

// Read fresh each time: config edits made via the API land in a different
// module instance (see above), so a cached getConfig() here would go stale.
function alertsConfig() {
  return loadConfig().alerts;
}

function sinks(cfg) {
  const out = [];
  if (cfg.webhookUrl) out.push({ kind: 'webhook', url: cfg.webhookUrl });
  if (cfg.ntfyUrl) out.push({ kind: 'ntfy', url: cfg.ntfyUrl });
  return out;
}

async function deliver(sink, alert) {
  let res;
  if (sink.kind === 'ntfy') {
    res = await fetch(sink.url, {
      method: 'POST',
      headers: {
        Title: alert.title,
        Priority: alert.priority || 'default',
        Tags: alert.event,
      },
      body: alert.message,
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
  } else {
    // `content` and `text` make the generic payload work as-is with Discord
    // and Slack incoming webhooks respectively.
    const text = `**${alert.title}**\n${alert.message}`;
    res = await fetch(sink.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...alert, content: text, text }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
  }
  if (!res.ok) throw new Error(`${sink.kind} responded ${res.status}`);
}

async function flushQueue() {
  while (state.queue.length > 0) {
    const { sink, alert } = state.queue[0];
    try {
      await deliver(sink, alert);
      state.queue.shift();
    } catch {
      return; // still unreachable; keep the rest for next time
    }
  }
}

// Send to every configured sink; anything that fails is queued for retry.
// cooldownKey (optional) suppresses repeats of the same alert within the
// configured cooldown so a flapping link doesn't spam.
async function notify(alert, cooldownKey = alert.event) {
  const cfg = alertsConfig();
  const targets = sinks(cfg);
  if (targets.length === 0) return false;

  const now = Date.now();
  if (cooldownKey && now - (state.lastSent[cooldownKey] || 0) < cfg.cooldownMinutes * 60000) {
    console.log(`Alert suppressed by cooldown: ${alert.title}`);
    return false;
  }
  if (cooldownKey) state.lastSent[cooldownKey] = now;

  const stamped = { ...alert, timestamp: now };
  await flushQueue();
  for (const sink of targets) {
    try {
      await deliver(sink, stamped);
    } catch (err) {
      console.error(`Alert delivery to ${sink.kind} failed, queued: ${err.message}`);
      state.queue.push({ sink, alert: stamped });
      if (state.queue.length > MAX_QUEUE) state.queue.shift();
    }
  }
  return true;
}

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h && `${h}h`, m && `${m}m`, `${s}s`].filter(Boolean).join(' ');
}

async function onOutageStarted(outageId, affectedServices) {
  const sent = await notify({
    event: 'outage_started',
    title: 'Outpost: outage started',
    message: `Connectivity lost (affected: ${affectedServices.join(', ')}).`,
    priority: 'high',
    outageId,
    affectedServices,
  }, 'outage');
  if (!sent) state.suppressedOutageIds.add(outageId);
}

async function onOutageEnded(outageId, durationSeconds) {
  // Pair with the start: if the start alert was suppressed, so is this one.
  if (state.suppressedOutageIds.delete(outageId)) return;
  await notify({
    event: 'outage_resolved',
    title: 'Outpost: outage resolved',
    message: `Connectivity restored after ${formatDuration(durationSeconds)}.`,
    outageId,
    durationSeconds,
  }, null);
}

async function onSpeedtest(result) {
  const { speedtestFloorMbps, speedtestConsecutive } = alertsConfig();
  if (!speedtestFloorMbps || !result.success) return;

  state.slowSpeedtests = result.downloadMbps < speedtestFloorMbps ? state.slowSpeedtests + 1 : 0;
  if (state.slowSpeedtests !== speedtestConsecutive) return;

  await notify({
    event: 'speedtest_degraded',
    title: 'Outpost: slow speedtests',
    message: `Download below ${speedtestFloorMbps} Mbps for ${speedtestConsecutive} consecutive runs (latest ${result.downloadMbps.toFixed(1)} Mbps).`,
    downloadMbps: result.downloadMbps,
  });
}

async function onPingResults(results) {
  await flushQueue();

  const { latencyThresholdMs, packetLossThresholdPercent, degradedChecks } = alertsConfig();
  if (!latencyThresholdMs && !packetLossThresholdPercent) return;
  // Total failure is the outage detector's job, not a degradation.
  if (results.length === 0 || results.every((r) => !r.success)) return;

  const ok = results.filter((r) => r.success && r.rttAvg != null);
  const avgRtt = ok.length ? ok.reduce((sum, r) => sum + r.rttAvg, 0) / ok.length : 0;
  const avgLoss = results.reduce((sum, r) => sum + (r.packetLoss ?? 0), 0) / results.length;

  const degraded =
    (latencyThresholdMs > 0 && avgRtt > latencyThresholdMs) ||
    (packetLossThresholdPercent > 0 && avgLoss > packetLossThresholdPercent);

  state.degradedPings = degraded ? state.degradedPings + 1 : 0;
  if (state.degradedPings !== degradedChecks) return;

  await notify({
    event: 'latency_degraded',
    title: 'Outpost: degraded connection',
    message: `Latency ${avgRtt.toFixed(0)} ms, packet loss ${avgLoss.toFixed(1)}% for ${degradedChecks} consecutive checks.`,
    avgRttMs: avgRtt,
    packetLossPercent: avgLoss,
  });
}

// Bypasses cooldown and queue: reports per-sink success so the UI can show it.
async function sendTest() {
  const targets = sinks(alertsConfig());
  const alert = {
    event: 'test',
    title: 'Outpost: test notification',
    message: 'If you can read this, Outpost alerts are working.',
    timestamp: Date.now(),
  };
  return Promise.all(
    targets.map((sink) =>
      deliver(sink, alert).then(
        () => ({ sink: sink.kind, ok: true }),
        (err) => ({ sink: sink.kind, ok: false, error: err.message })
      )
    )
  );
}

module.exports = {
  notify,
  flushQueue,
  onOutageStarted,
  onOutageEnded,
  onSpeedtest,
  onPingResults,
  sendTest,
  formatDuration,
  _state: state,
};
