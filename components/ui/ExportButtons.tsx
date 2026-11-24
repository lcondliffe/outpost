'use client';

import { getPeriodMs } from '@/lib/api';

interface ExportButtonsProps {
  type: 'ping' | 'dns' | 'speedtest' | 'outages';
  timeRange: string;
}

export default function ExportButtons({ type, timeRange }: ExportButtonsProps) {
  // Compute the window at click time so a long-open page exports up to "now".
  const download = (format: 'csv' | 'json') => {
    const end = Date.now();
    const start = end - getPeriodMs(timeRange);
    window.location.href = `/api/export?type=${type}&format=${format}&start=${start}&end=${end}`;
  };

  return (
    <div className="flex bg-white/5 rounded-lg p-1 border border-white/5">
      {(['csv', 'json'] as const).map((format) => (
        <button
          key={format}
          onClick={() => download(format)}
          title={`Download ${timeRange} of ${type} data as ${format.toUpperCase()}`}
          className="px-3 py-1 text-xs font-medium rounded-md text-gray-400 hover:text-white hover:bg-white/5 transition-all"
        >
          {format.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
