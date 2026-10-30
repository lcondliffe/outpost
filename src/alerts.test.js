// Run: npm test
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'outpost-alerts-'));
process.env.OUTPOST_DATA_DIR = dir;
const writeAlerts = (alerts) =>
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ alerts }));

const { redactConfig, updateConfig, loadConfig } = require('./config');
const alerts = require('./alerts');

let sent = [];
let down = false;
globalThis.fetch = async (url, opts) => {
  if (down) throw new Error('network down');
  sent.push({ url, opts });
  return { ok: true, status: 200 };
};

test('outage alerts queue while down, flush on recovery, cooldown pairs start/end', async () => {
  writeAlerts({ webhookUrl: 'https://hook.example/x', cooldownMinutes: 30 });
  down = true;
  await alerts.onOutageStarted(1, ['ping']);
  assert.strictEqual(alerts._state.queue.length, 1);

  down = false;
  await alerts.onOutageEnded(1, 125);
  assert.deepStrictEqual(sent.map((s) => JSON.parse(s.opts.body).event), ['outage_started', 'outage_resolved']);
  assert.match(JSON.parse(sent[1].opts.body).content, /2m 5s/);

  // Flap within cooldown: start and its resolve are both suppressed.
  sent = [];
  await alerts.onOutageStarted(2, ['ping']);
  await alerts.onOutageEnded(2, 10);
  assert.strictEqual(sent.length, 0);
});

test('speedtest alert fires once after N consecutive slow runs', async () => {
  writeAlerts({ ntfyUrl: 'https://ntfy.example/t', speedtestFloorMbps: 100, speedtestConsecutive: 2 });
  sent = [];
  for (const mbps of [50, 50, 50]) await alerts.onSpeedtest({ success: true, downloadMbps: mbps });
  assert.strictEqual(sent.length, 1);
  assert.strictEqual(sent[0].opts.headers.Title, 'Outpost: slow speedtests');
});

test('latency degradation ignores total failure and resets on recovery', async () => {
  writeAlerts({ ntfyUrl: 'https://ntfy.example/t', latencyThresholdMs: 100, degradedChecks: 2, cooldownMinutes: 1 });
  sent = [];
  const slow = [{ success: true, rttAvg: 300, packetLoss: 0 }];
  const dead = [{ success: false, rttAvg: null, packetLoss: 100 }];
  const fast = [{ success: true, rttAvg: 10, packetLoss: 0 }];
  for (const r of [slow, dead, fast, slow]) await alerts.onPingResults(r);
  assert.strictEqual(sent.length, 0);
  await alerts.onPingResults(slow);
  assert.strictEqual(sent.length, 1);
});

test('secrets are masked on read and preserved when the mask is sent back', () => {
  writeAlerts({ webhookUrl: 'https://hook.example/secret' });
  assert.strictEqual(redactConfig(loadConfig()).alerts.webhookUrl, '********');
  updateConfig({ alerts: { webhookUrl: '********', cooldownMinutes: 5 } });
  assert.strictEqual(loadConfig().alerts.webhookUrl, 'https://hook.example/secret');
  assert.throws(() => updateConfig({ alerts: { ntfyUrl: 'javascript:alert(1)' } }), /http\(s\) URL/);
});
