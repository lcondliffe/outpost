const { execFile } = require('child_process');
const { promisify } = require('util');
const db = require('../storage/database');
const { getConfig } = require('../config');

const execFileAsync = promisify(execFile);

// Track running speedtest to prevent concurrent runs
let isRunning = false;
let pendingJobs = new Map();
let jobIdCounter = 0;

const RETRY_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 45000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runSpeedtestCli(serverId = null) {
  const args = ['--json'];
  if (serverId) {
    args.push('--server', serverId.toString());
  }

  try {
    const { stdout } = await execFileAsync('speedtest-cli', args, {
      timeout: 120000, // 2 minute timeout
    });

    const result = JSON.parse(stdout);
    return {
      success: true,
      downloadMbps: result.download / 1_000_000, // Convert from bps to Mbps
      uploadMbps: result.upload / 1_000_000,
      pingMs: result.ping,
      jitterMs: null, // speedtest-cli doesn't provide jitter
      serverId: result.server?.id?.toString() || null,
      serverName: result.server?.name || null,
      error: null,
    };
  } catch (err) {
    const detail = err.killed
      ? 'Timed out after 120s'
      : (err.stderr || err.message || 'Unknown error').trim().slice(0, 300);
    console.error('Speedtest error:', detail);
    return {
      success: false,
      downloadMbps: null,
      uploadMbps: null,
      pingMs: null,
      jitterMs: null,
      serverId: null,
      serverName: null,
      error: detail,
    };
  }
}

async function runSpeedtestCliWithRetry(serverId = null) {
  let result;
  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
    result = await runSpeedtestCli(serverId);
    if (result.success) {
      return result;
    }
    if (attempt < RETRY_ATTEMPTS) {
      const delay = RETRY_BASE_DELAY_MS + Math.floor(Math.random() * 30000);
      console.log(`Speedtest attempt ${attempt} failed, retrying in ${Math.round(delay / 1000)}s...`);
      await sleep(delay);
    }
  }
  return result;
}

async function runSpeedtestMonitor() {
  const config = getConfig();
  const speedtestConfig = config.monitors.speedtest;

  if (!speedtestConfig.enabled) {
    return null;
  }

  if (isRunning) {
    console.log('Speedtest already in progress, skipping...');
    return null;
  }

  isRunning = true;
  console.log('Starting speedtest...');

  try {
    const result = await runSpeedtestCliWithRetry(speedtestConfig.serverId);
    const timestamp = Date.now();

    const data = {
      timestamp,
      downloadMbps: result.downloadMbps,
      uploadMbps: result.uploadMbps,
      pingMs: result.pingMs,
      jitterMs: result.jitterMs,
      serverId: result.serverId,
      serverName: result.serverName,
      success: result.success,
      error: result.error,
    };

    db.insertSpeedtest(data);

    if (result.success) {
      console.log(
        `Speedtest complete: ↓${result.downloadMbps?.toFixed(1)} Mbps ↑${result.uploadMbps?.toFixed(1)} Mbps`
      );
    } else {
      console.log(`Speedtest failed after ${RETRY_ATTEMPTS} attempts: ${result.error}`);
    }

    return data;
  } finally {
    isRunning = false;
  }
}

// Manual speedtest trigger with job tracking
function triggerSpeedtest() {
  const jobId = `speedtest-${++jobIdCounter}`;

  const job = {
    id: jobId,
    status: 'running',
    result: null,
    startedAt: Date.now(),
  };

  pendingJobs.set(jobId, job);

  // Run speedtest in background
  runSpeedtestMonitor().then((result) => {
    job.status = 'complete';
    job.result = result;
    job.completedAt = Date.now();
  }).catch((err) => {
    job.status = 'error';
    job.error = err.message;
    job.completedAt = Date.now();
  });

  // Clean up old jobs after 5 minutes
  setTimeout(() => {
    pendingJobs.delete(jobId);
  }, 5 * 60 * 1000);

  return jobId;
}

function getJobStatus(jobId) {
  return pendingJobs.get(jobId) || null;
}

module.exports = {
  runSpeedtestCli,
  runSpeedtestCliWithRetry,
  runSpeedtestMonitor,
  triggerSpeedtest,
  getJobStatus,
  isRunning: () => isRunning,
};
