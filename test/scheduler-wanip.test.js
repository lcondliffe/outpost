require('./setup');
const { test, mock } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// Only WAN IP tracking enabled, so startScheduler touches no network.
fs.writeFileSync(path.join(process.env.OUTPOST_DATA_DIR, 'config.json'), JSON.stringify({
  monitors: {
    ping: { enabled: false },
    dns: { enabled: false },
    speedtest: { enabled: false },
    wanIp: { enabled: true, intervalSeconds: 45 },
  },
}));

// Stub the monitor before the scheduler requires it.
const calls = [];
const wanipPath = require.resolve('../src/monitors/wanip');
require.cache[wanipPath] = {
  id: wanipPath,
  filename: wanipPath,
  loaded: true,
  exports: { runWanIpMonitor: async () => { calls.push(Date.now()); } },
};

const { startScheduler, stopAllTasks } = require('../src/scheduler');

test('WAN IP tracking schedules on the fixed-interval timer and runs immediately', () => {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  try {
    assert.doesNotThrow(() => startScheduler());
    assert.strictEqual(calls.length, 1, 'runs once on start');
    mock.timers.tick(45_000);
    assert.strictEqual(calls.length, 2, 'runs again after one 45s interval');
    mock.timers.tick(45_000);
    assert.strictEqual(calls.length, 3, 'keeps an even 45s cadence');
  } finally {
    stopAllTasks();
    mock.timers.reset();
  }
});
