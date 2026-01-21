'use client';

interface StatusCardProps {
  inOutage: boolean;
  lastOutage?: {
    endTime: number;
    durationSeconds: number;
  } | null;
}

export default function StatusCard({ inOutage, lastOutage }: StatusCardProps) {
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
    <div className="grid grid-cols-3 gap-4">
      <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
        <div className="text-sm text-gray-400 uppercase tracking-wide mb-2">Status</div>
        <div className="flex items-center space-x-2">
          <span
            className={`w-3 h-3 rounded-full ${
              inOutage ? 'bg-red-500 animate-pulse' : 'bg-green-500'
            }`}
          />
          <span className="text-xl font-semibold">
            {inOutage ? 'Outage' : 'Online'}
          </span>
        </div>
      </div>

      <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
        <div className="text-sm text-gray-400 uppercase tracking-wide mb-2">Uptime</div>
        <div className="text-xl font-semibold">--</div>
        <div className="text-sm text-gray-500">(calculating)</div>
      </div>

      <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
        <div className="text-sm text-gray-400 uppercase tracking-wide mb-2">Last Outage</div>
        {lastOutage ? (
          <>
            <div className="text-xl font-semibold">
              {formatRelativeTime(lastOutage.endTime)}
            </div>
            <div className="text-sm text-gray-500">
              Duration: {formatDuration(lastOutage.durationSeconds)}
            </div>
          </>
        ) : (
          <div className="text-xl font-semibold text-gray-500">None recorded</div>
        )}
      </div>
    </div>
  );
}
