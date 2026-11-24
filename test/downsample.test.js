const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.OUTPOST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'outpost-test-'));
const db = require('../src/storage/database');

test('ping/dns results bucket in SQL, keeping spikes and success fraction', () => {
  const MIN = 60 * 1000;
  const HOUR = 60 * MIN;
  assert.strictEqual(db.pickBucketMs(0, 6 * HOUR), 0);
  assert.strictEqual(db.pickBucketMs(0, 24 * HOUR), MIN);
  assert.strictEqual(db.pickBucketMs(0, 90 * 24 * HOUR), HOUR);

  // Two checks in bucket [0, 5m), one in [5m, 10m)
  const ping = (timestamp, rtt, success) => db.insertPing({
    timestamp, target: '1.1.1.1', targetName: 'cf',
    rttMin: rtt, rttAvg: rtt, rttMax: rtt, packetLoss: success ? 0 : 100, success,
  });
  ping(1000, 10, true);
  ping(2000, 500, true); // spike
  ping(3000, null, false);
  ping(5 * MIN + 1, 20, true);

  const rows = db.getPingResults(0, HOUR, 5 * MIN);
  assert.strictEqual(rows.length, 2);
  const [late, early] = rows; // newest first, like raw rows
  assert.strictEqual(early.timestamp, 0);
  assert.strictEqual(early.rtt_max, 500);
  assert.strictEqual(early.rtt_min, 10);
  assert.strictEqual(early.rtt_avg, 255);
  assert.ok(Math.abs(early.success - 2 / 3) < 1e-9);
  assert.strictEqual(late.timestamp, 5 * MIN);
  assert.strictEqual(db.getPingResults(0, HOUR, 0).length, 4); // bucket 0 = raw
  assert.strictEqual(db.getPingResultsByTarget(0, HOUR, 'nope', 5 * MIN).length, 0);

  db.insertDns({ timestamp: 1000, server: '8.8.8.8', serverName: 'g', queryDomain: 'a.com', responseTimeMs: 5, success: true });
  db.insertDns({ timestamp: 2000, server: '8.8.8.8', serverName: 'g', queryDomain: 'a.com', responseTimeMs: 95, success: true });
  const [dns] = db.getDnsResults(0, HOUR, 5 * MIN);
  assert.deepStrictEqual(
    [dns.response_time_ms, dns.response_time_min, dns.response_time_max, dns.success],
    [50, 5, 95, 1],
  );
});
