import React from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import Button from '../../components/ui/Button';
import { PageHeader, Pagination, Section, SimpleSelect, Tabs } from '../../components/ui/data';
import { CardSkeleton, EmptyState, ErrorState, Icon } from '../../components/ui/feedback';
import { useDocumentTitle, useUrlFilters } from '../../hooks/useData';
import { candidateApi } from '../../services';
import { formatCurrency, formatNumber, timeAgo } from '../../utils/format';

const SOURCE_LABELS = {
  search: { label: 'Found you in candidate search', icon: 'person_search' },
  application: { label: 'Viewed your job application', icon: 'description' },
  invite: { label: 'Invited you to apply', icon: 'mail' },
  recommended: { label: 'Saw you in recommendations', icon: 'recommend' },
  profile: { label: 'Opened your profile link', icon: 'link' },
};
const RANGES = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
  { value: '180', label: 'Last 6 months', premium: true },
  { value: '365', label: 'Last 12 months', premium: true },
];
const initials = (name = '') =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
const hintText = (h = {}) => [h.type === 'consultancy' ? 'Recruitment consultancy' : h.industry ? `${h.industry} company` : 'Company', h.city, h.size && `${h.size} employees`].filter(Boolean).join(' · ');

const Delta = ({ value }) =>
  value === null || value === undefined ? (
    <span className="text-xs text-brand-gray-muted">No earlier data</span>
  ) : (
    <span className={clsx('inline-flex items-center text-xs font-semibold', value >= 0 ? 'text-brand-green' : 'text-brand-red')}>
      <Icon name={value >= 0 ? 'trending_up' : 'trending_down'} size={15} />
      {Math.abs(value)}% vs previous period
    </span>
  );

const Tile = ({ icon, label, value, children }) => (
  <div className="surface p-4">
    <p className="flex items-center gap-1.5 text-[13px] font-medium text-brand-gray">
      <Icon name={icon} size={17} className="text-brand-blue" /> {label}
    </p>
    <p className="mt-1.5 text-2xl font-bold text-brand-dark">{formatNumber(value ?? 0)}</p>
    {children && <div className="mt-1">{children}</div>}
  </div>
);

const Bar = ({ label, value, total, tone = 'bg-brand-blue' }) => (
  <li>
    <div className="flex justify-between text-sm">
      <span className="truncate text-brand-dark">{label}</span>
      <span className="shrink-0 text-brand-gray">{formatNumber(value)}</span>
    </div>
    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-brand-tint">
      <div className={clsx('h-full rounded-full', tone)} style={{ width: `${total && value ? Math.max(4, Math.round((value / total) * 100)) : 0}%` }} />
    </div>
  </li>
);

/** Upgrade card: how many viewers are hidden and the plan that unlocks them. */
const Unlock = ({ access, locked, compact }) => {
  if (access?.premium) return null;
  const plan = access?.upgrade;
  return (
    <div className={clsx('overflow-hidden rounded-xl bg-gradient-to-r from-[#0B3D6E] via-brand-blue to-[#1E88E5] text-white', compact ? 'p-4' : 'p-5')}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/15">
            <Icon name="workspace_premium" size={22} />
          </span>
          <div className="min-w-0">
            <p className="font-bold">{locked > 0 ? `${formatNumber(locked)} more recruiter${locked > 1 ? 's' : ''} viewed your profile` : 'See every recruiter who views your profile'}</p>
            <p className="mt-0.5 text-sm text-white/80">Free accounts see the latest {access?.visibleLimit || 3}. Unlock every company, recruiter name and 12 months of history{plan ? ` with ${plan.name}` : ''}.</p>
          </div>
        </div>
        <Link to="/candidate/billing" className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-brand-blue shadow-sm transition hover:bg-brand-blue-tint">
          <Icon name="lock_open" size={17} />
          {plan ? `Unlock for ${formatCurrency(plan.price)}` : 'See plans'}
        </Link>
      </div>
    </div>
  );
};

const ViewerRow = ({ v, premium }) => {
  const meta = (
    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-brand-gray-muted">
      <span className="inline-flex items-center gap-1">
        <Icon name="schedule" size={14} /> {timeAgo(v.lastViewedAt)}
      </span>
      {v.count > 1 && (
        <span className="inline-flex items-center gap-1 font-medium text-brand-orange-dark">
          <Icon name="visibility" size={14} /> Viewed {v.count} times
        </span>
      )}
      {v.sources?.slice(0, 2).map((s) => (
        <span key={s} className="inline-flex items-center gap-1">
          <Icon name={SOURCE_LABELS[s]?.icon || 'visibility'} size={14} /> {SOURCE_LABELS[s]?.label || s}
        </span>
      ))}
    </p>
  );

  if (v.anonymous) {
    return (
      <li className="flex items-start gap-3 p-4">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-brand-tint text-brand-gray">
          <Icon name="visibility_off" size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-brand-dark">A recruiter in private mode</p>
          <p className="text-sm text-brand-gray">{hintText(v.hint)}</p>
          {meta}
        </div>
      </li>
    );
  }

  if (v.locked) {
    return (
      <li className="relative flex items-start gap-3 p-4">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-blue-tint to-brand-tint text-brand-blue">
          <Icon name="lock" size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <p aria-hidden className="select-none font-semibold text-brand-dark blur-[5px]">
            Hidden Company Pvt Ltd
          </p>
          <p className="text-sm text-brand-gray">{hintText(v.hint)}</p>
          {meta}
        </div>
        <Link to="/candidate/billing" className="shrink-0 self-center rounded-full border border-brand-blue/30 px-3 py-1.5 text-xs font-semibold text-brand-blue hover:bg-brand-blue-tint">
          Unlock
        </Link>
      </li>
    );
  }

  const o = v.organization || {};
  const page = o.slug ? `/${o.type === 'consultancy' ? 'recruiters' : 'companies'}/${o.slug}` : null;
  const Name = page ? Link : 'span';
  return (
    <li className="flex items-start gap-3 p-4 transition-colors hover:bg-brand-tint/50">
      {o.logo ? (
        <img src={o.logo} alt="" className="h-12 w-12 shrink-0 rounded-xl border border-brand-border bg-white object-contain p-1" loading="lazy" />
      ) : (
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-brand-blue-tint text-sm font-bold text-brand-blue">{initials(o.name)}</span>
      )}
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-1.5">
          <Name {...(page ? { to: page } : {})} className="font-semibold text-brand-dark hover:text-brand-blue">
            {o.name}
          </Name>
          {o.isVerified && <Icon name="verified" size={16} className="text-brand-blue" />}
          {o.type === 'consultancy' && <span className="rounded-full bg-brand-orange-tint px-2 py-0.5 text-[10px] font-semibold text-brand-orange-dark">Consultancy</span>}
        </p>
        <p className="text-sm text-brand-gray">{hintText(v.hint)}</p>
        {v.recruiter?.name ? (
          <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-brand-dark">
            <Icon name="badge" size={15} className="text-brand-gray-muted" /> {v.recruiter.name}
            {v.recruiter.designation && <span className="text-brand-gray">· {v.recruiter.designation}</span>}
          </p>
        ) : (
          !premium && (
            <p className="mt-1 inline-flex items-center gap-1 text-xs text-brand-gray-muted">
              <Icon name="lock" size={13} /> Recruiter name with Profile Booster
            </p>
          )
        )}
        {meta}
      </div>
      {page && (
        <Link to={page} className="hidden shrink-0 self-center rounded-full border border-brand-border px-3 py-1.5 text-xs font-semibold text-brand-dark hover:border-brand-blue hover:text-brand-blue sm:inline-flex">
          View company
        </Link>
      )}
    </li>
  );
};

const ProfileViews = () => {
  useDocumentTitle('Who viewed your profile');
  const [filters, setFilters] = useUrlFilters({ days: '30', type: 'all', page: '1' });
  const params = { days: Number(filters.days) || 30, type: filters.type || 'all', page: Number(filters.page) || 1, limit: 20 };
  const query = useQuery({ queryKey: ['profile-views', params], queryFn: () => candidateApi.profileViews(params), placeholderData: keepPreviousData });
  const d = query.data;
  const access = d?.access;
  const s = d?.summary;
  const premium = Boolean(access?.premium);
  const typeTotal = (s?.byType?.company || 0) + (s?.byType?.consultancy || 0);
  const industryTotal = (s?.industries || []).reduce((a, x) => a + x.count, 0);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Who viewed your profile"
        subtitle={premium ? `Profile Booster active${access?.until ? ` till ${new Date(access.until).toLocaleDateString()}` : ''}. You see every recruiter.` : 'Recruiters and companies that looked at your profile'}
        actions={
          <SimpleSelect
            ariaLabel="Time range"
            placeholder={null}
            value={String(params.days)}
            onChange={(v) => {
              if (RANGES.find((r) => r.value === v)?.premium && !premium) return toast('Up to 12 months of history comes with Profile Booster', { icon: '🔒' });
              return setFilters({ days: v, page: '1' });
            }}
            options={RANGES.map((r) => ({ value: r.value, label: r.premium && !premium ? `${r.label} 🔒` : r.label }))}
          />
        }
      />

      {query.isPending && <CardSkeleton count={3} />}
      {query.isError && <ErrorState error={query.error} onRetry={query.refetch} />}

      {d && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile icon="visibility" label="Profile views" value={s.total}>
              <Delta value={s.change} />
            </Tile>
            <Tile icon="groups" label="Recruiters" value={s.viewers} />
            <Tile icon="apartment" label="Companies" value={s.companies} />
            <Tile icon="search" label="Search appearances" value={s.searchAppearances}>
              <span className="text-xs text-brand-gray-muted">All time</span>
            </Tile>
          </div>

          <Unlock access={access} locked={s.locked} />

          <div className="grid gap-4 lg:grid-cols-3">
            <Section title={`Views ${s.trend.bucket === 'week' ? 'per week' : 'per day'}`} className="lg:col-span-2">
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={s.trend.points} margin={{ left: -12, right: 8, top: 8 }}>
                    <defs>
                      <linearGradient id="pvFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#0A6CB5" stopOpacity={0.28} />
                        <stop offset="100%" stopColor="#0A6CB5" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#EEF1F5" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => new Date(v).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} minTickGap={24} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={36} />
                    <Tooltip labelFormatter={(v) => new Date(v).toDateString()} formatter={(v) => [v, 'Views']} />
                    <Area type="monotone" dataKey="count" stroke="#0A6CB5" strokeWidth={2} fill="url(#pvFill)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Section>
            <Section title="Who is looking">
              {typeTotal ? (
                <div className="space-y-5">
                  <ul className="space-y-3">
                    <Bar label="Companies" value={s.byType.company} total={typeTotal} />
                    <Bar label="Recruitment consultancies" value={s.byType.consultancy} total={typeTotal} tone="bg-brand-orange" />
                  </ul>
                  {s.industries.length > 0 && (
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand-gray-muted">Top industries</p>
                      <ul className="space-y-3">
                        {s.industries.map((i) => (
                          <Bar key={i.name} label={i.name} value={i.count} total={industryTotal} tone="bg-brand-green" />
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-brand-gray">No views in this period yet.</p>
              )}
            </Section>
          </div>

          {Object.keys(s.bySource || {}).length > 0 && (
            <div className="flex flex-wrap gap-2">
              {Object.entries(s.bySource).map(([k, n]) => (
                <span key={k} className="inline-flex items-center gap-1.5 rounded-full border border-brand-border bg-white px-3 py-1.5 text-xs text-brand-gray">
                  <Icon name={SOURCE_LABELS[k]?.icon || 'visibility'} size={15} className="text-brand-blue" />
                  {SOURCE_LABELS[k]?.label || k}
                  <b className="text-brand-dark">{n}</b>
                </span>
              ))}
            </div>
          )}

          <section className="surface overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-brand-border px-4 pt-3">
              <Tabs
                value={params.type}
                onChange={(type) => setFilters({ type, page: '1' })}
                tabs={[
                  { value: 'all', label: 'All viewers' },
                  { value: 'company', label: 'Companies' },
                  { value: 'consultancy', label: 'Consultancies' },
                ]}
              />
            </div>
            {d.viewers.length ? (
              <ul className="divide-y divide-brand-border">
                {d.viewers.map((v) => (
                  <ViewerRow key={v.key} v={v} premium={premium} />
                ))}
              </ul>
            ) : (
              <EmptyState
                icon="visibility"
                title="No recruiter views yet"
                description="Profiles with a photo, resume and key skills get up to 3x more recruiter views."
                action={
                  <Button asChild size="sm" variant="primaryBlue">
                    <Link to="/candidate/profile">Improve my profile</Link>
                  </Button>
                }
              />
            )}
          </section>
          <Pagination meta={d.meta} onPage={(page) => setFilters({ page: String(page) })} />
          {!premium && s.locked > 3 && <Unlock access={access} locked={s.locked} compact />}
        </>
      )}
    </div>
  );
};

export default ProfileViews;
