import React, { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import AdSlot from '../../components/common/AdSlot';
import CompanyCard from '../../components/common/CompanyCard';
import JobSearchInput from '../../components/common/JobSearchInput';
import JobCard from '../../components/common/JobCard';
import { CardSkeleton, Icon } from '../../components/ui/feedback';
import { Select } from '../../components/ui/pickers';
import { useAction } from '../../hooks/useData';
import useAuthStore from '../../store/useAuthStore';
import { candidateApi, cmsApi, employerPublicApi, jobApi } from '../../services';
import { formatNumber } from '../../utils/format';
import { rememberSearch } from '../../utils/recentSearches';
import useSeo from '../../hooks/useSeo';

const toQuery = (obj) => new URLSearchParams(Object.entries(obj).filter(([, v]) => v !== '' && v !== undefined)).toString();

const SearchBar = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState({ q: '', experience: '', location: '' });
  const barRef = useRef(null);
  const search = (values) => {
    if (values.q || values.location) rememberSearch(values);
    navigate(`/jobs?${toQuery(values)}`);
  };
  const submit = (e) => {
    e?.preventDefault();
    search(form);
  };
  const cell = 'flex min-w-0 flex-1 items-center gap-2 px-3';
  return (
    <form ref={barRef} onSubmit={submit} className="mt-6 flex flex-col gap-1 rounded-lg border border-[#D5DBE4] bg-white p-1.5 shadow-[var(--shadow-card)] md:flex-row md:items-center">
      <div className={`${cell} md:flex-[1.5]`}>
        <Icon name="search" size={20} className="shrink-0 text-brand-gray-muted" />
        <JobSearchInput anchorRef={barRef} value={form.q} onChange={(q) => setForm((f) => ({ ...f, q }))} onSearch={(picked) => search({ ...form, ...picked })} placeholder="Skills, designation, company" />
      </div>
      <span className="hidden h-6 w-px bg-brand-border md:block" />
      <div className={cell}>
        <Icon name="work_outline" size={20} className="shrink-0 text-brand-gray-muted" />
        <Select className="w-full" ariaLabel="Experience" placeholder="Experience" value={form.experience} onChange={(v) => setForm((f) => ({ ...f, experience: v }))} options={[{ value: '0', label: 'Fresher' }, ...[1, 2, 3, 5, 7, 10, 15].map((y) => ({ value: String(y), label: `${y} years` }))]} buttonClassName="flex h-11 w-full items-center justify-between gap-2 bg-transparent text-left text-sm outline-none" />
      </div>
      <span className="hidden h-6 w-px bg-brand-border md:block" />
      <div className={cell}>
        <Icon name="location_on" size={20} className="shrink-0 text-brand-gray-muted" />
        <JobSearchInput kind="location" anchorRef={barRef} value={form.location} onChange={(location) => setForm((f) => ({ ...f, location }))} onSearch={({ location }) => setForm((f) => ({ ...f, location }))} placeholder="City or state" />
      </div>
      <button type="submit" className="h-11 shrink-0 rounded-md bg-brand-blue px-7 text-sm font-semibold text-white transition-colors hover:bg-brand-blue-dark">
        Search jobs
      </button>
    </form>
  );
};

const Hero = () => (
  <section className="w-full border-b border-brand-border bg-white px-4 py-8 sm:px-8 sm:py-12">
    <div className="mx-auto max-w-[760px] text-center">
      <h1 className="text-[32px] font-bold leading-tight text-brand-ink sm:text-[48px]">Find Your Dream Job Today</h1>
      <p className="mt-3 text-[15px] text-brand-gray-muted">Discover thousands of verified opportunities from trusted employers across India.</p>
      <SearchBar />
    </div>
  </section>
);

const CATEGORIES = [
  { label: 'Remote Jobs',   query: 'remoteOnly=true',              icon: 'laptop_mac',            color: 'text-blue-500',   bg: 'bg-blue-50'   },
  { label: 'MNC Jobs',      query: 'companyType=Indian MNC',       icon: 'corporate_fare',        color: 'text-orange-500', bg: 'bg-orange-50' },
  { label: 'Analytics',     query: 'q=analytics',                  icon: 'bar_chart',             color: 'text-green-500',  bg: 'bg-green-50'  },
  { label: 'Internships',   query: 'kind=internship',              icon: 'school',                color: 'text-purple-500', bg: 'bg-purple-50' },
  { label: 'Software',      query: 'category=IT Jobs',             icon: 'code',                  color: 'text-cyan-500',   bg: 'bg-cyan-50'   },
  { label: 'Startup Jobs',  query: 'companyType=Startup',          icon: 'rocket_launch',         color: 'text-red-500',    bg: 'bg-red-50'    },
  { label: 'Marketing',     query: 'q=marketing',                  icon: 'campaign',              color: 'text-pink-500',   bg: 'bg-pink-50'   },
  { label: 'Banking',       query: 'q=banking',                    icon: 'account_balance',       color: 'text-indigo-500', bg: 'bg-indigo-50' },
  { label: 'Engineering',   query: 'q=engineering',                icon: 'precision_manufacturing', color: 'text-amber-500', bg: 'bg-amber-50' },
  { label: 'Fortune 500',   query: 'label=top_company',            icon: 'stars',                 color: 'text-yellow-500', bg: 'bg-yellow-50' },
  { label: 'Sales',         query: 'q=sales',                      icon: 'trending_up',           color: 'text-teal-500',   bg: 'bg-teal-50'   },
  { label: 'HR Jobs',       query: 'q=hr',                         icon: 'groups',                color: 'text-violet-500', bg: 'bg-violet-50' },
];

const PopularCategories = () => (
  <section className="w-full bg-white py-10">
    <div className="mx-auto max-w-[1100px] px-4 sm:px-8">
      {/* Header */}
      <div className="mb-7 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold text-brand-dark sm:text-2xl">Popular Categories</h2>
          <p className="mt-1 text-sm text-brand-gray-muted">Handpicked paths for rapid career moves</p>
        </div>
        <Link to="/jobs" className="inline-flex items-center gap-1 text-sm font-bold text-brand-blue hover:underline">
          Explore all tracks <Icon name="arrow_forward" size={16} />
        </Link>
      </div>

      {/* Grid — 2 cols on mobile, 3 on sm, 4 on md, 6 on lg */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {CATEGORIES.map(({ label, query, icon, color, bg }) => (
          <Link
            key={label}
            to={`/jobs?${query}`}
            className="group flex items-center gap-3 rounded-xl border border-brand-border bg-white px-4 py-3.5 transition-all hover:border-brand-blue hover:shadow-md"
          >
            {/* Icon circle */}
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${bg}`}>
              <Icon name={icon} size={20} className={color} />
            </span>
            {/* Label + arrow */}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold text-brand-dark group-hover:text-brand-blue">
                {label}
              </span>
            </span>
            <Icon name="chevron_right" size={16} className="shrink-0 text-brand-gray-muted group-hover:text-brand-blue" />
          </Link>
        ))}
      </div>
    </div>
  </section>
);

const SectionHead = ({ title, subtitle, to, linkLabel }) => (
  <div className="mb-6 flex flex-wrap items-end justify-between gap-2">
    <div>
      <h2 className="text-xl font-bold text-brand-dark">{title}</h2>
      {subtitle && <p className="mt-1 text-sm text-brand-gray-muted">{subtitle}</p>}
    </div>
    {to && (
      <Link to={to} className="inline-flex items-center gap-1 text-sm font-bold text-brand-blue hover:underline">
        {linkLabel} <Icon name="arrow_forward" size={16} />
      </Link>
    )}
  </div>
);

const Wrap = ({ children, className = '' }) => (
  <section className={`w-full py-10 ${className}`}>
    <div className="mx-auto max-w-[1100px] px-4 sm:px-8">{children}</div>
  </section>
);

const LatestJobs = () => {
  const { data, isPending } = useQuery({ queryKey: ['home-jobs'], queryFn: () => jobApi.search({ limit: 6, sort: 'date' }) });
  if (!isPending && !data?.data?.length) return null;
  return (
    <Wrap>
      <SectionHead title="Latest jobs" subtitle="Fresh openings from employers on Freejobwala" to="/jobs" linkLabel="View all jobs" />
      {isPending ? (
        <CardSkeleton count={2} />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {data.data.map((job) => (
            <JobCard key={job._id} job={job} />
          ))}
        </div>
      )}
    </Wrap>
  );
};

const FeaturedCompanies = () => {
  const { data } = useQuery({ queryKey: ['home-companies'], queryFn: () => employerPublicApi.list({ type: 'company', limit: 8, sort: '-stats.activeJobs' }) });
  if (!data?.data?.length) return null;
  return (
    <Wrap className="bg-white">
      <SectionHead title="Top companies hiring now" subtitle="Follow employers to hear about their new jobs" to="/companies" linkLabel="View all companies" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {data.data.map((c) => (
          <CompanyCard key={c._id} company={c} />
        ))}
      </div>
    </Wrap>
  );
};

// ─── Employer + Pro Banners (above Popular Roles) ─────────────────────────

const EmployerAndProBanners = () => {
  const user = useAuthStore((s) => s.user);
  const isCandidate = user?.role === 'candidate';

  // "Explore Premium" → if logged-in candidate go to /candidate/billing,
  //   if guest go to /register then redirect, if employer go to /employer/packages-billing
  const premiumPath = user
    ? user.role === 'employer' ? '/employer/packages-billing' : '/candidate/billing'
    : '/register';

  return (
    <section className="w-full bg-[#F4F6FA] py-8 sm:py-10">
      <div className="mx-auto max-w-[1100px] space-y-5 px-4 sm:px-8">

        {/* ── Top: Hire the Right Talent Faster ── */}
        <div className="flex flex-col gap-6 overflow-hidden rounded-2xl bg-[#1C3B6E] px-6 py-8 sm:px-10 sm:py-10 lg:flex-row lg:items-center lg:gap-10">
          {/* Left copy */}
          <div className="min-w-0 flex-1">
            <span className="inline-block rounded-full bg-white/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-white/80">
              For Employers
            </span>
            <h2 className="mt-3 text-2xl font-extrabold leading-snug text-white sm:text-3xl">
              Hire the Right Talent Faster
            </h2>
            <p className="mt-2 max-w-md text-[14px] leading-relaxed text-white/75">
              Post jobs, discover qualified candidates and manage your entire hiring process with Freejobwala&apos;s intelligent screening engine.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                to={user?.role === 'employer' ? '/employer/jobs/post' : '/employer/register'}
                className="inline-flex items-center gap-2 rounded-lg bg-brand-orange px-5 py-2.5 text-sm font-bold text-white shadow transition-colors hover:bg-brand-orange-dark"
              >
                <Icon name="add_circle" size={18} /> Post a Job
              </Link>
              <Link
                to="/for-employers"
                className="inline-flex items-center gap-2 rounded-lg border border-white/40 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-white/10"
              >
                Explore Hiring Solutions <Icon name="arrow_forward" size={16} />
              </Link>
            </div>
          </div>

          {/* Right: AI match mock card */}
          <div className="w-full shrink-0 rounded-xl bg-[#243F72] p-5 lg:w-72">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-green-400" />
                <span className="text-xs font-semibold text-white/80">Freejobwala AI Match</span>
              </div>
              <span className="rounded-full bg-green-500/25 px-2.5 py-0.5 text-[11px] font-bold text-green-400">
                98% Match
              </span>
            </div>

            {/* Candidate row */}
            <div className="flex items-center gap-3 rounded-lg bg-white px-3 py-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-blue-tint text-sm font-bold text-brand-blue">
                AK
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1">
                  <p className="truncate text-sm font-bold text-brand-dark">Aarav Kumar</p>
                  <Icon name="verified" size={14} fill className="shrink-0 text-brand-blue" />
                </div>
                <p className="text-xs text-brand-gray-muted">Senior Full Stack Engineer · 5 yrs</p>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {['React', 'Node.js', 'AWS'].map((s) => (
                    <span key={s} className="rounded bg-brand-blue-tint px-1.5 py-0.5 text-[10px] font-semibold text-brand-blue">{s}</span>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between text-[11px] text-white/60">
              <span>Avg. Shortlist Time</span>
              <span className="font-bold text-white">24 Hours</span>
            </div>
          </div>
        </div>

        {/* ── Bottom: Freejobwala Pro strip ── */}
        <div className="flex flex-col items-start gap-5 rounded-2xl bg-[#2D1B6E] px-6 py-6 sm:flex-row sm:items-center sm:gap-8 sm:px-10">
          {/* Left copy */}
          <div className="min-w-0 flex-1">
            <span className="text-[11px] font-bold uppercase tracking-widest text-brand-orange">
              Freejobwala Pro
            </span>
            <h3 className="mt-1 text-lg font-extrabold text-white sm:text-xl">
              Stand Out to Leading Recruiters
            </h3>
            <p className="mt-1 text-sm text-white/70">
              Improve your profile visibility by 3x and get noticed by verified enterprise employers across India.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {['Featured Profile', 'Resume Highlight', 'Recruiter Insights'].map((f) => (
                <span key={f} className="flex items-center gap-1 text-[12px] text-white/70">
                  <Icon name="check_circle" size={14} className="text-green-400" /> {f}
                </span>
              ))}
            </div>
          </div>

          {/* Right CTAs */}
          <div className="flex shrink-0 flex-wrap items-center gap-3">
            <Link
              to={premiumPath}
              state={!user ? { from: isCandidate ? '/candidate/billing' : '/candidate/billing' } : undefined}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-orange px-6 py-2.5 text-sm font-bold text-white shadow transition-colors hover:bg-brand-orange-dark"
            >
              Explore Premium
            </Link>
            <Link to="/career-advice" className="text-sm font-semibold text-white/70 hover:text-white hover:underline">
              Learn More
            </Link>
          </div>
        </div>

      </div>
    </section>
  );
};
const ROLE_ITEMS = [
  { label: 'Software Developer', query: 'Software Developer', icon: 'code',             color: 'text-blue-500',   bg: 'bg-blue-50'   },
  { label: 'Data Analyst',       query: 'Data Analyst',       icon: 'monitoring',        color: 'text-green-500',  bg: 'bg-green-50'  },
  { label: 'UI/UX Designer',     query: 'UI/UX Designer',     icon: 'palette',           color: 'text-purple-500', bg: 'bg-purple-50' },
  { label: 'Product Manager',    query: 'Product Manager',    icon: 'inventory_2',       color: 'text-orange-500', bg: 'bg-orange-50' },
  { label: 'Digital Marketing',  query: 'Digital Marketing',  icon: 'ads_click',         color: 'text-teal-500',   bg: 'bg-teal-50'   },
  { label: 'Sales Executive',    query: 'Sales Executive',    icon: 'headset_mic',       color: 'text-indigo-500', bg: 'bg-indigo-50' },
];

// Static city definitions with colors matching the image
const CITY_ITEMS = [
  { label: 'Bengaluru',  query: 'Bengaluru',  icon: 'location_city', color: 'text-blue-500',   bg: 'bg-blue-50'   },
  { label: 'Delhi NCR',  query: 'Delhi',      icon: 'location_city', color: 'text-orange-500', bg: 'bg-orange-50' },
  { label: 'Mumbai',     query: 'Mumbai',     icon: 'location_city', color: 'text-sky-500',    bg: 'bg-sky-50'    },
  { label: 'Hyderabad',  query: 'Hyderabad',  icon: 'location_city', color: 'text-green-500',  bg: 'bg-green-50'  },
  { label: 'Pune',       query: 'Pune',       icon: 'location_city', color: 'text-violet-500', bg: 'bg-violet-50' },
  { label: 'Chennai',    query: 'Chennai',    icon: 'location_city', color: 'text-red-500',    bg: 'bg-red-50'    },
];

const PopularRoles = () => {
  // Pull live counts from facets; fall back to static list when data loads
  const { data } = useQuery({
    queryKey: ['home-facets'],
    queryFn: () => jobApi.facets({}),
    staleTime: 5 * 60 * 1000,
  });

  // Build a count map from facet data
  const countMap = {};
  (data?.role || []).forEach((r) => { countMap[r.value] = r.count; });

  const fmt = (n) => n ? `${formatNumber(n)}+ Jobs` : 'Jobs';

  return (
    <section className="w-full bg-white py-10">
      <div className="mx-auto max-w-[1100px] px-4 sm:px-8">
        {/* Header */}
        <div className="mb-7 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-xl font-bold text-brand-dark sm:text-2xl">Popular Roles and Opportunities</h2>
            <p className="mt-1 text-sm text-brand-gray-muted">High demand positions updated daily</p>
          </div>
          <Link to="/jobs" className="inline-flex items-center gap-1 text-sm font-bold text-brand-blue hover:underline">
            View all designations <Icon name="chevron_right" size={18} />
          </Link>
        </div>

        {/* Grid — 1 col mobile, 2 col sm, 3 col lg */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ROLE_ITEMS.map(({ label, query, icon, color, bg }) => (
            <Link
              key={label}
              to={`/jobs?role=${encodeURIComponent(query)}`}
              className="group flex items-center gap-4 rounded-xl border border-brand-border bg-white px-5 py-4 transition-all hover:border-brand-blue hover:shadow-md"
            >
              <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${bg}`}>
                <Icon name={icon} size={22} className={color} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-brand-dark group-hover:text-brand-blue">
                  {label}
                </p>
                <p className="mt-0.5 text-xs text-brand-gray-muted">
                  {fmt(countMap[label] || countMap[query])}
                </p>
              </div>
              <Icon name="chevron_right" size={18} className="shrink-0 text-brand-gray-muted group-hover:text-brand-blue" />
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
};

const PopularCities = () => {
  const { data } = useQuery({
    queryKey: ['home-facets'],
    queryFn: () => jobApi.facets({}),
    staleTime: 5 * 60 * 1000,
  });

  const countMap = {};
  (data?.location || []).forEach((l) => { countMap[l.value] = l.count; });

  const fmt = (n) => n ? `${formatNumber(n)}K+ Jobs` : 'Jobs';

  return (
    <section className="w-full bg-[#F4F6FA] py-10">
      <div className="mx-auto max-w-[1100px] px-4 sm:px-8">
        {/* Header — centered like image */}
        <div className="mb-8 text-center">
          <h2 className="text-xl font-bold text-brand-dark sm:text-2xl">Jobs in Popular Cities</h2>
          <p className="mt-1 text-sm text-brand-gray-muted">Locate opportunities in India&apos;s leading employment capitals</p>
        </div>

        {/* Cards — 2 col mobile, 3 col sm, 6 col lg */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {CITY_ITEMS.map(({ label, query, icon, color, bg }) => {
            const rawCount = countMap[label] || countMap[query] || 0;
            const displayCount = rawCount >= 1000
              ? `${Math.round(rawCount / 1000)}K+ Jobs`
              : rawCount ? `${formatNumber(rawCount)}+ Jobs` : fmt(rawCount);

            return (
              <Link
                key={label}
                to={`/jobs?location=${encodeURIComponent(query)}`}
                className="group flex flex-col items-center rounded-2xl border border-brand-border bg-white px-4 py-6 text-center transition-all hover:border-brand-blue hover:shadow-md"
              >
                <span className={`flex h-12 w-12 items-center justify-center rounded-xl ${bg}`}>
                  <Icon name={icon} size={24} className={color} />
                </span>
                <p className="mt-3 text-sm font-bold text-brand-dark">{label}</p>
                <p className="mt-0.5 text-xs text-brand-gray-muted">{displayCount}</p>
                <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-brand-blue group-hover:underline">
                  Explore Jobs <Icon name="arrow_forward" size={13} />
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
};

const ResumeUploadBanner = () => {
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);
  const isCandidate = user?.role === 'candidate';
  const completion = profile?.profileCompletion ?? 0;
  const hasResume = Boolean(profile?.resume?.name);
  const resumeName = profile?.resume?.name || 'Your_Resume_2026.pdf';
  const uploadRef = React.useRef(null);
  const upload = useAction(candidateApi.uploadResume, {
    success: 'Resume uploaded!',
    invalidate: ['candidate-me'],
  });

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (file) upload.mutate(file);
    e.target.value = '';
  };

  return (
    <section className="w-full bg-[#F4F6FA] py-8 sm:py-10">
      <div className="mx-auto max-w-[1100px] px-4 sm:px-8">
        <div className="flex flex-col items-start gap-8 overflow-hidden rounded-2xl border border-brand-border bg-brand-blue px-6 py-8 shadow-[var(--shadow-card)] sm:px-10 sm:py-10 lg:flex-row lg:items-center lg:gap-12">

          {/* ── Left: copy + CTA ── */}
          <div className="min-w-0 flex-1">
            <span className="inline-block rounded-full bg-white/20 px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-white/90">
              For Job Seekers
            </span>
            <h2 className="mt-3 text-2xl font-extrabold leading-snug text-white sm:text-3xl lg:text-4xl">
              Upload Your Resume,<br className="hidden sm:block" /> Get Discovered
            </h2>
            <p className="mt-3 max-w-md text-[15px] leading-relaxed text-white/80">
              Let recruiters come to you. We&apos;ll match your resume with jobs based on your interests and recent searches, so you never miss the right opportunity.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              {isCandidate ? (
                <>
                  <input ref={uploadRef} type="file" accept=".pdf,.doc,.docx" hidden onChange={handleFile} />
                  <button
                    onClick={() => uploadRef.current?.click()}
                    disabled={upload.isPending}
                    className="inline-flex items-center gap-2 rounded-lg bg-brand-orange px-6 py-3 text-sm font-bold text-white shadow-md transition-colors hover:bg-brand-orange-dark disabled:opacity-60"
                  >
                    <Icon name="upload_file" size={18} />
                    {upload.isPending ? 'Uploading…' : hasResume ? 'Update Resume' : 'Upload Resume'}
                  </button>
                </>
              ) : (
                <Link
                  to="/register"
                  className="inline-flex items-center gap-2 rounded-lg bg-brand-orange px-6 py-3 text-sm font-bold text-white shadow-md transition-colors hover:bg-brand-orange-dark"
                >
                  <Icon name="upload_file" size={18} />
                  Upload Resume
                </Link>
              )}
            </div>
          </div>

          {/* ── Right: mock card ── */}
          <div className="w-full shrink-0 rounded-xl border border-brand-border bg-[#F4F6FA] p-5 lg:w-72">
            {/* Header */}
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-green-500" />
                <span className="text-xs font-semibold text-brand-gray">Profile Match Engine</span>
              </div>
              <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-[11px] font-bold text-green-600">
                Active
              </span>
            </div>

            {/* Resume file row */}
            <div className="flex items-center gap-3 rounded-lg border border-brand-border bg-white px-4 py-3">
              <Icon name="description" size={22} className="shrink-0 text-brand-blue" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-brand-dark">
                  {isCandidate && hasResume ? resumeName : 'Your_Resume_2026.pdf'}
                </p>
                <p className="mt-0.5 text-[11px] text-brand-gray-muted">
                  {isCandidate && hasResume ? 'Uploaded ✓' : 'Not uploaded yet'}
                </p>
              </div>
            </div>

            {/* Progress bar */}
            <div className="mt-4">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-brand-border">
                <div
                  className="h-full rounded-full bg-brand-orange transition-all duration-700"
                  style={{ width: `${isCandidate ? completion : 35}%` }}
                />
              </div>
              <p className="mt-1.5 text-[11px] text-brand-gray-muted">
                Profile {isCandidate ? completion : 35}% complete
              </p>
            </div>

            {/* Footer stat */}
            <div className="mt-4 border-t border-brand-border pt-3 text-[12px] text-brand-gray">
              Candidates with resumes get{' '}
              <span className="font-bold text-brand-dark">3x more calls</span>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
};

// Card accent colors cycle across the 3 cards — matches the image (blue / peach / green)
const CARD_ACCENTS = [
  { banner: 'bg-brand-blue-tint',        icon: 'text-brand-blue',   iconBg: 'bg-white' },
  { banner: 'bg-orange-100',             icon: 'text-orange-400',   iconBg: 'bg-white' },
  { banner: 'bg-green-100',              icon: 'text-green-500',    iconBg: 'bg-white' },
];

const CARD_ICONS = ['description', 'forum', 'trending_up'];

export const BlogCard = ({ blog, index = 0 }) => {
  const accent = CARD_ACCENTS[index % CARD_ACCENTS.length];
  const cardIcon = CARD_ICONS[index % CARD_ICONS.length];
  // Estimate read time: ~200 words per minute
  const readTime = blog.readTime || (blog.content ? Math.max(1, Math.round(blog.content.split(' ').length / 200)) : (index === 0 ? 5 : index === 1 ? 7 : 6));

  return (
    <Link
      to={`/career-advice/${blog.slug}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-brand-border bg-white shadow-sm transition-all hover:shadow-md"
    >
      {/* Colored top banner with centered icon */}
      <div className={`relative flex h-40 items-center justify-center ${accent.banner}`}>
        {blog.coverImage?.url ? (
          <img src={blog.coverImage.url} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <span className={`flex h-14 w-14 items-center justify-center rounded-2xl ${accent.iconBg} shadow-sm`}>
            <Icon name={cardIcon} size={28} className={accent.icon} />
          </span>
        )}
        {/* Read time badge — top right */}
        <span className="absolute right-3 top-3 flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-medium text-brand-gray-muted shadow-sm">
          <Icon name="schedule" size={13} className="text-brand-gray-muted" />
          {readTime} min read
        </span>
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col p-5">
        {blog.category && (
          <span className="mb-2.5 inline-block text-[11px] font-bold uppercase tracking-widest text-brand-orange">
            {blog.category}
          </span>
        )}
        <h3 className="text-[15px] font-bold leading-snug text-brand-blue transition-colors group-hover:underline">
          {blog.title}
        </h3>
        {blog.excerpt && (
          <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-brand-gray">{blog.excerpt}</p>
        )}
        <div className="mt-4 flex items-center gap-1 text-sm font-semibold text-brand-blue">
          Read More <Icon name="arrow_forward" size={15} />
        </div>
      </div>
    </Link>
  );
};

const CareerAdvicePreview = () => {
  const { data } = useQuery({ queryKey: ['home-blogs'], queryFn: () => cmsApi.blogs({ limit: 3 }) });
  if (!data?.data?.length) return null;
  return (
    <Wrap className="bg-white">
      <SectionHead
        title="Career Advice for Your Next Move"
        subtitle="Expert guides on resume craft, salary negotiations and interview strategy"
        to="/career-advice"
        linkLabel="View All Career Advice"
      />
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {data.data.map((b, i) => (
          <BlogCard key={b._id} blog={b} index={i} />
        ))}
      </div>
    </Wrap>
  );
};

const Home = () => {
  useSeo({
    path: '/',
    description: 'Search verified jobs, internships and walk-ins across India. Apply in one click, get job alerts, or post jobs and hire talent on Freejobwala.',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'Freejobwala',
      url: window.location.origin,
      potentialAction: { '@type': 'SearchAction', target: `${window.location.origin}/jobs?keywords={search_term_string}`, 'query-input': 'required name=search_term_string' },
    },
  });
  return (
    <div className="flex w-full flex-col">
      <Hero />
      <ResumeUploadBanner />
      <PopularCategories />
      <AdSlot placement="home_top" className="mx-auto w-full max-w-[1100px] px-4 pt-6 sm:px-8" />
      <AdSlot placement="home_middle" className="mx-auto w-full max-w-[1100px] px-4 pt-6 sm:px-8" />
      <LatestJobs />
      <FeaturedCompanies />
      <EmployerAndProBanners />
      <PopularRoles />
      <PopularCities />
      <CareerAdvicePreview />
    </div>
  );
};

export default Home;
