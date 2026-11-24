const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Own process (node --test), so env must be set before src/config is required.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'outpost-config-deg-'));
process.on('exit', () => fs.rmSync(dir, { recursive: true, force: true }));
const file = path.join(dir, 'config.json');
// An existing install's config.json from before AGT-422: no degradation block.
fs.writeFileSync(file, JSON.stringify({ monitors: { ping: { intervalSeconds: 120 } }, alerts: { cooldownMinutes: 45 } }));
process.env.OUTPOST_DATA_DIR = dir;
process.env.OUTPOST_DEGRADATION_LOSS_PERCENT = '7.5';

const { getConfig, updateConfig, validateConfig, DEFAULT_CONFIG } = require('../src/config');

test('defaults match the homelab rule', () => {
  assert.deepStrictEqual(DEFAULT_CONFIG.degradation, {
    windowMinutes: 30,
    lossThresholdPercent: 5,
    recoveryLossThresholdPercent: null,
    minTargets: 2,
    minCoverage: 0.9,
    staleAfterIntervals: 3,
  });
});

test('existing settings are kept and the new block is filled from defaults', () => {
  const config = getConfig();
  assert.strictEqual(config.monitors.ping.intervalSeconds, 120);
  assert.strictEqual(config.alerts.cooldownMinutes, 45);
  assert.strictEqual(config.degradation.windowMinutes, 30);
  assert.strictEqual(config.degradation.minTargets, 2);
});

test('env override accepts a decimal loss threshold and is never persisted', () => {
  assert.strictEqual(getConfig().degradation.lossThresholdPercent, 7.5);
  updateConfig({ degradation: { windowMinutes: 60 } });
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.strictEqual(saved.degradation.windowMinutes, 60);
  assert.strictEqual(saved.degradation.lossThresholdPercent, 5);
  assert.strictEqual(saved.monitors.ping.intervalSeconds, 120);
});

test('validation rejects out-of-range degradation settings', () => {
  const bad = (degradation) => validateConfig({ degradation });
  assert.deepStrictEqual(bad({ windowMinutes: 30, lossThresholdPercent: 5, minTargets: 2, minCoverage: 0.9 }), []);
  assert.strictEqual(bad({ windowMinutes: 2 }).length, 1);
  assert.strictEqual(bad({ windowMinutes: 30.5 }).length, 1);
  assert.strictEqual(bad({ lossThresholdPercent: -1 }).length, 1);
  assert.strictEqual(bad({ lossThresholdPercent: '5' }).length, 1);
  assert.strictEqual(bad({ minTargets: 0 }).length, 1);
  assert.strictEqual(bad({ minCoverage: 0 }).length, 1);
  assert.strictEqual(bad({ minCoverage: 1.5 }).length, 1);
  assert.strictEqual(bad({ staleAfterIntervals: 0 }).length, 1);
  assert.deepStrictEqual(bad({ lossThresholdPercent: 5, recoveryLossThresholdPercent: null }), []);
  assert.deepStrictEqual(bad({ lossThresholdPercent: 5, recoveryLossThresholdPercent: 2 }), []);
  assert.strictEqual(bad({ lossThresholdPercent: 5, recoveryLossThresholdPercent: 6 }).length, 1);
  assert.throws(() => updateConfig({ degradation: { minTargets: 99 } }), /Invalid configuration/);
});
