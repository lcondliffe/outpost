const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

test('env vars override an existing config.json without being persisted', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'outpost-config-'));
  const file = path.join(dir, 'config.json');
  fs.writeFileSync(file, JSON.stringify({ monitors: { ping: { intervalSeconds: 120 } }, retention: { days: 30 } }));
  process.env.OUTPOST_DATA_DIR = dir;
  process.env.OUTPOST_PING_INTERVAL = '45';

  const { getConfig, updateConfig } = require('../src/config');
  assert.strictEqual(getConfig().monitors.ping.intervalSeconds, 45);
  assert.strictEqual(getConfig().retention.days, 30);

  updateConfig({ retention: { days: 60 } });
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.strictEqual(saved.monitors.ping.intervalSeconds, 120);
  assert.strictEqual(saved.retention.days, 60);
});
