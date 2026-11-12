import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import Button from '../../components/ui/Button';
import { PageHeader, SimpleSelect, Tabs } from '../../components/ui/data';
import { CardSkeleton, EmptyState, ErrorState, Icon, Modal } from '../../components/ui/feedback';
import { CheckboxField, TextField } from '../../components/ui/form';
import { useAction, useDocumentTitle } from '../../hooks/useData';
import { orgApi, talentApi } from '../../services';
import useAuth from '../../hooks/useAuth';
import { FoldersTab } from './Folders';
import { timeAgo } from '../../utils/format';

/** PRD "Searched / Folders filters": Today, Yesterday, In last 2 / 5 / 7 days, Custom date range. */
const SPANS = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: '2d', label: 'In last 2 days' },
  { value: '5d', label: 'In last 5 days' },
  { value: '7d', label: 'In last 7 days' },
  { value: 'custom', label: 'Custom date range' },
];
const toSpan = ({ timespan, from, to }) => {
  if (!timespan) return {};
  if (timespan !== 'custom') return { timespan };
  return { ...(from ? { from: new Date(`${from}T00:00:00`).toISOString() } : {}), ...(to ? { to: new Date(`${to}T23:59:59`).toISOString() } : {}) };
};
const SpanFilter = ({ value, onChange }) => (
  <div className="mb-4 flex flex-wrap items-end gap-2">
    <SimpleSelect ariaLabel="Updated" placeholder="Any time" value={value.timespan} onChange={(timespan) => onChange({ ...value, timespan })} options={SPANS} />
    {value.timespan === 'custom' && (
      <>
        <TextField label="From" type="date" max={new Date()} value={value.from} onChange={(e) => onChange({ ...value, from: e.target.value })} />
        <TextField label="To" type="date" max={new Date()} value={value.to} onChange={(e) => onChange({ ...value, to: e.target.value })} />
      </>
    )}
  </div>
);

/** Share a saved search or a folder with people of the same employer account. */
const ShareModal = ({ item, kind, onClose }) => {
  const { user } = useAuth();
  const [picked, setPicked] = useState(() => (item.sharedWith || []).map(String));
  const team = useQuery({ queryKey: ['team', ''], queryFn: () => orgApi.team({}) });
  const members = (team.data?.data || []).filter((m) => String(m._id) !== String(user?._id) && m.status === 'active');
  const save = useAction(() => (kind === 'folder' ? talentApi.updateFolder(item._id, { sharedWith: picked }) : talentApi.updateSearch(item._id, { sharedWith: picked })), {
    success: picked.length ? `Shared with ${picked.length} team member${picked.length === 1 ? '' : 's'}` : 'Sharing removed',
    invalidate: [kind === 'folder' ? 'folders' : 'saved-searches'],
    onSuccess: onClose,
  });
  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  return (
    <Modal open onClose={onClose} title={`Share ${kind === 'folder' ? 'folder' : 'search'}`} subtitle={item.name} size="sm" footer={<Button size="sm" variant="primaryBlue" loading={save.isPending} disabled={team.isPending} onClick={() => save.mutate()}>Save</Button>}>
      {team.isPending && <CardSkeleton count={1} />}
      {team.isError && <ErrorState error={team.error} onRetry={team.refetch} />}
      {team.data && !members.length && <EmptyState icon="group" title="No other team members yet" description="Add users from the Team page, then share with them here." />}
      <ul className="max-h-72 divide-y divide-brand-border overflow-y-auto">
        {members.map((m) => (
          <li key={m._id} className="py-2">
            <CheckboxField label={m.fullName} description={m.employer?.designation || m.email} checked={picked.includes(String(m._id))} onChange={() => toggle(String(m._id))} />
          </li>
        ))}
      </ul>
    </Modal>
  );
};

const SharedBadge = ({ count }) =>
  count ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-brand-blue-tint px-2 py-0.5 text-[11px] font-semibold text-brand-blue">
      <Icon name="group" size={12} /> {count}
    </span>
  ) : null;

const Searches = ({ span }) => {
  const [tab, setTab] = useState('mine');
  const query = useQuery({ queryKey: ['saved-searches', tab, span], queryFn: () => talentApi.searches({ tab, limit: 100, ...span }) });
  const remove = useAction(talentApi.removeSearch, { success: 'Search deleted', invalidate: ['saved-searches'] });
  const [sharing, setSharing] = useState(null);
  const mine = tab === 'mine';
  return (
    <>
      <Tabs
        className="mb-4"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'mine', label: 'My searches' },
          { value: 'shared', label: 'Shared with me' },
        ]}
      />
      {query.isPending && <CardSkeleton count={2} />}
      {query.isError && <ErrorState error={query.error} onRetry={query.refetch} />}
      {query.data && !query.data.data.length && <EmptyState icon="bookmarks" title="No saved searches" description="Save a search from the candidate search page." />}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {query.data?.data.map((s) => (
          <div key={s._id} className="flex items-center justify-between gap-2 surface p-4">
            <div className="min-w-0">
              <p className="flex items-center gap-2 truncate font-semibold text-brand-dark">
                <span className="truncate">{s.name}</span> {mine && <SharedBadge count={s.sharedWith?.length} />}
              </p>
              <p className="text-xs text-brand-gray-muted">
                {!mine && s.owner?.fullName ? `Shared by ${s.owner.fullName} · ` : ''}Updated {timeAgo(s.updatedAt)}
              </p>
            </div>
            <div className="flex shrink-0 gap-1">
              <Button asChild size="sm" variant="outline">
                <Link to={`/employer/candidates?search=${s._id}`}>Run</Link>
              </Button>
              {mine && (
                <>
                  <Button size="sm" variant="ghost" onClick={() => setSharing(s)}>
                    Share
                  </Button>
                  <Button size="sm" variant="dangerGhost" onClick={() => remove.mutate(s._id)}>
                    Delete
                  </Button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
      {sharing && <ShareModal item={sharing} kind="search" onClose={() => setSharing(null)} />}
    </>
  );
};

const SavedSearches = () => {
  useDocumentTitle('Saved searches');
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'folders' ? 'folders' : 'searches';
  const setTab = (value) => setParams(value === 'folders' ? { tab: 'folders' } : {}, { replace: true });
  const [range, setRange] = useState({ timespan: '', from: '', to: '' });
  const span = toSpan(range);
  return (
    <div>
      <PageHeader title="Saved Searches & Folders" subtitle="Searches you run often and the candidates you have filed, private or shared with your team" />
      <Tabs
        className="mb-4"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'searches', label: 'Saved searches' },
          { value: 'folders', label: 'Folders' },
        ]}
      />
      <SpanFilter value={range} onChange={setRange} />
      {tab === 'searches' ? <Searches span={span} /> : <FoldersTab span={span} />}
    </div>
  );
};

export default SavedSearches;
