'use client';

import { useState, useEffect, useCallback } from 'react';
import Card from '@/components/ui/Card';
import TimeRangeSelect from '@/components/ui/TimeRangeSelect';
import { api, getPeriodMs, Outage, formatDuration } from '@/lib/api';

export default function OutagesPage() {
  const [timeRange, setTimeRange] = useState('30d');
  const [outages, setOutages] = useState<Outage[]>([]);
  const [range, setRange] = useState<{ start: number; end: number } | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    const now = Date.now();
    const start = now - getPeriodMs(timeRange);
    const data = await api.getOutages(start, now);
    setOutages(data);
    setRange({ start, end: now });
    setLoading(false);
  }, [timeRange]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const activeOutage = outages.find((o) => o.end_time === null);

  // Sum only the portion of each outage that falls inside the fetched window,
  // treating an ongoing outage as still running at the window's end. The API
  // returns every outage overlapping the window, including ones that straddle
  // a boundary, so their stored duration must be clipped rather than counted
  // in full. This mirrors the same calculation in getOutageStats.
  const periodSeconds = range ? (range.end - range.start) / 1000 : 0;
  const totalDowntime = range
    ? Math.round(
        outages.reduce((sum, o) => {
          const start = Math.max(o.start_time, range.start);
          const end = Math.min(o.end_time ?? range.end, range.end);
          return sum + Math.max(0, end - start) / 1000;
        }, 0)
      )
    : 0;

  const uptimePercent = (
    periodSeconds > 0
      ? Math.min(100, Math.max(0, ((periodSeconds - totalDowntime) / periodSeconds) * 100))
      : 100
  ).toFixed(3);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-2xl font-bold">Outage History</h1>
        <TimeRangeSelect value={timeRange} onChange={setTimeRange} />
      </div>

      {activeOutage && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg p-4">
          <div className="flex items-center space-x-3">
            <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
            <div>
              <div className="font-semibold text-red-200">Active Outage</div>
              <div className="text-sm text-red-300">
                Started: {new Date(activeOutage.start_time).toLocaleString()} (
                {formatDuration(Math.floor((Date.now() - activeOutage.start_time) / 1000))})
              </div>
              <div className="text-sm text-red-300">
                Affected: {activeOutage.affected_services.join(', ')}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <div className="text-sm text-gray-400 mb-1">Total Outages</div>
          <div className="text-3xl font-bold">{outages.length}</div>
        </Card>
        <Card>
          <div className="text-sm text-gray-400 mb-1">Total Downtime</div>
          <div className="text-3xl font-bold">{formatDuration(totalDowntime)}</div>
        </Card>
        <Card>
          <div className="text-sm text-gray-400 mb-1">Uptime</div>
          <div className="text-3xl font-bold text-green-400">{uptimePercent}%</div>
        </Card>
      </div>

      <Card title="Outage Timeline">
        {loading ? (
          <div className="text-gray-500 text-center py-4">Loading...</div>
        ) : outages.length > 0 ? (
          <div className="space-y-4">
            {outages.map((outage) => (
              <div
                key={outage.id}
                className={`border rounded-lg p-4 ${
                  outage.end_time === null
                    ? 'border-red-700 bg-red-900/20'
                    : 'border-gray-800 bg-gray-800/30'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center space-x-2">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          outage.end_time === null
                            ? 'bg-red-500 animate-pulse'
                            : 'bg-gray-500'
                        }`}
                      />
                      <span className="font-medium">
                        {outage.end_time === null ? 'Ongoing' : 'Resolved'}
                      </span>
                    </div>
                    <div className="mt-2 text-sm text-gray-400">
                      <div>
                        Start: {new Date(outage.start_time).toLocaleString()}
                      </div>
                      {outage.end_time && (
                        <div>
                          End: {new Date(outage.end_time).toLocaleString()}
                        </div>
                      )}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {outage.affected_services.map((service) => (
                        <span
                          key={service}
                          className="px-2 py-1 text-xs rounded bg-gray-700 text-gray-300"
                        >
                          {service}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold">
                      {outage.duration_seconds
                        ? formatDuration(outage.duration_seconds)
                        : formatDuration(
                            Math.floor((Date.now() - outage.start_time) / 1000)
                          )}
                    </div>
                    <div className="text-sm text-gray-500">duration</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-gray-500 text-center py-8">
            No outages recorded in this period
          </div>
        )}
      </Card>
    </div>
  );
}
