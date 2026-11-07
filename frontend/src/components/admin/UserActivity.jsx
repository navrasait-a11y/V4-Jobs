import React, { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Pagination, Section, SimpleSelect } from '../ui/data';
import { EmptyState, Icon } from '../ui/feedback';
import { adminApi } from '../../services';
import { TIMESPAN_OPTIONS, formatDateTime, titleCase } from '../../utils/format';

const ICONS = { login: 'login', logout: 'logout', email_sent: 'mail', password_changed: 'key', profile_updated: 'edit', job_posted: 'work', applied: 'send' };

/** PRD "User Activity History - Login, Logout, Email History, with date and time". */
const UserActivity = ({ userId }) => {
  const [page, setPage] = useState(1);
  const [timespan, setTimespan] = useState('');
  const q = useQuery({
    queryKey: ['admin', 'user-activity', userId, page, timespan],
    queryFn: () => adminApi.list(`/users/${userId}/activity`, { page, limit: 20, ...(timespan ? { timespan } : {}) }),
    placeholderData: keepPreviousData,
  });
  const rows = q.data?.data || [];
  return (
    <Section title="Activity history" actions={<SimpleSelect ariaLabel="Time range" placeholder="All time" value={timespan} onChange={(v) => { setTimespan(v); setPage(1); }} options={TIMESPAN_OPTIONS} />}>
      {q.data && !rows.length && <EmptyState icon="history" title="No activity in this period" />}
      <ol className="relative space-y-3 border-l border-brand-border pl-5">
        {rows.map((a) => (
          <li key={a._id} className="relative">
            <span className="absolute -left-[29px] flex h-6 w-6 items-center justify-center rounded-full border border-brand-border bg-white text-brand-blue">
              <Icon name={ICONS[a.type] || 'radio_button_checked'} size={14} />
            </span>
            <p className="text-sm font-medium text-brand-dark">{a.description || titleCase(a.type)}</p>
            <p className="text-xs text-brand-gray-muted">
              {formatDateTime(a.createdAt)}
              {a.ip ? ` · ${a.ip}` : ''}
              {a.device ? ` · ${a.device}` : ''}
            </p>
          </li>
        ))}
      </ol>
      <Pagination meta={q.data?.meta} onPage={setPage} />
    </Section>
  );
};

export default UserActivity;
