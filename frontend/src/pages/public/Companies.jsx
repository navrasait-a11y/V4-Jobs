import React, { useEffect, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import CompanyCard from '../../components/common/CompanyCard';
import { Pagination, SearchInput, SimpleSelect } from '../../components/ui/data';
import { CardSkeleton, EmptyState, ErrorState } from '../../components/ui/feedback';
import { useDocumentTitle, useUrlFilters } from '../../hooks/useData';
import useDebounce from '../../hooks/useDebounce';
import { employerPublicApi } from '../../services';

/** Directory of employers; `/recruiters` is the same page for consultancies. */
const Companies = ({ type = 'company' }) => {
  const consultancy = type === 'consultancy';
  useDocumentTitle(consultancy ? 'Recruiters' : 'Companies');
  const [filters, setFilters] = useUrlFilters({ page: '1' });
  const [q, setQ] = useState(filters.q || '');
  const debounced = useDebounce(q, 400);
  useEffect(() => {
    if (debounced !== (filters.q || '')) setFilters({ q: debounced });
  }, [debounced]); // eslint-disable-line react-hooks/exhaustive-deps

  const params = { limit: 24, sort: '-stats.activeJobs', ...filters, type };
  const query = useQuery({ queryKey: ['employers', params], queryFn: () => employerPublicApi.list(params), placeholderData: keepPreviousData });

  return (
    <div className="bg-brand-tint">
      <div className="border-b border-brand-border bg-white">
        <div className="mx-auto max-w-[1200px] px-4 py-8 sm:px-6">
          <h1 className="text-2xl font-bold text-brand-dark sm:text-3xl">{consultancy ? 'Find Recruiters' : 'Explore Companies'}</h1>
          <p className="mt-1 text-sm text-brand-gray">{consultancy ? 'Consultancies hiring for their clients' : 'See who is hiring and follow the employers you like'}</p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <SearchInput className="flex-1" value={q} onChange={setQ} placeholder={`Search ${consultancy ? 'recruiters' : 'companies'}`} />
            <SimpleSelect
              ariaLabel="Verification"
              value={filters.verified}
              onChange={(v) => setFilters({ verified: v })}
              placeholder="All employers"
              options={[{ value: 'true', label: 'Verified only' }]}
            />
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6">
        {query.isPending && <CardSkeleton count={4} />}
        {query.isError && <ErrorState error={query.error} onRetry={query.refetch} />}
        {query.data && !query.data.data.length && <EmptyState icon="domain_disabled" title="No employers found" description="Try a different search." />}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {query.data?.data.map((c) => (
            <CompanyCard key={c._id} company={c} base={consultancy ? '/recruiters' : '/companies'} />
          ))}
        </div>
        <Pagination meta={query.data?.meta} onPage={(page) => setFilters({ page })} />
      </div>
    </div>
  );
};

export default Companies;
