const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.OUTPOST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'outpost-wanip-'));
process.env.OUTPOST_WAN_IP_ENABLED = 'true';

const db = require('../src/storage/database');
const { runWanIpMonitor } = require('../src/monitors/wanip');

test('records WAN IP only when it changes', async () => {
  const lookup = (ip) => async () => ip;

  assert.ok(await runWanIpMonitor(lookup('203.0.113.1')));
  assert.strictEqual(await runWanIpMonitor(lookup('203.0.113.1')), null);
  const change = await runWanIpMonitor(lookup('203.0.113.2'));
  assert.deepStrictEqual([change.previousIp, change.ip], ['203.0.113.1', '203.0.113.2']);

  assert.deepStrictEqual(db.getWanIpChanges().map((r) => r.ip), ['203.0.113.2', '203.0.113.1']);
  db.close();
});
