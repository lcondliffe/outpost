const { test, mock } = require('node:test');
const assert = require('node:assert');
const { every, msUntilMinute } = require('../src/scheduler');

test('non-divisor intervals fire at an even cadence (AGT-425)', () => {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  try {
    const fired = [];
    let t = 0;
    const task = every(45_000, () => fired.push(t));
    for (let i = 0; i < 8; i++) { t += 15_000; mock.timers.tick(15_000); }
    task.stop();
    mock.timers.tick(45_000);
    assert.deepStrictEqual(fired, [45_000, 90_000]);
  } finally {
    mock.timers.reset();
  }
});

test('speedtest first run lands on the minute offset, not the top of the hour', () => {
  const now = new Date(2026, 0, 1, 10, 30, 15);
  assert.strictEqual(msUntilMinute(40, now), (9 * 60 + 45) * 1000);
  assert.strictEqual(msUntilMinute(20, now), (49 * 60 + 45) * 1000);
});
