require('./setup');
const { test } = require('node:test');
const assert = require('node:assert');
const { secondsToCron, hoursToCron } = require('../src/scheduler');

test('secondsToCron', () => {
  assert.strictEqual(secondsToCron(30), '*/30 * * * * *');
  assert.strictEqual(secondsToCron(60), '*/1 * * * *');
  assert.strictEqual(secondsToCron(300), '*/5 * * * *');
  assert.strictEqual(secondsToCron(3600), '0 */1 * * *');
});

test('hoursToCron', () => {
  assert.strictEqual(hoursToCron(1, 7), '7 * * * *');
  assert.strictEqual(hoursToCron(6, 7), '7 */6 * * *');
  assert.strictEqual(hoursToCron(2), '0 */2 * * *');
});
