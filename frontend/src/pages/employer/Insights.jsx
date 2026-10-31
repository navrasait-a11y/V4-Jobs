import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import BillingPanel from '../../components/shared/BillingPanel';
import Button from '../../components/ui/Button';
import { DataTable, PageHeader, Pagination, Section, SimpleSelect, StatTile, StatusBadge } from '../../components/ui/data';
import { EmptyState, ErrorState } from '../../components/ui/feedback';
import { useAction, useDocumentTitle, useUrlFilters } from '../../hooks/useData';
import { analyticsApi, orgApi, responseApi } from '../../services';
import { STAGE_LABELS, TIMESPAN_OPTIONS, formatDate, titleCase } from '../../utils/format';

const COLORS = ['#0151A0', '#F96C00', '#18A86B', '#7c3aed', '#F7B500', '#788392'];
const FUNNEL = ['applied', 'screened', 'interview_scheduled', 'offered', 'hired'];

export const Analytics = () => {
  useDocumentTitle('Analytics');
  const [timespan, setTimespan] = useState('30d');
  const query = useQuery({ queryKey: ['employer-analytics', timespan], queryFn: () => analyticsApi.employer({ timespan }) });
  if (query.isError) return <ErrorState error={query.error} onRetry={query.refetch} />;
  const d = query.data;
  const funnel = FUNNEL.map((s) => ({ name: STAGE_LABELS[s], value: d?.hiringFunnel?.[s] || 0 }));
  const sources = Object.entries(d?.sourceTracking || {}).map(([name, value]) => ({ name: titleCase(name), value }));
  return (
    <div>
      <PageHeader title="Analytics" actions={<SimpleSelect ariaLabel="Time range" value={timespan} onChange={setTimespan} options={TIMESPAN_OPTIONS} />} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile loading={query.isPending} icon="visibility" label="Job views" value={d?.jobs?.totalViews} />
        <StatTile loading={query.isPending} icon="group" tone="green" label="Applications" value={d?.jobs?.totalApplications} />
        <StatTile loading={query.isPending} icon="percent" tone="orange" label="View to apply" value={`${d?.jobs?.viewToApplyRate ?? 0}%`} />
        <StatTile loading={query.isPending} icon="how_to_reg" tone="purple" label="Hired" value={d?.hiringFunnel?.hired} />
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section title="Hiring funnel">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={funnel}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E3E9F0" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={28} />
                <Tooltip />
                <Bar dataKey="value" name="Candidates" fill="#0151A0" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Section>
        <Section title="Application sources">
          {!sources.length && <p className="text-sm text-brand-gray">No data in this period.</p>}
          {sources.length > 0 && (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={sources} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} label={({ name }) => name}>
                    {sources.map((s, i) => (
                      <Cell key={s.name} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </Section>
      </div>
      <Section title="Top jobs" className="mt-4">
        <DataTable
          columns={[
            { key: 'title', header: 'Job' },
            { key: 'views', header: 'Views', render: (j) => j.stats?.views || 0 },
            { key: 'apps', header: 'Applications', render: (j) => j.stats?.applications || 0 },
            { key: 'conversion', header: 'Conversion', render: (j) => `${j.conversion}%` },
          ]}
          rows={d?.jobPerformance}
          query={query}
          empty={<EmptyState icon="monitoring" title="No job activity yet" />}
        />
      </Section>
      {d?.recruiterProductivity?.length > 0 && (
        <Section title="Recruiter productivity" className="mt-4">
          <DataTable
            rowKey={(r) => r.member?._id}
            columns={[
              { key: 'name', header: 'Recruiter', render: (r) => r.member?.fullName },
              { key: 'jobs', header: 'Jobs posted', render: (r) => r.jobsPosted },
              { key: 'handled', header: 'Applications handled', render: (r) => r.handled ?? r.count ?? 0 },
            ]}
            rows={d.recruiterProductivity}
          />
        </Section>
      )}
    </div>
  );
};

export const Reports = () => {
  useDocumentTitle('Reports');
  const [timespan, setTimespan] = useState('30d');
  const excel = useAction(() => responseApi.exportExcel({ timespan }), { success: 'Report downloaded' });
  const csv = useAction(() => responseApi.exportExcel({ timespan, format: 'csv' }), { success: 'Report downloaded' });
  const zip = useAction(() => responseApi.exportResumes({ timespan }), { success: 'Resumes downloaded' });
  const usage = useQuery({ queryKey: ['org-usage'], queryFn: () => orgApi.usage() });
  const followers = useQuery({ queryKey: ['org-followers'], queryFn: () => orgApi.followers({ limit: 20 }) });
  return (
    <div>
      <PageHeader title="Reports" actions={<SimpleSelect ariaLabel="Time range" value={timespan} onChange={setTimespan} options={TIMESPAN_OPTIONS} />} />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Section title="Applicants (Excel)">
          <Button size="sm" variant="primaryBlue" loading={excel.isPending} onClick={() => excel.mutate()}>
            Download
          </Button>
        </Section>
        <Section title="Applicants (CSV)">
          <Button size="sm" variant="primaryBlue" loading={csv.isPending} onClick={() => csv.mutate()}>
            Download
          </Button>
        </Section>
        <Section title="Resumes (ZIP)">
          <Button size="sm" variant="primaryBlue" loading={zip.isPending} onClick={() => zip.mutate()}>
            Download
          </Button>
        </Section>
      </div>
      <Section title={`Followers (${followers.data?.meta?.total ?? 0})`} className="mt-4">
        {!followers.data?.data?.length && <p className="text-sm text-brand-gray">No followers yet.</p>}
        <ul className="divide-y divide-brand-border text-sm">
          {followers.data?.data?.map((f) => (
            <li key={f._id} className="py-2 text-brand-dark">
              {f.follower?.fullName || f.fullName}
            </li>
          ))}
        </ul>
      </Section>
      <Section title="Team usage" className="mt-4">
        <DataTable
          rowKey={(m) => m.member?._id || m._id}
          columns={[
            { key: 'name', header: 'Member', render: (m) => m.member?.fullName || m.fullName },
            ...['job_post', 'resume_view', 'resume_download', 'invite'].map((k) => ({ key: k, header: titleCase(k), render: (m) => m.usage?.[k]?.monthly ?? m[k] ?? 0 })),
          ]}
          rows={usage.data?.members}
          query={usage}
          empty={<EmptyState icon="summarize" title="No usage recorded" />}
        />
      </Section>
    </div>
  );
};

export const PackagesBilling = () => {
  useDocumentTitle('Packages & billing');
  return (
    <div>
      <PageHeader title="Packages & Billing" />
      <BillingPanel audience="employer" />
    </div>
  );
};

export const Enquiries = () => {
  useDocumentTitle('Enquiries');
  const [filters, setFilters] = useUrlFilters({ page: '1' });
  const params = { limit: 20, ...filters };
  const query = useQuery({ queryKey: ['enquiries', params], queryFn: () => orgApi.enquiries(params) });
  return (
    <div>
      <PageHeader title="Enquiries" subtitle="Messages from your public page" />
      <DataTable
        columns={[
          { key: 'name', header: 'From', render: (e) => <span>{e.name}<span className="block text-xs text-brand-gray-muted">{e.email}</span></span> },
          { key: 'subject', header: 'Subject', render: (e) => e.subject || '—' },
          { key: 'message', header: 'Message', render: (e) => <span className="line-clamp-2 max-w-md">{e.message}</span> },
          { key: 'date', header: 'Date', render: (e) => formatDate(e.createdAt) },
          { key: 'status', header: 'Status', render: (e) => <StatusBadge status={e.status} /> },
        ]}
        rows={query.data?.data}
        query={query}
        empty={<EmptyState icon="contact_mail" title="No enquiries yet" />}
      />
      <Pagination meta={query.data?.meta} onPage={(page) => setFilters({ page })} />
    </div>
  );
};
