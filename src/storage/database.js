const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = process.env.OUTPOST_DATA_DIR || './data';

let dbInstance = null;
const stmts = {};

function getDb() {
  if (dbInstance) return dbInstance;

  // Ensure data directory exists
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const dbPath = path.join(DATA_DIR, 'outpost.db');
  dbInstance = new Database(dbPath);

  // Enable WAL mode for better concurrent access
  dbInstance.pragma('journal_mode = WAL');

  // Initialize schema
  dbInstance.exec(`
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

  // Migration: failure detail for speedtest results (added after initial release)
  const speedtestCols = dbInstance.prepare('PRAGMA table_info(speedtest_results)').all();
  if (!speedtestCols.some((c) => c.name === 'error')) {
    dbInstance.exec('ALTER TABLE speedtest_results ADD COLUMN error TEXT');
  }

  // Prepare statements
  // Ping results
  stmts.insertPing = dbInstance.prepare(`
    INSERT INTO ping_results (timestamp, target, target_name, rtt_min, rtt_avg, rtt_max, packet_loss, success)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmts.getPingResults = dbInstance.prepare(`
    SELECT * FROM ping_results
    WHERE timestamp >= ? AND timestamp <= ?
    ORDER BY timestamp DESC
  `);

  stmts.getPingResultsByTarget = dbInstance.prepare(`
    SELECT * FROM ping_results
    WHERE timestamp >= ? AND timestamp <= ? AND target = ?
    ORDER BY timestamp DESC
  `);

  stmts.getLatestPingByTarget = dbInstance.prepare(`
    SELECT * FROM ping_results
    WHERE target = ?
    ORDER BY timestamp DESC
    LIMIT 1
  `);

  stmts.getLatestPings = dbInstance.prepare(`
    SELECT p1.* FROM ping_results p1
    INNER JOIN (
      SELECT target, MAX(timestamp) as max_ts
      FROM ping_results
      GROUP BY target
    ) p2 ON p1.target = p2.target AND p1.timestamp = p2.max_ts
  `);

  // Speedtest results
  stmts.insertSpeedtest = dbInstance.prepare(`
    INSERT INTO speedtest_results (timestamp, download_mbps, upload_mbps, ping_ms, jitter_ms, server_id, server_name, success, error)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmts.getSpeedtestResults = dbInstance.prepare(`
    SELECT * FROM speedtest_results
    WHERE timestamp >= ? AND timestamp <= ?
    ORDER BY timestamp DESC
  `);

  stmts.getLatestSpeedtest = dbInstance.prepare(`
    SELECT * FROM speedtest_results
    ORDER BY timestamp DESC
    LIMIT 1
  `);

  // Distinct from getLatestSpeedtest: the most recent run may have failed, and
  // consumers reporting "time since last good result" need the last successful
  // one regardless of how many failures followed it.
  stmts.getLastSuccessfulSpeedtest = dbInstance.prepare(`
    SELECT * FROM speedtest_results
    WHERE success = 1
    ORDER BY timestamp DESC
    LIMIT 1
  `);

  // DNS results
  stmts.insertDns = dbInstance.prepare(`
    INSERT INTO dns_results (timestamp, server, server_name, query_domain, response_time_ms, success)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  stmts.getDnsResults = dbInstance.prepare(`
    SELECT * FROM dns_results
    WHERE timestamp >= ? AND timestamp <= ?
    ORDER BY timestamp DESC
  `);

  stmts.getDnsResultsByServer = dbInstance.prepare(`
    SELECT * FROM dns_results
    WHERE timestamp >= ? AND timestamp <= ? AND server = ?
    ORDER BY timestamp DESC
  `);

  stmts.getLatestDnsByServer = dbInstance.prepare(`
    SELECT d1.* FROM dns_results d1
    INNER JOIN (
      SELECT server, MAX(timestamp) as max_ts
      FROM dns_results
      GROUP BY server
    ) d2 ON d1.server = d2.server AND d1.timestamp = d2.max_ts
  `);

  // Outages
  stmts.insertOutage = dbInstance.prepare(`
    INSERT INTO outages (start_time, end_time, duration_seconds, affected_services, notes)
    VALUES (?, ?, ?, ?, ?)
  `);

  stmts.updateOutage = dbInstance.prepare(`
    UPDATE outages
    SET end_time = ?, duration_seconds = ?
    WHERE id = ?
  `);

  stmts.getActiveOutage = dbInstance.prepare(`
    SELECT * FROM outages
    WHERE end_time IS NULL
    ORDER BY start_time DESC
    LIMIT 1
  `);

  stmts.getOutages = dbInstance.prepare(`
    SELECT * FROM outages
    WHERE start_time <= ? AND (end_time IS NULL OR end_time >= ?)
    ORDER BY start_time DESC
  `);

  stmts.getRecentOutages = dbInstance.prepare(`
    SELECT * FROM outages
    ORDER BY start_time DESC
    LIMIT ?
  `);

  // Stats queries
  stmts.getPingStats = dbInstance.prepare(`
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

  stmts.getSpeedtestStats = dbInstance.prepare(`
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

  stmts.getDnsStats = dbInstance.prepare(`
    SELECT
      COUNT(*) as total_queries,
      SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful_queries,
      AVG(CASE WHEN success = 1 THEN response_time_ms ELSE NULL END) as avg_response_time
    FROM dns_results
    WHERE timestamp >= ?
  `);

  // Sums the intersection of each outage with the window [since, now],
  // treating an ongoing outage (end_time IS NULL) as still open at `now`.
  // Outages are counted/summed if they overlap the window at all, even if
  // they started before it or are still ongoing.
  stmts.getOutageStats = dbInstance.prepare(`
    SELECT
      COUNT(*) as total_outages,
      SUM(
        MAX(0, MIN(COALESCE(end_time, @now), @now) - MAX(start_time, @since))
      ) as total_downtime_ms
    FROM outages
    WHERE start_time < @now AND COALESCE(end_time, @now) > @since
  `);

  // Retention cleanup
  stmts.cleanupPing = dbInstance.prepare('DELETE FROM ping_results WHERE timestamp < ?');
  stmts.cleanupSpeedtest = dbInstance.prepare('DELETE FROM speedtest_results WHERE timestamp < ?');
  stmts.cleanupDns = dbInstance.prepare('DELETE FROM dns_results WHERE timestamp < ?');

  return dbInstance;
}

function runRetentionCleanup(retentionDays) {
  const db = getDb();
  const cutoff = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);
  const transaction = db.transaction(() => {
    stmts.cleanupPing.run(cutoff);
    stmts.cleanupSpeedtest.run(cutoff);
    stmts.cleanupDns.run(cutoff);
  });
  transaction();
  db.exec('VACUUM');
}

module.exports = {
  get db() { return getDb(); },
  // Ping
  insertPing: (data) => {
    getDb();
    return stmts.insertPing.run(
      data.timestamp, data.target, data.targetName,
      data.rttMin, data.rttAvg, data.rttMax, data.packetLoss, data.success ? 1 : 0
    );
  },
  getPingResults: (start, end) => {
    getDb();
    return stmts.getPingResults.all(start, end);
  },
  getPingResultsByTarget: (start, end, target) => {
    getDb();
    return stmts.getPingResultsByTarget.all(start, end, target);
  },
  getLatestPingByTarget: (target) => {
    getDb();
    return stmts.getLatestPingByTarget.get(target);
  },
  getLatestPings: () => {
    getDb();
    return stmts.getLatestPings.all();
  },

  // Speedtest
  insertSpeedtest: (data) => {
    getDb();
    return stmts.insertSpeedtest.run(
      data.timestamp, data.downloadMbps, data.uploadMbps,
      data.pingMs, data.jitterMs, data.serverId, data.serverName, data.success ? 1 : 0,
      data.error || null
    );
  },
  getSpeedtestResults: (start, end) => {
    getDb();
    return stmts.getSpeedtestResults.all(start, end);
  },
  getLatestSpeedtest: () => {
    getDb();
    return stmts.getLatestSpeedtest.get();
  },
  getLastSuccessfulSpeedtest: () => {
    getDb();
    return stmts.getLastSuccessfulSpeedtest.get();
  },

  // DNS
  insertDns: (data) => {
    getDb();
    return stmts.insertDns.run(
      data.timestamp, data.server, data.serverName,
      data.queryDomain, data.responseTimeMs, data.success ? 1 : 0
    );
  },
  getDnsResults: (start, end) => {
    getDb();
    return stmts.getDnsResults.all(start, end);
  },
  getDnsResultsByServer: (start, end, server) => {
    getDb();
    return stmts.getDnsResultsByServer.all(start, end, server);
  },
  getLatestDns: () => {
    getDb();
    return stmts.getLatestDnsByServer.all();
  },

  // Outages
  insertOutage: (data) => {
    getDb();
    const result = stmts.insertOutage.run(
      data.startTime, data.endTime || null,
      data.durationSeconds || null, JSON.stringify(data.affectedServices || []), data.notes || null
    );
    return result.lastInsertRowid;
  },
  updateOutage: (id, endTime, durationSeconds) => {
    getDb();
    return stmts.updateOutage.run(endTime, durationSeconds, id);
  },
  getActiveOutage: () => {
    getDb();
    return stmts.getActiveOutage.get();
  },
  getOutages: (start, end) => {
    getDb();
    // Overlap semantics: an outage overlaps [start, end] when it started
    // at or before the window's end, and either it's still ongoing
    // (end_time IS NULL) or it ended at or after the window's start.
    return stmts.getOutages.all(end, start);
  },
  getRecentOutages: (limit = 10) => {
    getDb();
    return stmts.getRecentOutages.all(limit);
  },

  // Stats
  getPingStats: (since) => {
    getDb();
    return stmts.getPingStats.get(since);
  },
  getSpeedtestStats: (since) => {
    getDb();
    return stmts.getSpeedtestStats.get(since);
  },
  getDnsStats: (since) => {
    getDb();
    return stmts.getDnsStats.get(since);
  },
  getOutageStats: (since, now = Date.now()) => {
    getDb();
    const row = stmts.getOutageStats.get({ since, now });
    const totalDowntimeMs = row?.total_downtime_ms || 0;
    return {
      total_outages: row?.total_outages || 0,
      total_downtime_seconds: totalDowntimeMs / 1000,
    };
  },

  // Maintenance
  runRetentionCleanup,
};
