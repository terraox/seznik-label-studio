import React from 'react';

export const TIME_RANGE_OPTIONS = [
  { value: '24h', label: 'Last 24 Hours' },
  { value: '3d', label: 'Last 3 Days' },
  { value: '7d', label: 'Last 7 Days' },
  { value: '30d', label: 'Last 30 Days' },
  { value: 'all', label: 'All Time' },
] as const;

export type AdminTimeRange = (typeof TIME_RANGE_OPTIONS)[number]['value'];

export function timeRangeLabel(range: string): string {
  return TIME_RANGE_OPTIONS.find((o) => o.value === range)?.label ?? range;
}

interface TimeRangeSelectProps {
  value: string;
  onChange: (value: string) => void;
  compact?: boolean;
}

export const TimeRangeSelect: React.FC<TimeRangeSelectProps> = ({ value, onChange, compact = false }) => (
  <select
    className="custom-select"
    value={value}
    onChange={(e) => onChange(e.target.value)}
    onClick={(e) => e.stopPropagation()}
    style={{
      background: 'var(--tab-bg)',
      border: '1px solid var(--tab-border)',
      borderRadius: '6px',
      color: 'var(--text-main)',
      fontSize: compact ? '0.72rem' : '0.75rem',
      fontWeight: 600,
      padding: compact ? '4px 8px' : '5px 10px',
      cursor: 'pointer',
      outline: 'none',
    }}
  >
    {TIME_RANGE_OPTIONS.map((opt) => (
      <option key={opt.value} value={opt.value}>
        {opt.label}
      </option>
    ))}
  </select>
);
