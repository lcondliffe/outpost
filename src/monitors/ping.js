const ping = require('ping');
const db = require('../storage/database');
const { getConfig } = require('../config');

// "3 packets transmitted, 2 received" (iputils) or
// "3 packets transmitted, 2 packets received" (busybox).
const COUNTS_RE = /(\d+)\s+packets?\s+transmitted,\s+(\d+)\s+(?:packets?\s+)?received/i;

// Packets sent/received for one check, read from the ping summary line, else
// derived from the parsed loss percentage and the configured packet count.
// Returns nulls when neither is known (e.g. the ping itself errored), so the
// check is not counted as either healthy or lossy (AGT-422).
function packetCounts(result, packetCount) {
  const match = typeof result?.output === 'string' ? COUNTS_RE.exec(result.output) : null;
  if (match) {
    const sent = parseInt(match[1], 10);
    const received = parseInt(match[2], 10);
    if (sent > 0 && received >= 0 && received <= sent) return { packetsSent: sent, packetsReceived: received };
  }
  const loss = parseFloat(result?.packetLoss);
  if (Number.isFinite(loss) && loss >= 0 && loss <= 100 && packetCount > 0) {
    return { packetsSent: packetCount, packetsReceived: Math.round(packetCount * (1 - loss / 100)) };
  }
  return { packetsSent: null, packetsReceived: null };
}

async function pingHost(host, timeout = 5000) {
  try {
    const config = getConfig();
    const packetCount = config.monitors?.ping?.packetCount || 3;

    const result = await ping.promise.probe(host, {
      timeout: Math.ceil(timeout / 1000),
      extra: ['-c', String(packetCount)],
    });

    return {
      alive: result.alive,
      rttMin: result.min !== 'unknown' ? parseFloat(result.min) : null,
      rttAvg: result.avg !== 'unknown' ? parseFloat(result.avg) : null,
      rttMax: result.max !== 'unknown' ? parseFloat(result.max) : null,
      packetLoss: result.packetLoss !== 'unknown' ? parseFloat(result.packetLoss) : 100,
      ...packetCounts(result, packetCount),
    };
  } catch (err) {
    console.error(`Ping error for ${host}:`, err.message);
    return {
      alive: false,
      rttMin: null,
      rttAvg: null,
      rttMax: null,
      packetLoss: 100,
      packetsSent: null,
      packetsReceived: null,
    };
  }
}

async function runPingMonitor() {
  const config = getConfig();
  const pingConfig = config.monitors.ping;

  if (!pingConfig.enabled) {
    return [];
  }

  const results = [];
  const timestamp = Date.now();

  for (const target of pingConfig.targets) {
    const result = await pingHost(target.host, pingConfig.timeout);

    const data = {
      timestamp,
      target: target.host,
      targetName: target.name,
      rttMin: result.rttMin,
      rttAvg: result.rttAvg,
      rttMax: result.rttMax,
      packetLoss: result.packetLoss,
      success: result.alive,
      packetsSent: result.packetsSent,
      packetsReceived: result.packetsReceived,
    };

    db.insertPing(data);
    results.push(data);

    console.log(`Ping ${target.name} (${target.host}): ${result.alive ? `${result.rttAvg}ms` : 'FAILED'}`);
  }

  return results;
}

module.exports = {
  packetCounts,
  pingHost,
  runPingMonitor,
};
