const cron = require('node-cron');
const { runPingMonitor } = require('./monitors/ping');
const { runDnsMonitor } = require('./monitors/dns');
const { runSpeedtestMonitor } = require('./monitors/speedtest');
const { runWanIpMonitor } = require('./monitors/wanip');
const { checkOutageConditions } = require('./monitors/outage');
const db = require('./storage/database');
const alerts = require('./alerts');
const { getConfig, reloadConfig } = require('./config');

let scheduledTasks = [];
let lastPingResults = [];
let lastDnsResults = [];

// Fixed-interval timers rather than cron step expressions: `*/45` seconds or
// `*/7` hours only give an even cadence when the interval divides its unit (AGT-425).
// Returns a { stop } handle like a cron task. First run after firstDelayMs (default: one interval).
function every(intervalMs, fn, firstDelayMs = intervalMs) {
  let interval;
  const timeout = setTimeout(() => {
    fn();
    interval = setInterval(fn, intervalMs);
  }, firstDelayMs);
  return {
    stop() {
      clearTimeout(timeout);
      clearInterval(interval);
    },
  };
}

// Speedtest.net rejects the server-list fetch at exactly the top of the hour,
// when every cron-scheduled client on the internet runs at once. Use a random
// minute offset (stable for the lifetime of the process) to stay out of the stampede.
const speedtestMinuteOffset = 2 + Math.floor(Math.random() * 56);

// ms from now until the next wall-clock time at `minute` past the hour.
function msUntilMinute(minute, now = new Date()) {
  const next = new Date(now);
  next.setMinutes(minute, 0, 0);
  if (next <= now) next.setHours(next.getHours() + 1);
  return next - now;
}

async function runPingAndCheckOutage() {
  try {
    lastPingResults = await runPingMonitor();
    checkOutageConditions(lastPingResults, lastDnsResults);
    await alerts.onPingResults(lastPingResults);
  } catch (err) {
    console.error('Ping monitor error:', err);
  }
}

async function runDnsAndCheckOutage() {
  try {
    lastDnsResults = await runDnsMonitor();
    checkOutageConditions(lastPingResults, lastDnsResults);
  } catch (err) {
    console.error('DNS monitor error:', err);
  }
}

async function runSpeedtest() {
  try {
    await runSpeedtestMonitor();
  } catch (err) {
    console.error('Speedtest monitor error:', err);
  }
}

async function runWanIp() {
  try {
    await runWanIpMonitor();
  } catch (err) {
    console.error('WAN IP monitor error:', err.message);
  }
}

async function runRetention() {
  try {
    const config = getConfig();
    console.log(`Running retention cleanup (${config.retention.days} days)...`);
    const { deleted, ms } = db.runRetentionCleanup(config.retention.days);
    console.log(`Retention cleanup complete: ${deleted} rows deleted in ${ms}ms`);
  } catch (err) {
    console.error('Retention cleanup error:', err);
  }
}

function stopAllTasks() {
  for (const task of scheduledTasks) {
    task.stop();
  }
  scheduledTasks = [];
}

function startScheduler() {
  stopAllTasks();
  const config = getConfig();

  console.log('Starting scheduler with configuration:');
  console.log(`  - Ping: every ${config.monitors.ping.intervalSeconds}s`);
  console.log(`  - DNS: every ${config.monitors.dns.intervalSeconds}s`);
  console.log(`  - Speedtest: every ${config.monitors.speedtest.intervalHours}h`);

  // Schedule ping monitor
  if (config.monitors.ping.enabled) {
    scheduledTasks.push(every(config.monitors.ping.intervalSeconds * 1000, runPingAndCheckOutage));

    // Run immediately on start
    runPingAndCheckOutage();
  }

  // Schedule DNS monitor
  if (config.monitors.dns.enabled) {
    scheduledTasks.push(every(config.monitors.dns.intervalSeconds * 1000, runDnsAndCheckOutage));

    // Run immediately on start
    runDnsAndCheckOutage();
  }

  // Schedule speedtest
  if (config.monitors.speedtest.enabled) {
    console.log(`  - Speedtest offset: ${speedtestMinuteOffset}m past the hour`);
    scheduledTasks.push(every(
      config.monitors.speedtest.intervalHours * 3600 * 1000,
      runSpeedtest,
      msUntilMinute(speedtestMinuteOffset),
    ));

    // Run speedtest 30 seconds after start (to not block startup)
    setTimeout(runSpeedtest, 30000);
  }

  // Schedule WAN IP tracking (opt-in; older config files lack this block)
  if (config.monitors.wanIp?.enabled) {
    scheduledTasks.push(every(config.monitors.wanIp.intervalSeconds * 1000, runWanIp));
    runWanIp();
  }

  // Schedule daily retention cleanup at 3:00 AM
  const retentionTask = cron.schedule('0 3 * * *', runRetention);
  scheduledTasks.push(retentionTask);

  console.log('Scheduler started');
}

function restartScheduler() {
  console.log('Restarting scheduler with new configuration...');
  reloadConfig();
  startScheduler();
}

module.exports = {
  startScheduler,
  stopAllTasks,
  restartScheduler,
  runPingAndCheckOutage,
  runDnsAndCheckOutage,
  runSpeedtest,
  every,
  msUntilMinute,
};
