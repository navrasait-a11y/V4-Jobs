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
                <XAxis dataKey="_id" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={28} />
                <Tooltip />
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
