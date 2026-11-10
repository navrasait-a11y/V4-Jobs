import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import ShareMenu from '../../components/common/ShareMenu';
import UpsellNotice from '../../components/employer/UpsellNotice';
import Button from '../../components/ui/Button';
import { Badge, DataTable, PageHeader, Pagination, SearchInput, SimpleSelect, StatusBadge, Tabs } from '../../components/ui/data';
import { CheckboxField } from '../../components/ui/form';
import { ConfirmDialog, EmptyState, Icon, Modal } from '../../components/ui/feedback';
import useAuth from '../../hooks/useAuth';
import { useAction, useDocumentTitle, useUrlFilters } from '../../hooks/useData';
import useDebounce from '../../hooks/useDebounce';
import { employerJobApi, orgApi } from '../../services';
import { formatDate, formatLocations, titleCase } from '../../utils/format';

const STATUSES = ['', 'active', 'pending', 'admin_review', 'draft', 'closed', 'expired', 'rejected'];
const KINDS = [
  { value: 'job', label: 'Job vacancy' },
  { value: 'internship', label: 'Internship' },
];
const SORTS = [
  { value: '-createdAt', label: 'Posted date (newest)' },
  { value: 'createdAt', label: 'Posted date (oldest)' },
  { value: 'title', label: 'Job title (A to Z)' },
  { value: '-title', label: 'Job title (Z to A)' },
];

const TeamShare = ({ job, onClose }) => {
  const team = useQuery({ queryKey: ['team', 'options'], queryFn: () => orgApi.team({ limit: 100 }) });
  const [ids, setIds] = useState((job.collaborators || []).map((c) => c._id || c));
  const save = useAction(() => employerJobApi.collaborators(job._id, ids), { success: 'Team updated', invalidate: ['employer-jobs'], onSuccess: onClose });
  return (
    <Modal open onClose={onClose} title="Share with team" subtitle={job.title} size="sm" footer={<Button size="sm" variant="primaryBlue" loading={save.isPending} onClick={() => save.mutate()}>Save</Button>}>
      <div className="space-y-2">
        {(team.data?.data || []).map((m) => (
          <CheckboxField key={m._id} label={m.fullName} description={m.email} checked={ids.includes(m._id)} onChange={() => setIds((x) => (x.includes(m._id) ? x.filter((v) => v !== m._id) : [...x, m._id]))} />
        ))}
      </div>
    </Modal>
  );
};

/** "Request Call Back" list for one job (opened from the row or from the notification link). */
const Callbacks = ({ jobId, onClose }) => {
  const q = useQuery({ queryKey: ['job-callbacks', jobId], queryFn: () => employerJobApi.callbacks(jobId, { limit: 100 }) });
  const rows = q.data?.data || [];
  return (
    <Modal open onClose={onClose} title="Call back requests" size="md">
      {q.isPending && <p className="text-sm text-brand-gray">Loading…</p>}
      {q.data && !rows.length && <EmptyState icon="phone_callback" title="No call back requests yet" />}
      <ul className="divide-y divide-brand-border">
        {rows.map((r) => (
          <li key={r._id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
            <span className="min-w-0">
              <span className="block font-medium text-brand-dark">{r.candidate?.fullName || 'Candidate'}</span>
              <span className="text-xs text-brand-gray-muted">{formatDate(r.createdAt, 'd MMM yyyy, h:mm a')}</span>
            </span>
            {r.candidate?.mobile && (
              <a href={`tel:+91${r.candidate.mobile}`} className="inline-flex items-center gap-1 font-semibold text-brand-blue">
                <Icon name="call" size={16} /> +91 {r.candidate.mobile}
              </a>
            )}
          </li>
        ))}
      </ul>
    </Modal>
  );
};

const Jobs = () => {
  useDocumentTitle('Jobs');
  const navigate = useNavigate();
  const [filters, setFilters] = useUrlFilters({ page: '1' });
  const { user } = useAuth();
  const team = useQuery({ queryKey: ['team', 'options'], queryFn: () => orgApi.team({ limit: 100 }), staleTime: 60 * 1000 });
  const postedByOptions = [
    { value: 'me', label: 'Posted by me' },
    ...(team.data?.data || []).filter((m) => String(m._id) !== String(user?._id)).map((m) => ({ value: m._id, label: m.fullName || m.email })),
  ];
  const [q, setQ] = useState(filters.q || '');
  const [confirm, setConfirm] = useState(null);
  const [sharing, setSharing] = useState(null);
  const fileRef = useRef(null);
  const debounced = useDebounce(q, 400);
  useEffect(() => {
    if (debounced !== (filters.q || '')) setFilters({ q: debounced });
  }, [debounced]); // eslint-disable-line react-hooks/exhaustive-deps
  const { callbacks: _cb, ...listFilters } = filters;
  const params = { limit: 20, sort: '-createdAt', ...listFilters };
  const query = useQuery({ queryKey: ['employer-jobs', params], queryFn: () => employerJobApi.list(params), placeholderData: keepPreviousData });
  const counts = query.data?.meta?.counts || {};
  const inv = { invalidate: ['employer-jobs'] };
  const close = useAction(employerJobApi.close, { ...inv, success: 'Job closed', onSuccess: () => setConfirm(null) });
  const trash = useAction(employerJobApi.trash, { ...inv, success: 'Job deleted', onSuccess: () => setConfirm(null) });
  const refresh = useAction(employerJobApi.refresh, { ...inv, success: 'Job refreshed' });
  const boost = useAction(employerJobApi.boost, { invalidate: ['employer-jobs', 'subscriptions'], success: 'Job boosted. It now shows at the top for 15 days', onSuccess: () => setConfirm(null) });
  const publish = useAction((id) => employerJobApi.publish(id), { ...inv, success: 'Job published', invalidate: ['employer-jobs', 'subscriptions'] });
  const duplicate = useAction(employerJobApi.duplicate, { success: 'Draft copy created', onSuccess: (j) => navigate(`/employer/jobs/${j._id}/edit`) });
  const bulk = useAction((file) => employerJobApi.bulkImport(file, false), { ...inv, success: (r) => `Imported ${r.created ?? r.imported ?? ''} jobs as drafts` });

  const columns = [
    {
      key: 'title',
      header: 'Job',
      render: (j) => (
        <Link to={`/employer/jobs/${j._id}/edit`} className="font-medium hover:text-brand-blue">
          {j.title}
          <span className="block text-xs font-normal text-brand-gray-muted">{formatLocations(j)}</span>
        </Link>
      ),
    },
    { key: 'kind', header: 'Type', render: (j) => <Badge tone={j.kind === 'internship' ? 'purple' : 'gray'}>{titleCase(j.kind)}</Badge> },
    {
      key: 'applications',
      header: 'Responses',
      render: (j) => (
        <Link to={`/employer/applications?job=${j._id}`} className="font-semibold text-brand-blue">
          {j.stats?.applications || 0}
        </Link>
      ),
    },
    { key: 'date', header: 'Posted', render: (j) => formatDate(j.publishedAt || j.createdAt) },
    {
      key: 'postedBy',
      header: 'Posted by',
      render: (j) => (String(j.postedBy?._id || j.postedBy) === String(user?._id) ? 'Me' : j.postedBy?.fullName || j.postedBy?.email || '—'),
    },
    { key: 'status', header: 'Status', render: (j) => <StatusBadge status={j.status} /> },
  ];
  const iconBtn = 'rounded p-1.5 text-brand-gray hover:bg-brand-tint hover:text-brand-blue';

  return (
    <div>
      <PageHeader
        title="Jobs"
        actions={
          <>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx"
              hidden
              onChange={(e) => {
                if (e.target.files?.[0]) bulk.mutate(e.target.files[0]);
                e.target.value = '';
              }}
            />
            <Button size="sm" variant="outline" loading={bulk.isPending} onClick={() => fileRef.current?.click()}>
              Bulk import
            </Button>
            <Button asChild size="sm" variant="primary">
              <Link to="/employer/jobs/post">Post a job</Link>
            </Button>
          </>
        }
      />
      <UpsellNotice error={publish.error || bulk.error || boost.error} />
      <Tabs className="mb-4" value={filters.status || ''} onChange={(status) => setFilters({ status })} tabs={STATUSES.map((s) => ({ value: s, label: s ? titleCase(s) : 'All', count: s ? counts[s] || 0 : undefined }))} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SearchInput className="w-full sm:max-w-xs" value={q} onChange={setQ} placeholder="Search title, job ID or client" />
        <SimpleSelect ariaLabel="Job or internship" placeholder="Jobs & internships" value={filters.kind} onChange={(kind) => setFilters({ kind })} options={KINDS} />
        <SimpleSelect ariaLabel="Posted by" placeholder="Posted by anyone" value={filters.postedBy} onChange={(postedBy) => setFilters({ postedBy })} options={postedByOptions} />
        <SimpleSelect ariaLabel="Sort by" value={filters.sort || '-createdAt'} onChange={(sort) => setFilters({ sort })} options={SORTS} />
      </div>
      <DataTable
        columns={columns}
        rows={query.data?.data}
        query={query}
        empty={
          <EmptyState
            icon="work"
            title="No jobs here"
            action={
              <Button asChild size="sm" variant="primaryBlue">
                <Link to="/employer/jobs/post">Post your first job</Link>
              </Button>
            }
          />
        }
        actions={(j) => (
          <span className="inline-flex items-center gap-0.5">
            {j.status === 'draft' && (
              <Button size="sm" variant="primaryBlue" onClick={() => publish.mutate(j._id)}>
                Publish
              </Button>
            )}
            {j.status === 'active' && (
              <button className={iconBtn} title="Refresh" aria-label="Refresh job" onClick={() => refresh.mutate(j._id)}>
                <Icon name="refresh" size={18} />
              </button>
            )}
            {j.status === 'active' &&
              (j.isFeatured ? (
                <span className="mx-1 inline-flex items-center gap-0.5 rounded-full bg-brand-orange-tint px-2 py-0.5 text-[11px] font-semibold text-brand-orange-dark" title={j.featuredUntil ? `Boosted till ${new Date(j.featuredUntil).toLocaleDateString()}` : 'Featured'}>
                  <Icon name="rocket_launch" size={13} /> Boosted
                </span>
              ) : (
                <button className={iconBtn} title="Boost job (1 featured credit)" aria-label="Boost job" onClick={() => setConfirm({ type: 'boost', job: j })}>
                  <Icon name="rocket_launch" size={18} />
                </button>
              ))}
            {j.callbackRequests > 0 && (
              <button className={`${iconBtn} relative`} title="Call back requests" aria-label={`${j.callbackRequests} call back requests`} onClick={() => setFilters({ callbacks: j._id })}>
                <Icon name="phone_callback" size={18} />
                <span className="absolute -right-0.5 -top-0.5 rounded-full bg-brand-orange px-1 text-[10px] font-bold text-white">{j.callbackRequests}</span>
              </button>
            )}
            <button className={iconBtn} title="Share with team" aria-label="Share with team" onClick={() => setSharing(j)}>
              <Icon name="group_add" size={18} />
            </button>
            <button className={iconBtn} title="Duplicate" aria-label="Duplicate job" onClick={() => duplicate.mutate(j._id)}>
              <Icon name="content_copy" size={18} />
            </button>
            {j.status === 'active' && <ShareMenu className={iconBtn} load={() => employerJobApi.share(j._id)} />}
            {j.status === 'active' && (
              <button className={iconBtn} title="Close" aria-label="Close job" onClick={() => setConfirm({ type: 'close', job: j })}>
                <Icon name="block" size={18} />
              </button>
            )}
            <button className={iconBtn} title="Delete" aria-label="Delete job" onClick={() => setConfirm({ type: 'trash', job: j })}>
              <Icon name="delete" size={18} />
            </button>
          </span>
        )}
      />
      <Pagination meta={query.data?.meta} onPage={(page) => setFilters({ page })} limit={filters.limit} onLimit={(limit) => setFilters({ limit })} />
      {sharing && <TeamShare job={sharing} onClose={() => setSharing(null)} />}
      {filters.callbacks && <Callbacks jobId={filters.callbacks} onClose={() => setFilters({ callbacks: '' })} />}
      <ConfirmDialog
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        title={confirm?.type === 'boost' ? 'Boost this job?' : confirm?.type === 'close' ? 'Close this job?' : 'Delete this job?'}
        message={confirm?.type === 'boost' ? `"${confirm.job.title}" moves to the top of search and featured slots for 15 days. Uses 1 featured job credit.` : confirm?.job?.title}
        danger={confirm?.type !== 'boost'}
        confirmLabel={confirm?.type === 'boost' ? 'Boost for 15 days' : confirm?.type === 'close' ? 'Close job' : 'Delete'}
        loading={close.isPending || trash.isPending || boost.isPending}
        onConfirm={() => ({ boost, close, trash })[confirm.type].mutate(confirm.job._id)}
      />
    </div>
  );
};

export default Jobs;
