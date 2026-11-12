import React, { useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import TimeRange, { rangeParams } from '../../components/admin/TimeRange';
import { PageHeader, Section, StatTile } from '../../components/ui/data';
import { EmptyState, ErrorState, PageLoader } from '../../components/ui/feedback';
import { useDocumentTitle } from '../../hooks/useData';
import { adminApi } from '../../services';
import { formatCurrency, formatNumber } from '../../utils/format';

const GRID = '#E3E9F0';
const BLUE = '#0151A0';
const GREEN = '#18A86B';
const ORANGE = '#F28C28';
const day = (d) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : '');
const pct = (part, whole) => (whole ? `${((part / whole) * 100).toFixed(1)}%` : '0%');

const Chart = ({ empty, emptyText, children }) =>
  empty ? (
    <EmptyState icon="monitoring" title="Nothing to show yet" description={emptyText} className="border-0" />
  ) : (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  );

/** One step of a funnel: a bar whose width is its share of the first step. */
const FunnelStep = ({ label, value, of, tone = 'bg-brand-blue' }) => (
  <div>
    <div className="flex items-baseline justify-between gap-2 text-sm">
      <span className="font-medium text-brand-dark">{label}</span>
      <span className="tabular-nums text-brand-gray">
        <b className="text-brand-dark">{formatNumber(value)}</b>
        {of !== undefined && <span className="ml-1.5 text-xs">({pct(value, of)})</span>}
      </span>
    </div>
    <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-brand-tint">
      <div className={`h-full rounded-full ${tone}`} style={{ width: `${of === undefined ? 100 : Math.max(of ? (value / of) * 100 : 0, value ? 2 : 0)}%` }} />
    </div>
  </div>
);

const SimpleTable = ({ head, rows, empty }) =>
  rows.length ? (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-xs uppercase tracking-wide text-brand-gray-muted">
          <tr>
            {head.map((h, i) => (
              <th key={h} className={`border-b border-brand-border py-2 font-semibold ${i ? 'pl-3 text-right' : ''}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r[0]} className="border-b border-brand-border last:border-0">
              {r.map((cell, i) => (
                <td key={i} className={`py-2 ${i ? 'pl-3 text-right tabular-nums text-brand-gray' : 'font-medium text-brand-dark'}`}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <p className="py-6 text-center text-sm text-brand-gray">{empty}</p>
  );

/** PRD Admin Analytics: revenue, user growth, conversion rates, traffic and job category performance. */
const AdminAnalytics = () => {
  useDocumentTitle('Analytics');
  const [range, setRange] = useState({ timespan: '30d', from: '', to: '' });
  const params = rangeParams(range);
  const ready = range.timespan !== 'custom' || (range.from && range.to);
  const query = useQuery({ queryKey: ['admin', 'analytics', params], queryFn: () => adminApi.get('/analytics', params), placeholderData: keepPreviousData, enabled: Boolean(ready) });
  const d = query.data;

  const growth = useMemo(() => {
    const byDate = {};
    for (const g of d?.userGrowth || []) {
      const row = (byDate[g.date] = byDate[g.date] || { date: g.date, candidates: 0, employers: 0 });
      if (g.role === 'candidate') row.candidates += g.count;
      else if (g.role === 'employer') row.employers += g.count;
    }
    return Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));
  }, [d]);

  const header = <PageHeader title="Analytics" subtitle="Revenue, growth, conversion and what candidates are searching for" actions={<TimeRange value={range} onChange={setRange} placeholder={null} />} />;
  if (!ready) return <div>{header}<EmptyState icon="date_range" title="Pick both dates" description="Choose a start and an end date to see the report." /></div>;
  if (query.isPending) return <div>{header}<PageLoader /></div>;
  if (query.isError) return <div>{header}<ErrorState error={query.error} onRetry={query.refetch} /></div>;

  const revenue = d.revenue?.daily || [];
  const c = d.conversion || {};
  const t = d.traffic || {};
  const categories = d.jobCategoryPerformance || [];
  const newUsers = growth.reduce((a, g) => a + g.candidates + g.employers, 0);

  return (
    <div className={query.isPlaceholderData ? 'opacity-70 transition-opacity' : ''}>
      {header}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile icon="currency_rupee" label="Revenue" value={formatCurrency(d.revenue?.total || 0)} note={`${formatNumber((d.revenue?.byPlan || []).reduce((a, p) => a + p.orders, 0))} paid orders`} to="/admin/orders?status=paid" />
        <StatTile icon="group_add" label="New users" value={formatNumber(newUsers)} note={`${formatNumber(c.candidatesRegistered || 0)} candidates · ${formatNumber(c.employersRegistered || 0)} employers`} />
        <StatTile icon="how_to_reg" label="Candidates who applied" value={pct(c.candidatesApplied || 0, c.candidatesRegistered || 0)} note={`${formatNumber(c.candidatesApplied || 0)} of ${formatNumber(c.candidatesRegistered || 0)} new candidates`} />
        <StatTile icon="workspace_premium" label="Employers who paid" value={`${c.employerPaidRate || 0}%`} note={`${formatNumber(c.employersPaid || 0)} of ${formatNumber(c.employersRegistered || 0)} new employers`} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section title="Revenue by day">
          <Chart empty={!revenue.length} emptyText="Paid orders in this period show up here.">
            <AreaChart data={revenue}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
              <XAxis dataKey="_id" tickFormatter={day} tick={{ fontSize: 11 }} minTickGap={24} />
              <YAxis tick={{ fontSize: 11 }} width={56} tickFormatter={(v) => `₹${formatNumber(v)}`} />
              <Tooltip formatter={(v) => formatCurrency(v)} />
              <Area dataKey="count" name="Revenue" stroke={GREEN} fill="#E8F8F0" strokeWidth={2} />
            </AreaChart>
          </Chart>
        </Section>
        <Section title="New sign-ups by day">
          <Chart empty={!growth.length} emptyText="New candidate and employer accounts in this period show up here.">
            <BarChart data={growth}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
              <XAxis dataKey="date" tickFormatter={day} tick={{ fontSize: 11 }} minTickGap={24} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={32} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="candidates" name="Candidates" stackId="u" fill={BLUE} />
              <Bar dataKey="employers" name="Employers" stackId="u" fill={ORANGE} radius={[4, 4, 0, 0]} />
            </BarChart>
          </Chart>
        </Section>

        <Section title="Conversion">
          <div className="space-y-5">
            <div className="space-y-3">
              <p className="text-xs font-bold uppercase tracking-wide text-brand-gray-muted">Candidates</p>
              <FunnelStep label="Registered" value={c.candidatesRegistered || 0} />
              <FunnelStep label="Applied to a job" value={c.candidatesApplied || 0} of={c.candidatesRegistered || 0} />
            </div>
            <div className="space-y-3">
              <p className="text-xs font-bold uppercase tracking-wide text-brand-gray-muted">Employers</p>
              <FunnelStep label="Registered" value={c.employersRegistered || 0} tone="bg-brand-orange" />
              <FunnelStep label="Bought a plan" value={c.employersPaid || 0} of={c.employersRegistered || 0} tone="bg-brand-orange" />
            </div>
          </div>
        </Section>
        <Section title="Job traffic (all time)">
          <div className="space-y-3">
            <FunnelStep label="Job views" value={t.views || 0} tone="bg-brand-green" />
            <FunnelStep label="Applications" value={t.applications || 0} of={t.views || 0} tone="bg-brand-green" />
            <FunnelStep label="Shares" value={t.shares || 0} of={t.views || 0} tone="bg-brand-green" />
          </div>
          <p className="mt-4 text-xs text-brand-gray-muted">Percentages are of job views. Visitor numbers by page come from your web analytics tool.</p>
        </Section>

        <Section title="Revenue by plan">
          <SimpleTable head={['Plan', 'Orders', 'Revenue']} rows={(d.revenue?.byPlan || []).map((p) => [p._id || 'Other', formatNumber(p.orders), formatCurrency(p.revenue)])} empty="No paid orders in this period." />
        </Section>
        <Section title="Job category performance">
          <SimpleTable
            head={['Department', 'Jobs', 'Views', 'Applications', 'Apply rate']}
            rows={categories.slice(0, 12).map((x) => [x._id, formatNumber(x.jobs), formatNumber(x.views), formatNumber(x.applications), pct(x.applications, x.views)])}
            empty="No jobs were published in this period."
          />
        </Section>

        <Section title="Most wanted skills (active jobs)">
          <Chart empty={!(d.topSkills || []).length} emptyText="Skills from active jobs show up here.">
            <BarChart data={(d.topSkills || []).slice(0, 10)} layout="vertical" margin={{ left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="_id" width={110} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="count" name="Jobs" fill={BLUE} radius={[0, 4, 4, 0]} />
            </BarChart>
          </Chart>
        </Section>
        <Section title="Cities with most jobs (active jobs)">
          <Chart empty={!(d.topCities || []).length} emptyText="Job locations show up here.">
            <BarChart data={(d.topCities || []).filter((x) => x._id).slice(0, 10)} layout="vertical" margin={{ left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="_id" width={110} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="count" name="Jobs" fill={ORANGE} radius={[0, 4, 4, 0]} />
            </BarChart>
          </Chart>
        </Section>
      </div>
    </div>
  );
};

export default AdminAnalytics;
