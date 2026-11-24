const { Resolver } = require('dns').promises;
const net = require('net');
const db = require('../storage/database');
const { getConfig } = require('../config');

const TIMEOUT_MS = 5000;

// Equivalent of `dig +short myip.opendns.com @resolver1.opendns.com`.
async function lookupViaDns() {
  const resolver = new Resolver({ timeout: TIMEOUT_MS, tries: 1 });
  resolver.setServers(['208.67.222.222']);
  const [ip] = await resolver.resolve4('myip.opendns.com');
  return ip;
}

async function lookupViaHttp() {
  const res = await fetch('https://api.ipify.org', { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.text()).trim();
}

async function lookupPublicIp() {
  let ip;
  try {
    ip = await lookupViaDns();
  } catch (err) {
    console.error('WAN IP DNS lookup failed, trying HTTP:', err.message);
    ip = await lookupViaHttp();
  }
  if (!net.isIP(ip)) throw new Error(`Invalid IP from lookup: ${ip}`);
  return ip;
}

// Records a row only when the IP differs from the last recorded one.
async function runWanIpMonitor(lookup = lookupPublicIp) {
  if (!getConfig().monitors.wanIp?.enabled) return null;

  const ip = await lookup();
  const previous = db.getLatestWanIp();
  if (previous?.ip === ip) return null;

  const change = { timestamp: Date.now(), ip, previousIp: previous?.ip ?? null };
  db.insertWanIp(change);
  console.log(`WAN IP ${previous ? `changed ${previous.ip} -> ${ip}` : `recorded: ${ip}`}`);
  return change;
}

module.exports = { lookupPublicIp, runWanIpMonitor };
