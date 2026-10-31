import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { clsx } from 'clsx';
import Button from '../../components/ui/Button';
import { PageHeader, Pagination } from '../../components/ui/data';
import { CardSkeleton, EmptyState, ErrorState, Icon } from '../../components/ui/feedback';
import useAuth from '../../hooks/useAuth';
import { useAction, useDocumentTitle, useUrlFilters } from '../../hooks/useData';
import { notificationLink } from '../../hooks/useRealtime';
import { notificationApi } from '../../services';
import { timeAgo } from '../../utils/format';

const Notifications = () => {
  useDocumentTitle('Notifications');
  const { user } = useAuth();
  const navigate = useNavigate();
  const [filters, setFilters] = useUrlFilters({ page: '1' });
  const params = { limit: 20, ...filters };
  const query = useQuery({ queryKey: ['notifications', params], queryFn: () => notificationApi.list(params) });
  const readAll = useAction(() => notificationApi.read(), { invalidate: ['notifications'] });
  const remove = useAction(notificationApi.remove, { invalidate: ['notifications'] });
  const open = async (n) => {
    if (!n.readAt) await notificationApi.read([n._id]).catch(() => {});
    const link = notificationLink(n, user.role);
    if (link) navigate(link);
  };
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Notifications"
        actions={
          <Button size="sm" variant="outline" disabled={!query.data?.meta?.unread} onClick={() => readAll.mutate()}>
            Mark all as read
          </Button>
        }
      />
      {query.isPending && <CardSkeleton />}
      {query.isError && <ErrorState error={query.error} onRetry={query.refetch} />}
      {query.data && !query.data.data.length && <EmptyState icon="notifications_off" title="No notifications yet" />}
      <div className="space-y-2">
        {query.data?.data.map((n) => (
          <div key={n._id} className={clsx('flex items-start gap-3 rounded-xl border border-brand-border p-4', n.readAt ? 'bg-white' : 'bg-brand-blue-tint/50')}>
            <button onClick={() => open(n)} className="min-w-0 flex-1 text-left">
              <p className="text-sm font-semibold text-brand-dark">{n.title}</p>
              {n.body && <p className="mt-0.5 text-sm text-brand-gray">{n.body}</p>}
              <p className="mt-1 text-xs text-brand-gray-muted">{timeAgo(n.createdAt)}</p>
            </button>
            <button onClick={() => remove.mutate(n._id)} aria-label="Delete notification" className="text-brand-gray-muted hover:text-brand-red">
              <Icon name="delete" size={18} />
            </button>
          </div>
        ))}
      </div>
      <Pagination meta={query.data?.meta} onPage={(page) => setFilters({ page })} />
    </div>
  );
};

export default Notifications;
