import React from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { DataTable, PageHeader, Section, SimpleSelect, StatTile, Tabs } from '../../components/ui/data';
import { EmptyState, ErrorState, PageLoader } from '../../components/ui/feedback';
import { useDocumentTitle, useUrlFilters } from '../../hooks/useData';
import { adminApi } from '../../services';
import { formatDate, formatNumber } from '../../utils/format';

const RANGES = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
  { value: '180', label: 'Last 6 months' },
];

/**
 * What people search for (anonymous daily counters): top searches, searches that found nothing
 * (demand the platform is not meeting yet) and daily volume.
 */
const SearchInsights = () => {
  useDocumentTitle('Search insights');
  const [filters, setFilters] = useUrlFilters({ scope: 'jobs', days: '30' });
  const params = { scope: filters.scope || 'jobs', days: Number(filters.days) || 30 };
  const q = useQuery({ queryKey: ['admin-search-insights', params], queryFn: () => adminApi.get('/search/insights', params), placeholderData: keepPreviousData });
  if (q.isPending) return <PageLoader />;
  if (q.isError) return <ErrorState error={q.error} onRetry={q.refetch} />;
  const d = q.data;
  const jobs = params.scope === 'jobs';
  const link = (term) => (jobs ? `/jobs?keywords=${encodeURIComponent(term)}` : null);
  const termCell = (r) =>
    link(r.term) ? (
      <Link to={link(r.term)} target="_blank" className="font-medium text-brand-dark hover:text-brand-blue">
        {r.term}
      </Link>
    ) : (
      <span className="font-medium text-brand-dark">{r.term}</span>
    );

  return (
    <div className="space-y-4">
      <PageHeader
        title="Search insights"
        subtitle="What job seekers and employers search for. Anonymous: no names, e-mails or numbers are stored."
        actions={<SimpleSelect ariaLabel="Time range" placeholder={null} value={String(params.days)} onChange={(days) => setFilters({ days })} options={RANGES} />}
      />
      <Tabs
        value={params.scope}
        onChange={(scope) => setFilters({ scope })}
        tabs={[
          { value: 'jobs', label: 'Job seekers (job search)' },
          { value: 'candidates', label: 'Employers (candidate search)' },
        ]}
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile icon="search" label="Searches" value={formatNumber(d.totals.searches)} />
        <StatTile icon="tag" label="Different terms" value={formatNumber(d.totals.uniqueTerms)} />
        <StatTile icon="search_off" label="Found nothing" value={`${d.totals.zeroRate}%`} note={`${formatNumber(d.totals.zero)} searches`} />
        <StatTile icon="ads_click" label="Suggestions picked" value={formatNumber(d.totals.picks)} />
      </div>

      <Section title="Searches per day">
        {d.daily.length ? (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={d.daily} margin={{ left: -10, right: 8, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EEF1F5" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} tickFormatter={(v) => formatDate(v)} minTickGap={24} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={40} />
                <Tooltip labelFormatter={(v) => formatDate(v)} />
                <Legend />
                <Area type="monotone" dataKey="searches" name="Searches" stroke="#0A6CB5" fill="#E9F3FB" strokeWidth={2} />
                <Area type="monotone" dataKey="zero" name="Found nothing" stroke="#D92D20" fill="#FEF1F0" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <EmptyState icon="query_stats" title="No searches yet in this period" />
        )}
      </Section>

      <div className="grid gap-4 xl:grid-cols-2">
        <Section title="Top searches">
          <DataTable
            rows={d.top}
            rowKey={(r) => r.term}
            columns={[
              { key: 'term', header: 'Search term', render: termCell },
              { key: 'searches', header: 'Searches', render: (r) => formatNumber(r.searches) },
              { key: 'picks', header: 'Picked', render: (r) => formatNumber(r.picks) },
              { key: 'zeroRate', header: 'No results', render: (r) => <span className={r.zeroRate >= 50 ? 'font-semibold text-brand-red' : 'text-brand-gray'}>{r.zeroRate}%</span> },
            ]}
            empty={<EmptyState icon="search" title="No searches yet" />}
          />
        </Section>
        <Section title="Searches that found nothing">
          <p className="mb-3 text-sm text-brand-gray">{jobs ? 'People want these jobs but none are live. Share them with employers or the sales team.' : 'Employers looked for these profiles and found none. Good targets for candidate campaigns.'}</p>
          <DataTable
            rows={d.zeroResults}
            rowKey={(r) => r.term}
            columns={[
              { key: 'term', header: 'Search term', render: termCell },
              { key: 'zero', header: 'No-result searches', render: (r) => formatNumber(r.zero) },
              { key: 'last', header: 'Last seen', render: (r) => formatDate(r.last) },
            ]}
            empty={<EmptyState icon="task_alt" title="Every search found something" />}
          />
        </Section>
      </div>
    </div>
  );
};

export default SearchInsights;
