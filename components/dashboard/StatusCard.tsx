'use client';

import { Wifi, Clock, AlertTriangle, CheckCircle2 } from 'lucide-react';
import Card from '@/components/ui/Card';

interface StatusCardProps {
  inOutage: boolean;
  uptime?: string;
  uptimePeriod?: string;
  lastOutage?: {
    endTime: number;
    durationSeconds: number;
  } | null;
}

export default function StatusCard({
  inOutage,
  lastOutage,
  uptime = '--',
  uptimePeriod = '24h',
}: StatusCardProps) {
  const formatRelativeTime = (timestamp: number) => {
    const diff = Date.now() - timestamp;
    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days} day${days > 1 ? 's' : ''} ago`;
  };

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <Card className="relative overflow-hidden">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-gray-400">Network Status</p>
            <h3 className="text-2xl font-bold mt-2 flex items-center space-x-2">
              <span className={inOutage ? 'text-red-400' : 'text-emerald-400'}>
                {inOutage ? 'Outage' : 'Online'}
              </span>
            </h3>
          </div>
          <div className={`p-3 rounded-xl ${inOutage ? 'bg-red-500/10' : 'bg-emerald-500/10'}`}>
            {inOutage ? (
              <AlertTriangle className="w-6 h-6 text-red-400" />
            ) : (
              <Wifi className="w-6 h-6 text-emerald-400" />
            )}
          </div>
        </div>
        {!inOutage && (
          <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500/50 to-transparent" />
        )}
      </Card>

      <Card>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-gray-400">Uptime</p>
            <h3 className="text-2xl font-bold mt-2 text-white">{uptime === '--' ? '--' : `${uptime}%`}</h3>
            <p className="text-xs text-gray-500 mt-1">
              {uptime === '--' ? 'Calculating...' : `Last ${uptimePeriod}`}
            </p>
          </div>
          <div className="p-3 rounded-xl bg-blue-500/10">
            <Clock className="w-6 h-6 text-blue-400" />
          </div>
        </div>
      </Card>

      <Card>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-gray-400">Last Incident</p>
            {lastOutage ? (
              <>
                <h3 className="text-2xl font-bold mt-2 text-white">
                  {formatRelativeTime(lastOutage.endTime)}
                </h3>
                <p className="text-xs text-gray-500 mt-1">
                  Duration: {formatDuration(lastOutage.durationSeconds)}
                </p>
              </>
            ) : (
              <h3 className="text-xl font-bold mt-2 text-gray-500">None recorded</h3>
            )}
          </div>
          <div className="p-3 rounded-xl bg-amber-500/10">
            <CheckCircle2 className="w-6 h-6 text-amber-400" />
          </div>
        </div>
      </Card>
    </div>
  );
}
