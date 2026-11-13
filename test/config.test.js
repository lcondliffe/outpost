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
      ping: {
        intervalSeconds: 10,
        packetCount: 11,
        targets: Array.from({ length: 11 }, () => ({ host: '8.8.8.8' })),
      },
      speedtest: { intervalHours: 25 },
      dns: {
        intervalSeconds: 30,
        servers: Array.from({ length: 6 }, () => ({ address: '1.1.1.1' })),
      },
    },
    retention: { days: 6 },
  });
  assert.deepStrictEqual(errors, [
    'Ping interval must be between 30 and 900 seconds',
    'Maximum 10 ping targets allowed',
    'Ping packet count must be between 1 and 10',
    'Speedtest interval must be between 1 and 24 hours',
    'DNS interval must be between 60 and 1800 seconds',
    'Maximum 5 DNS servers allowed',
    'Retention must be between 7 and 365 days',
  ]);
});

test('validateConfig rejects invalid ping targets and DNS server addresses', () => {
  assert.deepStrictEqual(validateConfig({
    monitors: { ping: { targets: [{}] }, dns: { servers: [{}] } },
  }), [
    'Invalid ping target "undefined": must be a hostname or IP',
    'Invalid DNS server "undefined": must be an IP address',
  ]);
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
