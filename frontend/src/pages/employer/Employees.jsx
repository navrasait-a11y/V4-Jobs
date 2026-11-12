import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import Button from '../../components/ui/Button';
import { Avatar, Badge, DataTable, PageHeader, SearchInput, SimpleSelect, StatusBadge, Tabs } from '../../components/ui/data';
import { Alert, ConfirmDialog, EmptyState, Icon, Modal } from '../../components/ui/feedback';
import { CheckboxField, MobileField, PasswordField, SelectField, SuggestField, TextField } from '../../components/ui/form';
import useAuth from '../../hooks/useAuth';
import useDebounce from '../../hooks/useDebounce';
import { useAction, useDocumentTitle, useUrlFilters } from '../../hooks/useData';
import { orgApi } from '../../services';
import { formatDateTime, formatNumber, titleCase } from '../../utils/format';

/*
 * Account members, permissions, limits and usage, following the "Add / Edit Account Members &
 * Permissions, Usage Analytics" columns of the client's Excel. Up to 50 users per account.
 */

const MAX_USERS = 50;
const USERNAME = /^(?!_)[A-Za-z0-9_]{3,30}(?<!_)$/;
const ROLES = ['employer_admin', 'manager', 'team_lead', 'recruiter'].map((value) => ({ value, label: titleCase(value) }));

const PERMISSION_GROUPS = [
  ['Jobs', [['job.post', 'Post new job'], ['job.manage_all', 'Manage all jobs'], ['job.manage_own', 'Manage own jobs only'], ['job.share_internal', 'Share / copy jobs with other internal users']]],
  [
    'Applicant responses',
    [
      ['response.manage_all', 'Manage all applicants responses'],
      ['response.manage_own', 'Manage own applicants responses only'],
      ['response.export_all', 'All applicants responses data in Excel download'],
      ['response.export_own', 'Own applicants responses data in Excel download'],
      ['resume.bulk_download', 'Bulk resume download'],
      ['data.bulk_excel_download', 'Bulk data in Excel download'],
    ],
  ],
  ['Candidates', [['candidate.search', 'Candidate search'], ['candidate.invite', 'Invite candidates'], ['email.own_only', 'Own emails only']]],
  [
    'Saved items and sharing',
    [
      ['saved_candidates.manage_all', 'Manage all saved candidates'],
      ['saved_candidates.manage_own', 'Manage own saved candidates'],
      ['saved_candidates.share', 'Share saved candidates with other internal users'],
      ['saved_search.manage_all', 'Manage all saved searches'],
      ['saved_search.manage_own', 'Manage own saved searches'],
      ['saved_search.share', 'Share saved search folders with other internal users'],
      ['folder.manage_all', 'Manage all saved folders'],
      ['folder.manage_own', 'Manage own saved folders'],
    ],
  ],
  ['Meetings and events', [['meeting.manage_all', 'Manage all meetings'], ['meeting.manage_own', 'Manage own meetings'], ['event.manage', 'Manage job events']]],
  ['Account', [['team.manage', 'Add and manage users'], ['quota.manage', 'Set usage limits'], ['company.manage', 'Edit company profile'], ['billing.manage', 'Buy plans and manage billing']]],
];

/** Excel: "Set Daily, Weekly, Monthly ... Limit" for invites, resume views, resume downloads and Excel downloads. */
const LIMITS = [
  ['invite', 'Invites'],
  ['resume_view', 'Resume views'],
  ['resume_download', 'Resume downloads'],
  ['excel_download', 'Data in Excel downloads'],
];
const PERIODS = ['daily', 'weekly', 'monthly'];

/** Excel: "Account Member Usage Analytics". */
const USAGE = [
  ['resume_view', 'Profile number views'],
  ['resume_download', 'Resume downloads'],
  ['excel_download', 'Excel downloads'],
  ['job_post', 'Job posts'],
  ['invite', 'Invites used'],
  ['response_download_own', 'Own responses downloaded'],
  ['response_download_all', 'All responses downloaded'],
];

const Block = ({ title, hint, children }) => (
  <fieldset className="space-y-3">
    <legend className="mb-2 w-full border-b border-brand-border pb-2">
      <span className="text-sm font-semibold text-brand-dark">{title}</span>
      {hint && <span className="mt-0.5 block text-xs text-brand-gray-muted">{hint}</span>}
    </legend>
    {children}
  </fieldset>
);

/** `api` lets the admin panel save through its own routes: { addMember(body), updateMember(id, body) }. */
export const MemberModal = ({ member, onClose, api = orgApi, invalidate = ['team'] }) => {
  const editing = Boolean(member);
  const [form, setForm] = useState({
    fullName: member?.fullName || '',
    username: member?.username || '',
    email: member?.email || '',
    mobile: member?.mobile || '',
    password: '',
    confirm: '',
    designation: member?.employer?.designation || '',
    memberRole: member?.employer?.memberRole || 'recruiter',
  });
  const [custom, setCustom] = useState(Boolean(member?.employer?.permissions?.length));
  const [perms, setPerms] = useState(member?.employer?.permissions || []);
  const [limits, setLimits] = useState(() => Object.fromEntries(LIMITS.map(([k]) => [k, Object.fromEntries(PERIODS.map((p) => [p, member?.employer?.quotas?.[k]?.[p] ?? '']))])));
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? e.target.value : e }));
  const togglePerm = (key) => setPerms((p) => (p.includes(key) ? p.filter((x) => x !== key) : [...p, key]));

  const save = useAction(
    () => {
      const quotas = Object.fromEntries(
        LIMITS.map(([k]) => [k, Object.fromEntries(PERIODS.filter((p) => limits[k][p] !== '').map((p) => [p, Number(limits[k][p])]))]).filter(([, v]) => Object.keys(v).length),
      );
      const access = { memberRole: form.memberRole, designation: form.designation || undefined, quotas, ...(custom ? { permissions: perms } : {}) };
      if (editing) return api.updateMember(member._id, access);
      const body = Object.fromEntries(Object.entries({ fullName: form.fullName, username: form.username, email: form.email, mobile: form.mobile, password: form.password }).filter(([, v]) => v !== ''));
      return api.addMember({ ...body, ...access });
    },
    { success: editing ? 'User updated' : form.password ? 'User added' : 'User added. An activation link was e-mailed', invalidate, onSuccess: onClose },
  );

  const submit = (e) => {
    e.preventDefault();
    if (!editing) {
      if (form.username && !USERNAME.test(form.username)) return setError('Username: 3 to 30 letters, numbers or _ . Cannot start or end with _');
      if (form.password && form.password !== form.confirm) return setError('Password and confirm password do not match');
    }
    if (custom && !perms.length) return setError('Choose at least one permission, or use the role defaults');
    setError('');
    return save.mutate();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? `Edit ${member.fullName}` : 'Add account member'}
      size="xl"
      footer={
        <Button type="submit" form="member-form" size="sm" variant="primaryBlue" loading={save.isPending}>
          {editing ? 'Save changes' : 'Add user'}
        </Button>
      }
    >
      <form id="member-form" className="space-y-6" onSubmit={submit}>
        {error && <Alert tone="error">{error}</Alert>}
        {!editing && (
          <Block title="Member details" hint="Leave the password empty to e-mail an activation link instead.">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <TextField label="Member name" required value={form.fullName} onChange={set('fullName')} maxLength={120} />
              <TextField label="Member username" value={form.username} onChange={(e) => set('username')(e.target.value.trim())} maxLength={30} hint="Optional. Created from the name if empty" />
              <TextField label="Member email" type="email" required value={form.email} onChange={set('email')} />
              <MobileField label="Mobile number" value={form.mobile} onChange={set('mobile')} />
              <PasswordField label="Member password" autoComplete="new-password" value={form.password} onChange={set('password')} hint="At least 8 characters with a letter and a digit" />
              <PasswordField label="Member confirm password" autoComplete="new-password" value={form.confirm} onChange={set('confirm')} />
            </div>
          </Block>
        )}
        <Block title="Role">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <SuggestField label="Designation" lookup="job_title" allowCreate value={form.designation} onChange={set('designation')} placeholder="e.g. HR Executive" />
            <SelectField label="Role" required placeholder={null} options={ROLES} value={form.memberRole} onChange={set('memberRole')} />
          </div>
        </Block>
        <Block title="Account member permissions">
          <div className="flex flex-wrap gap-4">
            <CheckboxField label="Use the defaults of this role" checked={!custom} onChange={(e) => setCustom(!e.target.checked)} />
          </div>
          {custom && (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              {PERMISSION_GROUPS.map(([group, items]) => (
                <div key={group} className="rounded-lg border border-brand-border p-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand-gray">{group}</p>
                  <div className="space-y-2">
                    {items.map(([key, label]) => (
                      <CheckboxField key={key} label={label} checked={perms.includes(key)} onChange={() => togglePerm(key)} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Block>
        <Block title="Usage limits" hint="Empty means no limit. Limits never exceed the credits of your plan.">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="text-left text-xs text-brand-gray-muted">
                  <th className="py-2 pr-3 font-medium">Action</th>
                  {PERIODS.map((p) => (
                    <th key={p} className="px-2 py-2 font-medium">
                      {titleCase(p)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {LIMITS.map(([k, label]) => (
                  <tr key={k} className="border-t border-brand-border">
                    <td className="py-2 pr-3 text-brand-dark">{label}</td>
                    {PERIODS.map((p) => (
                      <td key={p} className="px-2 py-2">
                        <input
                          aria-label={`${label} ${p} limit`}
                          inputMode="numeric"
                          value={limits[k][p]}
                          onChange={(e) => {
                            const v = e.target.value.replace(/\D/g, '').slice(0, 6);
                            setLimits((l) => ({ ...l, [k]: { ...l[k], [p]: v } }));
                          }}
                          placeholder="No limit"
                          className="field-control h-9 w-full px-2 text-sm"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Block>
      </form>
    </Modal>
  );
};

const UsageTab = () => {
  const [period, setPeriod] = useState('monthly');
  const usage = useQuery({ queryKey: ['org-usage', period], queryFn: () => orgApi.usage({ period }) });
  return (
    <div className="surface p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-brand-gray">Usage by each user for the current {period.replace('ly', '').replace('dai', 'day')}.</p>
        <SimpleSelect ariaLabel="Period" value={period} onChange={setPeriod} options={['daily', 'weekly', 'monthly', 'yearly'].map((value) => ({ value, label: titleCase(value) }))} />
      </div>
      <DataTable
        rowKey={(m) => String(m.member)}
        columns={[
          { key: 'name', header: 'User', render: (m) => <span className="font-medium">{m.user?.fullName || '—'}</span> },
          ...USAGE.map(([k, label]) => ({ key: k, header: label, render: (m) => formatNumber(m.usage?.[k] || 0) })),
        ]}
        rows={usage.data?.members}
        query={usage}
        empty={<EmptyState icon="monitoring" title="No usage yet" description="Views, downloads, job posts and invites show here as your team works." />}
      />
    </div>
  );
};

const Employees = () => {
  useDocumentTitle('Team');
  const { user } = useAuth();
  const [filters, setFilters] = useUrlFilters({ tab: 'users' });
  const [q, setQ] = useState('');
  const term = useDebounce(q, 300);
  const [editing, setEditing] = useState(null);
  const [removing, setRemoving] = useState([]);
  const [selected, setSelected] = useState([]);
  const query = useQuery({ queryKey: ['team', term], queryFn: () => orgApi.team(term ? { q: term } : {}) });
  // Deleted users stay in the database for audit history but are not part of the team any more.
  const rows = (query.data?.data || []).filter((m) => m.status !== 'trashed');
  const toggle = useAction(({ id, status }) => orgApi.updateMember(id, { status }), { success: (_, v) => (v.status === 'active' ? 'User activated' : 'User suspended'), invalidate: ['team'] });
  const reset = useAction(orgApi.resetMember, { success: 'Password reset link sent' });
  const remove = useAction(orgApi.removeMembers, {
    success: (_, ids) => `${ids.length} user${ids.length === 1 ? '' : 's'} deleted`,
    invalidate: ['team'],
    onSuccess: () => {
      setRemoving([]);
      setSelected([]);
    },
  });
  const count = rows.filter((m) => m.status !== 'trashed').length;
  const canAdd = count < MAX_USERS;
  const columns = [
    {
      key: 'name',
      header: 'User',
      render: (m) => (
        <span className="flex min-w-0 items-center gap-2.5">
          <Avatar name={m.fullName} src={m.avatar?.url} size={34} />
          <span className="min-w-0">
            <span className="flex items-center gap-1.5 font-medium">
              {m.fullName}
              {m.employer?.isOwner && <Badge tone="blue">Owner</Badge>}
              {m._id === user._id && <Badge tone="gray">You</Badge>}
            </span>
            <span className="block truncate text-xs text-brand-gray-muted">{[m.username && `@${m.username}`, m.email].filter(Boolean).join(' · ')}</span>
          </span>
        </span>
      ),
    },
    { key: 'role', header: 'Role', render: (m) => titleCase(m.employer?.memberRole || '') },
    { key: 'designation', header: 'Designation', render: (m) => m.employer?.designation || '—' },
    { key: 'last', header: 'Last login', render: (m) => (m.lastLoginAt ? formatDateTime(m.lastLoginAt) : 'Never') },
    { key: 'status', header: 'Status', render: (m) => <StatusBadge status={m.status} /> },
  ];
  const selectableIds = rows.filter((m) => !m.employer?.isOwner && m._id !== user._id).map((m) => m._id);

  return (
    <div>
      <PageHeader
        title="Account members"
        subtitle={`${count} of ${MAX_USERS} users`}
        actions={
          <Button size="sm" variant="primary" disabled={!canAdd} onClick={() => (canAdd ? setEditing({}) : toast.error(`Maximum ${MAX_USERS} users allowed`))}>
            <Icon name="person_add" size={16} /> Add user
          </Button>
        }
      />
      <Tabs
        className="mb-4"
        value={filters.tab}
        onChange={(tab) => setFilters({ tab })}
        tabs={[
          { value: 'users', label: 'Users and permissions' },
          { value: 'usage', label: 'Usage analytics' },
        ]}
      />
      {filters.tab === 'usage' ? (
        <UsageTab />
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <SearchInput className="min-w-[220px] flex-1" value={q} onChange={setQ} placeholder="Search by name or e-mail" />
            {selected.length > 0 && (
              <Button size="sm" variant="dangerGhost" onClick={() => setRemoving(selected)}>
                <Icon name="delete" size={16} /> Delete {selected.length} selected
              </Button>
            )}
          </div>
          <DataTable
            columns={columns}
            rows={rows}
            query={query}
            selectable
            selected={selected}
            onSelect={(ids) => setSelected(ids.filter((id) => selectableIds.includes(id)))}
            empty={<EmptyState icon="badge" title={term ? 'No user matches your search' : 'No team members yet'} />}
            actions={(m) =>
              !m.employer?.isOwner &&
              m._id !== user._id && (
                <span className="inline-flex flex-wrap justify-end gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(m)}>
                    Edit
                  </Button>
                  <Button size="sm" variant="ghost" loading={reset.isPending && reset.variables === m._id} onClick={() => reset.mutate(m._id)}>
                    Send reset link
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => toggle.mutate({ id: m._id, status: m.status === 'active' ? 'suspended' : 'active' })}>
                    {m.status === 'active' ? 'Suspend' : 'Activate'}
                  </Button>
                  <Button size="sm" variant="dangerGhost" onClick={() => setRemoving([m._id])}>
                    Delete
                  </Button>
                </span>
              )
            }
          />
        </>
      )}
      {editing && <MemberModal member={editing._id ? editing : null} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={removing.length > 0}
        onClose={() => setRemoving([])}
        title={removing.length > 1 ? `Delete ${removing.length} users?` : 'Delete this user?'}
        message="They lose access right away. Jobs and responses they handled stay with your account."
        danger
        confirmLabel="Delete"
        loading={remove.isPending}
        onConfirm={() => remove.mutate(removing)}
      />
    </div>
  );
};

export default Employees;
