import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { clsx } from 'clsx';
import { CardSkeleton, EmptyState, ErrorState, Icon, Skeleton } from './feedback';
import { Select } from './pickers';
import { initials, titleCase } from '../../utils/format';

const TONES = {
  green: 'bg-brand-green-tint text-brand-green',
  blue: 'bg-brand-blue-tint text-brand-blue',
  orange: 'bg-brand-orange-tint text-brand-orange-dark',
  amber: 'bg-brand-amber-tint text-amber-700',
  red: 'bg-brand-red-tint text-brand-red',
  gray: 'bg-brand-tint text-brand-gray',
  purple: 'bg-purple-50 text-purple-700',
};

const STATUS_TONE = {
  active: 'green', verified: 'green', paid: 'green', sent: 'green', delivered: 'green', published: 'green', approved: 'green', hired: 'green', resolved: 'green', completed: 'green', accepted: 'green', connected: 'green', success: 'green', converted: 'green', opened: 'green', clicked: 'green',
  pending: 'amber', admin_review: 'amber', under_review: 'amber', draft: 'amber', queued: 'amber', open: 'amber', in_review: 'amber', created: 'amber', scheduled: 'blue', rescheduled: 'blue', new: 'blue', viewed: 'blue', applied: 'blue', screened: 'blue', interview_scheduled: 'purple', offered: 'purple', contacted: 'blue', qualified: 'purple', paused: 'gray',
  closed: 'gray', expired: 'gray', trashed: 'gray', withdrawn: 'gray', dismissed: 'gray', cancelled: 'gray', not_submitted: 'gray', deactivated: 'gray', declined: 'red',
  rejected: 'red', failed: 'red', blocked: 'red', suspended: 'red', bounced: 'red', spam: 'red', resubmission_required: 'orange', refunded: 'orange', lost: 'red', no_show: 'red',
};

export const Badge = ({ tone = 'gray', children, className = '' }) => (
  <span className={clsx('inline-flex items-center gap-1 whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium', TONES[tone], className)}>{children}</span>
);

export const StatusBadge = ({ status, label }) => (status ? <Badge tone={STATUS_TONE[status] || 'gray'}>{label || titleCase(status)}</Badge> : null);

export const Avatar = ({ name, src, size = 40, square = false, className = '' }) => {
  const [failed, setFailed] = useState(false);
  return (
    <div
      className={clsx('flex shrink-0 items-center justify-center overflow-hidden border border-brand-border bg-brand-blue-tint font-bold text-brand-blue', square ? 'rounded-lg' : 'rounded-full', className)}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {src && !failed ? <img src={src} alt={name || ''} loading="lazy" className={clsx('h-full w-full', square ? 'object-contain p-0.5' : 'object-cover')} onError={() => setFailed(true)} /> : initials(name)}
    </div>
  );
};

export const PageHeader = ({ title, subtitle, actions, className = '' }) => (
  <div className={clsx('mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between', className)}>
    <div className="min-w-0">
      <h1 className="text-xl font-bold text-brand-dark sm:text-[22px]">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-brand-gray">{subtitle}</p>}
    </div>
    {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
  </div>
);

export const StatTile = ({ icon, label, value, note, to, loading }) => {
  const body = (
    <>
      <p className="flex items-center gap-1.5 text-[13px] font-medium text-brand-gray">
        {icon && <Icon name={icon} size={16} className="text-brand-gray-muted" />}
        {label}
      </p>
      {loading ? <Skeleton className="mt-2 h-7 w-14" /> : <p className="mt-1 text-2xl font-bold tabular-nums text-brand-dark">{value ?? 0}</p>}
      {note && <p className="mt-0.5 text-xs text-brand-gray-muted">{note}</p>}
    </>
  );
  return to ? (
    <Link to={to} className="surface surface-hover block p-4">
      {body}
    </Link>
  ) : (
    <div className="surface p-4">{body}</div>
  );
};

export const Tabs = ({ tabs, value, onChange, className = '' }) => (
  <div className={clsx('no-scrollbar flex gap-1 overflow-x-auto border-b border-brand-border', className)} role="tablist">
    {tabs.map((t) => {
      const item = typeof t === 'string' ? { value: t, label: t } : t;
      return (
        <button
          key={item.value}
          role="tab"
          aria-selected={value === item.value}
          onClick={() => onChange(item.value)}
          className={clsx('whitespace-nowrap border-b-[3px] px-3.5 pb-2.5 pt-1 text-sm font-semibold transition-colors', value === item.value ? 'border-brand-blue text-brand-blue' : 'border-transparent text-brand-gray-muted hover:text-brand-dark')}
        >
          {item.label}
          {item.count !== undefined && <span className="ml-1.5 rounded-full bg-brand-tint px-1.5 py-0.5 text-[11px] text-brand-gray">{item.count}</span>}
        </button>
      );
    })}
  </div>
);

export const PAGE_SIZES = [10, 20, 30, 40, 60, 80, 100, 150, 200];

/** Page links plus, with `onLimit`, the PRD "No of items show 10 … 200" selector. */
export const Pagination = ({ meta, onPage, limit, onLimit }) => {
  if (!meta) return null;
  const totalPages = meta.totalPages || 0;
  if (totalPages <= 1 && !(onLimit && (meta.total || 0) > PAGE_SIZES[0])) return null;
  const { page, total } = meta;
  const pages = [];
  for (let p = Math.max(1, page - 2); p <= Math.min(totalPages, page + 2); p += 1) pages.push(p);
  const btn = 'flex h-9 min-w-9 items-center justify-center rounded-md border px-2 text-sm font-medium transition-colors disabled:opacity-40';
  return (
    <nav className="mt-4 flex flex-wrap items-center justify-between gap-3" aria-label="Pagination">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-xs text-brand-gray-muted">
          Page {page} of {Math.max(totalPages, 1)} · {total?.toLocaleString('en-IN')} results
        </p>
        {onLimit && (
          <label className="flex items-center gap-1.5 text-xs text-brand-gray-muted">
            Show
            <Select
              ariaLabel="Results per page"
              value={String(limit || meta.limit || 20)}
              onChange={(v) => onLimit(Number(v))}
              options={PAGE_SIZES.map((n) => ({ value: String(n), label: String(n) }))}
              placeholder={null}
              className="w-20"
              buttonClassName="field-control flex h-8 w-full items-center justify-between gap-1 px-2 text-left text-xs"
            />
          </label>
        )}
      </div>
      <div className="flex gap-1.5">
        <button className={clsx(btn, 'border-brand-border bg-white text-brand-gray hover:border-brand-blue')} disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
          <Icon name="chevron_left" size={18} />
        </button>
        {pages.map((p) => (
          <button key={p} onClick={() => onPage(p)} aria-current={p === page ? 'page' : undefined} className={clsx(btn, p === page ? 'border-brand-blue bg-brand-blue text-white' : 'border-brand-border bg-white text-brand-gray hover:border-brand-blue')}>
            {p}
          </button>
        ))}
        <button className={clsx(btn, 'border-brand-border bg-white text-brand-gray hover:border-brand-blue')} disabled={page >= totalPages} onClick={() => onPage(page + 1)} aria-label="Next page">
          <Icon name="chevron_right" size={18} />
        </button>
      </div>
    </nav>
  );
};

/**
 * columns: [{ key, header, render?(row), className? }]
 * Renders a table on md+ and stacked cards on phones so nothing scrolls sideways.
 */
export const DataTable = ({ columns, rows, query, rowKey = (r) => r._id, empty, selectable, selected = [], onSelect, onRowClick, actions }) => {
  if (query?.isPending) return <CardSkeleton count={4} />;
  if (query?.isError) return <ErrorState error={query.error} onRetry={query.refetch} />;
  if (!rows?.length) return empty || <EmptyState title="Nothing here yet" />;

  const allSelected = rows.every((r) => selected.includes(rowKey(r)));
  const toggleAll = () => onSelect(allSelected ? selected.filter((id) => !rows.some((r) => rowKey(r) === id)) : [...new Set([...selected, ...rows.map(rowKey)])]);
  const toggle = (id) => onSelect(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  return (
    <>
      <div className="hidden overflow-x-auto surface md:block">
        <table className="w-full text-left text-sm">
          <thead className="bg-brand-tint text-xs uppercase tracking-wide text-brand-gray">
            <tr>
              {selectable && (
                <th className="w-10 px-4 py-3">
                  <input type="checkbox" aria-label="Select all" checked={allSelected} onChange={toggleAll}  />
                </th>
              )}
              {columns.map((c) => (
                <th key={c.key} className={clsx('whitespace-nowrap px-4 py-3 font-semibold', c.className)}>
                  {c.header}
                </th>
              ))}
              {actions && <th className="px-4 py-3 text-right font-semibold">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-border">
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                onKeyDown={onRowClick ? (e) => e.key === 'Enter' && e.target === e.currentTarget && onRowClick(row) : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                className={clsx('transition-colors hover:bg-brand-tint/60 focus-visible:bg-brand-blue-tint focus-visible:outline-none', onRowClick && 'cursor-pointer')}
              >
                {selectable && (
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" aria-label="Select row" checked={selected.includes(rowKey(row))} onChange={() => toggle(rowKey(row))}  />
                  </td>
                )}
                {columns.map((c) => (
                  <td key={c.key} className={clsx('px-4 py-3 text-brand-dark', c.className)}>
                    {c.render ? c.render(row) : (row[c.key] ?? '—')}
                  </td>
                ))}
                {actions && (
                  <td className="whitespace-nowrap px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                    {actions(row)}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-3 md:hidden">
        {rows.map((row) => (
          <div key={rowKey(row)} onClick={onRowClick ? () => onRowClick(row) : undefined} className="surface p-4">
            {selectable && (
              <label className="mb-2 flex items-center gap-2 text-xs text-brand-gray" onClick={(e) => e.stopPropagation()}>
                <input type="checkbox" checked={selected.includes(rowKey(row))} onChange={() => toggle(rowKey(row))}  /> Select
              </label>
            )}
            <dl className="space-y-2 text-sm">
              {columns.map((c) => (
                <div key={c.key} className="flex items-start justify-between gap-4">
                  <dt className="shrink-0 text-xs text-brand-gray-muted">{c.header}</dt>
                  <dd className="min-w-0 text-right text-brand-dark [overflow-wrap:anywhere]">{c.render ? c.render(row) : (row[c.key] ?? '—')}</dd>
                </div>
              ))}
            </dl>
            {actions && (
              <div className="mt-3 flex flex-wrap justify-end gap-2 border-t border-brand-border pt-2" onClick={(e) => e.stopPropagation()}>
                {actions(row)}
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
};

export const SearchInput = ({ value, onChange, placeholder = 'Search', className = '' }) => (
  <div className={clsx('relative', className)}>
    <Icon name="search" size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-gray-muted" />
    <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} className="field-control h-10 w-full pl-9 pr-3 text-sm" />
  </div>
);

export const SimpleSelect = ({ value, onChange, options, placeholder, className = '', ariaLabel }) => (
  <Select value={value} onChange={onChange} options={options} placeholder={placeholder === undefined ? null : placeholder} ariaLabel={ariaLabel || placeholder} className={clsx('min-w-[140px]', className)} buttonClassName="field-control flex h-10 w-full items-center justify-between gap-2 px-3 text-left text-sm" />
);

export const ProgressBar = ({ value = 0, tone = 'bg-brand-blue' }) => (
  <div className="h-2 w-full overflow-hidden rounded-full bg-brand-border" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
    <div className={clsx('h-full rounded-full transition-all duration-500', tone)} style={{ width: `${Math.min(value, 100)}%` }} />
  </div>
);

export const Section = ({ title, actions, children, className = '' }) => (
  <section className={clsx('surface p-5', className)}>
    {(title || actions) && (
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-base font-bold text-brand-dark">{title}</h2>
        {actions}
      </div>
    )}
    {children}
  </section>
);

export const DetailRow = ({ label, value }) => (
  <div>
    <dt className="text-xs text-brand-gray-muted">{label}</dt>
    <dd className="mt-0.5 break-words text-sm font-medium text-brand-dark">{value || '—'}</dd>
  </div>
);
