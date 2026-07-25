const db = require('../storage/database');
const { getConfig } = require('../config');

// Shared mutable state. This module gets instantiated multiple times in one
// process (server.js loads it via plain require, while Next.js bundles a
// separate copy into each API route), so the state must live on globalThis
// for the counters to actually be shared.
const state = globalThis.__outpostOutageState ??= {
  consecutivePingFailures: 0,
  consecutivePingSuccesses: 0,
  lastDnsSuccess: true,
};

function checkOutageConditions(pingResults, dnsResults) {
  const config = getConfig();
  const { pingFailuresForOutage, pingSuccessesForRecovery } = config.outageDetection;

  // Check if all pings failed
  const allPingsFailed = pingResults.length > 0 && pingResults.every((r) => !r.success);
  const anyPingSucceeded = pingResults.some((r) => r.success);

  // Check DNS status
  const allDnsFailed = dnsResults.length > 0 && dnsResults.every((r) => !r.success);
  const anyDnsSucceeded = dnsResults.some((r) => r.success);

  // Update consecutive counters
  if (allPingsFailed) {
    state.consecutivePingFailures++;
    state.consecutivePingSuccesses = 0;
  } else if (anyPingSucceeded) {
    state.consecutivePingSuccesses++;
    state.consecutivePingFailures = 0;
  }

  state.lastDnsSuccess = anyDnsSucceeded;

  // Determine current state
  const activeOutage = db.getActiveOutage();

  // Check if we should start an outage
  if (!activeOutage) {
    const shouldStartOutage =
      state.consecutivePingFailures >= pingFailuresForOutage || allDnsFailed;

    if (shouldStartOutage) {
      const affectedServices = [];
      if (state.consecutivePingFailures >= pingFailuresForOutage) {
        affectedServices.push('ping');
      }
      if (allDnsFailed) {
        affectedServices.push('dns');
      }

      const outageId = db.insertOutage({
        startTime: Date.now(),
        affectedServices,
      });

      console.log(`OUTAGE STARTED: ID ${outageId}, affected: ${affectedServices.join(', ')}`);
      return { action: 'started', outageId, affectedServices };
    }
  }

  // Check if we should end an outage
  if (activeOutage) {
    const shouldEndOutage =
      state.consecutivePingSuccesses >= pingSuccessesForRecovery && state.lastDnsSuccess;

    if (shouldEndOutage) {
      const endTime = Date.now();
      const durationSeconds = Math.round((endTime - activeOutage.start_time) / 1000);

      db.updateOutage(activeOutage.id, endTime, durationSeconds);

      // Reset counters
      state.consecutivePingFailures = 0;

      console.log(`OUTAGE ENDED: ID ${activeOutage.id}, duration: ${durationSeconds}s`);
      return { action: 'ended', outageId: activeOutage.id, durationSeconds };
    }
  }

  return { action: 'none' };
}

function getOutageStatus() {
  const activeOutage = db.getActiveOutage();
  return {
    inOutage: !!activeOutage,
    activeOutage: activeOutage
      ? {
          id: activeOutage.id,
          startTime: activeOutage.start_time,
          affectedServices: JSON.parse(activeOutage.affected_services || '[]'),
          durationSeconds: Math.round((Date.now() - activeOutage.start_time) / 1000),
        }
      : null,
    consecutivePingFailures: state.consecutivePingFailures,
    consecutivePingSuccesses: state.consecutivePingSuccesses,
  };
}

function resetCounters() {
  state.consecutivePingFailures = 0;
  state.consecutivePingSuccesses = 0;
  state.lastDnsSuccess = true;
}

module.exports = {
  checkOutageConditions,
  getOutageStatus,
  resetCounters,
};
