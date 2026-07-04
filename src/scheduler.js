const cron = require('node-cron');
const { runPingMonitor } = require('./monitors/ping');
const { runDnsMonitor } = require('./monitors/dns');
const { runSpeedtestMonitor } = require('./monitors/speedtest');
const { checkOutageConditions } = require('./monitors/outage');
const db = require('./storage/database');
const { getConfig, reloadConfig } = require('./config');

let scheduledTasks = [];
let lastPingResults = [];
let lastDnsResults = [];

function secondsToCron(seconds) {
  if (seconds < 60) {
    return `*/${seconds} * * * * *`;
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `*/${minutes} * * * *`;
  }
  return `0 */${Math.round(minutes / 60)} * * *`;
}

// Speedtest.net rejects the server-list fetch at exactly the top of the hour,
// when every cron-scheduled client on the internet runs at once. Use a random
// minute offset (stable for the lifetime of the process) to stay out of the stampede.
const speedtestMinuteOffset = 2 + Math.floor(Math.random() * 56);

function hoursToCron(hours, minute = 0) {
  if (hours === 1) {
    return `${minute} * * * *`;
  }
  return `${minute} */${hours} * * *`;
}

async function runPingAndCheckOutage() {
  try {
    lastPingResults = await runPingMonitor();
    checkOutageConditions(lastPingResults, lastDnsResults);
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

async function runRetention() {
  try {
    const config = getConfig();
    console.log(`Running retention cleanup (${config.retention.days} days)...`);
    db.runRetentionCleanup(config.retention.days);
    console.log('Retention cleanup complete');
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
    const pingCron = secondsToCron(config.monitors.ping.intervalSeconds);
    const pingTask = cron.schedule(pingCron, runPingAndCheckOutage);
    scheduledTasks.push(pingTask);

    // Run immediately on start
    runPingAndCheckOutage();
  }

  // Schedule DNS monitor
  if (config.monitors.dns.enabled) {
    const dnsCron = secondsToCron(config.monitors.dns.intervalSeconds);
    const dnsTask = cron.schedule(dnsCron, runDnsAndCheckOutage);
    scheduledTasks.push(dnsTask);

    // Run immediately on start
    runDnsAndCheckOutage();
  }

  // Schedule speedtest
  if (config.monitors.speedtest.enabled) {
    const speedtestCron = hoursToCron(config.monitors.speedtest.intervalHours, speedtestMinuteOffset);
    console.log(`  - Speedtest schedule: "${speedtestCron}" (offset ${speedtestMinuteOffset}m past the hour)`);
    const speedtestTask = cron.schedule(speedtestCron, runSpeedtest);
    scheduledTasks.push(speedtestTask);

    // Run speedtest 30 seconds after start (to not block startup)
    setTimeout(runSpeedtest, 30000);
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
};
