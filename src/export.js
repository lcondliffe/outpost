const Database = require('better-sqlite3');
const db = require('./storage/database');

const QUERIES = {
  ping: 'SELECT * FROM ping_results WHERE timestamp >= @start AND timestamp <= @end ORDER BY timestamp',
  dns: 'SELECT * FROM dns_results WHERE timestamp >= @start AND timestamp <= @end ORDER BY timestamp',
  speedtest: 'SELECT * FROM speedtest_results WHERE timestamp >= @start AND timestamp <= @end ORDER BY timestamp',
  // Same overlap semantics as getOutages: anything touching [start, end].
  outages: 'SELECT * FROM outages WHERE start_time <= @end AND (end_time IS NULL OR end_time >= @start) ORDER BY start_time',
};

const FORMATS = ['csv', 'json'];
const CHUNK_SIZE = 64 * 1024;

// RFC 4180: quote fields containing comma, quote, CR or LF; double embedded quotes.
function csvField(value) {
  if (value === null || value === undefined) return '';
  const s = String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function csvRow(values) {
  return values.map(csvField).join(',') + '\r\n';
}

// Yields the export body in ~64KB string chunks. Uses its own read-only
// connection: iterate() keeps a connection busy until exhausted, which would
// block the scheduler's inserts on the shared one. WAL allows the concurrent read.
function* exportChunks(type, format, start, end) {
  const conn = new Database(db.db.name, { readonly: true, fileMustExist: true });
  try {
    const stmt = conn.prepare(QUERIES[type]);
    const columns = stmt.columns().map((c) => c.name);
    let buf = format === 'csv' ? csvRow(columns) : '[';
    let first = true;
    for (const row of stmt.iterate({ start, end })) {
      if (format === 'csv') {
        buf += csvRow(columns.map((c) => row[c]));
      } else {
        buf += (first ? '\n' : ',\n') + JSON.stringify(row);
        first = false;
      }
      if (buf.length >= CHUNK_SIZE) {
        yield buf;
        buf = '';
      }
    }
    if (format === 'json') buf += first ? ']\n' : '\n]\n';
    yield buf;
  } finally {
    conn.close();
  }
}

module.exports = { QUERIES, FORMATS, csvField, csvRow, exportChunks };
