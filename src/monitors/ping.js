const ping = require('ping');
const db = require('../storage/database');
const { getConfig } = require('../config');

async function pingHost(host, timeout = 5000) {
  try {
    const result = await ping.promise.probe(host, {
      timeout: Math.ceil(timeout / 1000),
      extra: ['-c', '3'],
    });

    return {
      alive: result.alive,
      rttMin: result.min !== 'unknown' ? parseFloat(result.min) : null,
      rttAvg: result.avg !== 'unknown' ? parseFloat(result.avg) : null,
      rttMax: result.max !== 'unknown' ? parseFloat(result.max) : null,
      packetLoss: result.packetLoss !== 'unknown' ? parseFloat(result.packetLoss) : 100,
    };
  } catch (err) {
    console.error(`Ping error for ${host}:`, err.message);
    return {
      alive: false,
      rttMin: null,
      rttAvg: null,
      rttMax: null,
      packetLoss: 100,
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
    };

    db.insertPing(data);
    results.push(data);

    console.log(`Ping ${target.name} (${target.host}): ${result.alive ? `${result.rttAvg}ms` : 'FAILED'}`);
  }

  return results;
}

module.exports = {
  pingHost,
  runPingMonitor,
};
