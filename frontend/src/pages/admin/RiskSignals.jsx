import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { clsx } from 'clsx';
import Button from '../../components/ui/Button';
import { PageHeader, StatusBadge } from '../../components/ui/data';
import { EmptyState, ErrorState, Icon, PageLoader } from '../../components/ui/feedback';
import { useDocumentTitle } from '../../hooks/useData';
import { adminApi } from '../../services';
import { timeAgo } from '../../utils/format';

const SEVERITY = {
  high: { label: 'High', chip: 'bg-red-50 text-brand-red', icon: 'gpp_maybe', iconTone: 'text-brand-red bg-red-50' },
  medium: { label: 'Medium', chip: 'bg-orange-50 text-brand-orange', icon: 'report', iconTone: 'text-brand-orange bg-orange-50' },
  low: { label: 'Low', chip: 'bg-brand-tint text-brand-gray', icon: 'info', iconTone: 'text-brand-gray bg-brand-tint' },
};
const PREVIEW = 5;

const Group = ({ group }) => {
  const [all, setAll] = useState(false);
  const s = SEVERITY[group.severity] || SEVERITY.low;
  const items = all ? group.items : group.items.slice(0, PREVIEW);
  return (
    <section className="surface overflow-hidden" aria-labelledby={`risk-${group.key}`}>
      <header className="flex items-start gap-3 border-b border-brand-border p-4">
        <span className={clsx('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', s.iconTone)}>
          <Icon name={s.icon} size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id={`risk-${group.key}`} className="flex flex-wrap items-center gap-2 text-[15px] font-bold text-brand-dark">
            {group.title}
            <span className={clsx('rounded-full px-2 py-0.5 text-[11px] font-semibold', s.chip)}>{s.label}</span>
          </h2>
          <p className="mt-0.5 text-[13px] text-brand-gray">{group.hint}</p>
        </div>
        <span className="text-xl font-bold tabular-nums text-brand-dark">{group.items.length}</span>
      </header>
      <ul className="divide-y divide-brand-border">
        {items.map((it) => (
          <li key={it.id}>
            <Link to={it.link} className="flex items-center gap-3 px-4 py-3 hover:bg-brand-tint/60">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-brand-dark">{it.label}</p>
                <p className="line-clamp-2 text-xs text-brand-gray">{it.sub}</p>
              </div>
              {it.status && <StatusBadge status={it.status} />}
              <Icon name="chevron_right" size={18} className="shrink-0 text-brand-gray-muted" />
            </Link>
          </li>
        ))}
      </ul>
      {group.items.length > PREVIEW && (
        <button type="button" onClick={() => setAll((v) => !v)} className="w-full border-t border-brand-border py-2.5 text-sm font-semibold text-brand-blue hover:bg-brand-tint">
          {all ? 'Show fewer' : `Show all ${group.items.length}`}
        </button>
      )}
    </section>
  );
};

/** PRD "Fraud detection": suspicious jobs, employers and accounts in one place, each linked to the record. */
const RiskSignals = () => {
  useDocumentTitle('Risk signals');
  const query = useQuery({ queryKey: ['admin', 'risk-signals'], queryFn: () => adminApi.get('/risk-signals') });
  const header = (
    <PageHeader
      title="Risk signals"
      subtitle="Possible fraud and spam found automatically. Open a row to check it and take action."
      actions={
        <Button size="sm" variant="outline" leftIcon={<Icon name="refresh" size={16} />} loading={query.isFetching} onClick={() => query.refetch()}>
          Check again
        </Button>
      }
    />
  );
  if (query.isPending) return <div>{header}<PageLoader /></div>;
  if (query.isError) return <div>{header}<ErrorState error={query.error} onRetry={query.refetch} /></div>;
  const groups = query.data.groups.filter((g) => g.items.length);
  return (
    <div>
      {header}
      <p className="mb-4 text-xs text-brand-gray-muted">Checked {timeAgo(query.data.generatedAt)}. Jobs are scanned for fee and deposit requests in the last 30 days.</p>
      {!groups.length ? (
        <EmptyState icon="verified_user" title="Nothing suspicious right now" description="No fee requests in jobs, no repeated reports, no shared GST numbers or duplicate accounts were found." />
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {groups.map((g) => (
            <Group key={g.key} group={g} />
          ))}
        </div>
      )}
    </div>
  );
};

export default RiskSignals;
