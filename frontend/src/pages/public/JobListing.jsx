import React, { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import AdSlot from '../../components/common/AdSlot';
import JobCard from '../../components/common/JobCard';
import JobSearchInput from '../../components/common/JobSearchInput';
import Button from '../../components/ui/Button';
import { Pagination, SimpleSelect } from '../../components/ui/data';
import { CardSkeleton, Drawer, EmptyState, ErrorState, Icon } from '../../components/ui/feedback';
import { SuggestField } from '../../components/ui/form';
import { useDocumentTitle, useLookups, useUrlFilters } from '../../hooks/useData';
import { jobApi } from '../../services';
import { formatNumber } from '../../utils/format';
import { DATE_POSTED_OPTIONS, DISTANCE_OPTIONS, EMPLOYER_TYPE_OPTIONS, EXPERIENCE_OPTIONS, JOB_SORT_OPTIONS, STIPEND_OPTIONS, monthsToYears } from '../../utils/options';
import { rememberSearch } from '../../utils/recentSearches';

/**
 * Job search ("Other Forms" Excel: Job Search Bar + Side Filters). Multi-value filters live in the URL
 * joined by "|" (option names can contain commas) and go to the API as arrays.
 */
const SEP = '|';
const LIST_KEYS = [
  'keywords',
  'mandatory',
  'location',
  'department',
  'role',
  'industry',
  'topCompany',
  'experienceLevel',
  'companyType',
  'companySize',
  'employmentType',
  'shift',
  'workMode',
  'joiningPeriod',
  'stipend',
  'postedBy',
  'education',
  'degree',
  'specialisation',
  'skills',
];
const MAX = { keywords: 20, location: 20 };
const LABELS = {
  q: 'Keyword',
  keywords: 'Keyword',
  location: 'Location',
  department: 'Department',
  role: 'Role',
  industry: 'Industry',
  topCompany: 'Company',
  experienceLevel: 'Experience level',
  companyType: 'Company type',
  companySize: 'Company size',
  employmentType: 'Job type',
  shift: 'Shift',
  workMode: 'Work mode',
  joiningPeriod: 'Joining',
  stipend: 'Stipend',
  postedBy: 'Posted by',
  education: 'Education',
  degree: 'Degree',
  specialisation: 'Specialisation',
  skills: 'Skill',
};

const split = (v) => (v ? String(v).split(SEP).filter(Boolean) : []);
const optLabel = (options, v) => options.find((o) => o.value === String(v))?.label || v;

/** URL filters -> API params (lists as arrays, months -> years). */
function toApiParams(filters) {
  const out = { limit: 20 };
  for (const [k, v] of Object.entries(filters)) {
    if (v === '' || v === undefined) continue;
    if (LIST_KEYS.includes(k)) out[k] = split(v);
    else if (k === 'expMin') out.experienceMin = monthsToYears(v);
    else if (k === 'expMax') out.experienceMax = monthsToYears(v);
    else if (k === 'exp') out.experience = monthsToYears(v);
    else out[k] = v;
  }
  return out;
}

const Accordion = ({ icon, title, defaultOpen, count, children }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-brand-border py-3.5 last:border-0">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center justify-between text-left">
        <span className="flex items-center gap-2 text-sm font-semibold text-brand-dark">
          <Icon name={icon} size={18} className="text-brand-gray-muted" /> {title}
          {count > 0 && <span className="rounded-full bg-brand-blue-tint px-1.5 text-[11px] text-brand-blue">{count}</span>}
        </span>
        <Icon name={open ? 'expand_less' : 'expand_more'} size={18} className="text-brand-gray-muted" />
      </button>
      {open && <div className="mt-2.5 space-y-2">{children}</div>}
    </div>
  );
};

/** Checkbox list; facet counts when the API returns them. */
const CheckList = ({ options, selected, onToggle, counts }) => (
  <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
    {options.map((o) => {
      const value = typeof o === 'string' ? o : o.value;
      const label = typeof o === 'string' ? o : o.label;
      return (
        <label key={value} className="flex cursor-pointer items-center justify-between gap-2 text-sm text-brand-gray">
          <span className="flex min-w-0 items-center gap-2">
            <input type="checkbox" checked={selected.includes(value)} onChange={() => onToggle(value)} />
            <span className="truncate">{label}</span>
          </span>
          {counts?.[value] !== undefined && <span className="text-xs text-brand-gray-muted">{formatNumber(counts[value])}</span>}
        </label>
      );
    })}
  </div>
);

const Filters = ({ filters, setFilters, facets, lookups }) => {
  const get = (key) => split(filters[key]);
  const setList = (key) => (values) => setFilters({ [key]: values.join(SEP) });
  const toggle = (key) => (value) => {
    const cur = get(key);
    setList(key)(cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value]);
  };
  const counts = (key) => Object.fromEntries((facets?.[key] || []).map((f) => [f.value, f.count]));
  // Facet values first (with counts), then the picked ones the facet no longer shows.
  const facetOptions = (key) => [...new Set([...(facets?.[key] || []).map((f) => f.value), ...get(key)])];
  const keywords = get('keywords');
  const mandatory = get('mandatory');

  return (
    <div>
      {keywords.length > 0 && (
        <Accordion icon="key" title="Keywords" defaultOpen count={keywords.length}>
          <div className="flex flex-wrap gap-1.5">
            {keywords.map((k) => {
              const on = filters.allMandatory === 'true' || mandatory.includes(k);
              return (
                <span key={k} className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium ${on ? 'bg-[#FFF4E0] text-[#B26A00]' : 'bg-brand-blue-tint text-brand-blue'}`}>
                  <button type="button" aria-pressed={on} title={on ? 'Mandatory' : 'Mark as mandatory'} onClick={() => setList('mandatory')(on ? mandatory.filter((x) => x !== k) : [...mandatory, k])}>
                    <Icon name="star" size={14} fill={on} />
                  </button>
                  {k}
                  <button
                    type="button"
                    aria-label={`Remove ${k}`}
                    onClick={() => setFilters({ keywords: keywords.filter((x) => x !== k).join(SEP), mandatory: mandatory.filter((x) => x !== k).join(SEP) })}
                  >
                    <Icon name="close" size={13} />
                  </button>
                </span>
              );
            })}
          </div>
          <label className="flex items-center gap-2 text-xs text-brand-gray">
            <input type="checkbox" checked={filters.allMandatory === 'true'} onChange={(e) => setFilters({ allMandatory: e.target.checked ? 'true' : '' })} /> Mark all keywords as mandatory
          </label>
          <p className="text-[11px] text-brand-gray-muted">Starred keywords must match. The rest widen the search.</p>
        </Accordion>
      )}
      <Accordion icon="schedule" title="Date posted" defaultOpen count={filters.freshness ? 1 : 0}>
        <SimpleSelect className="w-full" placeholder="Any time" value={filters.freshness} onChange={(v) => setFilters({ freshness: v })} options={DATE_POSTED_OPTIONS} />
      </Accordion>
      <Accordion icon="category" title="Department" defaultOpen count={get('department').length}>
        <SuggestField lookup="department" multiple value={get('department')} onChange={setList('department')} placeholder="Search department" />
        <CheckList options={facetOptions('department')} selected={get('department')} onToggle={toggle('department')} counts={counts('department')} />
      </Accordion>
      <Accordion icon="badge" title="Job roles" count={get('role').length}>
        <SuggestField lookup="job_role" multiple max={20} value={get('role')} onChange={setList('role')} placeholder="Search role" />
        <CheckList options={facetOptions('role')} selected={get('role')} onToggle={toggle('role')} counts={counts('role')} />
      </Accordion>
      <Accordion icon="domain" title="Industry" count={get('industry').length}>
        <SuggestField lookup="industry" multiple value={get('industry')} onChange={setList('industry')} placeholder="Search industry" />
        <CheckList options={facetOptions('industry')} selected={get('industry')} onToggle={toggle('industry')} counts={counts('industry')} />
      </Accordion>
      <Accordion icon="star" title="Top companies" count={get('topCompany').length}>
        <CheckList options={lookups.top_company} selected={get('topCompany')} onToggle={toggle('topCompany')} />
      </Accordion>
      <Accordion icon="workspace_premium" title="Experience level" count={get('experienceLevel').length}>
        <CheckList options={lookups.experience_level} selected={get('experienceLevel')} onToggle={toggle('experienceLevel')} />
      </Accordion>
      <Accordion icon="grade" title="Experience" count={(filters.expMin ? 1 : 0) + (filters.expMax ? 1 : 0)}>
        <div className="grid grid-cols-2 gap-2">
          <SimpleSelect placeholder="Min Exp." value={filters.expMin} onChange={(v) => setFilters({ expMin: v })} options={EXPERIENCE_OPTIONS} />
          <SimpleSelect placeholder="Max Exp." value={filters.expMax} onChange={(v) => setFilters({ expMax: v })} options={EXPERIENCE_OPTIONS} />
        </div>
      </Accordion>
      <Accordion icon="business" title="Company type" count={get('companyType').length}>
        <CheckList options={lookups.employer_type} selected={get('companyType')} onToggle={toggle('companyType')} />
      </Accordion>
      <Accordion icon="groups" title="Company size" count={get('companySize').length}>
        <CheckList options={lookups.company_size} selected={get('companySize')} onToggle={toggle('companySize')} />
      </Accordion>
      <Accordion icon="payments" title="Monthly salary" count={(filters.salaryMin ? 1 : 0) + (filters.salaryMax ? 1 : 0)}>
        <div className="grid grid-cols-2 gap-2">
          <input type="number" min="0" step="1000" value={filters.salaryMin ?? ''} onChange={(e) => setFilters({ salaryMin: e.target.value })} aria-label="Min in-hand salary" placeholder="Min. in hand" className="field-control h-10 w-full px-3 text-sm" />
          <input type="number" min="0" step="1000" value={filters.salaryMax ?? ''} onChange={(e) => setFilters({ salaryMax: e.target.value })} aria-label="Max in-hand salary" placeholder="Max. in hand" className="field-control h-10 w-full px-3 text-sm" />
        </div>
      </Accordion>
      <Accordion icon="work" title="Job type" count={get('employmentType').length}>
        <CheckList options={lookups.employment_type.filter((t) => !/internship|^any$/i.test(t))} selected={get('employmentType')} onToggle={toggle('employmentType')} counts={counts('employmentType')} />
      </Accordion>
      <Accordion icon="nights_stay" title="Shift type" count={get('shift').length}>
        <CheckList options={lookups.shift.filter((s) => s !== 'Any')} selected={get('shift')} onToggle={toggle('shift')} />
      </Accordion>
      <Accordion icon="home_work" title="Work mode" count={get('workMode').length}>
        <CheckList options={lookups.job_mode.filter((s) => s !== 'Any')} selected={get('workMode')} onToggle={toggle('workMode')} counts={counts('workMode')} />
      </Accordion>
      <Accordion icon="location_on" title="Locations" count={get('location').length}>
        <CheckList options={facetOptions('location')} selected={get('location')} onToggle={toggle('location')} counts={counts('location')} />
        <SimpleSelect className="w-full" placeholder="Show jobs within" value={filters.distanceKm} onChange={(v) => (v && !get('location').length ? toast.error('Pick a location first') : setFilters({ distanceKm: v }))} options={DISTANCE_OPTIONS} />
      </Accordion>
      <Accordion icon="event_available" title="Joining period" count={get('joiningPeriod').length}>
        <CheckList options={lookups.notice_period} selected={get('joiningPeriod')} onToggle={toggle('joiningPeriod')} />
      </Accordion>
      <Accordion icon="school" title="Stipend (internships)" count={get('stipend').length + (filters.stipendMin ? 1 : 0) + (filters.stipendMax ? 1 : 0)}>
        <CheckList options={STIPEND_OPTIONS} selected={get('stipend')} onToggle={toggle('stipend')} />
        <div className="grid grid-cols-2 gap-2">
          <input type="number" min="0" step="1000" value={filters.stipendMin ?? ''} onChange={(e) => setFilters({ stipendMin: e.target.value })} aria-label="Min in-hand stipend" placeholder="Min. stipend" className="field-control h-10 w-full px-3 text-sm" />
          <input type="number" min="0" step="1000" value={filters.stipendMax ?? ''} onChange={(e) => setFilters({ stipendMax: e.target.value })} aria-label="Max in-hand stipend" placeholder="Max. stipend" className="field-control h-10 w-full px-3 text-sm" />
        </div>
      </Accordion>
      <Accordion icon="person" title="Job posted by" count={get('postedBy').length}>
        <CheckList options={EMPLOYER_TYPE_OPTIONS} selected={get('postedBy')} onToggle={toggle('postedBy')} counts={counts('postedBy')} />
      </Accordion>
      <Accordion icon="menu_book" title="Education" count={get('education').length + get('degree').length + get('specialisation').length}>
        <CheckList options={lookups.education_level} selected={get('education')} onToggle={toggle('education')} />
        <SuggestField label="Degree / course" lookup="degree" parents={get('education').join('|') || undefined} multiple value={get('degree')} onChange={setList('degree')} />
        <SuggestField label="Specialisation" lookup="specialisation" multiple value={get('specialisation')} onChange={setList('specialisation')} />
      </Accordion>
      <label className="flex items-center gap-2 py-3 text-sm text-brand-gray">
        <input type="checkbox" checked={filters.verifiedOnly === 'true'} onChange={(e) => setFilters({ verifiedOnly: e.target.checked ? 'true' : '' })} /> Verified employers only
      </label>
    </div>
  );
};

/** "10 Filters Applied (Reset)": every applied filter in one box. */
const AppliedFilters = ({ filters, setFilters, onReset }) => {
  const items = [];
  for (const [k, v] of Object.entries(filters)) {
    if (['page', 'sort', 'allMandatory', 'mandatory'].includes(k) || v === '') continue;
    if (LIST_KEYS.includes(k)) {
      for (const x of split(v)) items.push({ k, v: x, label: k === 'postedBy' ? optLabel(EMPLOYER_TYPE_OPTIONS, x) : x });
    } else {
      const label =
        k === 'freshness'
          ? `Last ${optLabel(DATE_POSTED_OPTIONS, v)}`
          : k === 'expMin'
            ? `Min ${optLabel(EXPERIENCE_OPTIONS, v)}`
            : k === 'expMax'
              ? `Max ${optLabel(EXPERIENCE_OPTIONS, v)}`
              : k === 'exp'
                ? optLabel(EXPERIENCE_OPTIONS, v)
                : k === 'distanceKm'
                  ? `Within ${v} KM`
                  : k === 'salaryMin'
                    ? `Min ₹${formatNumber(v)}`
                    : k === 'salaryMax'
                      ? `Max ₹${formatNumber(v)}`
                      : k === 'stipendMin'
                        ? `Stipend from ₹${formatNumber(v)}`
                        : k === 'stipendMax'
                          ? `Stipend to ₹${formatNumber(v)}`
                          : k === 'verifiedOnly'
                            ? 'Verified employers'
                            : k === 'q'
                              ? v
                              : `${LABELS[k] || k}: ${v}`;
      items.push({ k, v, label });
    }
  }
  if (!items.length) return null;
  const remove = ({ k, v }) => {
    if (LIST_KEYS.includes(k)) {
      const patch = { [k]: split(filters[k]).filter((x) => x !== v).join(SEP) };
      if (k === 'keywords') patch.mandatory = split(filters.mandatory).filter((x) => x !== v).join(SEP);
      if (k === 'location' && split(filters.location).length === 1) patch.distanceKm = '';
      setFilters(patch);
    } else setFilters({ [k]: '' });
  };
  return (
    <div className="surface mb-3 p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-semibold text-brand-dark">
          {items.length} filter{items.length > 1 ? 's' : ''} applied
        </p>
        <button type="button" onClick={onReset} className="text-xs font-semibold text-brand-blue hover:underline">
          Reset
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {items.map((it) => (
          <button key={`${it.k}-${it.v}`} type="button" onClick={() => remove(it)} aria-label={`Remove filter ${it.label}`} className="inline-flex items-center gap-1 rounded-md border border-brand-border bg-white px-2 py-1 text-xs text-brand-gray hover:border-brand-blue">
            {it.label} <Icon name="close" size={14} />
          </button>
        ))}
      </div>
    </div>
  );
};

const JobListing = () => {
  useDocumentTitle('Search jobs');
  const [filters, setFilters] = useUrlFilters({ page: '1' });
  const lookups = useLookups('top_company', 'experience_level', 'employer_type', 'company_size', 'employment_type', 'shift', 'job_mode', 'notice_period', 'education_level');
  const [drawer, setDrawer] = useState(false);
  const [q, setQ] = useState('');
  const [location, setLocation] = useState('');
  const searchRef = useRef(null);
  const locationRef = useRef(null);

  /** Search bar: typed keyword / location become boxes (up to 20 each). */
  const addTo = (key, raw, current = filters) => {
    const list = split(current[key]);
    const items = String(raw || '')
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean)
      .filter((x) => !list.some((y) => y.toLowerCase() === x.toLowerCase()));
    if (list.length + items.length > MAX[key]) toast.error(`You can add up to ${MAX[key]} ${key === 'location' ? 'locations' : 'keywords'}`);
    return [...list, ...items].slice(0, MAX[key]).join(SEP);
  };
  const runSearch = (picked = {}) => {
    const kw = picked.q ?? q;
    const loc = picked.location ?? location;
    const patch = {};
    if (kw) patch.keywords = addTo('keywords', kw);
    if (loc) patch.location = addTo('location', loc);
    if (filters.q && kw) patch.q = '';
    if (Object.keys(patch).length) setFilters(patch);
    setQ('');
    setLocation('');
    if (kw || loc) rememberSearch({ q: kw || '', location: loc || '' });
  };
  const reset = () => {
    setFilters(Object.fromEntries(Object.keys(filters).map((k) => [k, ''])));
    setQ('');
    setLocation('');
  };

  const params = toApiParams(filters);
  const jobs = useQuery({ queryKey: ['jobs', params], queryFn: () => jobApi.search(params), placeholderData: keepPreviousData });
  const { page: _page, sort: _sort, limit: _limit, ...facetParams } = params;
  const facets = useQuery({ queryKey: ['job-facets', facetParams], queryFn: () => jobApi.facets(facetParams), placeholderData: keepPreviousData });
  const total = jobs.data?.meta?.total ?? 0;
  const active = Object.keys(filters).filter((k) => !['page', 'sort'].includes(k) && filters[k] !== '').length;

  return (
    <div className="bg-brand-tint">
      <div className="border-b border-brand-border bg-white">
        <form
          className="mx-auto flex max-w-[1200px] flex-col gap-2 px-4 py-4 sm:px-6 md:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            runSearch();
          }}
        >
          <div ref={searchRef} className="relative min-w-0 flex-[2]">
            <Icon name="search" size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-gray-muted" />
            <JobSearchInput anchorRef={searchRef} value={q} onChange={setQ} onSearch={runSearch} onEnter={() => runSearch()} placeholder="Job titles, skills, roles, companies" inputClassName="h-11 w-full field-control pl-9 pr-3 text-sm" />
          </div>
          <SimpleSelect ariaLabel="Experience" className="md:w-44" placeholder="Experience" value={filters.exp} onChange={(v) => setFilters({ exp: v })} options={EXPERIENCE_OPTIONS} />
          <div ref={locationRef} className="relative min-w-0 flex-1">
            <Icon name="location_on" size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-gray-muted" />
            <JobSearchInput kind="location" anchorRef={locationRef} value={location} onChange={setLocation} onSearch={runSearch} onEnter={() => runSearch()} placeholder="City, district or state" inputClassName="h-11 w-full field-control pl-9 pr-3 text-sm" />
          </div>
          <Button type="submit" variant="primary" className="h-11">
            Search jobs
          </Button>
        </form>
      </div>

      <div className="mx-auto flex max-w-[1200px] gap-6 px-4 py-6 sm:px-6">
        <aside className="surface sticky top-[86px] hidden max-h-[calc(100vh-102px)] w-72 shrink-0 self-start overflow-y-auto p-4 lg:block">
          <div className="flex items-center justify-between border-b border-brand-border pb-3">
            <p className="text-sm font-bold text-brand-dark">Filters</p>
            {active > 0 && (
              <button type="button" onClick={reset} className="text-xs font-semibold text-brand-blue hover:underline">
                Clear all
              </button>
            )}
          </div>
          <Filters filters={filters} setFilters={setFilters} facets={facets.data} lookups={lookups} />
        </aside>

        <div className="min-w-0 flex-1">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-lg font-bold text-brand-dark">{jobs.isPending ? 'Searching jobs...' : `${formatNumber(total)} ${total === 1 ? 'job' : 'jobs'} found`}</h1>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="lg:hidden" onClick={() => setDrawer(true)} leftIcon={<Icon name="tune" size={16} />}>
                Filters{active ? ` (${active})` : ''}
              </Button>
              <SimpleSelect ariaLabel="Sort by" value={filters.sort || 'relevance'} onChange={(v) => setFilters({ sort: v })} options={JOB_SORT_OPTIONS} />
            </div>
          </div>
          <AppliedFilters filters={filters} setFilters={setFilters} onReset={reset} />
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
          <Pagination
            meta={jobs.data?.meta}
            onPage={(page) => {
              setFilters({ page });
              window.scrollTo(0, 0);
            }}
          />
        </div>
      </div>

      <Drawer
        open={drawer}
        onClose={() => setDrawer(false)}
        title="Filters"
        width="max-w-sm"
        footer={
          <Button variant="primaryBlue" size="sm" onClick={() => setDrawer(false)}>
            Show {formatNumber(total)} jobs
          </Button>
        }
      >
        <Filters filters={filters} setFilters={setFilters} facets={facets.data} lookups={lookups} />
      </Drawer>
    </div>
  );
};

export default JobListing;
