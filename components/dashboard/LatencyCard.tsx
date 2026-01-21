'use client';

import { PingResult } from '@/lib/api';

interface LatencyCardProps {
  pings: PingResult[];
}

export default function LatencyCard({ pings }: LatencyCardProps) {
  return (
    <div className="bg-gray-900 rounded-lg border border-gray-800">
      <div className="px-4 py-3 border-b border-gray-800">
        <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wide">
          Latency
        </h3>
      </div>
      <div className="p-4">
        {pings.length > 0 ? (
          <div className="space-y-3">
            {pings.map((ping) => (
              <div
                key={`${ping.target}-${ping.timestamp}`}
                className="flex items-center justify-between"
              >
                <div className="flex items-center space-x-2">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      ping.success ? 'bg-green-500' : 'bg-red-500'
                    }`}
                  />
                  <span className="text-sm text-gray-300">
                    {ping.target_name || ping.target}
                  </span>
                </div>
                <div className="text-right">
                  {ping.success && ping.rtt_avg !== null ? (
                    <span className="text-lg font-semibold">
                      {ping.rtt_avg.toFixed(1)}
                      <span className="text-sm text-gray-500 ml-1">ms</span>
                    </span>
                  ) : (
                    <span className="text-red-400 text-sm">Failed</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-gray-500 text-center py-4">No latency data yet</div>
        )}
      </div>
    </div>
  );
}
