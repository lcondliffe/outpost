const test = require('node:test');
const assert = require('node:assert');
const { csvRow } = require('../src/export');

test('csvRow quotes and escapes per RFC 4180', () => {
  assert.strictEqual(
    csvRow([1, 'plain', null, undefined, 'a,b', 'say "hi"', 'line1\nline2', 0, 1.5]),
    '1,plain,,,"a,b","say ""hi""","line1\nline2",0,1.5\r\n'
  );
});
