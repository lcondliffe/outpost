'use client';

import { useState, useEffect, useCallback } from 'react';
import Card from '@/components/ui/Card';
import TimeRangeSelect from '@/components/ui/TimeRangeSelect';
import SpeedChart from '@/components/charts/SpeedChart';
import { api, getPeriodMs, SpeedtestResult, formatRelativeTime } from '@/lib/api';

export default function SpeedtestPage() {
  const [timeRange, setTimeRange] = useState('7d');
  const [results, setResults] = useState<SpeedtestResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRunning, setIsRunning] = useState(false);

  const fetchData = useCallback(async () => {
    const now = Date.now();
    const start = now - getPeriodMs(timeRange);
    const data = await api.getSpeedtestResults(start, now);
    setResults(data);
    setLoading(false);
  }, [timeRange]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleRunTest = async () => {
    setIsRunning(true);
    try {
      await api.triggerSpeedtest();
      // Poll for new result
      const startTime = Date.now();
      const checkInterval = setInterval(async () => {
        const data = await api.getSpeedtestResults(startTime - 1000, Date.now());
        if (data.length > 0) {
          clearInterval(checkInterval);
          setIsRunning(false);
          fetchData();
        }
      }, 5000);
      setTimeout(() => {
        clearInterval(checkInterval);
        setIsRunning(false);
      }, 180000);
    } catch {
      setIsRunning(false);
    }
  };

  const successfulTests = results.filter((r) => r.success);
  const avgDownload = successfulTests.length
    ? successfulTests.reduce((a, r) => a + (r.download_mbps || 0), 0) / successfulTests.length
    : 0;
  const avgUpload = successfulTests.length
    ? successfulTests.reduce((a, r) => a + (r.upload_mbps || 0), 0) / successfulTests.length
    : 0;
  const maxDownload = successfulTests.length
    ? Math.max(...successfulTests.map((r) => r.download_mbps || 0))
    : 0;
  const minDownload = successfulTests.length
    ? Math.min(...successfulTests.map((r) => r.download_mbps || 0))
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-2xl font-bold">Speedtest History</h1>
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={handleRunTest}
            disabled={isRunning}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg transition-colors"
          >
            {isRunning ? 'Running...' : 'Run Speedtest'}
          </button>
          <TimeRangeSelect value={timeRange} onChange={setTimeRange} />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <div className="text-sm text-gray-400 mb-1">Avg Download</div>
          <div className="text-2xl font-bold text-green-400">
            {avgDownload.toFixed(1)} <span className="text-sm text-gray-500">Mbps</span>
          </div>
        </Card>
        <Card>
          <div className="text-sm text-gray-400 mb-1">Avg Upload</div>
          <div className="text-2xl font-bold text-blue-400">
            {avgUpload.toFixed(1)} <span className="text-sm text-gray-500">Mbps</span>
          </div>
        </Card>
        <Card>
          <div className="text-sm text-gray-400 mb-1">Max Download</div>
          <div className="text-2xl font-bold">
            {maxDownload.toFixed(1)} <span className="text-sm text-gray-500">Mbps</span>
          </div>
        </Card>
        <Card>
          <div className="text-sm text-gray-400 mb-1">Min Download</div>
          <div className="text-2xl font-bold">
            {minDownload.toFixed(1)} <span className="text-sm text-gray-500">Mbps</span>
          </div>
        </Card>
      </div>

      <Card title="Speed Over Time">
        <SpeedChart data={results} height={300} />
      </Card>

      <Card title="Test History">
        {loading ? (
          <div className="text-gray-500 text-center py-4">Loading...</div>
        ) : results.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-sm text-gray-400 border-b border-gray-800">
                  <th className="pb-3 font-medium">Time</th>
                  <th className="pb-3 font-medium">Download</th>
                  <th className="pb-3 font-medium">Upload</th>
                  <th className="pb-3 font-medium">Ping</th>
                  <th className="pb-3 font-medium">Server</th>
                  <th className="pb-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {results.slice(0, 50).map((r) => (
                  <tr key={r.id} className="border-b border-gray-800/50">
                    <td className="py-3 text-sm">
                      {new Date(r.timestamp).toLocaleString()}
                    </td>
                    <td className="py-3">
                      {r.success ? (
                        <span className="text-green-400">
                          {r.download_mbps?.toFixed(1)} Mbps
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="py-3">
                      {r.success ? (
                        <span className="text-blue-400">
                          {r.upload_mbps?.toFixed(1)} Mbps
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="py-3">
                      {r.success ? `${r.ping_ms?.toFixed(0)} ms` : '-'}
                    </td>
                    <td className="py-3 text-sm text-gray-400">
                      {r.server_name || '-'}
                    </td>
                    <td className="py-3">
                      {r.success ? (
                        <span className="text-green-400">Success</span>
                      ) : (
                        <span className="text-red-400" title={r.error || undefined}>
                          Failed
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-gray-500 text-center py-4">No speedtest data</div>
        )}
      </Card>
    </div>
  );
}
