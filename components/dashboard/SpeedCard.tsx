'use client';

import { SpeedtestResult, formatRelativeTime } from '@/lib/api';
import Card from '@/components/ui/Card';
import { Download, Upload, Activity, Play, Loader2 } from 'lucide-react';

interface SpeedCardProps {
  speedtest: SpeedtestResult | null;
  onRunTest: () => void;
  isRunning: boolean;
}

export default function SpeedCard({ speedtest, onRunTest, isRunning }: SpeedCardProps) {
  return (
    <Card
      title="Network Speed"
      action={
        <button
          onClick={onRunTest}
          disabled={isRunning}
          className="flex items-center space-x-2 px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg transition-all"
        >
          {isRunning ? (
            <>
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>Running...</span>
            </>
          ) : (
            <>
              <Play className="w-3 h-3" />
              <span>Run Test</span>
            </>
          )}
        </button>
      }
    >
      {speedtest && speedtest.success ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="flex items-center space-x-4">
            <div className="p-3 rounded-full bg-emerald-500/10 text-emerald-400">
              <Download className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm text-gray-400">Download</p>
              <div className="text-2xl font-bold text-white">
                {speedtest.download_mbps?.toFixed(1)}
                <span className="text-sm font-normal text-gray-500 ml-1">Mbps</span>
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <div className="p-3 rounded-full bg-blue-500/10 text-blue-400">
              <Upload className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm text-gray-400">Upload</p>
              <div className="text-2xl font-bold text-white">
                {speedtest.upload_mbps?.toFixed(1)}
                <span className="text-sm font-normal text-gray-500 ml-1">Mbps</span>
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <div className="p-3 rounded-full bg-amber-500/10 text-amber-400">
              <Activity className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm text-gray-400">Ping</p>
              <div className="text-2xl font-bold text-white">
                {speedtest.ping_ms?.toFixed(0)}
                <span className="text-sm font-normal text-gray-500 ml-1">ms</span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-8 text-gray-500">
          <Activity className="w-8 h-8 mb-2 opacity-50" />
          <p>{speedtest ? 'Last test failed' : 'No speedtest data yet'}</p>
        </div>
      )}
      
      {speedtest && (
        <div className="mt-6 pt-4 border-t border-white/5 flex justify-end">
          <span className="text-xs text-gray-500">
            Last updated: {formatRelativeTime(speedtest.timestamp)}
          </span>
        </div>
      )}
    </Card>
  );
}
