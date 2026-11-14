import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Avatar, Section, SimpleSelect, StatusBadge } from '../../components/ui/data';
import { ErrorState, Icon, Skeleton } from '../../components/ui/feedback';
import useAuth from '../../hooks/useAuth';
import { useDocumentTitle } from '../../hooks/useData';
import { adminApi } from '../../services';
import { TIMESPAN_OPTIONS, formatCurrency, formatNumber, timeAgo, titleCase } from '../../utils/format';
import DemoDataNotice from '../../components/admin/DemoDataNotice';

const SERIES = [
  { key: 'candidates', name: 'New candidates', color: '#0A6CB5' },
  { key: 'applications', name: 'Applications', color: '#18A86B' },
  { key: 'jobs', name: 'Jobs published', color: '#F28C28' },
  { key: 'employers', name: 'New employers', color: '#7B5CD6' },
];
const TONES = {
  blue: 'bg-brand-blue-tint text-brand-blue',
  green: 'bg-[#E8F8F0] text-brand-green',
  orange: 'bg-[#FFF4E8] text-[#C46A0F]',
  purple: 'bg-[#F1ECFC] text-[#6A4BC4]',
  red: 'bg-[#FDECEC] text-brand-red',
};

const Kpi = ({ icon, tone, label, value, sub, to, loading }) => (
  <Link to={to} className="surface group flex items-start gap-3 p-4 transition-shadow hover:shadow-[var(--shadow-hover)]">
    <span className={clsx('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', TONES[tone])}>
      <Icon name={icon} size={22} />
    </span>
    <span className="min-w-0 flex-1">
      <span className="block text-xs font-medium text-brand-gray">{label}</span>
      {loading ? <Skeleton className="mt-1 h-7 w-20" /> : <span className="block text-2xl font-bold text-brand-dark">{value}</span>}
      {sub && <span className="block truncate text-xs text-brand-gray-muted">{sub}</span>}
    </span>
    <Icon name="arrow_forward" size={18} className="text-brand-gray-muted transition-transform group-hover:translate-x-0.5 group-hover:text-brand-blue" />
  </Link>
);

const Attention = ({ icon, tone, label, count, to, loading }) => (
  <Link to={to} className={clsx('flex items-center justify-between gap-3 rounded-xl border p-3.5 transition-colors', count ? 'border-transparent bg-white shadow-sm hover:shadow-[var(--shadow-hover)]' : 'border-brand-border bg-white/60')}>
    <span className="flex items-center gap-2.5">
      <span className={clsx('flex h-9 w-9 items-center justify-center rounded-lg', TONES[tone])}>
        <Icon name={icon} size={18} />
      </span>
      <span className="text-sm font-medium text-brand-dark">{label}</span>
    </span>
    {loading ? <Skeleton className="h-6 w-8" /> : <span className={clsx('min-w-8 rounded-full px-2.5 py-0.5 text-center text-sm font-bold', count ? 'bg-brand-red text-white' : 'bg-brand-tint text-brand-gray')}>{count}</span>}
  </Link>
);

const QUICK = [
  ['post_add', 'Post job for employer', '/admin/jobs/post'],
  ['person_add', 'Add candidate', '/admin/candidates?create=1'],
  ['domain_add', 'Add employer', '/admin/employers?create=1'],
  ['campaign', 'Send bulk message', '/admin/communications'],
  ['notifications_active', 'Job alerts', '/admin/job-alerts'],
  ['health_and_safety', 'Platform health', '/admin/health'],
];

const List = ({ title, to, items, empty, render }) => (
  <Section title={title} actions={<Link to={to} className="text-xs font-semibold text-brand-blue hover:underline">View all</Link>}>
    {!items?.length ? <p className="py-4 text-center text-sm text-brand-gray-muted">{empty}</p> : <ul className="-my-2 divide-y divide-brand-border">{items.map(render)}</ul>}
  </Section>
);

/** Admin home: KPIs, a trend chart, everything waiting for action, quick actions and the latest records. */
const AdminOverview = () => {
  useDocumentTitle('Admin overview');
  const { user } = useAuth();
  const [timespan, setTimespan] = useState('30d');
  const query = useQuery({ queryKey: ['admin', 'dashboard', timespan], queryFn: () => adminApi.get('/dashboard', { timespan }), placeholderData: keepPreviousData });
  const risk = useQuery({ queryKey: ['admin', 'risk-count'], queryFn: () => adminApi.get('/risk-signals/count'), staleTime: 5 * 60 * 1000 });
  const logins = useQuery({ queryKey: ['admin', 'logins', timespan], queryFn: () => adminApi.get('/stats/logins', { timespan }), placeholderData: keepPreviousData });
  const messaging = useQuery({ queryKey: ['admin', 'messaging', timespan], queryFn: () => adminApi.get('/stats/messaging', { timespan }), placeholderData: keepPreviousData });
  if (query.isError) return <ErrorState error={query.error} onRetry={query.refetch} />;
  const d = query.data || {};
  const p = d.pending || {};
  const L = query.isPending;
  const employers = (d.employers?.company?.total || 0) + (d.employers?.consultancy?.total || 0);
  const span = TIMESPAN_OPTIONS.find((o) => o.value === timespan)?.label?.toLowerCase() || 'this period';
  const waiting = (p.reports || 0) + (p.kycReviews || 0) + (p.jobReviews || 0) + (p.supportChats || 0) + (p.employers || 0);
  const hour = new Date().getHours();

  return (
    <div className="space-y-5">
      <DemoDataNotice demo={d.demoData} className="" />
      <div className="flex flex-col gap-3 rounded-2xl bg-gradient-to-r from-[#0A4F8C] to-brand-blue p-5 text-white sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-white/80">{hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'}</p>
          <h1 className="text-2xl font-bold">{user?.admin?.nickname || user?.fullName?.split(' ')[0] || 'Admin'}</h1>
          <p className="mt-1 text-sm text-white/85">{waiting ? `${waiting} item${waiting > 1 ? 's' : ''} need your attention.` : 'Everything is up to date.'}</p>
        </div>
        <SimpleSelect ariaLabel="Time range" value={timespan} onChange={setTimespan} options={TIMESPAN_OPTIONS} className="bg-white text-brand-dark sm:w-48" />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi loading={L} icon="group" tone="blue" label="Candidates" value={formatNumber(d.users?.candidate?.total ?? 0)} sub={`+${formatNumber(d.newUsers?.candidate ?? 0)} in ${span}`} to="/admin/candidates" />
        <Kpi loading={L} icon="apartment" tone="purple" label="Employers" value={formatNumber(employers)} sub={`${formatNumber(d.employers?.company?.total ?? 0)} companies · ${formatNumber(d.employers?.consultancy?.total ?? 0)} consultancies`} to="/admin/employers" />
        <Kpi loading={L} icon="work" tone="green" label="Active jobs" value={formatNumber(d.jobs?.active ?? 0)} sub={`${formatNumber(d.jobsInRange ?? 0)} published · ${formatNumber(d.applicationsInRange ?? 0)} applications`} to="/admin/jobs" />
        <Kpi loading={L} icon="currency_rupee" tone="orange" label="Revenue" value={formatCurrency(d.revenue?.revenue ?? 0)} sub={`${formatNumber(d.revenue?.orders ?? 0)} paid orders in ${span}`} to="/admin/orders" />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Section title="Growth trend" className="xl:col-span-2">
          <div className="h-72">
            {L ? (
              <Skeleton className="h-full w-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={d.trend || []} margin={{ left: -12, right: 8, top: 8 }}>
                  <defs>
                    {SERIES.map((s) => (
                      <linearGradient key={s.key} id={`g-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={s.color} stopOpacity={0.25} />
                        <stop offset="100%" stopColor={s.color} stopOpacity={0} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E3E9F0" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => v.slice(5)} minTickGap={16} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                  {SERIES.map((s) => (
                    <Area key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2} fill={`url(#g-${s.key})`} />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </Section>
        <div className="space-y-2.5 rounded-2xl bg-brand-tint p-3">
          <p className="px-1 text-sm font-bold text-brand-dark">Needs attention</p>
          <Attention loading={L} icon="domain" tone="purple" label="Employers to approve" count={p.employers ?? 0} to="/admin/employers?status=pending" />
          <Attention loading={L} icon="verified_user" tone="orange" label="KYC documents" count={p.kycReviews ?? 0} to="/admin/kyc" />
          <Attention loading={L} icon="rule" tone="blue" label="Jobs to review" count={p.jobReviews ?? 0} to="/admin/jobs?status=admin_review" />
          <Attention loading={risk.isPending} icon="gpp_maybe" tone="red" label="Risk signals" count={risk.data?.total ?? 0} to="/admin/risk" />
          <Attention loading={L} icon="flag" tone="red" label="Open reports" count={p.reports ?? 0} to="/admin/moderation?status=open" />
          <Attention loading={L} icon="support_agent" tone="green" label="Support chats" count={p.supportChats ?? 0} to="/admin/support-chat" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {QUICK.map(([icon, label, to]) => (
          <Link key={to} to={to} className="surface flex flex-col items-center gap-2 p-4 text-center text-xs font-semibold text-brand-dark transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-hover)]">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-blue-tint text-brand-blue">
              <Icon name={icon} size={20} />
            </span>
            {label}
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-4">
        <List
          title="Employers to approve"
          to="/admin/employers?status=pending"
          items={d.recent?.employersToApprove}
          empty="No pending employers"
          render={(o) => (
            <li key={o._id}>
              <Link to={`/admin/employers/${o._id}`} className="flex items-center gap-2.5 py-2 hover:text-brand-blue">
                <Avatar name={o.name} src={o.logo?.url} size={32} square />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{o.name}</span>
                  <span className="text-xs text-brand-gray-muted">{titleCase(o.type)} · {timeAgo(o.createdAt)}</span>
                </span>
              </Link>
            </li>
          )}
        />
        <List
          title="Jobs to review"
          to="/admin/jobs?status=admin_review"
          items={d.recent?.jobsToReview}
          empty="No jobs waiting"
          render={(j) => (
            <li key={j._id}>
              <Link to={`/admin/jobs/${j._id}/edit`} className="block py-2 hover:text-brand-blue">
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">{j.title}</span>
                  <StatusBadge status={j.status} />
                </span>
                <span className="block truncate text-xs text-brand-gray-muted">{j.statusReason || j.orgSnapshot?.name}</span>
              </Link>
            </li>
          )}
        />
        <List
          title="New candidates"
          to="/admin/candidates"
          items={d.recent?.candidates}
          empty="No candidates yet"
          render={(c) => (
            <li key={c._id}>
              <Link to={`/admin/candidates/${c._id}`} className="flex items-center gap-2.5 py-2 hover:text-brand-blue">
                <Avatar name={c.fullName} src={c.avatar?.url} size={32} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{c.fullName}</span>
                  <span className="text-xs text-brand-gray-muted">{titleCase(c.source || 'direct')} · {timeAgo(c.createdAt)}</span>
                </span>
              </Link>
            </li>
          )}
        />
        <List
          title="Latest payments"
          to="/admin/orders"
          items={d.recent?.orders}
          empty="No payments yet"
          render={(o) => (
            <li key={o._id} className="flex items-center justify-between gap-2 py-2 text-sm">
              <span className="min-w-0">
                <span className="block truncate font-medium">{o.planName || 'Plan'}</span>
                <span className="text-xs text-brand-gray-muted">{timeAgo(o.paidAt)}</span>
              </span>
              <span className="font-semibold text-brand-green">{formatCurrency((o.total || 0) + (o.walletUsed || 0))}</span>
            </li>
          )}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section title={`Logins (${span})`}>
          <div className="grid grid-cols-3 gap-2 text-center sm:grid-cols-6">
            {[['Attempts', logins.data?.totalAttempts], ['Successful', logins.data?.successful], ['Failed', logins.data?.failed], ['Candidates', logins.data?.candidates], ['Companies', logins.data?.companies], ['Consultancies', logins.data?.consultancies]].map(([k, v]) => (
              <div key={k} className="rounded-lg bg-brand-tint px-2 py-3">
                <p className="text-lg font-bold text-brand-dark">{formatNumber(v ?? 0)}</p>
                <p className="text-[11px] text-brand-gray-muted">{k}</p>
              </div>
            ))}
          </div>
          <Link to="/admin/login-audit" className="mt-3 inline-block text-xs font-semibold text-brand-blue">Open login audit</Link>
        </Section>
        <Section title={`E-mail delivery (${span})`}>
          <div className="grid grid-cols-3 gap-2 text-center">
            {[['Sent', messaging.data?.emails?.sent, 'text-brand-green'], ['Failed', messaging.data?.emails?.failed, 'text-brand-red'], ['Queued', messaging.data?.emails?.queued, 'text-brand-dark']].map(([k, v, c]) => (
              <div key={k} className="rounded-lg bg-brand-tint px-2 py-3">
                <p className={clsx('text-lg font-bold', c)}>{formatNumber(v ?? 0)}</p>
                <p className="text-[11px] text-brand-gray-muted">{k}</p>
              </div>
            ))}
          </div>
          <Link to="/admin/message-logs" className="mt-3 inline-block text-xs font-semibold text-brand-blue">Open e-mail logs</Link>
        </Section>
      </div>
    </div>
  );
};

export default AdminOverview;
