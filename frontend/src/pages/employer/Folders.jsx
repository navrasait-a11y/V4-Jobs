import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { clsx } from 'clsx';
import Button from '../../components/ui/Button';
import { Avatar, Pagination, SearchInput, SimpleSelect, Tabs } from '../../components/ui/data';
import { CardSkeleton, ConfirmDialog, EmptyState, ErrorState, Icon } from '../../components/ui/feedback';
import { AddToFolderModal, FolderFormModal, SharingBadge } from '../../components/employer/folders';
import { useCan } from '../../hooks/useAuth';
import { useAction, useDocumentTitle } from '../../hooks/useData';
import useDebounce from '../../hooks/useDebounce';
import { talentApi } from '../../services';
import { formatCurrency, formatDate, monthsToExperience, timeAgo, titleCase } from '../../utils/format';

const SORTS = [
  { value: '-updatedAt', label: 'Recently updated' },
  { value: '-createdAt', label: 'Newest first' },
  { value: 'name', label: 'Name (A to Z)' },
  { value: '-name', label: 'Name (Z to A)' },
  { value: '-count', label: 'Most profiles' },
];
const SYSTEM = {
  accessed: { icon: 'visibility', label: 'Accessed', hint: 'Profiles your team opened' },
  commented: { icon: 'comment', label: 'Commented', hint: 'Profiles with a comment' },
  contacted: { icon: 'call', label: 'Contacted', hint: 'Called, e-mailed or messaged' },
  shortlisted: { icon: 'thumb_up', label: 'Shortlisted', hint: 'Screening status: shortlisted' },
  rejected: { icon: 'thumb_down', label: 'Rejected', hint: 'Screening status: rejected' },
  hold: { icon: 'pause_circle', label: 'On hold', hint: 'Screening status: on hold' },
};

/** Small "…" menu for row actions; closes on outside click and Escape. */
const RowMenu = ({ items, label }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => (e.type === 'keydown' ? e.key === 'Escape' : !ref.current?.contains(e.target)) && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button type="button" aria-haspopup="menu" aria-expanded={open} aria-label={label} onClick={() => setOpen((o) => !o)} className="flex h-9 w-9 items-center justify-center rounded-full text-brand-gray hover:bg-brand-tint">
        <Icon name="more_vert" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-10 z-30 w-44 overflow-hidden rounded-lg border border-brand-border bg-white py-1 shadow-[var(--shadow-modal)]">
          {items.map((it) => (
            <button
              key={it.label}
              role="menuitem"
              type="button"
              onClick={() => {
                setOpen(false);
                it.onClick();
              }}
              className={clsx('flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-brand-tint', it.danger ? 'text-brand-red' : 'text-brand-dark')}
            >
              <Icon name={it.icon} size={17} /> {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const People = ({ users = [], max = 3 }) => (
  <span className="flex items-center">
    {users.slice(0, max).map((u, i) => (
      <span key={u._id} className={clsx('rounded-full ring-2 ring-white', i && '-ml-2')} title={u.fullName}>
        <Avatar name={u.fullName} src={u.avatar} size={24} />
      </span>
    ))}
    {users.length > max && <span className="ml-1 text-xs text-brand-gray-muted">+{users.length - max}</span>}
  </span>
);

const FolderRow = ({ folder, onEdit, onShare, onDelete }) => {
  const owner = folder.access === 'owner';
  const to = `/employer/folders/${folder._id}`;
  return (
    <li className="group flex items-start gap-3 px-4 py-3 hover:bg-brand-tint/60 sm:items-center sm:gap-4">
      <Link to={to} className="hidden h-11 w-11 shrink-0 items-center min-[400px]:flex justify-center rounded-lg bg-brand-blue-tint text-brand-blue" tabIndex={-1} aria-hidden="true">
        <Icon name={owner && folder.visibility === 'private' ? 'folder' : 'folder_shared'} size={24} fill />
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Link to={to} className="line-clamp-2 break-words text-[15px] font-semibold text-brand-dark hover:text-brand-blue sm:line-clamp-1">
            {folder.name}
          </Link>
          <SharingBadge folder={folder} />
          {folder.access === 'view' && <span className="rounded-full bg-brand-tint px-2 py-0.5 text-[11px] font-semibold text-brand-gray">View only</span>}
        </div>
        {folder.description && <p className="mt-0.5 line-clamp-1 text-xs text-brand-gray">{folder.description}</p>}
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-brand-gray-muted">
          <span className="font-semibold text-brand-dark">
            {folder.count} profile{folder.count === 1 ? '' : 's'}
          </span>
          <span>By {folder.owner?.fullName || 'a team member'}</span>
          <span>Updated {timeAgo(folder.updatedAt)}</span>
          <span className="hidden sm:inline">Created {formatDate(folder.createdAt)}</span>
        </p>
      </div>
      {folder.visibility === 'selected' && folder.sharedWith?.length > 0 && (
        <div className="hidden lg:block">
          <People users={folder.sharedWith} />
        </div>
      )}
      <span className="hidden sm:block">
        <Button asChild size="sm" variant="outline">
          <Link to={to}>Open</Link>
        </Button>
      </span>
      {owner && (
        <RowMenu
          label={`Actions for ${folder.name}`}
          items={[
            { icon: 'edit', label: 'Rename / edit', onClick: () => onEdit(folder) },
            { icon: 'share', label: 'Share', onClick: () => onShare(folder) },
            { icon: 'delete', label: 'Delete', danger: true, onClick: () => onDelete(folder) },
          ]}
        />
      )}
    </li>
  );
};

/** Folders list: system folders, my folders, shared with me. Lives in the "Saved searches & folders" page. */
export const FoldersTab = ({ span }) => {
  const can = useCan();
  const canCreate = can('folder.manage_own', 'folder.manage_all');
  const manageAll = can('folder.manage_all');
  const [tab, setTab] = useState('mine');
  const [term, setTerm] = useState('');
  const [sort, setSort] = useState('-updatedAt');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [form, setForm] = useState(null); // { folder?, focus? }
  const [deleting, setDeleting] = useState(null);
  const q = useDebounce(term, 350);
  useEffect(() => setPage(1), [tab, q, sort, limit, span]);

  const params = { tab, q: q || undefined, sort, page, limit, ...span };
  const query = useQuery({ queryKey: ['folders', params], queryFn: () => talentApi.folders(params), placeholderData: keepPreviousData });
  const remove = useAction((id) => talentApi.removeFolder(id), { success: 'Folder deleted', invalidate: ['folders'], onSuccess: () => setDeleting(null) });
  const data = query.data;
  const folders = data?.folders || [];
  const filtered = Boolean(q) || Object.keys(span || {}).length > 0;

  return (
    <div className="space-y-5">
      <section aria-label="Smart folders">
        <h2 className="mb-2 text-sm font-bold text-brand-dark">Smart folders</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {Object.entries(SYSTEM).map(([key, s]) => (
            <Link key={key} to={`/employer/folders/system/${key}`} className="surface block p-3 transition-colors hover:border-brand-blue" title={s.hint}>
              <span className="flex items-center gap-1.5 text-xs font-medium text-brand-gray">
                <Icon name={s.icon} size={16} /> <span className="truncate">{s.label}</span>
              </span>
              <span className="mt-1 block text-xl font-bold text-brand-dark">{data ? (data.system?.[key] ?? 0).toLocaleString('en-IN') : '–'}</span>
            </Link>
          ))}
        </div>
      </section>

      <section aria-label="Folders">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <Tabs
            value={tab}
            onChange={setTab}
            tabs={[
              { value: 'mine', label: 'My folders', count: data?.counts?.mine },
              { value: 'shared', label: 'Shared with me', count: data?.counts?.shared },
              ...(manageAll ? [{ value: 'all', label: 'All team folders' }] : []),
            ]}
          />
          {canCreate && (
            <Button size="sm" variant="primaryBlue" leftIcon={<Icon name="create_new_folder" size={17} />} onClick={() => setForm({})}>
              Create folder
            </Button>
          )}
        </div>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <SearchInput className="min-w-[200px] flex-1" value={term} onChange={setTerm} placeholder="Search folders by name" />
          <SimpleSelect ariaLabel="Sort folders" value={sort} onChange={(v) => setSort(v || '-updatedAt')} options={SORTS} placeholder={null} />
        </div>

        {query.isPending && <CardSkeleton count={3} />}
        {query.isError && <ErrorState error={query.error} onRetry={query.refetch} />}
        {data && !folders.length && (
          <EmptyState
            icon={filtered ? 'search_off' : tab === 'shared' ? 'folder_shared' : 'create_new_folder'}
            title={filtered ? 'No folder matches your search' : tab === 'shared' ? 'Nothing is shared with you yet' : 'No folders yet'}
            description={filtered ? 'Try a different name or clear the date filter.' : tab === 'shared' ? 'Folders that teammates share with you show up here.' : 'Create a folder to keep the candidates you like in one place, then share it with your team.'}
            action={
              !filtered && tab !== 'shared' && canCreate ? (
                <Button size="sm" variant="primaryBlue" onClick={() => setForm({})}>
                  Create your first folder
                </Button>
              ) : undefined
            }
          />
        )}
        {folders.length > 0 && (
          <ul className={clsx('surface divide-y divide-brand-border', query.isPlaceholderData && 'opacity-60')}>
            {folders.map((f) => (
              <FolderRow key={f._id} folder={f} onEdit={(folder) => setForm({ folder })} onShare={(folder) => setForm({ folder, focus: 'share' })} onDelete={setDeleting} />
            ))}
          </ul>
        )}
        {data && <Pagination meta={{ page: data.page, total: data.total, limit: data.limit, totalPages: Math.ceil(data.total / data.limit) }} onPage={setPage} limit={limit} onLimit={setLimit} />}
      </section>

      {form && <FolderFormModal folder={form.folder} focus={form.focus} onClose={() => setForm(null)} />}
      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title={`Delete "${deleting?.name}"?`}
        message={`The folder and its list of ${deleting?.count || 0} profile${deleting?.count === 1 ? '' : 's'} are removed for everyone it is shared with. The candidates themselves are not deleted.`}
        danger
        confirmLabel="Delete folder"
        loading={remove.isPending}
        onConfirm={() => remove.mutate(deleting._id)}
      />
    </div>
  );
};

const CandidateRow = ({ c, selectable, checked, onToggle, onRemove }) => {
  const id = c.candidateId || c._id;
  const facts = [c.currentJobTitle, c.currentEmployer, c.totalExperienceMonths !== undefined && c.totalExperienceMonths !== null ? monthsToExperience(c.totalExperienceMonths) : '', c.currentLocation?.city, c.currentSalary ? `${formatCurrency(c.currentSalary)}/mo` : ''].filter(Boolean);
  return (
    <li className="flex items-start gap-3 px-4 py-3 hover:bg-brand-tint/60">
      {selectable && <input type="checkbox" className="mt-3 accent-[var(--color-brand-blue)]" checked={checked} onChange={() => onToggle(String(id))} aria-label={`Select ${c.name}`} />}
      <Avatar name={c.name} src={c.avatar} size={40} />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2">
          <Link to={`/employer/candidates/${id}`} className="truncate text-sm font-semibold text-brand-dark hover:text-brand-blue">
            {c.name}
          </Link>
          {c.isVerified && <Icon name="verified" size={15} fill className="text-brand-green" />}
          {c.tracking?.screeningStatus && <span className="rounded-full bg-brand-tint px-2 py-0.5 text-[11px] font-semibold text-brand-gray">{titleCase(c.tracking.screeningStatus)}</span>}
        </p>
        {facts.length > 0 && <p className="mt-0.5 line-clamp-1 text-xs text-brand-gray">{facts.join(' · ')}</p>}
        <p className="mt-0.5 text-xs text-brand-gray-muted">
          {c.addedAt ? `Added ${timeAgo(c.addedAt)}${c.addedBy ? ` by ${c.addedBy}` : ''}` : c.lastActiveAt ? `Active ${timeAgo(c.lastActiveAt)}` : ''}
        </p>
      </div>
      <span className="hidden sm:block">
        <Button asChild size="sm" variant="outline">
          <Link to={`/employer/candidates/${id}`}>View profile</Link>
        </Button>
      </span>
      {onRemove && (
        <button type="button" aria-label={`Remove ${c.name} from folder`} title="Remove from folder" onClick={() => onRemove(String(id))} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-brand-gray-muted hover:bg-red-50 hover:text-brand-red">
          <Icon name="close" size={18} />
        </button>
      )}
    </li>
  );
};

/** One folder: who can see it, the candidates in it, and copy / move / remove. Also renders the smart folders. */
export const FolderPage = () => {
  const { id, key } = useParams();
  const navigate = useNavigate();
  const system = key ? SYSTEM[key] : null;
  const [term, setTerm] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [selected, setSelected] = useState([]);
  const [form, setForm] = useState(null);
  const [transfer, setTransfer] = useState(null); // { move }
  const [confirm, setConfirm] = useState(null); // { ids } | 'delete'
  const q = useDebounce(term, 350);
  useEffect(() => {
    setPage(1);
    setSelected([]);
  }, [q, limit, id, key]);

  const details = useQuery({ queryKey: ['folder', 'details', id], queryFn: () => talentApi.folderDetails(id), enabled: Boolean(id), retry: false });
  const list = useQuery({
    queryKey: ['folder', key || id, { page, limit, q }],
    queryFn: () => (key ? talentApi.systemFolder(key, { page, limit }) : talentApi.folder(id, { page, limit, q: q || undefined })),
    placeholderData: keepPreviousData,
    enabled: Boolean(system || id),
    retry: false,
  });
  const folder = details.data;
  useDocumentTitle(system?.label || folder?.name || 'Folder');

  const done = { invalidate: ['folder', 'folders'] };
  const remove = useAction((ids) => talentApi.removeFromFolder(id, ids), {
    ...done,
    success: (r) => `Removed ${r?.removed ?? ''} candidate${r?.removed === 1 ? '' : 's'} from the folder`.replace('  ', ' '),
    onSuccess: () => {
      setSelected([]);
      setConfirm(null);
    },
  });
  const del = useAction(() => talentApi.removeFolder(id), { success: 'Folder deleted', invalidate: ['folders'], onSuccess: () => navigate('/employer/saved-searches?tab=folders', { replace: true }) });

  const back = (
    <Link to="/employer/saved-searches?tab=folders" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-brand-blue">
      <Icon name="arrow_back" size={17} /> All folders
    </Link>
  );
  if (key && !system) return <div>{back}<EmptyState icon="folder_off" title="This folder does not exist" /></div>;
  if (id && details.isError) {
    const gone = [403, 404].includes(details.error.status);
    return (
      <div>
        {back}
        {gone ? <EmptyState icon="folder_off" title="You cannot open this folder" description="It was deleted, or it is no longer shared with you." /> : <ErrorState error={details.error} onRetry={details.refetch} />}
      </div>
    );
  }

  const rows = list.data?.data || [];
  const meta = list.data?.meta;
  const owner = folder?.access === 'owner';
  const canEdit = owner || folder?.access === 'edit';
  const pageIds = rows.map((c) => String(c.candidateId || c._id));
  const allPicked = pageIds.length > 0 && pageIds.every((x) => selected.includes(x));
  const toggle = (cid) => setSelected((s) => (s.includes(cid) ? s.filter((x) => x !== cid) : [...s, cid]));

  return (
    <div>
      {back}
      <header className="surface mb-4 p-4 sm:p-5">
        {id && details.isPending ? (
          <CardSkeleton count={1} />
        ) : (
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-blue-tint text-brand-blue">
                <Icon name={system ? system.icon : folder.visibility === 'private' ? 'folder' : 'folder_shared'} size={26} fill={!system} />
              </span>
              <div className="min-w-0">
                <h1 className="flex flex-wrap items-center gap-2 text-xl font-bold text-brand-dark">
                  <span className="break-words">{system ? system.label : folder.name}</span>
                  {folder && <SharingBadge folder={folder} />}
                  {folder?.access === 'view' && <span className="rounded-full bg-brand-tint px-2 py-0.5 text-[11px] font-semibold text-brand-gray">View only</span>}
                </h1>
                <p className="mt-1 text-sm text-brand-gray">{system ? `${system.hint}. Updated automatically.` : folder.description || 'No description'}</p>
                {folder && (
                  <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-brand-gray-muted">
                    <span>
                      <b className="text-brand-dark">{folder.count.toLocaleString('en-IN')}</b> of {folder.capacity.toLocaleString('en-IN')} profiles
                    </span>
                    <span>Owner: {folder.owner?.fullName || '—'}</span>
                    <span>Created {formatDate(folder.createdAt)}</span>
                    <span>Updated {timeAgo(folder.updatedAt)}</span>
                  </p>
                )}
                {folder?.visibility === 'selected' && folder.sharedWith.length > 0 && (
                  <p className="mt-2 flex items-center gap-2 text-xs text-brand-gray">
                    Shared with <People users={folder.sharedWith} max={5} />
                  </p>
                )}
              </div>
            </div>
            {owner && (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" leftIcon={<Icon name="share" size={16} />} onClick={() => setForm({ focus: 'share' })}>
                  Share
                </Button>
                <Button size="sm" variant="outline" leftIcon={<Icon name="edit" size={16} />} onClick={() => setForm({})}>
                  Edit
                </Button>
                <Button size="sm" variant="dangerGhost" leftIcon={<Icon name="delete" size={16} />} onClick={() => setConfirm('delete')}>
                  Delete
                </Button>
              </div>
            )}
          </div>
        )}
      </header>

      {id && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <SearchInput className="min-w-[200px] flex-1" value={term} onChange={setTerm} placeholder="Search candidates in this folder by name" />
          <Button asChild size="sm" variant="outline" leftIcon={<Icon name="person_search" size={16} />}>
            <Link to="/employer/candidates">Find more candidates</Link>
          </Button>
        </div>
      )}

      {id && rows.length > 0 && (
        <div className={clsx('sticky top-0 z-20 mb-2 flex flex-wrap items-center gap-2 rounded-lg border p-2.5 text-sm', selected.length ? 'border-brand-blue/30 bg-brand-blue-tint shadow-sm' : 'border-brand-border bg-white')}>
          <label className="flex cursor-pointer items-center gap-2 font-medium text-brand-dark">
            <input type="checkbox" className="accent-[var(--color-brand-blue)]" checked={allPicked} onChange={() => setSelected(allPicked ? selected.filter((x) => !pageIds.includes(x)) : [...new Set([...selected, ...pageIds])])} />
            {selected.length ? `${selected.length} selected` : 'Select all on this page'}
          </label>
          {selected.length > 0 && (
            <>
              <Button size="sm" variant="outline" leftIcon={<Icon name="content_copy" size={15} />} onClick={() => setTransfer({ move: false })}>
                Copy to folder
              </Button>
              {canEdit && (
                <>
                  <Button size="sm" variant="outline" leftIcon={<Icon name="drive_file_move" size={15} />} onClick={() => setTransfer({ move: true })}>
                    Move to folder
                  </Button>
                  <Button size="sm" variant="dangerGhost" leftIcon={<Icon name="playlist_remove" size={16} />} onClick={() => setConfirm({ ids: selected })}>
                    Remove
                  </Button>
                </>
              )}
              <button type="button" className="ml-auto text-xs font-semibold text-brand-blue underline" onClick={() => setSelected([])}>
                Clear
              </button>
            </>
          )}
        </div>
      )}

      {list.isPending && <CardSkeleton count={4} />}
      {list.isError && !details.isError && <ErrorState error={list.error} onRetry={list.refetch} />}
      {list.data && !rows.length && (
        <EmptyState
          icon={q ? 'search_off' : 'group_add'}
          title={q ? `No candidate in this folder matches "${q}"` : 'No candidates here yet'}
          description={q ? 'Check the spelling or clear the search.' : system ? 'Candidates appear here automatically as your team works on them.' : 'Search the resume database and use "Add to folder" on the profiles you like.'}
          action={
            !q && !system ? (
              <Button asChild size="sm" variant="primaryBlue">
                <Link to="/employer/candidates">Search candidates</Link>
              </Button>
            ) : undefined
          }
        />
      )}
      {rows.length > 0 && (
        <ul className={clsx('surface divide-y divide-brand-border', list.isPlaceholderData && 'opacity-60')}>
          {rows.map((c) => (
            <CandidateRow key={c.candidateId || c._id} c={c} selectable={Boolean(id)} checked={selected.includes(String(c.candidateId || c._id))} onToggle={toggle} onRemove={id && canEdit ? (cid) => setConfirm({ ids: [cid] }) : undefined} />
          ))}
        </ul>
      )}
      <Pagination meta={meta} onPage={setPage} limit={limit} onLimit={setLimit} />

      {form && folder && <FolderFormModal folder={folder} focus={form.focus} onClose={() => setForm(null)} />}
      {transfer && <AddToFolderModal ids={selected} fromFolder={id} move={transfer.move} onClose={() => setTransfer(null)} onDone={() => setSelected([])} />}
      <ConfirmDialog
        open={Boolean(confirm?.ids)}
        onClose={() => setConfirm(null)}
        title={`Remove ${confirm?.ids?.length} candidate${confirm?.ids?.length === 1 ? '' : 's'} from this folder?`}
        message="They stay in the resume database and in any other folder. Only this folder's list changes."
        danger
        confirmLabel="Remove"
        loading={remove.isPending}
        onConfirm={() => remove.mutate(confirm.ids)}
      />
      <ConfirmDialog
        open={confirm === 'delete'}
        onClose={() => setConfirm(null)}
        title={`Delete "${folder?.name}"?`}
        message="The folder is removed for everyone it is shared with. The candidates themselves are not deleted."
        danger
        confirmLabel="Delete folder"
        loading={del.isPending}
        onConfirm={() => del.mutate()}
      />
    </div>
  );
};

export default FolderPage;
