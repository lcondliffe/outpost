'use client';

import { DnsResult } from '@/lib/api';
import Card from '@/components/ui/Card';

interface DnsCardProps {
  dnsResults: DnsResult[];
}

export default function DnsCard({ dnsResults }: DnsCardProps) {
  // Group by server and get latest result for each
  const latestByServer = dnsResults.reduce(
    (acc, result) => {
      if (!acc[result.server] || result.timestamp > acc[result.server].timestamp) {
        acc[result.server] = result;
      }
      return acc;
    },
    {} as Record<string, DnsResult>
  );

  const servers = Object.values(latestByServer);

  return (
    <Card title="DNS Resolution">
      {servers.length > 0 ? (
        <div className="space-y-1">
          {servers.map((dns) => (
            <div
              key={`${dns.server}-${dns.timestamp}`}
              className="flex items-center justify-between p-2 rounded-lg hover:bg-white/5 transition-colors"
            >
              <div className="flex items-center space-x-3">
                <span
                  className={`w-2 h-2 rounded-full ring-2 ring-opacity-20 ${
                    dns.success 
                      ? 'bg-emerald-500 ring-emerald-500' 
                      : 'bg-red-500 ring-red-500'
                  }`}
                />
                <span className="text-sm font-medium text-gray-300">
                  {dns.server_name || dns.server}
                </span>
              </div>
              <div className="flex items-center space-x-4">
                {dns.success && dns.response_time_ms !== null ? (
                  <>
                     <div className="hidden sm:block w-24 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-purple-500 rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(dns.response_time_ms, 100)}%` }}
                      />
                    </div>
                    <span className="text-sm font-semibold tabular-nums text-white w-16 text-right">
                      {dns.response_time_ms.toFixed(0)}
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
          No DNS data available
        </div>
      )}
    </Card>
  );
}
