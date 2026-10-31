import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import AdSlot from '../../components/common/AdSlot';
import JobCard from '../../components/common/JobCard';
import JobSearchInput from '../../components/common/JobSearchInput';
import Button from '../../components/ui/Button';
import { Pagination, SimpleSelect } from '../../components/ui/data';
import { CardSkeleton, Drawer, EmptyState, ErrorState, Icon } from '../../components/ui/feedback';
import { useDocumentTitle, useUrlFilters } from '../../hooks/useData';
import useDebounce from '../../hooks/useDebounce';
import { jobApi } from '../../services';
import { formatNumber } from '../../utils/format';
import { rememberSearch } from '../../utils/recentSearches';

const FRESHNESS = [
  { value: '1', label: 'Last 24 hours' },
  { value: '3', label: 'Last 3 days' },
  { value: '7', label: 'Last 7 days' },
  { value: '15', label: 'Last 15 days' },
  { value: '30', label: 'Last 30 days' },
];
const FACETS = [
  ['workMode', 'Work Mode', 'home_work'],
  ['location', 'Location', 'location_on'],
  ['department', 'Department', 'category'],
  ['industry', 'Industry', 'domain'],
  ['role', 'Role', 'badge'],
  ['employmentType', 'Employment Type', 'work'],
  ['companyType', 'Company Type', 'business'],
  ['postedBy', 'Posted By', 'person'],
];

const Accordion = ({ icon, title, defaultOpen, children }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-brand-border py-3.5 last:border-0">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center justify-between text-left">
        <span className="flex items-center gap-2 text-sm font-semibold text-brand-dark">
          <Icon name={icon} size={18} className="text-brand-gray-muted" /> {title}
        </span>
        <Icon name={open ? 'expand_less' : 'expand_more'} size={18} className="text-brand-gray-muted" />
      </button>
      {open && <div className="mt-2.5 max-h-56 space-y-2 overflow-y-auto">{children}</div>}
    </div>
  );
};

const Filters = ({ filters, setFilters, facets }) => {
  const selected = (key) => (filters[key] ? filters[key].split(',') : []);
  const toggle = (key, value) => {
    const cur = selected(key);
    setFilters({ [key]: cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value] });
  };
  return (
    <div>
      <Accordion icon="schedule" title="Freshness" defaultOpen>
        <SimpleSelect className="w-full" placeholder="Any time" value={filters.freshness} onChange={(v) => setFilters({ freshness: v })} options={FRESHNESS} />
      </Accordion>
      <Accordion icon="grade" title="Experience (years)" defaultOpen>
        <input type="number" min="0" max="50" value={filters.experience ?? ''} onChange={(e) => setFilters({ experience: e.target.value })} aria-label="Years of experience" placeholder="e.g. 3" className="field-control h-10 w-full px-3 text-sm" />
      </Accordion>
      <Accordion icon="payments" title="Minimum monthly salary">
        <input type="number" min="0" step="5000" value={filters.salaryMin ?? ''} onChange={(e) => setFilters({ salaryMin: e.target.value })} aria-label="Minimum monthly salary" placeholder="e.g. 30000" className="field-control h-10 w-full px-3 text-sm" />
      </Accordion>
      {FACETS.map(([key, title, icon], i) => {
        const items = facets?.[key] || [];
        if (!items.length) return null;
        return (
          <Accordion key={key} icon={icon} title={title} defaultOpen={i < 2}>
            {items.map((f) => (
              <label key={f.value} className="flex cursor-pointer items-center justify-between gap-2 text-sm text-brand-gray">
                <span className="flex min-w-0 items-center gap-2">
                  <input type="checkbox" checked={selected(key).includes(f.value)} onChange={() => toggle(key, f.value)} />
                  <span className="truncate">{f.value}</span>
                </span>
                <span className="text-xs text-brand-gray-muted">{formatNumber(f.count)}</span>
              </label>
            ))}
          </Accordion>
        );
      })}
      <label className="flex items-center gap-2 py-3 text-sm text-brand-gray">
        <input type="checkbox" checked={filters.verifiedOnly === 'true'} onChange={(e) => setFilters({ verifiedOnly: e.target.checked ? 'true' : '' })} /> Verified employers only
      </label>
    </div>
  );
};

const JobListing = () => {
  useDocumentTitle('Search jobs');
  const [filters, setFilters] = useUrlFilters({ page: '1' });
  const [drawer, setDrawer] = useState(false);
  const [q, setQ] = useState(filters.q || '');
  const [location, setLocation] = useState(filters.location || '');
  const searchRef = useRef(null);
  const locationRef = useRef(null);
  const debouncedQ = useDebounce(q, 400);
  const debouncedLocation = useDebounce(location, 400);

  useEffect(() => {
    if (debouncedQ !== (filters.q || '') || debouncedLocation !== (filters.location || '')) setFilters({ q: debouncedQ, location: debouncedLocation });
  }, [debouncedQ, debouncedLocation]); // eslint-disable-line react-hooks/exhaustive-deps

  const runSearch = (picked = {}) => {
    const next = { q, location, ...picked };
    setQ(next.q || '');
    setLocation(next.location || '');
    if (next.q || next.location) rememberSearch({ q: next.q || '', location: next.location || '' });
  };

  const params = { limit: 20, ...filters };
  const jobs = useQuery({ queryKey: ['jobs', params], queryFn: () => jobApi.search(params), placeholderData: keepPreviousData });
  const { page: _page, sort: _sort, ...facetParams } = params;
  const facets = useQuery({ queryKey: ['job-facets', facetParams], queryFn: () => jobApi.facets(facetParams), placeholderData: keepPreviousData });
  const total = jobs.data?.meta?.total ?? 0;
  const active = Object.keys(filters).filter((k) => !['page', 'sort'].includes(k)).length;
  const chips = Object.entries(filters)
    .filter(([k]) => !['page', 'sort'].includes(k))
    .flatMap(([k, v]) => (FACETS.some(([f]) => f === k) ? String(v).split(',').map((x) => [k, x]) : [[k, k === 'freshness' ? `Last ${v} days` : k === 'experience' ? `${v} yrs exp` : k === 'salaryMin' ? `Min ₹${v}` : k === 'verifiedOnly' ? 'Verified' : k === 'remoteOnly' ? 'Remote' : v]]));
  const removeChip = (key, value) => {
    if (key === 'q') setQ('');
    if (key === 'location') setLocation(String(filters.location).split(',').filter((x) => x !== value).join(','));
    if (FACETS.some(([f]) => f === key)) setFilters({ [key]: String(filters[key]).split(',').filter((x) => x !== value) });
    else setFilters({ [key]: '' });
  };

  return (
    <div className="bg-brand-tint">
      <div className="border-b border-brand-border bg-white">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-2 px-4 py-4 sm:flex-row sm:px-6">
          <div ref={searchRef} className="relative flex-1">
            <Icon name="search" size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-gray-muted" />
            <JobSearchInput anchorRef={searchRef} value={q} onChange={setQ} onSearch={runSearch} onEnter={() => runSearch()} placeholder="Skills, title or company" inputClassName="h-11 w-full field-control pl-9 pr-3 text-sm" />
          </div>
          <div ref={locationRef} className="relative flex-1">
            <Icon name="location_on" size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-gray-muted" />
            <JobSearchInput kind="location" anchorRef={locationRef} value={location} onChange={setLocation} onSearch={runSearch} onEnter={() => runSearch()} placeholder="City or state" inputClassName="h-11 w-full field-control pl-9 pr-3 text-sm" />
          </div>
        </div>
      </div>

      <div className="mx-auto flex max-w-[1200px] gap-6 px-4 py-6 sm:px-6">
        <aside className="surface sticky top-[86px] hidden max-h-[calc(100vh-102px)] w-72 shrink-0 self-start overflow-y-auto p-4 lg:block">
          <div className="flex items-center justify-between border-b border-brand-border pb-3">
            <p className="text-sm font-bold text-brand-dark">Filters</p>
            {active > 0 && (
              <Link to="/jobs" onClick={() => { setQ(''); setLocation(''); }} className="text-xs font-semibold text-brand-blue hover:underline">
                Clear all
              </Link>
            )}
          </div>
          <Filters filters={filters} setFilters={setFilters} facets={facets.data} />
        </aside>

        <div className="min-w-0 flex-1">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-lg font-bold text-brand-dark">{jobs.isPending ? 'Searching jobs...' : `${formatNumber(total)} ${total === 1 ? "job" : "jobs"} found`}</h1>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="lg:hidden" onClick={() => setDrawer(true)} leftIcon={<Icon name="tune" size={16} />}>
                Filters{active ? ` (${active})` : ''}
              </Button>
              <SimpleSelect
                ariaLabel="Sort jobs"
                value={filters.sort || 'relevance'}
                onChange={(v) => setFilters({ sort: v })}
                options={[
                  { value: 'relevance', label: 'Most relevant' },
                  { value: 'date', label: 'Newest first' },
                  { value: 'salary', label: 'Highest salary' },
                ]}
              />
            </div>
          </div>
          {chips.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-1.5">
              {chips.map(([key, value]) => (
                <button key={`${key}-${value}`} onClick={() => removeChip(key, value)} aria-label={`Remove filter ${value}`} className="inline-flex items-center gap-1 rounded-md border border-brand-border bg-white px-2 py-1 text-xs font-medium text-brand-gray hover:border-brand-red hover:text-brand-red">
                  {value} <Icon name="close" size={14} />
                </button>
              ))}
              <Link to="/jobs" onClick={() => { setQ(''); setLocation(''); }} className="ml-1 text-xs font-semibold text-brand-blue hover:underline">
                Clear all
              </Link>
            </div>
          )}
          <AdSlot placement="jobs_list" className="mb-4" />
          {jobs.isPending && <CardSkeleton count={5} />}
          {jobs.isError && <ErrorState error={jobs.error} onRetry={jobs.refetch} />}
          {jobs.data && !jobs.data.data.length && (
            <EmptyState
              icon="search_off"
              title="No jobs match your search"
              description="Try fewer filters, or set a job alert and we will tell you when a match is posted."
              action={
                <Button asChild variant="primaryBlue" size="sm">
                  <Link to="/job-alerts">Create job alert</Link>
                </Button>
              }
            />
          )}
          <div className="space-y-3">
            {jobs.data?.data.map((job) => (
              <JobCard key={job._id} job={job} />
            ))}
          </div>
          <Pagination meta={jobs.data?.meta} onPage={(page) => { setFilters({ page }); window.scrollTo(0, 0); }} />
        </div>
      </div>

      <Drawer open={drawer} onClose={() => setDrawer(false)} title="Filters" width="max-w-sm" footer={<Button variant="primaryBlue" size="sm" onClick={() => setDrawer(false)}>Show {formatNumber(total)} jobs</Button>}>
        <Filters filters={filters} setFilters={setFilters} facets={facets.data} />
      </Drawer>
    </div>
  );
};

export default JobListing;
