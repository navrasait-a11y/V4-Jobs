import React, { useState } from 'react';
import AddToCalendar from '../../components/common/AddToCalendar';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { clsx } from 'clsx';
import Button from '../../components/ui/Button';
import { DataTable, PageHeader, Pagination, Section, StatusBadge, Tabs } from '../../components/ui/data';
import { ConfirmDialog, EmptyState, ErrorState, Icon, PageLoader } from '../../components/ui/feedback';
import { useAction, useDocumentTitle, useUrlFilters } from '../../hooks/useData';
import { applicationApi } from '../../services';
import { STAGE_LABELS, formatDate, formatDateTime, formatLocations } from '../../utils/format';

const TIMELINE = ['applied', 'screened', 'interview_scheduled', 'offered', 'hired'];
const TABS = ['', 'applied', 'screened', 'interview_scheduled', 'offered', 'hired', 'rejected', 'withdrawn'];

export const Applications = () => {
  useDocumentTitle('My applications');
  const [filters, setFilters] = useUrlFilters({ page: '1' });
  const [withdrawId, setWithdrawId] = useState(null);
  const params = { limit: 20, ...filters };
  const query = useQuery({ queryKey: ['applications', params], queryFn: () => applicationApi.list(params) });
  const withdraw = useAction(applicationApi.withdraw, { success: 'Application withdrawn', invalidate: ['applications', 'candidate-dashboard'], onSuccess: () => setWithdrawId(null) });
  const counts = query.data?.meta?.counts || {};
  const columns = [
    {
      key: 'job',
      header: 'Job',
      render: (a) => (
        <Link to={`/candidate/ats-tracker?id=${a._id}`} className="font-medium hover:text-brand-blue">
          {a.job?.title || 'Job removed'}
          <span className="block text-xs font-normal text-brand-gray-muted">{a.job?.orgSnapshot?.name}</span>
        </Link>
      ),
    },
    { key: 'location', header: 'Location', render: (a) => formatLocations(a.job) },
    { key: 'date', header: 'Applied', render: (a) => formatDate(a.createdAt) },
    { key: 'stage', header: 'Status', render: (a) => <StatusBadge status={a.stage} label={STAGE_LABELS[a.stage]} /> },
    {
      key: 'viewed',
      header: 'Recruiter',
      // Naukri-style signal: did anyone at the company open this application yet?
      render: (a) =>
        a.isViewed ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-brand-green" title={a.viewedAt ? `Viewed on ${formatDateTime(a.viewedAt)}` : undefined}>
            <Icon name="visibility" size={15} /> Viewed{a.viewedAt ? ` ${formatDate(a.viewedAt)}` : ''}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs text-brand-gray-muted">
            <Icon name="schedule" size={15} /> Not viewed yet
          </span>
        ),
    },
  ];
  return (
    <div>
      <PageHeader title="My Applications" subtitle="Everything you have applied to" />
      <Tabs className="mb-4" value={filters.stage || ''} onChange={(stage) => setFilters({ stage })} tabs={TABS.map((s) => ({ value: s, label: s ? STAGE_LABELS[s] : 'All', count: s ? counts[s] || 0 : undefined }))} />
      <DataTable
        columns={columns}
        rows={query.data?.data}
        query={query}
        empty={
          <EmptyState
            icon="description"
            title="No applications here"
            action={
              <Button asChild size="sm" variant="primaryBlue">
                <Link to="/jobs">Find jobs</Link>
              </Button>
            }
          />
        }
        actions={(a) => !['withdrawn', 'hired', 'rejected'].includes(a.stage) && (
          <Button size="sm" variant="dangerGhost" onClick={() => setWithdrawId(a._id)}>
            Withdraw
          </Button>
        )}
      />
      <Pagination meta={query.data?.meta} onPage={(page) => setFilters({ page })} limit={filters.limit} onLimit={(limit) => setFilters({ limit })} />
      <ConfirmDialog open={Boolean(withdrawId)} onClose={() => setWithdrawId(null)} title="Withdraw application?" message="The employer will no longer consider this application." danger confirmLabel="Withdraw" loading={withdraw.isPending} onConfirm={() => withdraw.mutate(withdrawId)} />
    </div>
  );
};

export const ATSTracker = () => {
  useDocumentTitle('ATS tracker');
  const [params, setParams] = useSearchParams();
  const list = useQuery({ queryKey: ['applications', 'tracker'], queryFn: () => applicationApi.list({ limit: 100 }) });
  const id = params.get('id') || list.data?.data?.[0]?._id;
  const detail = useQuery({ queryKey: ['application', id], queryFn: () => applicationApi.get(id), enabled: Boolean(id) });
  if (list.isPending) return <PageLoader />;
  if (list.isError) return <ErrorState error={list.error} onRetry={list.refetch} />;
  if (!list.data.data.length) return <EmptyState icon="timeline" title="Nothing to track yet" description="Apply to a job and follow its progress here." />;
  const app = detail.data?.application || detail.data;
  const reached = TIMELINE.indexOf(app?.stage);
  const dated = Object.fromEntries((app?.history || []).filter((h) => h.stage || h.to).map((h) => [h.stage || h.to, h.at]));

  return (
    <div>
      <PageHeader title="ATS Tracker" subtitle="See exactly where each application stands" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="max-h-[70vh] space-y-2 overflow-y-auto">
          {list.data.data.map((a) => (
            <button key={a._id} onClick={() => setParams({ id: a._id })} className={clsx('block w-full rounded-xl border bg-white p-3 text-left', a._id === id ? 'border-brand-blue' : 'border-brand-border')}>
              <p className="text-sm font-semibold text-brand-dark">{a.job?.title || 'Job removed'}</p>
              <p className="text-xs text-brand-gray-muted">{a.job?.orgSnapshot?.name}</p>
            </button>
          ))}
        </div>
        <div className="space-y-4 lg:col-span-2">
          {detail.isPending && <PageLoader className="h-40" />}
          {app && (
            <>
              <Section title={app.job?.title}>
                {['rejected', 'withdrawn'].includes(app.stage) && <div className="mb-3"><StatusBadge status={app.stage} label={STAGE_LABELS[app.stage]} /></div>}
                <ol className="space-y-0">
                  {TIMELINE.map((s, i) => {
                    const done = i <= reached;
                    return (
                      <li key={s} className="relative flex gap-3 pb-5 last:pb-0">
                        {i < TIMELINE.length - 1 && <span className={clsx('absolute left-[11px] top-6 h-full w-0.5', i < reached ? 'bg-brand-green' : 'bg-brand-border')} />}
                        <span className={clsx('z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full', done ? 'bg-brand-green text-white' : 'bg-brand-border text-white')}>
                          <Icon name="check" size={14} />
                        </span>
                        <div>
                          <p className={clsx('text-sm font-medium', done ? 'text-brand-dark' : 'text-brand-gray-muted')}>{STAGE_LABELS[s]}</p>
                          {dated[s] && <p className="text-xs text-brand-gray-muted">{formatDateTime(dated[s])}</p>}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </Section>
              {detail.data?.interviews?.length > 0 && (
                <Section title="Interviews">
                  <ul className="space-y-2 text-sm text-brand-gray">
                    {detail.data.interviews.map((iv) => (
                      <li key={iv._id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span>
                          {formatDateTime(iv.scheduledAt)} · {iv.mode} <StatusBadge status={iv.status} />
                        </span>
                        <AddToCalendar interview={iv} jobTitle={detail.data?.job?.title} company={detail.data?.job?.orgSnapshot?.name} />
                      </li>
                    ))}
                  </ul>
                </Section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
