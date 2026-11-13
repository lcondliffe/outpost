const fs = require('fs');
const net = require('net');
const path = require('path');

const DATA_DIR = process.env.OUTPOST_DATA_DIR || './data';
const CONFIG_PATH = path.join(DATA_DIR, 'config.json');

const DEFAULT_CONFIG = {
  monitors: {
    ping: {
      enabled: true,
      intervalSeconds: 60,
      targets: [
        { host: '8.8.8.8', name: 'Google DNS' },
        { host: '1.1.1.1', name: 'Cloudflare DNS' },
      ],
      timeout: 5000,
      packetCount: 3,
    },
    speedtest: {
      enabled: true,
      intervalHours: 1,
      serverId: null,
    },
    dns: {
      enabled: true,
      intervalSeconds: 300,
      servers: [
        { address: '8.8.8.8', name: 'Google' },
        { address: '1.1.1.1', name: 'Cloudflare' },
      ],
      testDomains: ['google.com', 'cloudflare.com'],
      timeout: 5000,
    },
    // Off by default: writes your public IP to disk.
    wanIp: {
      enabled: process.env.OUTPOST_WAN_IP_ENABLED === 'true',
      intervalSeconds: parseInt(process.env.OUTPOST_WAN_IP_INTERVAL, 10) || 300,
    },
  },
  outageDetection: {
    pingFailuresForOutage: 3,
    pingSuccessesForRecovery: 2,
  },
  retention: {
    days: 90,
  },
  server: {
    port: 3000,
  },
};

// Env vars always win over config.json (applied on every load, never persisted).
const ENV_OVERRIDES = [
  ['OUTPOST_PING_INTERVAL', ['monitors', 'ping', 'intervalSeconds']],
  ['OUTPOST_SPEEDTEST_INTERVAL', ['monitors', 'speedtest', 'intervalHours']],
  ['OUTPOST_DNS_INTERVAL', ['monitors', 'dns', 'intervalSeconds']],
  ['OUTPOST_RETENTION_DAYS', ['retention', 'days']],
  ['OUTPOST_PORT', ['server', 'port']],
];

function applyEnvOverrides(config) {
  let result = config;
  for (const [name, keys] of ENV_OVERRIDES) {
    const val = parseInt(process.env[name], 10);
    if (Number.isNaN(val)) continue;
    result = deepMerge(result, keys.reduceRight((acc, key) => ({ [key]: acc }), val));
  }
  return result;
}

// Configuration constraints
const CONSTRAINTS = {
  ping: {
    intervalSeconds: { min: 30, max: 900 },
    maxTargets: 10,
    packetCount: { min: 1, max: 10 },
    timeout: { min: 1000, max: 30000 },
  },
  speedtest: {
    intervalHours: { min: 1, max: 24 },
  },
  dns: {
    intervalSeconds: { min: 60, max: 1800 },
    maxServers: 5,
    maxTestDomains: 10,
    timeout: { min: 1000, max: 30000 },
  },
  outageDetection: {
    pingFailuresForOutage: { min: 1, max: 20 },
    pingSuccessesForRecovery: { min: 1, max: 20 },
  },
  retention: {
    days: { min: 7, max: 365 },
  },
};

// RFC 1123 hostname (labels of letters/digits/hyphens, no leading/trailing hyphen)
const HOSTNAME_RE = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i;

function isHostOrIp(value) {
  return typeof value === 'string' && (net.isIP(value) !== 0 || HOSTNAME_RE.test(value));
}

function checkInt(errors, val, range, label) {
  if (val === undefined) return;
  if (!Number.isInteger(val) || val < range.min || val > range.max) {
    errors.push(`${label} must be an integer between ${range.min} and ${range.max}`);
  }
}

function validateConfig(config) {
  const errors = [];
  const ping = config.monitors?.ping;
  const dns = config.monitors?.dns;
  const speedtest = config.monitors?.speedtest;

  checkInt(errors, ping?.timeout, CONSTRAINTS.ping.timeout, 'Ping timeout (ms)');
  checkInt(errors, dns?.timeout, CONSTRAINTS.dns.timeout, 'DNS timeout (ms)');
  checkInt(errors, config.outageDetection?.pingFailuresForOutage,
    CONSTRAINTS.outageDetection.pingFailuresForOutage, 'Ping failures for outage');
  checkInt(errors, config.outageDetection?.pingSuccessesForRecovery,
    CONSTRAINTS.outageDetection.pingSuccessesForRecovery, 'Ping successes for recovery');

  for (const t of ping?.targets || []) {
    if (!isHostOrIp(t?.host)) errors.push(`Invalid ping target "${t?.host}": must be a hostname or IP`);
  }
  for (const s of dns?.servers || []) {
    if (net.isIP(s?.address) === 0) errors.push(`Invalid DNS server "${s?.address}": must be an IP address`);
  }
  if (dns?.testDomains !== undefined) {
    if (!Array.isArray(dns.testDomains) || dns.testDomains.length === 0) {
      errors.push('At least one DNS test domain is required');
    } else if (dns.testDomains.length > CONSTRAINTS.dns.maxTestDomains) {
      errors.push(`Maximum ${CONSTRAINTS.dns.maxTestDomains} DNS test domains allowed`);
    }
    for (const d of Array.isArray(dns.testDomains) ? dns.testDomains : []) {
      if (typeof d !== 'string' || net.isIP(d) !== 0 || !HOSTNAME_RE.test(d)) {
        errors.push(`Invalid DNS test domain "${d}"`);
      }
    }
  }
  if (speedtest?.serverId != null && !/^\d{1,10}$/.test(String(speedtest.serverId))) {
    errors.push('Speedtest server ID must be numeric');
  }

  // Validate ping interval
  if (config.monitors?.ping?.intervalSeconds !== undefined) {
    const val = config.monitors.ping.intervalSeconds;
    if (val < CONSTRAINTS.ping.intervalSeconds.min || val > CONSTRAINTS.ping.intervalSeconds.max) {
      errors.push(`Ping interval must be between ${CONSTRAINTS.ping.intervalSeconds.min} and ${CONSTRAINTS.ping.intervalSeconds.max} seconds`);
    }
  }

  // Validate ping targets count
  if (config.monitors?.ping?.targets?.length > CONSTRAINTS.ping.maxTargets) {
    errors.push(`Maximum ${CONSTRAINTS.ping.maxTargets} ping targets allowed`);
  }

  // Validate ping packet count
  if (config.monitors?.ping?.packetCount !== undefined) {
    const val = config.monitors.ping.packetCount;
    if (val < CONSTRAINTS.ping.packetCount.min || val > CONSTRAINTS.ping.packetCount.max) {
      errors.push(`Ping packet count must be between ${CONSTRAINTS.ping.packetCount.min} and ${CONSTRAINTS.ping.packetCount.max}`);
    }
  }

  // Validate speedtest interval
  if (config.monitors?.speedtest?.intervalHours !== undefined) {
    const val = config.monitors.speedtest.intervalHours;
    if (val < CONSTRAINTS.speedtest.intervalHours.min || val > CONSTRAINTS.speedtest.intervalHours.max) {
      errors.push(`Speedtest interval must be between ${CONSTRAINTS.speedtest.intervalHours.min} and ${CONSTRAINTS.speedtest.intervalHours.max} hours`);
    }
  }

  // Validate DNS interval
  if (config.monitors?.dns?.intervalSeconds !== undefined) {
    const val = config.monitors.dns.intervalSeconds;
    if (val < CONSTRAINTS.dns.intervalSeconds.min || val > CONSTRAINTS.dns.intervalSeconds.max) {
      errors.push(`DNS interval must be between ${CONSTRAINTS.dns.intervalSeconds.min} and ${CONSTRAINTS.dns.intervalSeconds.max} seconds`);
    }
  }

  // Validate DNS servers count
  if (config.monitors?.dns?.servers?.length > CONSTRAINTS.dns.maxServers) {
    errors.push(`Maximum ${CONSTRAINTS.dns.maxServers} DNS servers allowed`);
  }

  // Validate retention
  if (config.retention?.days !== undefined) {
    const val = config.retention.days;
    if (val < CONSTRAINTS.retention.days.min || val > CONSTRAINTS.retention.days.max) {
      errors.push(`Retention must be between ${CONSTRAINTS.retention.days.min} and ${CONSTRAINTS.retention.days.max} days`);
    }
  }

  return errors;
}

function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] !== null && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(target[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

// Persisted config (defaults + config.json), without env overrides.
function loadFileConfig() {
  // Ensure data directory exists
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  // Load config from file if exists
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      const fileConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
      return deepMerge(DEFAULT_CONFIG, fileConfig);
    } catch (err) {
      console.error('Error reading config file, using defaults:', err.message);
      return { ...DEFAULT_CONFIG };
    }
  }

  // Save default config
  saveConfig(DEFAULT_CONFIG);
  return { ...DEFAULT_CONFIG };
}

function loadConfig() {
  return applyEnvOverrides(loadFileConfig());
}

function saveConfig(config) {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

function updateConfig(partialConfig) {
  const newConfig = deepMerge(loadFileConfig(), partialConfig);

  const errors = validateConfig(newConfig);
  if (errors.length > 0) {
    throw new Error(`Invalid configuration: ${errors.join(', ')}`);
  }

  saveConfig(newConfig);
  return applyEnvOverrides(newConfig);
}

function resetConfig() {
  saveConfig(DEFAULT_CONFIG);
  return applyEnvOverrides(DEFAULT_CONFIG);
}

// Export singleton config instance
let configInstance = null;

function getConfig() {
  if (!configInstance) {
    configInstance = loadConfig();
  }
  return configInstance;
}

function reloadConfig() {
  configInstance = loadConfig();
  return configInstance;
}

module.exports = {
  getConfig,
  reloadConfig,
  updateConfig,
  resetConfig,
  validateConfig,
  DEFAULT_CONFIG,
  CONSTRAINTS,
};
