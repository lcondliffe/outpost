'use client';

import { PingResult } from '@/lib/api';
import Card from '@/components/ui/Card';

interface LatencyCardProps {
  pings: PingResult[];
}

export default function LatencyCard({ pings }: LatencyCardProps) {
  return (
    <Card title="Latency Monitor">
      {pings.length > 0 ? (
        <div className="space-y-1">
          {pings.map((ping) => (
            <div
              key={`${ping.target}-${ping.timestamp}`}
              className="flex items-center justify-between p-2 rounded-lg hover:bg-white/5 transition-colors"
            >
              <div className="flex items-center space-x-3">
                <span
                  className={`w-2 h-2 rounded-full ring-2 ring-opacity-20 ${
                    ping.success 
                      ? 'bg-emerald-500 ring-emerald-500' 
                      : 'bg-red-500 ring-red-500'
                  }`}
                />
                <span className="text-sm font-medium text-gray-300">
                  {ping.target_name || ping.target}
                </span>
              </div>
              <div className="flex items-center space-x-4">
                {ping.success && ping.rtt_avg !== null ? (
                  <>
                    <div className="hidden sm:block w-24 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-blue-500 rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(ping.rtt_avg, 100)}%` }}
                      />
                    </div>
                    <span className="text-sm font-semibold tabular-nums text-white w-16 text-right">
                      {ping.rtt_avg.toFixed(1)}
                      <span className="text-xs text-gray-500 ml-1">ms</span>
                    </span>
                  </>
                ) : (
                  <span className="text-red-400 text-xs font-medium bg-red-500/10 px-2 py-1 rounded">
                    Failed
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-gray-500 text-center py-8 text-sm">
          No latency data available
        </div>
      )}
    </Card>
  );
}
