import React from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import JobCard from '../../components/common/JobCard';
import Button from '../../components/ui/Button';
import { Pagination } from '../../components/ui/data';
import { CardSkeleton, EmptyState, ErrorState, Icon } from '../../components/ui/feedback';
import useSeo from '../../hooks/useSeo';
import { seoApi } from '../../services';
import { formatNumber } from '../../utils/format';
import NotFound from './NotFound';

/** /jobs-in-jaipur, /sales-executive-jobs, /sales-executive-jobs-in-jaipur (same rule as the API). */
export const LANDING_RE = /^(?:([a-z0-9][a-z0-9-]*?)-)?jobs(?:-in-([a-z0-9][a-z0-9-]*))?$/;
const SEP = '|';

const LinkCloud = ({ title, items }) =>
  items?.length ? (
    <section className="surface p-4 sm:p-5">
      <h2 className="mb-3 text-[15px] font-bold text-brand-dark">{title}</h2>
      <ul className="flex flex-wrap gap-2">
        {items.map((i) => (
          <li key={i.path}>
            <Link to={i.path} className="inline-flex items-center gap-1 rounded-full border border-brand-border bg-white px-3 py-1.5 text-[13px] text-brand-gray transition-colors hover:border-brand-blue hover:text-brand-blue">
              {i.name}
              <span className="text-xs text-brand-gray-muted">({formatNumber(i.count)})</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  ) : null;

const Landing = ({ slug }) => {
  const [params, setParams] = useSearchParams();
  const page = Number(params.get('page')) || 1;
  const query = useQuery({ queryKey: ['seo-landing', slug, page], queryFn: () => seoApi.landing(slug, { page }), placeholderData: keepPreviousData, retry: (n, e) => e?.status !== 404 && n < 2 });
  const d = query.data;
  useSeo({ title: d?.title, description: d?.description, path: d?.path, noindex: d ? d.noindex || page > 1 : false });

  if (query.isError && query.error?.status === 404) return <NotFound />;
  const filtersLink = d ? `/jobs?${new URLSearchParams({ ...(d.search.keywords.length ? { keywords: d.search.keywords.join(SEP) } : {}), ...(d.search.location.length ? { location: d.search.location.join(SEP) } : {}) })}` : '/jobs';
  const alertLink = d ? `/job-alerts?${new URLSearchParams({ ...(d.role ? { keywords: d.role } : {}), ...(d.city ? { location: d.city } : {}) })}` : '/job-alerts';

  return (
    <div className="bg-brand-tint">
      <div className="border-b border-brand-border bg-white">
        <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6">
          <nav aria-label="Breadcrumb" className="mb-2 text-xs text-brand-gray-muted">
            <Link to="/" className="hover:text-brand-blue">
              Home
            </Link>
            <span className="mx-1.5">›</span>
            <Link to="/jobs" className="hover:text-brand-blue">
              Jobs
            </Link>
            {d && (
              <>
                <span className="mx-1.5">›</span>
                <span className="text-brand-gray">{d.heading}</span>
              </>
            )}
          </nav>
          <h1 className="text-xl font-bold text-brand-dark sm:text-2xl">{d ? d.heading : 'Loading jobs…'}</h1>
          {d && <p className="mt-1.5 max-w-3xl text-sm text-brand-gray">{d.description}</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button asChild size="sm" variant="primary" leftIcon={<Icon name="tune" size={16} />}>
              <Link to={filtersLink}>Refine with filters</Link>
            </Button>
            <Button asChild size="sm" variant="outline" leftIcon={<Icon name="notifications" size={16} />}>
              <Link to={alertLink}>Get job alerts</Link>
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-[1200px] gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0">
          {d && <p className="mb-3 text-sm font-semibold text-brand-dark">{`${formatNumber(d.total)} ${d.total === 1 ? 'job' : 'jobs'} found`}</p>}
          {query.isPending && <CardSkeleton count={5} />}
          {query.isError && <ErrorState error={query.error} onRetry={query.refetch} />}
          {d && !d.jobs.length && (
            <EmptyState
              icon="work_off"
              title={`No ${d.heading.toLowerCase()} right now`}
              description="Create a free job alert and we will tell you as soon as one is posted."
              action={
                <Button asChild size="sm" variant="primaryBlue">
                  <Link to={alertLink}>Create job alert</Link>
                </Button>
              }
            />
          )}
          <div className="space-y-3">
            {d?.jobs.map((job) => (
              <JobCard key={job._id} job={job} />
            ))}
          </div>
          {d && (
            <Pagination
              meta={{ page: d.page, limit: d.limit, total: d.total, totalPages: Math.ceil(d.total / d.limit) }}
              onPage={(p) => {
                setParams(p > 1 ? { page: String(p) } : {});
                window.scrollTo(0, 0);
              }}
            />
          )}
        </div>
        <aside className="space-y-4">
          <LinkCloud title={d?.city ? `Popular jobs in ${d.city}` : 'Popular job searches'} items={d?.relatedRoles} />
          <LinkCloud title={d?.role ? `${d.role} jobs in other cities` : 'Jobs by city'} items={d?.relatedCities} />
        </aside>
      </div>
    </div>
  );
};

/** Single-segment URL: a landing page when it matches the pattern, otherwise the 404 page. */
const SeoLanding = () => {
  const { landing = '' } = useParams();
  const slug = landing.toLowerCase();
  const m = LANDING_RE.exec(slug);
  if (!m || (!m[1] && !m[2])) return <NotFound />;
  return <Landing key={slug} slug={slug} />;
};

export default SeoLanding;
