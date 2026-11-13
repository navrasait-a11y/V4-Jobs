import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { DataTable, Section, StatTile } from '../ui/data';
import { EmptyState, ErrorState, PageLoader } from '../ui/feedback';
import { adminApi } from '../../services';
import { formatNumber, titleCase } from '../../utils/format';

const Counts = ({ title, map }) => {
  const rows = Object.entries(map || {}).filter(([, v]) => v);
  if (!rows.length) return null;
  return (
    <Section title={title}>
      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        {rows.map(([key, value]) => (
          <div key={key}>
            <dt className="text-xs text-brand-gray-muted">{titleCase(key)}</dt>
            <dd className="font-semibold text-brand-dark">{formatNumber(value)}</dd>
          </div>
        ))}
      </dl>
    </Section>
  );
};

/** PRD "User Usage Reports": what an employer account or a candidate did on the portal in the last 12 months. */
const UsageReport = ({ userId, candidate = false }) => {
  const query = useQuery({ queryKey: ['admin', 'usage', userId], queryFn: () => adminApi.get(`/users/${userId}/usage`) });
  if (query.isPending) return <PageLoader className="min-h-[20vh]" />;
  if (query.isError) return <ErrorState error={query.error} onRetry={query.refetch} />;
  const d = query.data;
  if (!d) return <EmptyState icon="monitoring" title="No usage yet" />;

  if (candidate) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile icon="visibility" label="Profile views (12 months)" value={formatNumber(d.profileViews?.total || 0)} />
          <StatTile icon="download" label="Resume downloads" value={formatNumber(d.resumeDownloads?.total || 0)} />
          <StatTile icon="person_search" label="Search appearances" value={formatNumber(d.searchAppearances || 0)} />
          <StatTile icon="description" label="Applications" value={formatNumber(d.applicationPerformance?.total || 0)} note={`${d.applicationPerformance?.viewRate || 0}% viewed by recruiters`} />
        </div>
        <Counts title="Applications by stage" map={d.applicationPerformance?.byStage} />
      </div>
    );
  }

  const jobs = Object.values(d.jobs?.byStatus || {}).reduce((a, b) => a + b, 0);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile icon="work" label="Jobs posted (12 months)" value={formatNumber(jobs)} />
        <StatTile icon="visibility" label="Job views" value={formatNumber(d.jobs?.totalViews || 0)} />
        <StatTile icon="group" label="Applications received" value={formatNumber(d.jobs?.totalApplications || 0)} />
        <StatTile icon="percent" label="View to apply rate" value={`${d.jobs?.viewToApplyRate || 0}%`} />
      </div>
      <Counts title="Hiring funnel" map={d.hiringFunnel} />
      <Counts title="Where applications came from" map={d.sourceTracking} />
      <Section title="Team activity">
        <DataTable
          rowKey={(r) => String(r.member?._id)}
          columns={[
            { key: 'member', header: 'User', render: (r) => <span className="font-medium">{r.member?.fullName || '—'}</span> },
            { key: 'jobsPosted', header: 'Jobs posted', render: (r) => formatNumber(r.jobsPosted || 0) },
            { key: 'actions', header: 'Candidate actions', render: (r) => formatNumber(r.actions || 0) },
            { key: 'shortlists', header: 'Shortlisted', render: (r) => formatNumber(r.shortlists || 0) },
            { key: 'hires', header: 'Hired', render: (r) => formatNumber(r.hires || 0) },
          ]}
          rows={d.recruiterProductivity || []}
          empty={<EmptyState icon="group" title="No team activity yet" />}
        />
      </Section>
    </div>
  );
};

export default UsageReport;
