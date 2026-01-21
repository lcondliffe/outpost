'use client';

import { SpeedtestResult, formatRelativeTime } from '@/lib/api';

interface SpeedCardProps {
  speedtest: SpeedtestResult | null;
  onRunTest: () => void;
  isRunning: boolean;
}

export default function SpeedCard({ speedtest, onRunTest, isRunning }: SpeedCardProps) {
  return (
    <div className="bg-gray-900 rounded-lg border border-gray-800">
      <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wide">
            Speed
          </h3>
          {speedtest && (
            <span className="text-xs text-gray-500">
              Last test: {formatRelativeTime(speedtest.timestamp)}
            </span>
          )}
        </div>
        <button
          onClick={onRunTest}
          disabled={isRunning}
          className="px-3 py-1 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 rounded transition-colors"
        >
          {isRunning ? 'Running...' : 'Run Test'}
        </button>
      </div>
      <div className="p-4">
        {speedtest && speedtest.success ? (
          <div className="grid grid-cols-3 gap-4">
            <div>
              <div className="text-sm text-gray-400 mb-1">Download</div>
              <div className="text-2xl font-bold text-green-400">
                {speedtest.download_mbps?.toFixed(1)}
                <span className="text-sm font-normal text-gray-500 ml-1">Mbps</span>
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-400 mb-1">Upload</div>
              <div className="text-2xl font-bold text-blue-400">
                {speedtest.upload_mbps?.toFixed(1)}
                <span className="text-sm font-normal text-gray-500 ml-1">Mbps</span>
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-400 mb-1">Ping</div>
              <div className="text-2xl font-bold text-yellow-400">
                {speedtest.ping_ms?.toFixed(0)}
                <span className="text-sm font-normal text-gray-500 ml-1">ms</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-gray-500 text-center py-4">
            {speedtest ? 'Last test failed' : 'No speedtest data yet'}
          </div>
        )}
      </div>
    </div>
  );
}
