import React from 'react';
import { SimpleSelect } from '../ui/data';
import { TIMESPAN_OPTIONS } from '../../utils/format';

const OPTIONS = [...TIMESPAN_OPTIONS, { value: 'custom', label: 'Custom dates' }];
const today = () => new Date().toISOString().slice(0, 10);
const input = 'h-10 rounded-lg border border-brand-border bg-white px-2.5 text-sm text-brand-dark outline-none focus:border-brand-blue';

/** API query for a { timespan, from, to } value: presets pass through, custom becomes whole-day ISO bounds. */
export const rangeParams = ({ timespan, from, to } = {}) => {
  if (timespan !== 'custom') return timespan ? { timespan } : {};
  return {
    ...(from ? { from: new Date(`${from}T00:00:00`).toISOString() } : {}),
    ...(to ? { to: new Date(`${to}T23:59:59.999`).toISOString() } : {}),
  };
};

/**
 * PRD "Select Timespan": Last 24 hours ... Last 12 months, or a custom date range.
 * value / onChange: { timespan, from, to } with from / to as yyyy-mm-dd.
 */
const TimeRange = ({ value = {}, onChange, placeholder = 'All time', className = '' }) => (
  <div className={`flex flex-wrap items-center gap-2 ${className}`}>
    <SimpleSelect ariaLabel="Time range" value={value.timespan} placeholder={placeholder} options={OPTIONS} onChange={(timespan) => onChange({ timespan: timespan || '', from: timespan === 'custom' ? value.from : '', to: timespan === 'custom' ? value.to : '' })} />
    {value.timespan === 'custom' && (
      <>
        <input type="date" aria-label="From date" className={input} max={value.to || today()} value={value.from || ''} onChange={(e) => onChange({ ...value, from: e.target.value })} />
        <span className="text-sm text-brand-gray-muted">to</span>
        <input type="date" aria-label="To date" className={input} min={value.from || undefined} max={today()} value={value.to || ''} onChange={(e) => onChange({ ...value, to: e.target.value })} />
      </>
    )}
  </div>
);

export default TimeRange;
