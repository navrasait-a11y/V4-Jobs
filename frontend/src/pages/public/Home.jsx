import React, { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import AdSlot from '../../components/common/AdSlot';
import CompanyCard from '../../components/common/CompanyCard';
import JobSearchInput from '../../components/common/JobSearchInput';
import JobCard from '../../components/common/JobCard';
import { CardSkeleton, Icon } from '../../components/ui/feedback';
import CompanyLogo from '../../components/common/CompanyLogo';
import { Select } from '../../components/ui/pickers';
import { useDocumentTitle } from '../../hooks/useData';
import { cmsApi, employerPublicApi, jobApi } from '../../services';
import { formatDate, formatNumber } from '../../utils/format';
import { rememberSearch } from '../../utils/recentSearches';

const toQuery = (obj) => new URLSearchParams(Object.entries(obj).filter(([, v]) => v !== '' && v !== undefined)).toString();

const QUICK = [
  ['Remote', 'remoteOnly=true', 'home_work'],
  ['Fresher', 'experience=0', 'school'],
  ['Internship', 'kind=internship', 'badge'],
  ['IT', 'category=IT Jobs', 'code'],
  ['Sales', 'q=sales', 'trending_up'],
  ['Marketing', 'q=marketing', 'campaign'],
  ['Banking', 'q=banking', 'account_balance'],
  ['Engineering', 'q=engineering', 'precision_manufacturing'],
];

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
      <button type="submit" className="h-11 shrink-0 rounded-md bg-brand-orange px-7 text-sm font-semibold text-white transition-colors hover:bg-brand-orange-dark">
        Search jobs
      </button>
    </form>
  );
};

const HiringNow = () => {
  const { data } = useQuery({ queryKey: ['home-hiring'], queryFn: () => employerPublicApi.list({ limit: 10, sort: '-stats.activeJobs' }) });
  const rows = data?.data?.slice(0, 5) || [];
  if (!rows.length) return null;
  return (
    <aside className="surface hidden w-[320px] shrink-0 p-4 lg:block">
      <p className="mb-2 text-[13px] font-semibold text-brand-dark">Hiring now</p>
      <ul className="divide-y divide-brand-border">
        {rows.map((o) => (
          <li key={o._id}>
            <Link to={`/${o.type === 'consultancy' ? 'recruiters' : 'companies'}/${o.slug}`} className="flex items-center gap-3 py-2 hover:text-brand-blue">
              <CompanyLogo name={o.name} src={o.logo?.url} size={34} />
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-brand-dark">{o.name}</span>
              <span className="shrink-0 text-xs text-brand-gray-muted">{o.stats?.activeJobs || 0} jobs</span>
            </Link>
          </li>
        ))}
      </ul>
    </aside>
  );
};

const Hero = () => {
  const jobs = useQuery({ queryKey: ['home-count-jobs'], queryFn: () => jobApi.search({ limit: 1 }) });
  const orgs = useQuery({ queryKey: ['home-count-orgs'], queryFn: () => employerPublicApi.list({ limit: 1 }) });
  const nJobs = jobs.data?.meta?.total;
  const nOrgs = orgs.data?.meta?.total;
  return (
    <section className="w-full border-b border-brand-border bg-white px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto flex max-w-[1240px] items-center gap-10">
        <div className="min-w-0 flex-1">
          <h1 className="text-[28px] font-bold leading-tight text-brand-dark sm:text-[40px]">Find your next job</h1>
          <p className="mt-2 text-[15px] text-brand-gray">{nJobs ? `${formatNumber(nJobs)} open jobs from ${formatNumber(nOrgs || 0)} employers across India` : 'Jobs from verified employers across India'}</p>
          <SearchBar />
        </div>
        <HiringNow />
      </div>
    </section>
  );
};

const QuickChips = () => (
  <section className="w-full border-b border-brand-border bg-white py-3">
    <div className="no-scrollbar mx-auto flex max-w-[1240px] gap-2.5 overflow-x-auto px-4 sm:px-6">
      {QUICK.map(([label, query, icon]) => (
        <Link key={label} to={`/jobs?${query}`} className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-brand-border px-3 py-1.5 text-[13px] font-medium text-brand-gray transition-colors hover:border-brand-blue hover:text-brand-blue">
          <Icon name={icon} size={18} /> {label}
        </Link>
      ))}
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
    <div className="mx-auto max-w-[1240px] px-4 sm:px-6">{children}</div>
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

const PopularFromFacets = () => {
  const { data } = useQuery({ queryKey: ['home-facets'], queryFn: () => jobApi.facets({}), staleTime: 5 * 60 * 1000 });
  const cities = data?.location?.slice(0, 6) || [];
  const roles = data?.role?.slice(0, 8) || [];
  if (!cities.length && !roles.length) return null;
  return (
    <Wrap>
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
        {roles.length > 0 && (
          <div>
            <SectionHead title="Popular roles" />
            <div className="grid grid-cols-2 gap-3">
              {roles.map((r) => (
                <Link key={r.value} to={`/jobs?role=${encodeURIComponent(r.value)}`} className="surface surface-hover p-4">
                  <p className="truncate text-sm font-bold text-brand-dark">{r.value}</p>
                  <p className="mt-0.5 text-xs text-brand-gray-muted">{formatNumber(r.count)} jobs</p>
                </Link>
              ))}
            </div>
          </div>
        )}
        {cities.length > 0 && (
          <div>
            <SectionHead title="Jobs by city" />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {cities.map((c) => (
                <Link key={c.value} to={`/jobs?location=${encodeURIComponent(c.value)}`} className="surface surface-hover p-4 text-center">
                  <Icon name="location_city" size={26} className="text-brand-blue" />
                  <p className="mt-1 truncate text-sm font-bold text-brand-dark">{c.value}</p>
                  <p className="text-xs text-brand-gray-muted">{formatNumber(c.count)} jobs</p>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </Wrap>
  );
};

const TwoBanners = () => (
  <Wrap className="bg-white">
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <div className="relative overflow-hidden rounded-[var(--radius-card)] bg-brand-blue p-7 text-white sm:p-9">
        <p className="text-[13px] font-medium text-white/75">For job seekers</p>
        <h2 className="mt-2 text-xl font-bold sm:text-2xl">Let recruiters find you</h2>
        <p className="mt-2 max-w-md text-sm text-white/85">Upload your resume and complete your profile to appear in recruiter searches.</p>
        <Link to="/candidate/complete-profile" className="mt-5 inline-flex rounded-md bg-white px-5 py-2.5 text-sm font-semibold text-brand-blue hover:bg-brand-blue-tint">
          Upload resume
        </Link>
      </div>
      <div className="relative overflow-hidden rounded-[var(--radius-card)] bg-brand-ink p-7 text-white sm:p-9">
        <p className="text-[13px] font-medium text-brand-orange">For employers</p>
        <h2 className="mt-2 text-xl font-bold sm:text-2xl">Hire the right talent faster</h2>
        <p className="mt-2 max-w-md text-sm text-white/75">Post jobs, search candidates and manage your whole hiring pipeline in one place.</p>
        <Link to="/for-employers" className="mt-5 inline-flex rounded-md bg-brand-orange px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-orange-dark">
          Start hiring
        </Link>
      </div>
    </div>
  </Wrap>
);

export const BlogCard = ({ blog }) => (
  <Link to={`/career-advice/${blog.slug}`} className="surface surface-hover group flex flex-col overflow-hidden">
    <div className="flex h-40 items-center justify-center bg-brand-tint">{blog.coverImage?.url ? <img src={blog.coverImage.url} alt="" loading="lazy" className="h-full w-full object-cover" /> : <Icon name="article" size={36} className="text-brand-blue" />}</div>
    <div className="flex flex-1 flex-col p-5">
      {blog.category && <span className="mb-2 text-xs font-semibold text-brand-orange">{blog.category}</span>}
      <h3 className="font-bold leading-snug text-brand-dark transition-colors group-hover:text-brand-blue">{blog.title}</h3>
      {blog.excerpt && <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-brand-gray">{blog.excerpt}</p>}
      <p className="mt-auto pt-3 text-xs text-brand-gray-muted">{formatDate(blog.publishedAt)}</p>
    </div>
  </Link>
);

const CareerAdvicePreview = () => {
  const { data } = useQuery({ queryKey: ['home-blogs'], queryFn: () => cmsApi.blogs({ limit: 3 }) });
  if (!data?.data?.length) return null;
  return (
    <Wrap>
      <SectionHead title="Career advice" subtitle="Guides on resumes, salary negotiation and interviews" to="/career-advice" linkLabel="View all" />
      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        {data.data.map((b) => (
          <BlogCard key={b._id} blog={b} />
        ))}
      </div>
    </Wrap>
  );
};

const Home = () => {
  useDocumentTitle();
  return (
    <div className="flex w-full flex-col">
      <Hero />
      <QuickChips />
      <AdSlot placement="home_top" className="mx-auto w-full max-w-[1240px] px-4 pt-6 sm:px-6" />
      <LatestJobs />
      <FeaturedCompanies />
      <PopularFromFacets />
      <TwoBanners />
      <CareerAdvicePreview />
    </div>
  );
};

export default Home;
