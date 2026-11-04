require('./setup');
const { test, after } = require('node:test');
const assert = require('node:assert');
const db = require('../src/storage/database');

after(() => db.close());

const HOUR = 3600_000;
const now = 100 * HOUR;

test('getOutageStats only counts downtime inside the window', () => {
  // Started before the window, ended inside it: 1h counted.
  db.insertOutage({ startTime: now - 26 * HOUR, endTime: now - 23 * HOUR });
  // Fully inside: 30 min.
  db.insertOutage({ startTime: now - 2 * HOUR, endTime: now - 1.5 * HOUR });
  // Entirely before the window: ignored.
  db.insertOutage({ startTime: now - 50 * HOUR, endTime: now - 40 * HOUR });
  // Ongoing: open until `now`, 10 min.
  db.insertOutage({ startTime: now - HOUR / 6 });

  const stats = db.getOutageStats(now - 24 * HOUR, now);
  assert.strictEqual(stats.total_outages, 3);
  assert.strictEqual(stats.total_downtime_seconds, (HOUR + HOUR / 2 + HOUR / 6) / 1000);
});

test('getOutages uses overlap semantics', () => {
  const rows = db.getOutages(now - 24 * HOUR, now);
  assert.strictEqual(rows.length, 3);
});

test('getActiveOutage / updateOutage', () => {
  const active = db.getActiveOutage();
  assert.ok(active);
  db.updateOutage(active.id, now, 600);
  assert.strictEqual(db.getActiveOutage(), undefined);
});

test('getLatestPings returns the newest row per target', () => {
  db.insertPing({ timestamp: 1, target: 'a', success: true });
  db.insertPing({ timestamp: 2, target: 'a', success: false });
  db.insertPing({ timestamp: 1, target: 'b', success: true });
  const latest = Object.fromEntries(db.getLatestPings().map((r) => [r.target, r]));
  assert.strictEqual(latest.a.timestamp, 2);
  assert.strictEqual(latest.a.success, 0);
  assert.strictEqual(latest.b.timestamp, 1);
});
