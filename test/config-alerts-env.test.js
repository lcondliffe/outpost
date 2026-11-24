require('./setup');
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const file = path.join(process.env.OUTPOST_DATA_DIR, 'config.json');

// AGT-409 (env overrides never persisted) and AGT-416 (masked secrets mean
// "keep current") both live in updateConfig; a settings save must honour both.
test('saving alerts keeps a masked secret and does not persist env overrides', () => {
  fs.writeFileSync(file, JSON.stringify({
    monitors: { ping: { intervalSeconds: 120 } },
    alerts: { webhookUrl: 'https://hook.example/secret', cooldownMinutes: 30 },
  }));
  process.env.OUTPOST_PING_INTERVAL = '45';

  const { updateConfig, redactConfig } = require('../src/config');
  const result = updateConfig({ alerts: { webhookUrl: '********', cooldownMinutes: 10 } });

  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.strictEqual(saved.monitors.ping.intervalSeconds, 120, 'env override not written to config.json');
  assert.strictEqual(saved.alerts.webhookUrl, 'https://hook.example/secret', 'masked secret keeps stored value');
  assert.strictEqual(saved.alerts.cooldownMinutes, 10);

  assert.strictEqual(result.monitors.ping.intervalSeconds, 45, 'env override still wins at runtime');
  assert.strictEqual(redactConfig(result).alerts.webhookUrl, '********');
});
