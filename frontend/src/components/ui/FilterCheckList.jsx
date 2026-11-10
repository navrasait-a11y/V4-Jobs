import React, { useState } from 'react';
import { clsx } from 'clsx';
import { Icon } from './feedback';
import { formatNumber } from '../../utils/format';

/**
 * Search-page filter list (Naukri style): picked options float to the top, the first `visible`
 * show by default, "View N more" expands the rest with a search box, and facet counts sit on the right.
 * options: string[] | { value, label }[]; counts: { [value]: number }
 */
const FilterCheckList = ({ options = [], selected = [], onToggle, counts, visible = 5, label = 'options' }) => {
  const [expanded, setExpanded] = useState(false);
  const [q, setQ] = useState('');
  const items = options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o));
  const ordered = [...items.filter((o) => selected.includes(o.value)), ...items.filter((o) => !selected.includes(o.value))];
  const searchable = expanded && items.length > 10;
  const filtered = searchable && q ? ordered.filter((o) => String(o.label).toLowerCase().includes(q.toLowerCase())) : ordered;
  const shown = expanded ? filtered : ordered.slice(0, Math.max(visible, selected.length));
  const hidden = items.length - shown.length;

  if (!items.length) return <p className="text-xs text-brand-gray-muted">No {label} for this search</p>;
  return (
    <div>
      {searchable && (
        <div className="relative mb-2">
          <Icon name="search" size={16} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-brand-gray-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${label}`} aria-label={`Search ${label}`} className="h-9 w-full rounded-md border border-[#D5DBE4] bg-white pl-8 pr-2 text-sm outline-none focus:border-brand-blue focus:shadow-[0_0_0_3px_var(--color-brand-blue-tint)]" />
        </div>
      )}
      <div className={clsx('space-y-0.5', expanded && 'max-h-64 overflow-y-auto pr-1')}>
        {shown.map((o) => {
          const on = selected.includes(o.value);
          return (
            <label key={o.value} className={clsx('flex cursor-pointer items-center justify-between gap-2 rounded-md px-1.5 py-1.5 text-sm transition-colors hover:bg-brand-tint', on ? 'font-medium text-brand-dark' : 'text-brand-gray')}>
              <span className="flex min-w-0 items-center gap-2">
                <input type="checkbox" checked={on} onChange={() => onToggle(o.value)} />
                <span className="truncate" title={String(o.label)}>
                  {o.label}
                </span>
              </span>
              {counts?.[o.value] !== undefined && <span className="shrink-0 text-xs text-brand-gray-muted">({formatNumber(counts[o.value])})</span>}
            </label>
          );
        })}
        {searchable && !filtered.length && <p className="px-1.5 py-2 text-xs text-brand-gray-muted">No match for “{q}”</p>}
      </div>
      {(hidden > 0 || expanded) && items.length > visible && (
        <button
          type="button"
          onClick={() => {
            setExpanded((x) => !x);
            setQ('');
          }}
          className="mt-1.5 inline-flex items-center gap-0.5 px-1.5 text-xs font-semibold text-brand-blue hover:underline"
        >
          {expanded ? 'View less' : `View ${hidden} more`}
          <Icon name={expanded ? 'expand_less' : 'expand_more'} size={16} />
        </button>
      )}
    </div>
  );
};

export default FilterCheckList;
