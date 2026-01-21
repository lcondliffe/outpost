'use client';

import { useState, useEffect, useCallback } from 'react';
import Card from '@/components/ui/Card';
import TimeRangeSelect from '@/components/ui/TimeRangeSelect';
import LatencyChart from '@/components/charts/LatencyChart';
import { api, getPeriodMs, PingResult } from '@/lib/api';

export default function LatencyPage() {
  const [timeRange, setTimeRange] = useState('24h');
  const [pingResults, setPingResults] = useState<PingResult[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    const now = Date.now();
    const start = now - getPeriodMs(timeRange);
    const results = await api.getPingResults(start, now);
    setPingResults(results);
    setLoading(false);
  }, [timeRange]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Calculate stats per target
  const statsByTarget = pingResults.reduce(
    (acc, ping) => {
      const key = ping.target_name || ping.target;
      if (!acc[key]) {
        acc[key] = {
          target: ping.target,
          name: key,
          total: 0,
          successful: 0,
          latencies: [] as number[],
          packetLoss: [] as number[],
        };
      }
      acc[key].total++;
      if (ping.success) {
        acc[key].successful++;
        if (ping.rtt_avg !== null) acc[key].latencies.push(ping.rtt_avg);
      }
      if (ping.packet_loss !== null) acc[key].packetLoss.push(ping.packet_loss);
      return acc;
    },
    {} as Record<string, { target: string; name: string; total: number; successful: number; latencies: number[]; packetLoss: number[] }>
  );

  const stats = Object.values(statsByTarget).map((s) => ({
    ...s,
    successRate: ((s.successful / s.total) * 100).toFixed(1),
    avgLatency: s.latencies.length
      ? (s.latencies.reduce((a, b) => a + b, 0) / s.latencies.length).toFixed(1)
      : '-',
    minLatency: s.latencies.length ? Math.min(...s.latencies).toFixed(1) : '-',
    maxLatency: s.latencies.length ? Math.max(...s.latencies).toFixed(1) : '-',
    avgPacketLoss: s.packetLoss.length
      ? (s.packetLoss.reduce((a, b) => a + b, 0) / s.packetLoss.length).toFixed(1)
      : '-',
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Latency Monitoring</h1>
        <TimeRangeSelect value={timeRange} onChange={setTimeRange} />
      </div>

      <Card title="Latency Over Time">
        <LatencyChart data={pingResults} height={300} />
      </Card>

      <Card title="Statistics by Target">
        {loading ? (
          <div className="text-gray-500 text-center py-4">Loading...</div>
        ) : stats.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-sm text-gray-400 border-b border-gray-800">
                  <th className="pb-3 font-medium">Target</th>
                  <th className="pb-3 font-medium">Success Rate</th>
                  <th className="pb-3 font-medium">Avg Latency</th>
                  <th className="pb-3 font-medium">Min</th>
                  <th className="pb-3 font-medium">Max</th>
                  <th className="pb-3 font-medium">Avg Packet Loss</th>
                </tr>
              </thead>
              <tbody>
                {stats.map((s) => (
                  <tr key={s.target} className="border-b border-gray-800/50">
                    <td className="py-3">
                      <div>{s.name}</div>
                      <div className="text-xs text-gray-500">{s.target}</div>
                    </td>
                    <td className="py-3">
                      <span
                        className={
                          parseFloat(s.successRate) >= 99
                            ? 'text-green-400'
                            : parseFloat(s.successRate) >= 95
                              ? 'text-yellow-400'
                              : 'text-red-400'
                        }
                      >
                        {s.successRate}%
                      </span>
                    </td>
                    <td className="py-3">{s.avgLatency} ms</td>
                    <td className="py-3 text-gray-400">{s.minLatency} ms</td>
                    <td className="py-3 text-gray-400">{s.maxLatency} ms</td>
                    <td className="py-3">{s.avgPacketLoss}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-gray-500 text-center py-4">No data available</div>
        )}
      </Card>
    </div>
  );
}
