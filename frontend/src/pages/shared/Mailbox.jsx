import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { clsx } from 'clsx';
import Button from '../../components/ui/Button';
import { PageHeader, Pagination, Tabs } from '../../components/ui/data';
import { CardSkeleton, Drawer, EmptyState, ErrorState, PageLoader } from '../../components/ui/feedback';
import { TextAreaField } from '../../components/ui/form';
import { useAction, useDocumentTitle, useUrlFilters } from '../../hooks/useData';
import { mailboxApi } from '../../services';
import { formatDateTime, timeAgo } from '../../utils/format';

const FOLDERS = [
  { value: 'inbox', label: 'Inbox' },
  { value: 'sent', label: 'Sent' },
  { value: 'drafts', label: 'Drafts' },
  { value: 'replied', label: 'Replied' },
  { value: 'service', label: 'Service' },
];

const MailDetail = ({ id, onClose }) => {
  const [reply, setReply] = useState('');
  const query = useQuery({ queryKey: ['mail', id], queryFn: () => mailboxApi.get(id) });
  const send = useAction(() => mailboxApi.reply(id, { body: reply }), { success: 'Reply sent', invalidate: ['mail', 'mailbox'], onSuccess: () => setReply('') });
  const remove = useAction(() => mailboxApi.remove(id), { success: 'Deleted', invalidate: ['mailbox'], onSuccess: onClose });
  const mail = query.data?.mail || query.data;
  return (
    <Drawer open onClose={onClose} title={mail?.subject || 'Mail'} subtitle={mail ? formatDateTime(mail.createdAt) : ''} footer={<Button size="sm" variant="dangerGhost" onClick={() => remove.mutate()}>Delete</Button>}>
      {query.isPending && <PageLoader className="h-40" />}
      {query.isError && <ErrorState error={query.error} />}
      {mail && (
        <div className="space-y-4">
          {[...(mail.thread || []), ...(mail.thread?.length ? [] : [mail])].map((m) => (
            <div key={m._id} className="rounded-lg border border-brand-border p-3">
              <p className="mb-2 text-xs text-brand-gray-muted">
                {m.sender?.fullName || 'Freejobwala'} · {timeAgo(m.createdAt)}
              </p>
              {/* mail bodies are sanitised on the API */}
              <div className="prose-content" dangerouslySetInnerHTML={{ __html: m.body }} />
            </div>
          ))}
          {mail.category !== 'service' && (
            <form
              className="space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                send.mutate();
              }}
            >
              <TextAreaField label="Reply" required rows={4} value={reply} onChange={(e) => setReply(e.target.value)} />
              <Button type="submit" size="sm" variant="primaryBlue" loading={send.isPending}>
                Send reply
              </Button>
            </form>
          )}
        </div>
      )}
    </Drawer>
  );
};

const Mailbox = () => {
  useDocumentTitle('Mailbox');
  const [filters, setFilters] = useUrlFilters({ folder: 'inbox', page: '1' });
  const [openId, setOpenId] = useState(null);
  const params = { limit: 20, ...filters };
  const query = useQuery({ queryKey: ['mailbox', params], queryFn: () => mailboxApi.list(params) });
  return (
    <div>
      <PageHeader title="Mailbox" subtitle={query.data?.meta?.unread ? `${query.data.meta.unread} unread` : undefined} />
      <Tabs className="mb-4" tabs={FOLDERS} value={filters.folder} onChange={(folder) => setFilters({ folder })} />
      {query.isPending && <CardSkeleton />}
      {query.isError && <ErrorState error={query.error} onRetry={query.refetch} />}
      {query.data && !query.data.data.length && <EmptyState icon="inbox" title="This folder is empty" />}
      <div className="overflow-hidden surface">
        {query.data?.data.map((m) => (
          <button key={m._id} onClick={() => setOpenId(m._id)} className={clsx('flex w-full items-center gap-3 border-b border-brand-border/60 px-4 py-3 text-left last:border-0 hover:bg-brand-tint', m.isRead === false && filters.folder === 'inbox' && 'font-semibold')}>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-brand-dark">{m.subject}</span>
              <span className="block truncate text-xs text-brand-gray-muted">{m.sender?.fullName || 'Freejobwala'}</span>
            </span>
            <span className="shrink-0 text-xs text-brand-gray-muted">{timeAgo(m.createdAt)}</span>
          </button>
        ))}
      </div>
      <Pagination meta={query.data?.meta} onPage={(page) => setFilters({ page })} limit={filters.limit} onLimit={(limit) => setFilters({ limit })} />
      {openId && <MailDetail id={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
};

export default Mailbox;
