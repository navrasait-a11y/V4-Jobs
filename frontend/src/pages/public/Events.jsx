import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import ApplyModal from '../../components/candidate/ApplyModal';
import Button from '../../components/ui/Button';
import { Badge, Pagination, Section } from '../../components/ui/data';
import { CardSkeleton, EmptyState, ErrorState, Icon, PageLoader } from '../../components/ui/feedback';
import { useAction, useDocumentTitle, useUrlFilters } from '../../hooks/useData';
import { eventApi } from '../../services';
import useAuthStore from '../../store/useAuthStore';
import { formatDateTime, formatExperience, formatLocations, titleCase } from '../../utils/format';

export const Events = () => {
  useDocumentTitle('Job events');
  const [filters, setFilters] = useUrlFilters({ page: '1' });
  const params = { limit: 12, ...filters };
  const query = useQuery({ queryKey: ['events', params], queryFn: () => eventApi.list(params) });
  return (
    <div className="min-h-[60vh] bg-brand-tint">
      <div className="border-b border-brand-border bg-white">
        <div className="mx-auto max-w-[1200px] px-4 py-8 sm:px-6">
          <h1 className="text-2xl font-bold text-brand-dark sm:text-3xl">Job Events</h1>
          <p className="mt-1 text-sm text-brand-gray">Walk-ins and hiring drives near you</p>
        </div>
      </div>
      <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6">
        {query.isPending && <CardSkeleton />}
        {query.isError && <ErrorState error={query.error} onRetry={query.refetch} />}
        {query.data && !query.data.data.length && <EmptyState icon="event_busy" title="No upcoming events" description="Check back soon." />}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {query.data?.data.map((e) => (
            <Link key={e._id} to={`/events/${e.slug}`} className="overflow-hidden surface transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-hover)]">
              <div className="flex h-32 items-center justify-center bg-brand-blue-tint">{e.banner?.url ? <img src={e.banner.url} alt="" loading="lazy" className="h-full w-full object-cover" /> : <Icon name="celebration" size={36} className="text-brand-blue" />}</div>
              <div className="p-4">
                <Badge tone="blue">{titleCase(e.mode || 'event')}</Badge>
                <h2 className="mt-2 font-semibold text-brand-dark">{e.title}</h2>
                <p className="mt-1 text-xs text-brand-gray">{formatDateTime(e.startAt)}</p>
                {e.venue?.city && <p className="text-xs text-brand-gray-muted">{e.venue.city}</p>}
              </div>
            </Link>
          ))}
        </div>
        <Pagination meta={query.data?.meta} onPage={(page) => setFilters({ page })} />
      </div>
    </div>
  );
};

export const EventDetails = () => {
  const { slug } = useParams();
  const client = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const [selected, setSelected] = useState([]);
  const [guestJob, setGuestJob] = useState(null);
  const query = useQuery({ queryKey: ['event', slug], queryFn: () => eventApi.get(slug) });
  const event = query.data?.event || query.data;
  useDocumentTitle(event?.title);
  const apply = useAction(() => eventApi.apply(slug, selected), {
    success: 'Applied to the selected jobs',
    invalidate: ['applications'],
    onSuccess: () => setSelected([]),
  });
  if (query.isPending) return <PageLoader />;
  if (query.isError) return <div className="mx-auto max-w-[800px] p-6"><ErrorState error={query.error} onRetry={query.refetch} /></div>;
  const jobs = query.data.jobs || event.jobs || [];
  const candidate = user?.role === 'candidate';
  const open = query.data.isOpen ?? event.isOpen;
  return (
    <div className="mx-auto max-w-[900px] space-y-4 px-4 py-6 sm:px-6">
      {event.banner?.url && <img src={event.banner.url} alt="" className="max-h-64 w-full rounded-xl object-cover" />}
      <Section>
        <Badge tone="blue">{titleCase(event.mode || 'event')}</Badge>
        <h1 className="mt-2 text-2xl font-bold text-brand-dark">{event.title}</h1>
        <p className="mt-2 flex items-center gap-1.5 text-sm text-brand-gray">
          <Icon name="event" size={18} className="text-brand-blue" /> {formatDateTime(event.startAt)} {event.endAt && `to ${formatDateTime(event.endAt)}`}
        </p>
        {event.venue?.address && (
          <p className="mt-1 flex items-center gap-1.5 text-sm text-brand-gray">
            <Icon name="location_on" size={18} className="text-brand-blue" /> {[event.venue.address, event.venue.city, event.venue.state].filter(Boolean).join(', ')}
          </p>
        )}
        {event.description && <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-brand-gray">{event.description}</p>}
      </Section>
      <Section
        title="Jobs at this event"
        actions={
          candidate && open ? (
            <Button size="sm" variant="primary" disabled={!selected.length} loading={apply.isPending} onClick={() => apply.mutate()}>
              Apply to {selected.length || ''} selected
            </Button>
          ) : null
        }
      >
        {!jobs.length && <p className="text-sm text-brand-gray">No jobs listed yet.</p>}
        <ul className="divide-y divide-brand-border">
          {jobs.map((j) => (
            <li key={j._id} className="flex items-center gap-3 py-3">
              {candidate && open && (
                <input
                  type="checkbox"
                  aria-label={`Select ${j.title}`}
                  checked={selected.includes(j._id)}
                  onChange={() => setSelected((s) => (s.includes(j._id) ? s.filter((x) => x !== j._id) : [...s, j._id]))}
                 
                />
              )}
              <div className="min-w-0 flex-1">
                <Link to={`/jobs/${j.slug || j._id}`} className="font-medium text-brand-dark hover:text-brand-blue">
                  {j.title}
                </Link>
                <p className="text-xs text-brand-gray-muted">
                  {formatExperience(j)} · {formatLocations(j)}
                </p>
              </div>
              {!user && open && (
                <Button size="sm" variant="outline" onClick={() => setGuestJob(j)}>
                  Apply
                </Button>
              )}
            </li>
          ))}
        </ul>
      </Section>
      {guestJob && (
        <ApplyModal
          job={guestJob}
          eventId={event._id}
          onClose={() => setGuestJob(null)}
          onApplied={() => {
            setGuestJob(null);
            client.invalidateQueries({ queryKey: ['event', slug] });
          }}
        />
      )}
    </div>
  );
};
