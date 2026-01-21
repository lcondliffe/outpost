const { Resolver } = require('dns').promises;
const db = require('../storage/database');
const { getConfig } = require('../config');

async function queryDns(server, domain, timeout = 5000) {
  const resolver = new Resolver();
  resolver.setServers([server]);

  const start = Date.now();

  try {
    await Promise.race([
      resolver.resolve4(domain),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('DNS timeout')), timeout)
      ),
    ]);

    const responseTime = Date.now() - start;
    return {
      success: true,
      responseTimeMs: responseTime,
    };
  } catch (err) {
    console.error(`DNS error for ${server} querying ${domain}:`, err.message);
    return {
      success: false,
      responseTimeMs: null,
    };
  }
}

async function runDnsMonitor() {
  const config = getConfig();
  const dnsConfig = config.monitors.dns;

  if (!dnsConfig.enabled) {
    return [];
  }

  const results = [];
  const timestamp = Date.now();

  for (const server of dnsConfig.servers) {
    for (const domain of dnsConfig.testDomains) {
      const result = await queryDns(server.address, domain, dnsConfig.timeout);

      const data = {
        timestamp,
        server: server.address,
        serverName: server.name,
        queryDomain: domain,
        responseTimeMs: result.responseTimeMs,
        success: result.success,
      };

      db.insertDns(data);
      results.push(data);

      console.log(
        `DNS ${server.name} (${server.address}) -> ${domain}: ${
          result.success ? `${result.responseTimeMs}ms` : 'FAILED'
        }`
      );
    }
  }

  return results;
}

module.exports = {
  queryDns,
  runDnsMonitor,
};
