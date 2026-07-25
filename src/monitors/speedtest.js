const { execFile, spawn } = require('child_process');
const { promisify } = require('util');
const db = require('../storage/database');
const { getConfig } = require('../config');

const execFileAsync = promisify(execFile);

// Shared mutable state. This module gets instantiated multiple times in one
// process (server.js loads it via plain require, while Next.js bundles a
// separate copy into each API route), so the state must live on globalThis
// for the run-lock and job registry to actually be shared.
const state = globalThis.__outpostSpeedtestState ??= {
  isRunning: false,
  pendingJobs: new Map(),
  jobIdCounter: 0,
  enginePromise: null,
};

const RETRY_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 45000;
const SPEEDTEST_TIMEOUT_MS = 120000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function failureResult(detail) {
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

function bandwidthToMbps(bytesPerSec) {
  return bytesPerSec != null ? (bytesPerSec * 8) / 1_000_000 : null;
}

// Detect which speedtest binary is available. The Ookla CLI supports live
// JSONL progress output; the Python speedtest-cli only reports at the end.
// Both may install a `speedtest` binary, so check --version output.
function detectEngine() {
  if (!state.enginePromise) {
    state.enginePromise = (async () => {
      try {
        const { stdout } = await execFileAsync('speedtest', ['--version'], { timeout: 10000 });
        if (/ookla/i.test(stdout)) {
          return 'ookla';
        }
      } catch {
        // speedtest binary missing or not Ookla; fall back to speedtest-cli
      }
      return 'speedtest-cli';
    })();
  }
  return state.enginePromise;
}

// Run the Ookla CLI with JSONL output, emitting live progress via onProgress
function runOoklaCli(serverId = null, onProgress = null) {
  return new Promise((resolve) => {
    const args = [
      '--accept-license',
      '--accept-gdpr',
      '--format=jsonl',
      '--progress=yes',
    ];
    if (serverId) {
      args.push('--server-id', serverId.toString());
    }

    const child = spawn('speedtest', args);
    let resultEvent = null;
    let errorDetail = '';
    let stderr = '';
    let stdoutBuffer = '';
    let timedOut = false;
    let settled = false;

    const finish = (result) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(result);
      }
    };

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, SPEEDTEST_TIMEOUT_MS);

    const handleEvent = (event) => {
      switch (event.type) {
        case 'testStart':
          onProgress?.({
            phase: 'ping',
            serverName: event.server?.name || null,
            percent: 0,
          });
          break;
        case 'ping':
          onProgress?.({
            phase: 'ping',
            pingMs: event.ping?.latency ?? null,
            percent: (event.ping?.progress ?? 0) * 100,
          });
          break;
        case 'download':
          onProgress?.({
            phase: 'download',
            downloadMbps: bandwidthToMbps(event.download?.bandwidth),
            percent: (event.download?.progress ?? 0) * 100,
          });
          break;
        case 'upload':
          onProgress?.({
            phase: 'upload',
            uploadMbps: bandwidthToMbps(event.upload?.bandwidth),
            percent: (event.upload?.progress ?? 0) * 100,
          });
          break;
        case 'result':
          resultEvent = event;
          break;
        case 'log':
          if (event.level === 'error' && event.message) {
            errorDetail = event.message;
          }
          break;
      }
    };

    child.stdout.on('data', (chunk) => {
      stdoutBuffer += chunk.toString();
      const lines = stdoutBuffer.split('\n');
      stdoutBuffer = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          handleEvent(JSON.parse(line));
        } catch {
          // Ignore non-JSON output lines
        }
      }
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (err) => {
      finish(failureResult(err.message));
    });

    child.on('close', (code) => {
      if (resultEvent) {
        finish({
          success: true,
          downloadMbps: bandwidthToMbps(resultEvent.download?.bandwidth),
          uploadMbps: bandwidthToMbps(resultEvent.upload?.bandwidth),
          pingMs: resultEvent.ping?.latency ?? null,
          jitterMs: resultEvent.ping?.jitter ?? null,
          serverId: resultEvent.server?.id?.toString() || null,
          serverName: resultEvent.server?.name || null,
          error: null,
        });
      } else {
        const detail = timedOut
          ? `Timed out after ${SPEEDTEST_TIMEOUT_MS / 1000}s`
          : (errorDetail || stderr.trim() || `speedtest exited with code ${code}`).slice(0, 300);
        console.error('Speedtest error:', detail);
        finish(failureResult(detail));
      }
    });
  });
}

// Run the Python speedtest-cli (no live progress available)
async function runPythonCli(serverId = null, onProgress = null) {
  const args = ['--json'];
  if (serverId) {
    args.push('--server', serverId.toString());
  }

  onProgress?.({ phase: 'running' });

  try {
    const { stdout } = await execFileAsync('speedtest-cli', args, {
      timeout: SPEEDTEST_TIMEOUT_MS,
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
      ? `Timed out after ${SPEEDTEST_TIMEOUT_MS / 1000}s`
      : (err.stderr || err.message || 'Unknown error').trim().slice(0, 300);
    console.error('Speedtest error:', detail);
    return failureResult(detail);
  }
}

async function runSpeedtestCli(serverId = null, onProgress = null) {
  const engine = await detectEngine();
  if (engine === 'ookla') {
    return runOoklaCli(serverId, onProgress);
  }
  return runPythonCli(serverId, onProgress);
}

async function runSpeedtestCliWithRetry(serverId = null, onProgress = null) {
  let result;
  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
    result = await runSpeedtestCli(serverId, onProgress);
    if (result.success) {
      return result;
    }
    if (attempt < RETRY_ATTEMPTS) {
      const delay = RETRY_BASE_DELAY_MS + Math.floor(Math.random() * 30000);
      console.log(`Speedtest attempt ${attempt} failed, retrying in ${Math.round(delay / 1000)}s...`);
      onProgress?.({
        phase: 'retrying',
        attempt,
        nextRetrySeconds: Math.round(delay / 1000),
        percent: 0,
      });
      await sleep(delay);
    }
  }
  return result;
}

async function runSpeedtestMonitor(onProgress = null) {
  const config = getConfig();
  const speedtestConfig = config.monitors.speedtest;

  if (!speedtestConfig.enabled) {
    return null;
  }

  if (state.isRunning) {
    console.log('Speedtest already in progress, skipping...');
    return null;
  }

  state.isRunning = true;
  console.log('Starting speedtest...');

  try {
    const result = await runSpeedtestCliWithRetry(speedtestConfig.serverId, onProgress);
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
    state.isRunning = false;
  }
}

// How long a finished job lingers in pendingJobs so the UI can read its
// final result before it is reclaimed.
const JOB_RETENTION_MS = 5 * 60 * 1000;

// Absolute upper bound on a job's lifetime, in case it somehow never
// reaches a terminal state. Worst case is 3 attempts x 120s timeout plus 2
// retry delays of 45-75s (~7 minutes), so this must stay comfortably above
// that rather than matching it.
const JOB_BACKSTOP_MS = 12 * 60 * 1000;

// Manual speedtest trigger with job tracking and live progress
function triggerSpeedtest() {
  const jobId = `speedtest-${++state.jobIdCounter}`;

  const job = {
    id: jobId,
    status: 'running',
    progress: { phase: 'starting', percent: 0 },
    result: null,
    startedAt: Date.now(),
  };

  state.pendingJobs.set(jobId, job);

  // Backstop cleanup in case the job never reaches a terminal state.
  // Replaced by a shorter post-completion timer once the job actually
  // finishes (see scheduleCleanup below).
  const backstopTimer = setTimeout(() => {
    state.pendingJobs.delete(jobId);
  }, JOB_BACKSTOP_MS);

  // Called from every terminal code path (success, skipped, or error) to
  // cancel the backstop and give the UI a few minutes to read the result.
  const scheduleCleanup = () => {
    clearTimeout(backstopTimer);
    setTimeout(() => {
      state.pendingJobs.delete(jobId);
    }, JOB_RETENTION_MS);
  };

  // Run speedtest in background, merging live progress into the job
  const onProgress = (update) => {
    job.progress = { ...job.progress, ...update };
  };

  runSpeedtestMonitor(onProgress).then((result) => {
    // A null result means the test was skipped (disabled or already running)
    job.status = result ? 'complete' : 'skipped';
    job.progress = { ...job.progress, phase: 'complete', percent: 100 };
    job.result = result;
    job.completedAt = Date.now();
    scheduleCleanup();
  }).catch((err) => {
    job.status = 'error';
    job.error = err.message;
    job.completedAt = Date.now();
    scheduleCleanup();
  });

  return jobId;
}

function getJobStatus(jobId) {
  return state.pendingJobs.get(jobId) || null;
}

module.exports = {
  runSpeedtestCli,
  runSpeedtestCliWithRetry,
  runSpeedtestMonitor,
  triggerSpeedtest,
  getJobStatus,
  isRunning: () => state.isRunning,
};
