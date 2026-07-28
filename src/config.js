const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.OUTPOST_DATA_DIR || './data';
const CONFIG_PATH = path.join(DATA_DIR, 'config.json');

const DEFAULT_CONFIG = {
  monitors: {
    ping: {
      enabled: true,
      intervalSeconds: parseInt(process.env.OUTPOST_PING_INTERVAL, 10) || 60,
      targets: [
        { host: '8.8.8.8', name: 'Google DNS' },
        { host: '1.1.1.1', name: 'Cloudflare DNS' },
      ],
      timeout: 5000,
      packetCount: 3,
    },
    speedtest: {
      enabled: true,
      intervalHours: parseInt(process.env.OUTPOST_SPEEDTEST_INTERVAL, 10) || 1,
      serverId: null,
    },
    dns: {
      enabled: true,
      intervalSeconds: parseInt(process.env.OUTPOST_DNS_INTERVAL, 10) || 300,
      servers: [
        { address: '8.8.8.8', name: 'Google' },
        { address: '1.1.1.1', name: 'Cloudflare' },
      ],
      testDomains: ['google.com', 'cloudflare.com'],
      timeout: 5000,
    },
  },
  outageDetection: {
    pingFailuresForOutage: 3,
    pingSuccessesForRecovery: 2,
  },
  retention: {
    days: parseInt(process.env.OUTPOST_RETENTION_DAYS, 10) || 90,
  },
  server: {
    port: parseInt(process.env.OUTPOST_PORT, 10) || 3000,
  },
};

// Configuration constraints
const CONSTRAINTS = {
  ping: {
    intervalSeconds: { min: 30, max: 900 },
    maxTargets: 10,
    packetCount: { min: 1, max: 10 },
  },
  speedtest: {
    intervalHours: { min: 1, max: 24 },
  },
  dns: {
    intervalSeconds: { min: 60, max: 1800 },
    maxServers: 5,
  },
  retention: {
    days: { min: 7, max: 365 },
  },
};

function validateConfig(config) {
  const errors = [];

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

function loadConfig() {
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

function saveConfig(config) {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

function updateConfig(partialConfig) {
  const currentConfig = loadConfig();
  const newConfig = deepMerge(currentConfig, partialConfig);

  const errors = validateConfig(newConfig);
  if (errors.length > 0) {
    throw new Error(`Invalid configuration: ${errors.join(', ')}`);
  }

  saveConfig(newConfig);
  return newConfig;
}

function resetConfig() {
  saveConfig(DEFAULT_CONFIG);
  return { ...DEFAULT_CONFIG };
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
