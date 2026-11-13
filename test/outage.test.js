require('./setup');
const { test, beforeEach, after } = require('node:test');
const assert = require('node:assert');
const db = require('../src/storage/database');
const { checkOutageConditions, getOutageStatus, resetCounters } = require('../src/monitors/outage');

// Defaults: 3 ping failures start an outage, 2 successes end it.
const fail = [{ success: false }];
const ok = [{ success: true }];

test.mock.method(console, 'log', () => {});
beforeEach(() => resetCounters());
after(() => db.close());

test('outage starts after N consecutive ping failures and ends after M successes', () => {
  assert.strictEqual(checkOutageConditions(fail, ok).action, 'none');
  assert.strictEqual(checkOutageConditions(fail, ok).action, 'none');
  const started = checkOutageConditions(fail, ok);
  assert.strictEqual(started.action, 'started');
  assert.deepStrictEqual(started.affectedServices, ['ping']);
  assert.strictEqual(getOutageStatus().inOutage, true);

  assert.strictEqual(checkOutageConditions(ok, ok).action, 'none');
  const ended = checkOutageConditions(ok, ok);
  assert.strictEqual(ended.action, 'ended');
  assert.strictEqual(ended.outageId, started.outageId);
  assert.strictEqual(getOutageStatus().inOutage, false);
});

test('a success resets the failure streak', () => {
  checkOutageConditions(fail, ok);
  checkOutageConditions(fail, ok);
  checkOutageConditions(ok, ok);
  checkOutageConditions(fail, ok);
  assert.strictEqual(checkOutageConditions(fail, ok).action, 'none');
});

test('all DNS failing starts an outage immediately, and blocks recovery', () => {
  const started = checkOutageConditions(ok, fail);
  assert.strictEqual(started.action, 'started');
  assert.deepStrictEqual(started.affectedServices, ['dns']);

  checkOutageConditions(ok, fail);
  assert.strictEqual(checkOutageConditions(ok, fail).action, 'none');
  assert.strictEqual(checkOutageConditions(ok, ok).action, 'ended');
});
