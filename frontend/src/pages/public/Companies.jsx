import React, { useEffect, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import CompanyCard from '../../components/common/CompanyCard';
import Button from '../../components/ui/Button';
import CompanySearchBox from '../../components/common/CompanySearchBox';
import FilterCheckList from '../../components/ui/FilterCheckList';
import { Pagination, SimpleSelect } from '../../components/ui/data';
import { CardSkeleton, Drawer, EmptyState, ErrorState, Icon } from '../../components/ui/feedback';
import { SuggestField, TagInput } from '../../components/ui/form';
import { useLookups, useUrlFilters } from '../../hooks/useData';
import useDebounce from '../../hooks/useDebounce';
import { employerPublicApi } from '../../services';
import { DATE_POSTED_OPTIONS, EMPLOYER_TYPE_OPTIONS } from '../../utils/options';
import useSeo from '../../hooks/useSeo';

/** Multi-value filters are "|"-joined in the URL (names can contain commas) and sent as arrays. */
const SEP = '|';
const LIST_KEYS = ['type', 'companyType', 'city', 'industry', 'role', 'department', 'experienceLevel', 'companySize', 'topCompany'];
const split = (v) => (v ? String(v).split(SEP).filter(Boolean) : []);

const Group = ({ title, count, defaultOpen, children }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-brand-border py-3 last:border-0">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center justify-between text-left text-sm font-semibold text-brand-dark">
        <span className="flex items-center gap-2">
          {title}
          {count > 0 && <span className="rounded-full bg-brand-blue-tint px-1.5 text-[11px] text-brand-blue">{count}</span>}
        </span>
        <Icon name={open ? 'expand_less' : 'expand_more'} size={18} className="text-brand-gray-muted" />
      </button>
      {open && <div className="mt-2.5 space-y-2">{children}</div>}
    </div>
  );
};

const Checks = (props) => <FilterCheckList {...props} />;

/** "Side Filters- Companies Search" (Other Forms Excel). */
const Filters = ({ filters, setFilters, lookups, consultancy }) => {
  const get = (k) => split(filters[k]);
  const setList = (k) => (v) => setFilters({ [k]: v.join(SEP) });
  const toggle = (k) => (v) => setList(k)(get(k).includes(v) ? get(k).filter((x) => x !== v) : [...get(k), v]);
  return (
    <div>
      {!consultancy && (
        <Group title="Employer type" defaultOpen count={get('type').length}>
          <Checks options={EMPLOYER_TYPE_OPTIONS} selected={get('type')} onToggle={toggle('type')} />
        </Group>
      )}
      <Group title="Date posted" defaultOpen count={filters.datePosted ? 1 : 0}>
        <SimpleSelect className="w-full" placeholder="Any time" value={filters.datePosted} onChange={(v) => setFilters({ datePosted: v })} options={DATE_POSTED_OPTIONS} />
      </Group>
      <Group title="Company type" defaultOpen count={get('companyType').length}>
        <Checks options={lookups.employer_type} selected={get('companyType')} onToggle={toggle('companyType')} />
      </Group>
      <Group title="Locations" count={get('city').length}>
        <TagInput max={20} value={get('city')} onChange={setList('city')} placeholder="City and press Enter" hint="Up to 20" />
      </Group>
      <Group title="Industry" count={get('industry').length}>
        <SuggestField lookup="industry" multiple value={get('industry')} onChange={setList('industry')} placeholder="Search industry" />
      </Group>
      <Group title="Job roles" count={get('role').length}>
        <SuggestField lookup="job_role" multiple max={20} value={get('role')} onChange={setList('role')} placeholder="Search role" />
      </Group>
      <Group title="Department" count={get('department').length}>
        <SuggestField lookup="department" multiple value={get('department')} onChange={setList('department')} placeholder="Search department" />
      </Group>
      <Group title="Experience level" count={get('experienceLevel').length}>
        <Checks options={lookups.experience_level} selected={get('experienceLevel')} onToggle={toggle('experienceLevel')} />
      </Group>
      <Group title="Company size" count={get('companySize').length}>
        <Checks options={lookups.company_size} selected={get('companySize')} onToggle={toggle('companySize')} />
      </Group>
      <Group title="Top companies" count={get('topCompany').length}>
        <Checks options={lookups.top_company} selected={get('topCompany')} onToggle={toggle('topCompany')} />
      </Group>
      <label className="flex items-center gap-2 py-3 text-sm text-brand-gray">
        <input type="checkbox" checked={filters.verified === 'true'} onChange={(e) => setFilters({ verified: e.target.checked ? 'true' : '' })} /> Verified employers only
      </label>
    </div>
  );
};

/** Directory of employers; `/recruiters` is the same page for consultancies. */
const Companies = ({ type = 'company' }) => {
  const consultancy = type === 'consultancy';
  useSeo({
    title: consultancy ? 'Recruiters and job consultancies' : 'Top companies hiring now',
    description: consultancy ? 'Verified job consultancies and staffing agencies hiring for their clients across India.' : 'Explore verified companies hiring across India, see their open jobs and follow them for new openings.',
    path: consultancy ? '/recruiters' : '/companies',
  });
  const lookups = useLookups('employer_type', 'experience_level', 'company_size', 'top_company');
  const [filters, setFilters] = useUrlFilters({ page: '1' });
  const [drawer, setDrawer] = useState(false);
  const [q, setQ] = useState(filters.q || '');
  const debounced = useDebounce(q, 400);
  useEffect(() => {
    if (debounced !== (filters.q || '')) setFilters({ q: debounced });
  }, [debounced]); // eslint-disable-line react-hooks/exhaustive-deps

  const params = { limit: 24, sort: '-stats.activeJobs' };
  for (const [k, v] of Object.entries(filters)) if (v !== '') params[k] = LIST_KEYS.includes(k) ? split(v) : v;
  // `/recruiters` is always consultancies; `/companies` lets the "Employer type" filter decide (default company).
  if (consultancy) params.type = ['consultancy'];
  else if (!params.type?.length) params.type = ['company'];
  const query = useQuery({ queryKey: ['employers', params], queryFn: () => employerPublicApi.list(params), placeholderData: keepPreviousData });
  const active = Object.keys(filters).filter((k) => !['page', 'q', 'limit'].includes(k) && filters[k] !== '').length;
  const reset = () => setFilters(Object.fromEntries(Object.keys(filters).map((k) => [k, ''])));
  const filterPanel = <Filters filters={filters} setFilters={setFilters} lookups={lookups} consultancy={consultancy} />;

  return (
    <div className="bg-brand-tint">
      <div className="border-b border-brand-border bg-white">
        <div className="mx-auto max-w-[1200px] px-4 py-8 sm:px-6">
          <h1 className="text-2xl font-bold text-brand-dark sm:text-3xl">{consultancy ? 'Find Recruiters' : 'Explore Companies'}</h1>
          <p className="mt-1 text-sm text-brand-gray">{consultancy ? 'Consultancies hiring for their clients' : 'See who is hiring and follow the employers you like'}</p>
          <div className="mt-4 flex gap-2">
            <CompanySearchBox value={q} onChange={setQ} type={consultancy ? 'consultancy' : 'company'} placeholder={`Search ${consultancy ? 'recruiters' : 'companies'} by name`} />
            <Button variant="outline" size="sm" className="h-10 lg:hidden" onClick={() => setDrawer(true)} leftIcon={<Icon name="tune" size={16} />}>
              Filters{active ? ` (${active})` : ''}
            </Button>
          </div>
        </div>
      </div>
      <div className="mx-auto flex max-w-[1200px] gap-6 px-4 py-6 sm:px-6">
        <aside className="surface sticky top-[86px] hidden max-h-[calc(100vh-102px)] w-72 shrink-0 self-start overflow-y-auto p-4 lg:block">
          <div className="flex items-center justify-between border-b border-brand-border pb-3">
            <p className="text-sm font-bold text-brand-dark">Filters</p>
            {active > 0 && (
              <button type="button" onClick={reset} className="text-xs font-semibold text-brand-blue hover:underline">
                Reset
              </button>
            )}
          </div>
          {filterPanel}
        </aside>
        <div className="min-w-0 flex-1">
          {query.isPending && <CardSkeleton count={4} />}
          {query.isError && <ErrorState error={query.error} onRetry={query.refetch} />}
          {query.data && !query.data.data.length && <EmptyState icon="domain_disabled" title="No employers found" description="Try fewer filters or a different search." />}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {query.data?.data.map((c) => (
              <CompanyCard key={c._id} company={c} base={c.type === 'consultancy' ? '/recruiters' : '/companies'} />
            ))}
          </div>
          <Pagination meta={query.data?.meta} onPage={(page) => setFilters({ page })} limit={filters.limit} onLimit={(limit) => setFilters({ limit })} />
        </div>
      </div>
      <Drawer open={drawer} onClose={() => setDrawer(false)} title="Filters" width="max-w-sm">
        {filterPanel}
      </Drawer>
    </div>
  );
};

export default Companies;
