'use client';

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
    <div className="flex space-x-1 bg-gray-800 rounded-lg p-1">
      {ranges.map((range) => (
        <button
          key={range.value}
          onClick={() => onChange(range.value)}
          className={`px-3 py-1 text-sm font-medium rounded transition-colors ${
            value === range.value
              ? 'bg-blue-600 text-white'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          {range.label}
        </button>
      ))}
    </div>
  );
}
