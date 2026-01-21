'use client';

import { useState, useEffect, useCallback } from 'react';
import Card from '@/components/ui/Card';
import TimeRangeSelect from '@/components/ui/TimeRangeSelect';
import { api, getPeriodMs, DnsResult } from '@/lib/api';

export default function DnsPage() {
  const [timeRange, setTimeRange] = useState('24h');
  const [results, setResults] = useState<DnsResult[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    const now = Date.now();
    const start = now - getPeriodMs(timeRange);
    const data = await api.getDnsResults(start, now);
    setResults(data);
    setLoading(false);
  }, [timeRange]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Group stats by server
  const statsByServer = results.reduce(
    (acc, r) => {
      const key = r.server_name || r.server;
      if (!acc[key]) {
        acc[key] = {
          server: r.server,
          name: key,
          total: 0,
          successful: 0,
          responseTimes: [] as number[],
        };
      }
      acc[key].total++;
      if (r.success) {
        acc[key].successful++;
        if (r.response_time_ms !== null) {
          acc[key].responseTimes.push(r.response_time_ms);
        }
      }
      return acc;
    },
    {} as Record<string, { server: string; name: string; total: number; successful: number; responseTimes: number[] }>
  );

  const stats = Object.values(statsByServer).map((s) => ({
    ...s,
    successRate: ((s.successful / s.total) * 100).toFixed(1),
    avgResponseTime: s.responseTimes.length
      ? (s.responseTimes.reduce((a, b) => a + b, 0) / s.responseTimes.length).toFixed(1)
      : '-',
    minResponseTime: s.responseTimes.length
      ? Math.min(...s.responseTimes).toFixed(1)
      : '-',
    maxResponseTime: s.responseTimes.length
      ? Math.max(...s.responseTimes).toFixed(1)
      : '-',
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">DNS Health</h1>
        <TimeRangeSelect value={timeRange} onChange={setTimeRange} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {stats.map((s) => (
          <Card key={s.server}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="font-medium">{s.name}</div>
                <div className="text-xs text-gray-500">{s.server}</div>
              </div>
              <span
                className={`w-3 h-3 rounded-full ${
                  parseFloat(s.successRate) >= 99
                    ? 'bg-green-500'
                    : parseFloat(s.successRate) >= 95
                      ? 'bg-yellow-500'
                      : 'bg-red-500'
                }`}
              />
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-gray-400">Success Rate</div>
                <div className="text-lg font-semibold">{s.successRate}%</div>
              </div>
              <div>
                <div className="text-gray-400">Avg Response</div>
                <div className="text-lg font-semibold">{s.avgResponseTime} ms</div>
              </div>
              <div>
                <div className="text-gray-400">Min</div>
                <div>{s.minResponseTime} ms</div>
              </div>
              <div>
                <div className="text-gray-400">Max</div>
                <div>{s.maxResponseTime} ms</div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Card title="Recent Queries">
        {loading ? (
          <div className="text-gray-500 text-center py-4">Loading...</div>
        ) : results.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-sm text-gray-400 border-b border-gray-800">
                  <th className="pb-3 font-medium">Time</th>
                  <th className="pb-3 font-medium">Server</th>
                  <th className="pb-3 font-medium">Domain</th>
                  <th className="pb-3 font-medium">Response Time</th>
                  <th className="pb-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {results.slice(0, 100).map((r) => (
                  <tr key={r.id} className="border-b border-gray-800/50">
                    <td className="py-2 text-sm">
                      {new Date(r.timestamp).toLocaleString()}
                    </td>
                    <td className="py-2">{r.server_name || r.server}</td>
                    <td className="py-2 text-gray-400">{r.query_domain}</td>
                    <td className="py-2">
                      {r.success && r.response_time_ms !== null
                        ? `${r.response_time_ms.toFixed(0)} ms`
                        : '-'}
                    </td>
                    <td className="py-2">
                      {r.success ? (
                        <span className="text-green-400">OK</span>
                      ) : (
                        <span className="text-red-400">Failed</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-gray-500 text-center py-4">No DNS data</div>
        )}
      </Card>
    </div>
  );
}
