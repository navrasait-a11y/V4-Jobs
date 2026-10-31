import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Button from '../../components/ui/Button';
import { Avatar, DataTable, PageHeader, Pagination, StatusBadge } from '../../components/ui/data';
import { ConfirmDialog, EmptyState, Modal } from '../../components/ui/feedback';
import { ChoiceChips, Field, MobileField, SelectField, TextField } from '../../components/ui/form';
import { useAction, useDocumentTitle, useUrlFilters } from '../../hooks/useData';
import { orgApi } from '../../services';
import { titleCase } from '../../utils/format';

const ROLES = ['employer_admin', 'manager', 'team_lead', 'recruiter'].map((value) => ({ value, label: titleCase(value) }));

const PERMISSIONS = ['job.post', 'job.manage_all', 'job.manage_own', 'response.manage_all', 'response.manage_own', 'response.export_all', 'resume.bulk_download', 'candidate.search', 'candidate.invite', 'team.manage', 'billing.manage', 'company.manage', 'event.manage'];
const QUOTAS = [
  ['job_post', 'Job posts'],
  ['resume_view', 'Resume views'],
  ['resume_download', 'Resume downloads'],
  ['invite', 'Invites'],
];

const MemberModal = ({ member, onClose }) => {
  const [form, setForm] = useState({ fullName: member?.fullName || '', email: member?.email || '', mobile: member?.mobile || '', designation: member?.employer?.designation || member?.designation || '', memberRole: member?.employer?.memberRole || 'recruiter' });
  const [perms, setPerms] = useState(member?.employer?.permissions || []);
  const [quotas, setQuotas] = useState(Object.fromEntries(QUOTAS.map(([k]) => [k, member?.employer?.quotas?.[k]?.monthly ?? ''])));
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? e.target.value : e }));
  const save = useAction(
    () => {
      const body = Object.fromEntries(Object.entries(form).filter(([, v]) => v !== ''));
      const access = { ...(perms.length ? { permissions: perms } : {}), quotas: Object.fromEntries(Object.entries(quotas).filter(([, v]) => v !== '').map(([k, v]) => [k, { monthly: Number(v) }])) };
      return member ? orgApi.updateMember(member._id, { designation: body.designation, memberRole: body.memberRole, ...access }) : orgApi.addMember({ ...body, ...access });
    },
    { success: member ? 'Member updated' : 'Invitation sent', invalidate: ['team'], onSuccess: onClose },
  );
  return (
    <Modal open onClose={onClose} title={member ? 'Edit member' : 'Add team member'} footer={<Button type="submit" form="member-form" size="sm" variant="primaryBlue" loading={save.isPending}>Save</Button>}>
      <form
        id="member-form"
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        {!member && (
          <>
            <TextField label="Full name" required value={form.fullName} onChange={set('fullName')} />
            <TextField label="Email" type="email" required value={form.email} onChange={set('email')} hint="An activation link is sent here" />
            <MobileField value={form.mobile} onChange={set('mobile')} />
          </>
        )}
        <TextField label="Designation" required value={form.designation} onChange={set('designation')} />
        <SelectField label="Role" required placeholder={null} options={ROLES} value={form.memberRole} onChange={set('memberRole')} />
        <Field label="Custom permissions" hint="Leave empty to use the role defaults">
          <ChoiceChips multiple options={PERMISSIONS} value={perms} onChange={setPerms} />
        </Field>
        <Field label="Monthly quotas" hint="Empty means unlimited">
          <div className="grid grid-cols-2 gap-3">
            {QUOTAS.map(([k, label]) => (
              <TextField key={k} label={label} type="number" min="0" value={quotas[k]} onChange={(e) => setQuotas((q) => ({ ...q, [k]: e.target.value }))} />
            ))}
          </div>
        </Field>
      </form>
    </Modal>
  );
};

const Employees = () => {
  useDocumentTitle('Team');
  const [filters, setFilters] = useUrlFilters({ page: '1' });
  const [editing, setEditing] = useState(null);
  const [removing, setRemoving] = useState(null);
  const params = { limit: 20, ...filters };
  const query = useQuery({ queryKey: ['team', params], queryFn: () => orgApi.team(params) });
  const toggle = useAction(({ id, status }) => orgApi.updateMember(id, { status }), { success: 'Member updated', invalidate: ['team'] });
  const reset = useAction(orgApi.resetMember, { success: 'Password reset link sent' });
  const remove = useAction((id) => orgApi.removeMembers([id]), { success: 'Member removed', invalidate: ['team'], onSuccess: () => setRemoving(null) });
  const columns = [
    {
      key: 'name',
      header: 'Member',
      render: (m) => (
        <span className="flex min-w-0 items-center gap-2.5">
          <Avatar name={m.fullName} src={m.avatar?.url} size={34} />
          <span className="min-w-0">
            <span className="block font-medium">{m.fullName}</span>
            <span className="block text-xs text-brand-gray-muted">{m.email}</span>
          </span>
        </span>
      ),
    },
    { key: 'role', header: 'Role', render: (m) => titleCase(m.employer?.memberRole || '') },
    { key: 'designation', header: 'Designation', render: (m) => m.employer?.designation || m.designation || '—' },
    { key: 'status', header: 'Status', render: (m) => <StatusBadge status={m.status} /> },
  ];
  return (
    <div>
      <PageHeader
        title="Team"
        subtitle="Up to 50 users"
        actions={
          <Button size="sm" variant="primary" onClick={() => setEditing({})}>
            Add member
          </Button>
        }
      />
      <DataTable
        columns={columns}
        rows={query.data?.data}
        query={query}
        empty={<EmptyState icon="badge" title="No team members" />}
        actions={(m) =>
          !m.employer?.isOwner && (
            <span className="inline-flex flex-wrap justify-end gap-1">
              <Button size="sm" variant="ghost" onClick={() => setEditing(m)}>
                Edit
              </Button>
              <Button size="sm" variant="ghost" onClick={() => reset.mutate(m._id)}>
                Reset
              </Button>
              <Button size="sm" variant="ghost" onClick={() => toggle.mutate({ id: m._id, status: m.status === 'active' ? 'suspended' : 'active' })}>
                {m.status === 'active' ? 'Suspend' : 'Activate'}
              </Button>
              <Button size="sm" variant="dangerGhost" onClick={() => setRemoving(m)}>
                Remove
              </Button>
            </span>
          )
        }
      />
      <Pagination meta={query.data?.meta} onPage={(page) => setFilters({ page })} />
      {editing && <MemberModal member={editing._id ? editing : null} onClose={() => setEditing(null)} />}
      <ConfirmDialog open={Boolean(removing)} onClose={() => setRemoving(null)} title="Remove member?" message={removing?.fullName} danger confirmLabel="Remove" loading={remove.isPending} onConfirm={() => remove.mutate(removing._id)} />
    </div>
  );
};

export default Employees;
