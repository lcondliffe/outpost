const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = process.env.OUTPOST_DATA_DIR || './data';

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const dbPath = path.join(DATA_DIR, 'outpost.db');
const db = new Database(dbPath);

// Enable WAL mode for better concurrent access
db.pragma('journal_mode = WAL');

// Initialize schema
function initSchema() {
  db.exec(`
    -- Ping measurements
    CREATE TABLE IF NOT EXISTS ping_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp INTEGER NOT NULL,
      target TEXT NOT NULL,
      target_name TEXT,
      rtt_min REAL,
      rtt_avg REAL,
      rtt_max REAL,
      packet_loss REAL,
      success INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_ping_timestamp ON ping_results(timestamp);
    CREATE INDEX IF NOT EXISTS idx_ping_target ON ping_results(target, timestamp);

    -- Speedtest results
    CREATE TABLE IF NOT EXISTS speedtest_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp INTEGER NOT NULL,
      download_mbps REAL,
      upload_mbps REAL,
      ping_ms REAL,
      jitter_ms REAL,
      server_id TEXT,
      server_name TEXT,
      success INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_speedtest_timestamp ON speedtest_results(timestamp);

    -- DNS query results
    CREATE TABLE IF NOT EXISTS dns_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp INTEGER NOT NULL,
      server TEXT NOT NULL,
      server_name TEXT,
      query_domain TEXT NOT NULL,
      response_time_ms REAL,
      success INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_dns_timestamp ON dns_results(timestamp);
    CREATE INDEX IF NOT EXISTS idx_dns_server ON dns_results(server, timestamp);

    -- Outage records
    CREATE TABLE IF NOT EXISTS outages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      start_time INTEGER NOT NULL,
      end_time INTEGER,
      duration_seconds INTEGER,
      affected_services TEXT,
      notes TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_outages_start ON outages(start_time);
  `);
}

initSchema();

// Ping results
const insertPing = db.prepare(`
  INSERT INTO ping_results (timestamp, target, target_name, rtt_min, rtt_avg, rtt_max, packet_loss, success)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

const getPingResults = db.prepare(`
  SELECT * FROM ping_results
  WHERE timestamp >= ? AND timestamp <= ?
  ORDER BY timestamp DESC
`);

const getPingResultsByTarget = db.prepare(`
  SELECT * FROM ping_results
  WHERE timestamp >= ? AND timestamp <= ? AND target = ?
  ORDER BY timestamp DESC
`);

const getLatestPingByTarget = db.prepare(`
  SELECT * FROM ping_results
  WHERE target = ?
  ORDER BY timestamp DESC
  LIMIT 1
`);

const getLatestPings = db.prepare(`
  SELECT p1.* FROM ping_results p1
  INNER JOIN (
    SELECT target, MAX(timestamp) as max_ts
    FROM ping_results
    GROUP BY target
  ) p2 ON p1.target = p2.target AND p1.timestamp = p2.max_ts
`);

// Speedtest results
const insertSpeedtest = db.prepare(`
  INSERT INTO speedtest_results (timestamp, download_mbps, upload_mbps, ping_ms, jitter_ms, server_id, server_name, success)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

const getSpeedtestResults = db.prepare(`
  SELECT * FROM speedtest_results
  WHERE timestamp >= ? AND timestamp <= ?
  ORDER BY timestamp DESC
`);

const getLatestSpeedtest = db.prepare(`
  SELECT * FROM speedtest_results
  ORDER BY timestamp DESC
  LIMIT 1
`);

// DNS results
const insertDns = db.prepare(`
  INSERT INTO dns_results (timestamp, server, server_name, query_domain, response_time_ms, success)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const getDnsResults = db.prepare(`
  SELECT * FROM dns_results
  WHERE timestamp >= ? AND timestamp <= ?
  ORDER BY timestamp DESC
`);

const getDnsResultsByServer = db.prepare(`
  SELECT * FROM dns_results
  WHERE timestamp >= ? AND timestamp <= ? AND server = ?
  ORDER BY timestamp DESC
`);

const getLatestDnsByServer = db.prepare(`
  SELECT d1.* FROM dns_results d1
  INNER JOIN (
    SELECT server, MAX(timestamp) as max_ts
    FROM dns_results
    GROUP BY server
  ) d2 ON d1.server = d2.server AND d1.timestamp = d2.max_ts
`);

// Outages
const insertOutage = db.prepare(`
  INSERT INTO outages (start_time, end_time, duration_seconds, affected_services, notes)
  VALUES (?, ?, ?, ?, ?)
`);

const updateOutage = db.prepare(`
  UPDATE outages
  SET end_time = ?, duration_seconds = ?
  WHERE id = ?
`);

const getActiveOutage = db.prepare(`
  SELECT * FROM outages
  WHERE end_time IS NULL
  ORDER BY start_time DESC
  LIMIT 1
`);

const getOutages = db.prepare(`
  SELECT * FROM outages
  WHERE start_time >= ? AND (end_time <= ? OR end_time IS NULL)
  ORDER BY start_time DESC
`);

const getRecentOutages = db.prepare(`
  SELECT * FROM outages
  ORDER BY start_time DESC
  LIMIT ?
`);

// Stats queries
const getPingStats = db.prepare(`
  SELECT
    COUNT(*) as total_checks,
    SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful_checks,
    AVG(CASE WHEN success = 1 THEN rtt_avg ELSE NULL END) as avg_latency,
    MIN(CASE WHEN success = 1 THEN rtt_min ELSE NULL END) as min_latency,
    MAX(CASE WHEN success = 1 THEN rtt_max ELSE NULL END) as max_latency,
    AVG(packet_loss) as avg_packet_loss
  FROM ping_results
  WHERE timestamp >= ?
`);

const getSpeedtestStats = db.prepare(`
  SELECT
    COUNT(*) as total_tests,
    SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful_tests,
    AVG(CASE WHEN success = 1 THEN download_mbps ELSE NULL END) as avg_download,
    AVG(CASE WHEN success = 1 THEN upload_mbps ELSE NULL END) as avg_upload,
    MIN(CASE WHEN success = 1 THEN download_mbps ELSE NULL END) as min_download,
    MAX(CASE WHEN success = 1 THEN download_mbps ELSE NULL END) as max_download
  FROM speedtest_results
  WHERE timestamp >= ?
`);

const getDnsStats = db.prepare(`
  SELECT
    COUNT(*) as total_queries,
    SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful_queries,
    AVG(CASE WHEN success = 1 THEN response_time_ms ELSE NULL END) as avg_response_time
  FROM dns_results
  WHERE timestamp >= ?
`);

const getOutageStats = db.prepare(`
  SELECT
    COUNT(*) as total_outages,
    SUM(duration_seconds) as total_downtime_seconds
  FROM outages
  WHERE start_time >= ? AND end_time IS NOT NULL
`);

// Retention cleanup
const cleanupPing = db.prepare('DELETE FROM ping_results WHERE timestamp < ?');
const cleanupSpeedtest = db.prepare('DELETE FROM speedtest_results WHERE timestamp < ?');
const cleanupDns = db.prepare('DELETE FROM dns_results WHERE timestamp < ?');

function runRetentionCleanup(retentionDays) {
  const cutoff = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);
  const transaction = db.transaction(() => {
    cleanupPing.run(cutoff);
    cleanupSpeedtest.run(cutoff);
    cleanupDns.run(cutoff);
  });
  transaction();
  db.exec('VACUUM');
}

module.exports = {
  db,
  // Ping
  insertPing: (data) => insertPing.run(
    data.timestamp, data.target, data.targetName,
    data.rttMin, data.rttAvg, data.rttMax, data.packetLoss, data.success ? 1 : 0
  ),
  getPingResults: (start, end) => getPingResults.all(start, end),
  getPingResultsByTarget: (start, end, target) => getPingResultsByTarget.all(start, end, target),
  getLatestPingByTarget: (target) => getLatestPingByTarget.get(target),
  getLatestPings: () => getLatestPings.all(),

  // Speedtest
  insertSpeedtest: (data) => insertSpeedtest.run(
    data.timestamp, data.downloadMbps, data.uploadMbps,
    data.pingMs, data.jitterMs, data.serverId, data.serverName, data.success ? 1 : 0
  ),
  getSpeedtestResults: (start, end) => getSpeedtestResults.all(start, end),
  getLatestSpeedtest: () => getLatestSpeedtest.get(),

  // DNS
  insertDns: (data) => insertDns.run(
    data.timestamp, data.server, data.serverName,
    data.queryDomain, data.responseTimeMs, data.success ? 1 : 0
  ),
  getDnsResults: (start, end) => getDnsResults.all(start, end),
  getDnsResultsByServer: (start, end, server) => getDnsResultsByServer.all(start, end, server),
  getLatestDns: () => getLatestDnsByServer.all(),

  // Outages
  insertOutage: (data) => {
    const result = insertOutage.run(
      data.startTime, data.endTime || null,
      data.durationSeconds || null, JSON.stringify(data.affectedServices || []), data.notes || null
    );
    return result.lastInsertRowid;
  },
  updateOutage: (id, endTime, durationSeconds) => updateOutage.run(endTime, durationSeconds, id),
  getActiveOutage: () => getActiveOutage.get(),
  getOutages: (start, end) => getOutages.all(start, end),
  getRecentOutages: (limit = 10) => getRecentOutages.all(limit),

  // Stats
  getPingStats: (since) => getPingStats.get(since),
  getSpeedtestStats: (since) => getSpeedtestStats.get(since),
  getDnsStats: (since) => getDnsStats.get(since),
  getOutageStats: (since) => getOutageStats.get(since),

  // Maintenance
  runRetentionCleanup,
};
