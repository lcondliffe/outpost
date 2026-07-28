import { NextRequest, NextResponse } from 'next/server';
import db from '@/src/storage/database';

function getPeriodStart(period: string): number {
  const now = Date.now();
  const periods: Record<string, number> = {
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000,
    '90d': 90 * 24 * 60 * 60 * 1000,
  };
  return now - (periods[period] || periods['24h']);
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const period = searchParams.get('period') || '24h';
  const since = getPeriodStart(period);

  try {
    const now = Date.now();
    const pingStats = db.getPingStats(since);
    const speedtestStats = db.getSpeedtestStats(since);
    const dnsStats = db.getDnsStats(since);
    const outageStats = db.getOutageStats(since, now);

    // Calculate uptime percentage from the downtime that actually falls
    // within [since, now], clamped to a sane 0-100 range. Outages that are
    // ongoing or that straddle the window boundaries are only counted for
    // the portion that overlaps the window (see getOutageStats), so this
    // can no longer exceed the window length or go negative from bad data,
    // but we clamp defensively anyway.
    const totalSeconds = (now - since) / 1000;
    const downtimeSeconds = outageStats?.total_downtime_seconds || 0;
    const rawUptimePercent = totalSeconds > 0
      ? ((totalSeconds - downtimeSeconds) / totalSeconds) * 100
      : 100;
    const uptimePercent = Math.min(100, Math.max(0, rawUptimePercent));

    return NextResponse.json({
      period,
      since,
      ping: {
        totalChecks: pingStats?.total_checks || 0,
        successfulChecks: pingStats?.successful_checks || 0,
        successRate: pingStats?.total_checks
          ? ((pingStats.successful_checks / pingStats.total_checks) * 100).toFixed(2)
          : 0,
        avgLatency: pingStats?.avg_latency?.toFixed(2) || null,
        minLatency: pingStats?.min_latency?.toFixed(2) || null,
        maxLatency: pingStats?.max_latency?.toFixed(2) || null,
        avgPacketLoss: pingStats?.avg_packet_loss?.toFixed(2) || null,
      },
      speedtest: {
        totalTests: speedtestStats?.total_tests || 0,
        successfulTests: speedtestStats?.successful_tests || 0,
        avgDownload: speedtestStats?.avg_download?.toFixed(2) || null,
        avgUpload: speedtestStats?.avg_upload?.toFixed(2) || null,
        minDownload: speedtestStats?.min_download?.toFixed(2) || null,
        maxDownload: speedtestStats?.max_download?.toFixed(2) || null,
      },
      dns: {
        totalQueries: dnsStats?.total_queries || 0,
        successfulQueries: dnsStats?.successful_queries || 0,
        successRate: dnsStats?.total_queries
          ? ((dnsStats.successful_queries / dnsStats.total_queries) * 100).toFixed(2)
          : 0,
        avgResponseTime: dnsStats?.avg_response_time?.toFixed(2) || null,
      },
      outages: {
        totalOutages: outageStats?.total_outages || 0,
        totalDowntimeSeconds: downtimeSeconds,
        uptimePercent: uptimePercent.toFixed(3),
      },
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
  }
}
