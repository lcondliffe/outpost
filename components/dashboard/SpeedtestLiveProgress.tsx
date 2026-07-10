'use client';

import { SpeedtestProgress } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Download, Upload, Activity, Loader2 } from 'lucide-react';

interface SpeedtestLiveProgressProps {
  progress?: SpeedtestProgress | null;
}

function formatMbps(value: number | null | undefined) {
  return value != null ? value.toFixed(1) : '—';
}

export default function SpeedtestLiveProgress({ progress }: SpeedtestLiveProgressProps) {
  const phase = progress?.phase || 'starting';
  const percent = Math.max(0, Math.min(100, progress?.percent ?? 0));
  // The Python speedtest-cli fallback can't report live values
  const indeterminate = phase === 'starting' || phase === 'running' || phase === 'complete';

  const phaseLabel =
    phase === 'starting' ? 'Starting test…'
    : phase === 'running' ? 'Running test…'
    : phase === 'ping' ? 'Measuring ping'
    : phase === 'download' ? 'Testing download'
    : phase === 'upload' ? 'Testing upload'
    : phase === 'retrying'
      ? `Attempt ${progress?.attempt ?? 1} failed — retrying in ~${progress?.nextRetrySeconds ?? 45}s`
    : 'Finishing up…';

  const stats = [
    {
      key: 'ping',
      label: 'Ping',
      icon: Activity,
      color: 'text-amber-400',
      bg: 'bg-amber-500/10',
      value: progress?.pingMs != null ? `${progress.pingMs.toFixed(0)}` : '—',
      unit: 'ms',
    },
    {
      key: 'download',
      label: 'Download',
      icon: Download,
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/10',
      value: formatMbps(progress?.downloadMbps),
      unit: 'Mbps',
    },
    {
      key: 'upload',
      label: 'Upload',
      icon: Upload,
      color: 'text-blue-400',
      bg: 'bg-blue-500/10',
      value: formatMbps(progress?.uploadMbps),
      unit: 'Mbps',
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-gray-300">
        <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
        <span>{phaseLabel}</span>
        {progress?.serverName && (
          <span className="text-gray-500">· {progress.serverName}</span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {stats.map((stat) => {
          const active = phase === stat.key;
          return (
            <div key={stat.key} className="flex items-center space-x-4">
              <div
                className={cn(
                  'p-3 rounded-full transition-all',
                  stat.bg,
                  stat.color,
                  active && 'animate-pulse ring-2 ring-gray-600'
                )}
              >
                <stat.icon className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm text-gray-400">{stat.label}</p>
                <div className={cn('text-2xl font-bold', active ? stat.color : 'text-white')}>
                  {stat.value}
                  <span className="text-sm font-normal text-gray-500 ml-1">{stat.unit}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="h-1.5 w-full rounded-full bg-gray-800 overflow-hidden">
        {indeterminate ? (
          <div className="h-full w-1/3 rounded-full bg-blue-500/60 animate-pulse" />
        ) : (
          <div
            className="h-full rounded-full bg-blue-500 transition-all duration-500"
            style={{ width: `${percent}%` }}
          />
        )}
      </div>
    </div>
  );
}
