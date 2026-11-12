import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { clsx } from 'clsx';
import Button from '../ui/Button';
import { Avatar } from '../ui/data';
import { Alert, CardSkeleton, EmptyState, ErrorState, Icon, Modal } from '../ui/feedback';
import { TextAreaField, TextField } from '../ui/form';
import useAuth, { useCan } from '../../hooks/useAuth';
import { useAction } from '../../hooks/useData';
import { orgApi, talentApi } from '../../services';

export const NAME_MAX = 60;
export const DESCRIPTION_MAX = 300;

const VISIBILITY = [
  { value: 'private', icon: 'lock', label: 'Only me', hint: 'A personal folder nobody else can open.' },
  { value: 'team', icon: 'groups', label: 'Whole team', hint: 'Every user of this account, including people added later.' },
  { value: 'selected', icon: 'person_add', label: 'Specific people', hint: 'Only the team members you choose.' },
];
const ACCESS = [
  { value: 'view', label: 'View only', hint: 'They can open the folder and the profiles in it.' },
  { value: 'edit', label: 'Can add and remove', hint: 'They can also add candidates to it and take them out.' },
];

/** "Private", "Team" or "3 people" chip with a matching icon. */
export const SharingBadge = ({ folder, className = '' }) => {
  const v = folder.visibility || 'private';
  const count = folder.sharedWith?.length || 0;
  const map = {
    private: { icon: 'lock', label: 'Private', tone: 'bg-brand-tint text-brand-gray' },
    team: { icon: 'groups', label: 'Whole team', tone: 'bg-brand-blue-tint text-brand-blue' },
    selected: { icon: 'group', label: `${count} ${count === 1 ? 'person' : 'people'}`, tone: 'bg-brand-blue-tint text-brand-blue' },
  };
  const m = map[v];
  return (
    <span className={clsx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold', m.tone, className)} title={v === 'selected' ? (folder.sharedWith || []).map((u) => u.fullName).join(', ') : undefined}>
      <Icon name={m.icon} size={13} /> {m.label}
      {v !== 'private' && folder.sharedAccess === 'edit' && <span className="font-medium opacity-80">· can edit</span>}
    </span>
  );
};

const RadioCard = ({ option, checked, onChange, name, disabled }) => (
  <label className={clsx('flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors', checked ? 'border-brand-blue bg-brand-blue-tint/50' : 'border-brand-border hover:border-brand-blue', disabled && 'cursor-not-allowed opacity-50')}>
    <input type="radio" name={name} className="mt-1 accent-[var(--color-brand-blue)]" checked={checked} disabled={disabled} onChange={() => onChange(option.value)} />
    <span className="min-w-0">
      <span className="flex items-center gap-1.5 text-sm font-semibold text-brand-dark">
        {option.icon && <Icon name={option.icon} size={16} className="text-brand-gray" />} {option.label}
      </span>
      <span className="mt-0.5 block text-xs text-brand-gray">{option.hint}</span>
    </span>
  </label>
);

/** Team member checklist with search and "select all". */
const MemberPicker = ({ value, onChange }) => {
  const { user } = useAuth();
  const [term, setTerm] = useState('');
  const team = useQuery({ queryKey: ['team', ''], queryFn: () => orgApi.team({}) });
  const members = useMemo(() => (team.data?.data || []).filter((m) => String(m._id) !== String(user?._id) && m.status === 'active'), [team.data, user]);
  const shown = members.filter((m) => !term.trim() || `${m.fullName} ${m.email} ${m.employer?.designation || ''}`.toLowerCase().includes(term.trim().toLowerCase()));
  const toggle = (id) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  const allShown = shown.length > 0 && shown.every((m) => value.includes(String(m._id)));

  if (team.isPending) return <CardSkeleton count={1} />;
  if (team.isError) return <ErrorState error={team.error} onRetry={team.refetch} />;
  if (!members.length) return <EmptyState icon="group" title="No other users on this account yet" description="Add users from the Team page, then share folders with them." />;
  return (
    <div className="rounded-lg border border-brand-border">
      <div className="flex items-center gap-2 border-b border-brand-border p-2">
        <div className="relative min-w-0 flex-1">
          <Icon name="search" size={16} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-brand-gray-muted" />
          <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search team members" aria-label="Search team members" className="h-9 w-full rounded-md border border-brand-border pl-8 pr-2 text-sm outline-none focus:border-brand-blue" />
        </div>
        <button type="button" className="shrink-0 px-1 text-xs font-semibold text-brand-blue" onClick={() => onChange(allShown ? value.filter((id) => !shown.some((m) => String(m._id) === id)) : [...new Set([...value, ...shown.map((m) => String(m._id))])])}>
          {allShown ? 'Clear all' : 'Select all'}
        </button>
      </div>
      <ul className="max-h-52 divide-y divide-brand-border overflow-y-auto">
        {shown.map((m) => {
          const id = String(m._id);
          return (
            <li key={id}>
              <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-brand-tint">
                <input type="checkbox" className="accent-[var(--color-brand-blue)]" checked={value.includes(id)} onChange={() => toggle(id)} />
                <Avatar name={m.fullName} src={m.avatar?.url} size={30} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-brand-dark">{m.fullName}</span>
                  <span className="block truncate text-xs text-brand-gray-muted">{m.employer?.designation || m.email}</span>
                </span>
              </label>
            </li>
          );
        })}
        {!shown.length && <li className="px-3 py-4 text-center text-sm text-brand-gray">No team member matches "{term}"</li>}
      </ul>
      <p className="border-t border-brand-border px-3 py-1.5 text-xs text-brand-gray-muted">{value.length} selected</p>
    </div>
  );
};

/**
 * Create a folder, or edit one. `focus="share"` opens straight on the sharing part.
 * `candidateIds` files those candidates into the new folder in the same step.
 */
export const FolderFormModal = ({ folder, candidateIds, focus, onClose, onSaved }) => {
  const editing = Boolean(folder?._id);
  const can = useCan();
  const canShare = can('saved_candidates.share');
  const [form, setForm] = useState({
    name: folder?.name || '',
    description: folder?.description || '',
    visibility: folder?.visibility || 'private',
    sharedAccess: folder?.sharedAccess || 'view',
    sharedWith: (folder?.sharedWith || []).map((u) => String(u._id || u)),
  });
  const [errors, setErrors] = useState({});
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v?.target ? v.target.value : v }));

  const save = useAction(
    () => {
      const body = {
        name: form.name.trim(),
        description: form.description.trim(),
        ...(canShare ? { visibility: form.visibility, sharedAccess: form.sharedAccess, ...(form.visibility === 'selected' ? { sharedWith: form.sharedWith } : {}) } : {}),
      };
      return editing ? talentApi.updateFolder(folder._id, body) : talentApi.addFolder({ ...body, ...(candidateIds?.length ? { candidateIds } : {}) });
    },
    {
      silent: true,
      invalidate: ['folders', 'folder'],
      success: editing ? 'Folder updated' : candidateIds?.length ? `Folder created with ${candidateIds.length} candidate${candidateIds.length === 1 ? '' : 's'}` : 'Folder created',
      onSuccess: (saved) => {
        onSaved?.(saved);
        onClose();
      },
      onError: (e) => setErrors(e.code === 'FOLDER_EXISTS' ? { name: e.message } : e.code === 'SHARE_NEEDS_MEMBERS' ? { sharedWith: e.message } : { ...e.fieldErrors, form: Object.keys(e.fieldErrors || {}).length ? '' : e.message }),
    },
  );

  const submit = (e) => {
    e.preventDefault();
    const next = {};
    const name = form.name.trim();
    if (name.length < 2) next.name = 'Give the folder a name (at least 2 characters)';
    if (canShare && form.visibility === 'selected' && !form.sharedWith.length) next.sharedWith = 'Choose at least one team member, or pick another sharing option';
    setErrors(next);
    if (!Object.keys(next).length) save.mutate();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? (focus === 'share' ? 'Share folder' : 'Edit folder') : 'Create folder'}
      subtitle={editing ? folder.name : candidateIds?.length ? `${candidateIds.length} selected candidate${candidateIds.length === 1 ? '' : 's'} will be added to it` : 'Group candidates you want to come back to'}
      size="lg"
      footer={
        <>
          <Button size="sm" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="folder-form" size="sm" variant="primaryBlue" loading={save.isPending}>
            {editing ? 'Save changes' : 'Create folder'}
          </Button>
        </>
      }
    >
      <form id="folder-form" className="space-y-5" onSubmit={submit} noValidate>
        {errors.form && <Alert tone="error">{errors.form}</Alert>}
        {focus !== 'share' && (
          <div className="space-y-4">
            <TextField
              label="Folder name"
              required
              autoFocus
              maxLength={NAME_MAX}
              value={form.name}
              onChange={set('name')}
              error={errors.name}
              placeholder="e.g. Sales executives - Jaipur"
              hint={`${form.name.length}/${NAME_MAX}`}
            />
            <TextAreaField label="Description" rows={2} maxLength={DESCRIPTION_MAX} value={form.description} onChange={set('description')} error={errors.description} placeholder="What is this folder for? (optional)" hint={`${form.description.length}/${DESCRIPTION_MAX}`} />
          </div>
        )}
        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-brand-dark">Who can open this folder?</legend>
          {!canShare && (
            <Alert tone="info" className="mb-2">
              Your team role keeps folders private. Ask your account admin for the "share saved candidates" permission to share them.
            </Alert>
          )}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {VISIBILITY.map((o) => (
              <RadioCard key={o.value} name="visibility" option={o} checked={form.visibility === o.value} disabled={!canShare && o.value !== 'private'} onChange={set('visibility')} />
            ))}
          </div>
        </fieldset>
        {canShare && form.visibility === 'selected' && (
          <div>
            <p className="mb-2 text-sm font-semibold text-brand-dark">Share with</p>
            <MemberPicker value={form.sharedWith} onChange={set('sharedWith')} />
            {errors.sharedWith && (
              <p className="mt-1 text-xs text-brand-red" role="alert">
                {errors.sharedWith}
              </p>
            )}
          </div>
        )}
        {canShare && form.visibility !== 'private' && (
          <fieldset>
            <legend className="mb-2 text-sm font-semibold text-brand-dark">What can they do?</legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {ACCESS.map((o) => (
                <RadioCard key={o.value} name="sharedAccess" option={o} checked={form.sharedAccess === o.value} onChange={set('sharedAccess')} />
              ))}
            </div>
            <p className="mt-2 text-xs text-brand-gray-muted">Only you can rename, share or delete this folder.</p>
          </fieldset>
        )}
      </form>
    </Modal>
  );
};

/** Folder list to pick from (my folders plus shared ones I may add to), with search. */
const FolderPicker = ({ value, onChange, exclude }) => {
  const { user } = useAuth();
  const mine = (f) => String(f.owner?._id) === String(user?._id);
  const [term, setTerm] = useState('');
  const query = useQuery({ queryKey: ['folders', 'pick'], queryFn: () => talentApi.folders({ tab: 'all', sort: '-updatedAt', limit: 200 }) });
  const folders = (query.data?.folders || []).filter((f) => f.access !== 'view' && String(f._id) !== String(exclude));
  const shown = folders.filter((f) => !term.trim() || f.name.toLowerCase().includes(term.trim().toLowerCase()));
  if (query.isPending) return <CardSkeleton count={1} />;
  if (query.isError) return <ErrorState error={query.error} onRetry={query.refetch} />;
  if (!folders.length) return <p className="rounded-lg border border-dashed border-brand-border px-3 py-4 text-center text-sm text-brand-gray">You have no folders yet. Create one below.</p>;
  return (
    <div className="rounded-lg border border-brand-border">
      {folders.length > 6 && (
        <div className="relative border-b border-brand-border p-2">
          <Icon name="search" size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-brand-gray-muted" />
          <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search folders" aria-label="Search folders" className="h-9 w-full rounded-md border border-brand-border pl-8 pr-2 text-sm outline-none focus:border-brand-blue" />
        </div>
      )}
      <ul className="max-h-56 divide-y divide-brand-border overflow-y-auto" role="radiogroup" aria-label="Folder">
        {shown.map((f) => (
          <li key={f._id}>
            <label className={clsx('flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-brand-tint', value === f._id && 'bg-brand-blue-tint/50')}>
              <input type="radio" name="target-folder" className="accent-[var(--color-brand-blue)]" checked={value === f._id} onChange={() => onChange(f._id)} />
              <Icon name={mine(f) ? 'folder' : 'folder_shared'} size={20} className="shrink-0 text-brand-blue" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-brand-dark">{f.name}</span>
                <span className="block truncate text-xs text-brand-gray-muted">
                  {f.count} profile{f.count === 1 ? '' : 's'}
                  {!mine(f) && f.owner?.fullName ? ` · by ${f.owner.fullName}` : ''}
                </span>
              </span>
            </label>
          </li>
        ))}
        {!shown.length && <li className="px-3 py-4 text-center text-sm text-brand-gray">No folder matches "{term}"</li>}
      </ul>
    </div>
  );
};

/**
 * Put candidates into a folder. Without `fromFolder` it adds them (search results, profile page);
 * with it, it copies or moves them from that folder to another one.
 */
export const AddToFolderModal = ({ ids, fromFolder, move = false, onClose, onDone }) => {
  const [target, setTarget] = useState('');
  const [creating, setCreating] = useState(false);
  const n = ids.length;
  const verb = fromFolder ? (move ? 'Move' : 'Copy') : 'Add';
  const run = useAction(() => (fromFolder ? talentApi.transfer(fromFolder, { candidateIds: ids, targetFolderId: target, move }) : talentApi.addToFolder(target, ids)), {
    invalidate: ['folders', 'folder'],
    success: (r) => {
      const added = r?.added ?? n;
      const skipped = r?.alreadyThere ? ` (${r.alreadyThere} already there)` : '';
      return fromFolder ? `${move ? 'Moved' : 'Copied'} ${added} candidate${added === 1 ? '' : 's'}${skipped}` : `Added ${added} candidate${added === 1 ? '' : 's'}${skipped}`;
    },
    onSuccess: (r) => {
      onDone?.(r);
      onClose();
    },
  });
  if (creating) {
    return (
      <FolderFormModal
        candidateIds={fromFolder ? undefined : ids}
        onClose={() => setCreating(false)}
        onSaved={(folder) => {
          if (!fromFolder) {
            onDone?.(folder);
            onClose();
          } else setTarget(folder._id);
        }}
      />
    );
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={`${verb} to folder`}
      subtitle={`${n} candidate${n === 1 ? '' : 's'} selected`}
      size="sm"
      footer={
        <>
          <Button size="sm" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" variant="primaryBlue" disabled={!target} loading={run.isPending} onClick={() => run.mutate()}>
            {verb}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <FolderPicker value={target} onChange={setTarget} exclude={fromFolder} />
        <button type="button" onClick={() => setCreating(true)} className="flex w-full items-center gap-2 rounded-lg border border-dashed border-brand-blue/50 px-3 py-2.5 text-sm font-semibold text-brand-blue hover:bg-brand-blue-tint">
          <Icon name="create_new_folder" size={18} /> Create a new folder
        </button>
      </div>
    </Modal>
  );
};
