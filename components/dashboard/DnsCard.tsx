'use client';

import { DnsResult } from '@/lib/api';

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
    <div className="bg-gray-900 rounded-lg border border-gray-800">
      <div className="px-4 py-3 border-b border-gray-800">
        <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wide">
          DNS Health
        </h3>
      </div>
      <div className="p-4">
        {servers.length > 0 ? (
          <div className="space-y-3">
            {servers.map((dns) => (
              <div
                key={`${dns.server}-${dns.timestamp}`}
                className="flex items-center justify-between"
              >
                <div className="flex items-center space-x-2">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      dns.success ? 'bg-green-500' : 'bg-red-500'
                    }`}
                  />
                  <span className="text-sm text-gray-300">
                    {dns.server_name || dns.server}
                  </span>
                </div>
                <div className="text-right">
                  {dns.success && dns.response_time_ms !== null ? (
                    <span className="text-lg font-semibold">
                      {dns.response_time_ms.toFixed(0)}
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
          <div className="text-gray-500 text-center py-4">No DNS data yet</div>
        )}
      </div>
    </div>
  );
}
