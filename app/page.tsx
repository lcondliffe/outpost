'use client';

import { useState, useEffect, useCallback } from 'react';
import StatusCard from '@/components/dashboard/StatusCard';
import SpeedCard from '@/components/dashboard/SpeedCard';
import LatencyCard from '@/components/dashboard/LatencyCard';
import DnsCard from '@/components/dashboard/DnsCard';
import LatencyChart from '@/components/charts/LatencyChart';
import TimeRangeSelect from '@/components/ui/TimeRangeSelect';
import {
  api,
  getPeriodMs,
  PingResult,
  SpeedtestResult,
  DnsResult,
  Outage,
  OutageStatus,
  Stats,
} from '@/lib/api';

export default function Dashboard() {
  const [timeRange, setTimeRange] = useState('24h');
  const [status, setStatus] = useState<OutageStatus | null>(null);
  const [latestPings, setLatestPings] = useState<PingResult[]>([]);
  const [latestSpeedtest, setLatestSpeedtest] = useState<SpeedtestResult | null>(null);
  const [latestDns, setLatestDns] = useState<DnsResult[]>([]);
  const [pingHistory, setPingHistory] = useState<PingResult[]>([]);
  const [recentOutages, setRecentOutages] = useState<Outage[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [isRunningSpeedtest, setIsRunningSpeedtest] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const now = Date.now();
      const start = now - getPeriodMs(timeRange);

      const [statusData, pings, speedtest, dns, history, outages, statsData] = await Promise.all([
        api.getStatus().catch(() => null),
        api.getLatestPings().catch(() => []),
        api.getLatestSpeedtest().catch(() => null),
        api.getLatestDns().catch(() => []),
        api.getPingResults(start, now).catch(() => []),
        api.getRecentOutages(5).catch(() => []),
        api.getStats(timeRange).catch(() => null),
      ]);

      setStatus(statusData);
      setLatestPings(pings);
      setLatestSpeedtest(speedtest);
      setLatestDns(dns);
      setPingHistory(history);
      setRecentOutages(outages);
      setStats(statsData);
      setError(null);
    } catch (err) {
      setError('Failed to fetch data. Is the backend running?');
      console.error('Fetch error:', err);
    }
  }, [timeRange]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleRunSpeedtest = async () => {
    setIsRunningSpeedtest(true);
    try {
      await api.triggerSpeedtest();
      // Poll for completion
      const checkComplete = setInterval(async () => {
        const result = await api.getLatestSpeedtest();
        if (result && result.timestamp > (latestSpeedtest?.timestamp || 0)) {
          setLatestSpeedtest(result);
          setIsRunningSpeedtest(false);
          clearInterval(checkComplete);
        }
      }, 5000);
      // Timeout after 3 minutes
      setTimeout(() => {
        clearInterval(checkComplete);
        setIsRunningSpeedtest(false);
      }, 180000);
    } catch (err) {
      setIsRunningSpeedtest(false);
      console.error('Speedtest error:', err);
    }
  };

  const lastResolvedOutage = recentOutages.find((o) => o.end_time !== null);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <TimeRangeSelect value={timeRange} onChange={setTimeRange} />
      </div>

      {error && (
        <div className="bg-red-900/50 border border-red-700 text-red-200 px-4 py-3 rounded">
          {error}
        </div>
      )}

      <StatusCard
        inOutage={status?.inOutage || false}
        uptime={stats?.outages.uptimePercent}
        uptimePeriod={timeRange}
        lastOutage={
          lastResolvedOutage
            ? {
                endTime: lastResolvedOutage.end_time!,
                durationSeconds: lastResolvedOutage.duration_seconds!,
              }
            : null
        }
      />

      <SpeedCard
        speedtest={latestSpeedtest}
        onRunTest={handleRunSpeedtest}
        isRunning={isRunningSpeedtest}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <LatencyCard pings={latestPings} />
        <DnsCard dnsResults={latestDns} />
      </div>

      <div className="bg-gray-900 rounded-lg border border-gray-800">
        <div className="px-4 py-3 border-b border-gray-800">
          <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wide">
            Latency History
          </h3>
        </div>
        <div className="p-4">
          <LatencyChart data={pingHistory} height={250} />
        </div>
      </div>
    </div>
  );
}
