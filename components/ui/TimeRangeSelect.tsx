'use client';

import { cn } from '@/lib/utils';

interface TimeRangeSelectProps {
  value: string;
  onChange: (value: string) => void;
}

const ranges = [
  { value: '24h', label: '24h' },
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
  { value: '90d', label: '90d' },
];

export default function TimeRangeSelect({ value, onChange }: TimeRangeSelectProps) {
  return (
    <div className="flex bg-white/5 rounded-lg p-1 border border-white/5">
      {ranges.map((range) => (
        <button
          key={range.value}
          onClick={() => onChange(range.value)}
          className={cn(
            'px-3 py-1 text-xs font-medium rounded-md transition-all',
            value === range.value
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-gray-400 hover:text-white hover:bg-white/5'
          )}
        >
          {range.label}
        </button>
      ))}
    </div>
  );
}
