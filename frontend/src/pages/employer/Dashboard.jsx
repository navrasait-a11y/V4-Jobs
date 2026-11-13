import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import Button from '../../components/ui/Button';
import { Avatar, Section, StatTile, StatusBadge } from '../../components/ui/data';
import { ErrorState } from '../../components/ui/feedback';
import useAuth from '../../hooks/useAuth';
import { useDocumentTitle } from '../../hooks/useData';
import { analyticsApi, interviewApi, orgApi, responseApi } from '../../services';
import { STAGE_LABELS, formatDateTime, timeAgo } from '../../utils/format';

const FUNNEL = [
  ['applied', 'Applied', 'bg-brand-blue'],
  ['screened', 'Shortlisted', 'bg-[#3B82C4]'],
  ['interview_scheduled', 'Interviewed', 'bg-brand-orange'],
  ['offered', 'Offered', 'bg-[#8B5CF6]'],
  ['hired', 'Hired', 'bg-brand-green'],
];
const ORDER = FUNNEL.map(([k]) => k);
const day = (d) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : '');

/**
 * Hiring funnel for the last 30 days. Each application counts towards every stage it has reached,
 * so the bars always narrow from left to right (rejected / withdrawn ones count as "applied").
 */
const Funnel = ({ byStage = {} }) => {
  const reached = (stage) => Object.entries(byStage).reduce((sum, [s, n]) => sum + (stage === 'applied' || ORDER.indexOf(s) >= ORDER.indexOf(stage) ? n : 0), 0);
  const total = reached('applied');
  if (!total) return <p className="py-6 text-center text-sm text-brand-gray">Applications in the last 30 days show up here.</p>;
  return (
    <ul className="space-y-3">
      {FUNNEL.map(([k, label, color]) => {
        const n = reached(k);
        const pct = Math.round((n / total) * 100);
        return (
          <li key={k}>
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-medium text-brand-dark">{label}</span>
              <span className="tabular-nums text-brand-gray">
                <b className="text-brand-dark">{n}</b> <span className="text-xs">({pct}%)</span>
              </span>
            </div>
            <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-brand-tint">
              <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(pct, n ? 3 : 0)}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
};

const Dashboard = () => {
  useDocumentTitle('Dashboard');
  const { user, organization } = useAuth();
  const stats = useQuery({ queryKey: ['employer-analytics', '30d'], queryFn: () => analyticsApi.employer({ timespan: '30d' }) });
  const recent = useQuery({ queryKey: ['responses', 'recent'], queryFn: () => responseApi.list({ limit: 10, sort: '-createdAt' }) });
  const upcoming = useQuery({ queryKey: ['interviews', 'upcoming'], queryFn: () => interviewApi.list({ from: new Date().toISOString(), limit: 5 }) });
  const usage = useQuery({ queryKey: ['org-usage'], queryFn: () => orgApi.usage() });
  if (stats.isError) return <ErrorState error={stats.error} onRetry={stats.refetch} />;
  const d = stats.data;
  const credits = usage.data?.credits || {};

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-brand-dark">Hello, {user.fullName?.split(' ')[0]}</h1>
          <p className="mt-1 text-sm text-brand-gray">Hiring activity at {organization?.name} in the last 30 days.</p>
        </div>
        <Button asChild size="sm" variant="primary">
          <Link to="/employer/jobs/post">Post a job</Link>
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile loading={stats.isPending} icon="work" label="Active jobs" value={d?.jobs?.byStatus?.active} to="/employer/jobs?status=active" />
        <StatTile loading={stats.isPending} icon="group" tone="green" label="Applications" value={d?.jobs?.totalApplications} to="/employer/applications" />
        <StatTile loading={stats.isPending} icon="event" tone="orange" label="Interviews" value={d?.hiringFunnel?.interview_scheduled} to="/employer/interviews" />
        <StatTile loading={stats.isPending} icon="how_to_reg" tone="purple" label="Hired" value={d?.hiringFunnel?.hired} to="/employer/ats" />
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Section title="Applications" className="lg:col-span-2">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={d?.applicationTrend || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E3E9F0" vertical={false} />
                <XAxis dataKey="_id" tickFormatter={day} tick={{ fontSize: 11 }} minTickGap={20} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={28} />
                <Tooltip labelFormatter={(d) => day(d)} />
                <Area dataKey="count" name="Applications" stroke="#0151A0" fill="#EDF4FC" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Section>
        <Section title="Credits" actions={<Link to="/employer/packages-billing" className="text-xs font-semibold text-brand-blue">Buy more</Link>}>
          <ul className="space-y-2 text-sm">
            {[
              ['job_post', 'Job posts'],
              ['resume_view', 'Resume views'],
              ['resume_download', 'Resume downloads'],
              ['invite', 'Invites'],
            ].map(([k, label]) => (
              <li key={k} className="flex justify-between text-brand-gray">
                {label}
                <b className="text-brand-dark">{credits[k] ?? 0}</b>
              </li>
            ))}
          </ul>
        </Section>
        <Section title="Hiring funnel" className="lg:col-span-1" actions={<Link to="/employer/analytics" className="text-xs font-semibold text-brand-blue">Full report</Link>}>
          <Funnel byStage={d?.hiringFunnel} />
        </Section>
        <Section title="Team activity" className="lg:col-span-2" actions={<span className="text-xs text-brand-gray-muted">Last 30 days</span>}>
          {!d?.recruiterProductivity?.length ? (
            <p className="py-6 text-center text-sm text-brand-gray">Shortlists, stage changes and hires by each team member show up here.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-brand-gray-muted">
                  <tr>
                    <th className="border-b border-brand-border py-2 font-semibold">Member</th>
                    <th className="border-b border-brand-border py-2 pl-3 text-right font-semibold">Jobs posted</th>
                    <th className="border-b border-brand-border py-2 pl-3 text-right font-semibold">Actions</th>
                    <th className="border-b border-brand-border py-2 pl-3 text-right font-semibold">Shortlisted</th>
                    <th className="border-b border-brand-border py-2 pl-3 text-right font-semibold">Hired</th>
                  </tr>
                </thead>
                <tbody>
                  {d.recruiterProductivity.slice(0, 6).map((r) => (
                    <tr key={r.member?._id} className="border-b border-brand-border last:border-0">
                      <td className="py-2">
                        <span className="flex items-center gap-2">
                          <Avatar name={r.member?.fullName} size={28} />
                          <span className="truncate font-medium text-brand-dark">{r.member?.fullName}</span>
                        </span>
                      </td>
                      <td className="py-2 pl-3 text-right tabular-nums text-brand-gray">{r.jobsPosted || 0}</td>
                      <td className="py-2 pl-3 text-right tabular-nums text-brand-gray">{r.actions || 0}</td>
                      <td className="py-2 pl-3 text-right tabular-nums text-brand-gray">{r.shortlists || 0}</td>
                      <td className="py-2 pl-3 text-right tabular-nums font-semibold text-brand-green">{r.hires || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
        <Section title="Latest applicants" className="lg:col-span-2" actions={<Link to="/employer/applications" className="text-xs font-semibold text-brand-blue">View all</Link>}>
          {!recent.data?.data?.length && <p className="text-sm text-brand-gray">No applications yet.</p>}
          <ul className="divide-y divide-brand-border">
            {recent.data?.data.slice(0, 5).map((a) => (
              <li key={a._id}>
                <Link to={`/employer/applications/${a._id}`} className="flex items-center gap-3 py-2.5 hover:bg-brand-tint">
                  <Avatar name={a.snapshot?.fullName} size={36} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-brand-dark">{a.snapshot?.fullName}</p>
                    <p className="truncate text-xs text-brand-gray-muted">{a.job?.title} · {timeAgo(a.createdAt)}</p>
                  </div>
                  <StatusBadge status={a.stage} label={STAGE_LABELS[a.stage]} />
                </Link>
              </li>
            ))}
          </ul>
        </Section>
        <Section title="Upcoming interviews">
          {!upcoming.data?.data?.length && <p className="text-sm text-brand-gray">Nothing scheduled.</p>}
          <ul className="space-y-2.5 text-sm">
            {upcoming.data?.data.map((iv) => (
              <li key={iv._id}>
                <p className="font-medium text-brand-dark">{iv.candidate?.fullName || iv.application?.snapshot?.fullName}</p>
                <p className="text-xs text-brand-gray-muted">{formatDateTime(iv.scheduledAt)}</p>
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </div>
  );
};

export default Dashboard;
