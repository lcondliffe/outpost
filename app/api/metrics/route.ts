import { NextResponse } from 'next/server';
import packageJson from '@/package.json';
import db from '@/src/storage/database';

function escapeLabelValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

function formatLabels(labels: Record<string, string>): string {
  const parts = Object.entries(labels).map(
    ([key, value]) => `${key}="${escapeLabelValue(value)}"`
  );
  return parts.length ? `{${parts.join(',')}}` : '';
}

function metricLine(name: string, value: number, labels: Record<string, string> = {}): string {
  return `${name}${formatLabels(labels)} ${value}`;
}

export async function GET() {
  const lines: string[] = [];

  // Ping metrics
  lines.push('# HELP outpost_ping_rtt_ms Latest average round-trip time in milliseconds');
  lines.push('# TYPE outpost_ping_rtt_ms gauge');
  lines.push('# HELP outpost_ping_packet_loss_ratio Latest packet loss ratio (0-1)');
  lines.push('# TYPE outpost_ping_packet_loss_ratio gauge');
  lines.push('# HELP outpost_ping_up Whether the latest ping check succeeded (1) or not (0)');
  lines.push('# TYPE outpost_ping_up gauge');

  const latestPings = db.getLatestPings();
  for (const ping of latestPings) {
    const labels = { target: ping.target, name: ping.target_name || ping.target };
    if (ping.success && ping.rtt_avg != null) {
      lines.push(metricLine('outpost_ping_rtt_ms', ping.rtt_avg, labels));
    }
    lines.push(
      metricLine('outpost_ping_packet_loss_ratio', (ping.packet_loss ?? 0) / 100, labels)
    );
    lines.push(metricLine('outpost_ping_up', ping.success ? 1 : 0, labels));
  }

  // DNS metrics
  lines.push('# HELP outpost_dns_response_ms Latest DNS response time in milliseconds');
  lines.push('# TYPE outpost_dns_response_ms gauge');
  lines.push('# HELP outpost_dns_up Whether the latest DNS check succeeded (1) or not (0)');
  lines.push('# TYPE outpost_dns_up gauge');

  const latestDns = db.getLatestDns();
  for (const dns of latestDns) {
    const labels = { server: dns.server, name: dns.server_name || dns.server };
    if (dns.success && dns.response_time_ms != null) {
      lines.push(metricLine('outpost_dns_response_ms', dns.response_time_ms, labels));
    }
    lines.push(metricLine('outpost_dns_up', dns.success ? 1 : 0, labels));
  }

  // Speedtest metrics
  lines.push('# HELP outpost_speedtest_download_mbps Latest speedtest download speed in Mbps');
  lines.push('# TYPE outpost_speedtest_download_mbps gauge');
  lines.push('# HELP outpost_speedtest_upload_mbps Latest speedtest upload speed in Mbps');
  lines.push('# TYPE outpost_speedtest_upload_mbps gauge');
  lines.push('# HELP outpost_speedtest_ping_ms Latest speedtest ping in milliseconds');
  lines.push('# TYPE outpost_speedtest_ping_ms gauge');
  lines.push('# HELP outpost_speedtest_jitter_ms Latest speedtest jitter in milliseconds');
  lines.push('# TYPE outpost_speedtest_jitter_ms gauge');
  lines.push(
    '# HELP outpost_speedtest_last_success_timestamp_seconds Unix timestamp of the last successful speedtest'
  );
  lines.push('# TYPE outpost_speedtest_last_success_timestamp_seconds gauge');

  const latestSpeedtest = db.getLatestSpeedtest();
  if (latestSpeedtest && latestSpeedtest.success) {
    if (latestSpeedtest.download_mbps != null) {
      lines.push(metricLine('outpost_speedtest_download_mbps', latestSpeedtest.download_mbps));
    }
    if (latestSpeedtest.upload_mbps != null) {
      lines.push(metricLine('outpost_speedtest_upload_mbps', latestSpeedtest.upload_mbps));
    }
    if (latestSpeedtest.ping_ms != null) {
      lines.push(metricLine('outpost_speedtest_ping_ms', latestSpeedtest.ping_ms));
    }
    if (latestSpeedtest.jitter_ms != null) {
      lines.push(metricLine('outpost_speedtest_jitter_ms', latestSpeedtest.jitter_ms));
    }
    lines.push(
      metricLine(
        'outpost_speedtest_last_success_timestamp_seconds',
        Math.floor(latestSpeedtest.timestamp / 1000)
      )
    );
  }

  // Outage metrics
  lines.push('# HELP outpost_outage_active Whether an outage is currently active (1) or not (0)');
  lines.push('# TYPE outpost_outage_active gauge');
  lines.push('# HELP outpost_outages_total Total number of recorded outages');
  lines.push('# TYPE outpost_outages_total counter');
  lines.push('# HELP outpost_downtime_seconds_total Total recorded downtime in seconds');
  lines.push('# TYPE outpost_downtime_seconds_total counter');

  const activeOutage = db.getActiveOutage();
  const outageStats = db.getOutageStats(0);
  lines.push(metricLine('outpost_outage_active', activeOutage ? 1 : 0));
  lines.push(metricLine('outpost_outages_total', outageStats.total_outages));
  lines.push(metricLine('outpost_downtime_seconds_total', outageStats.total_downtime_seconds));

  // Build info
  lines.push('# HELP outpost_build_info Outpost build information');
  lines.push('# TYPE outpost_build_info gauge');
  lines.push(
    metricLine('outpost_build_info', 1, {
      version: packageJson.version,
      revision: process.env.OUTPOST_REVISION || 'unknown',
    })
  );

  const body = lines.join('\n') + '\n';

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
    },
  });
}
