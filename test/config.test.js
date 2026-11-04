require('./setup');
const { test } = require('node:test');
const assert = require('node:assert');
const { validateConfig, updateConfig, getConfig, DEFAULT_CONFIG } = require('../src/config');

test('default config is valid', () => {
  assert.deepStrictEqual(validateConfig(DEFAULT_CONFIG), []);
});

test('validateConfig rejects out-of-range values', () => {
  const errors = validateConfig({
    monitors: {
      ping: { intervalSeconds: 10, packetCount: 11, targets: new Array(11).fill({}) },
      speedtest: { intervalHours: 25 },
      dns: { intervalSeconds: 30, servers: new Array(6).fill({}) },
    },
    retention: { days: 6 },
  });
  assert.strictEqual(errors.length, 7);
});

test('validateConfig accepts boundary values', () => {
  assert.deepStrictEqual(
    validateConfig({ monitors: { ping: { intervalSeconds: 30 }, dns: { intervalSeconds: 1800 } }, retention: { days: 365 } }),
    [],
  );
});

test('updateConfig deep-merges partial config and persists it', () => {
  const updated = updateConfig({ monitors: { ping: { intervalSeconds: 120 } } });
  assert.strictEqual(updated.monitors.ping.intervalSeconds, 120);
  // siblings survive the merge
  assert.deepStrictEqual(updated.monitors.ping.targets, DEFAULT_CONFIG.monitors.ping.targets);
  assert.deepStrictEqual(updated.monitors.dns, DEFAULT_CONFIG.monitors.dns);
  assert.strictEqual(getConfig().monitors.ping.intervalSeconds, 120);
});

test('updateConfig throws and does not persist invalid config', () => {
  assert.throws(() => updateConfig({ retention: { days: 1 } }), /Retention must be between/);
  assert.notStrictEqual(require('../src/config').reloadConfig().retention.days, 1);
});
