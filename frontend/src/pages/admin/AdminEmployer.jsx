import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import AccountPanel, { EMPLOYER_LABELS } from '../../components/admin/AccountPanel';
import { MediaField, PlanAndWallet } from '../../components/admin/AdminActions';
import UserActivity from '../../components/admin/UserActivity';
import Button from '../../components/ui/Button';
import { Avatar, Badge, DataTable, Pagination, Section, StatTile, StatusBadge, Tabs } from '../../components/ui/data';
import { ConfirmDialog, EmptyState, ErrorState, Icon, Modal, PageLoader } from '../../components/ui/feedback';
import { CheckboxField, ChoiceChips, Field, MobileField, SelectField, TextAreaField, TextField } from '../../components/ui/form';
import HierarchyField from '../../components/ui/HierarchyField';
import { useAction, useDocumentTitle, useLookups } from '../../hooks/useData';
import { DuplicateEmployer } from './AdminPages';
import { adminApi } from '../../services';
import { formatDate, formatDateTime, formatNumber, timeAgo, titleCase, toInputDate } from '../../utils/format';

const STATUSES = ['active', 'pending', 'admin_review', 'blocked', 'suspended', 'trashed'];
const KYC = ['not_submitted', 'under_review', 'verified', 'rejected', 'resubmission_required'];
const CREDIT_KEYS = ['job_post', 'featured_job', 'resume_view', 'resume_download', 'invite', 'excel_download', 'resume_search'];
const opts = (list) => list.map((v) => ({ value: v, label: titleCase(v) }));
const TABS = ['company', 'team', 'jobs', 'kyc', 'billing', 'notes', 'activity'];
const TAB_LABELS = { company: 'Company profile', team: 'Owner & team', jobs: 'Jobs', kyc: 'KYC documents', billing: 'Packages & credits', notes: 'Notes', activity: 'Activity' };

const loginAs = async (userId) => {
  try {
    const data = await adminApi.post(`/users/${userId}/impersonate`);
    window.open(`/impersonate#${encodeURIComponent(data.tokens.accessToken)}`, '_blank', 'noopener');
  } catch (e) {
    toast.error(e.message);
  }
};

const orgForm = (o) => ({
  type: o.type || 'company',
  name: o.name || '',
  legalName: o.legalName || '',
  username: o.username || '',
  employerType: o.employerType || '',
  organizationType: o.organizationType || '',
  industries: o.industries || [],
  subIndustries: o.subIndustries || [],
  departments: o.departments || [],
  functions: o.functions || [],
  employeeCount: o.employeeCount || '',
  foundedDate: toInputDate(o.foundedDate),
  website: o.website || '',
  email: o.email || '',
  phone: o.phone || '',
  about: o.about || '',
  hiringStatus: o.hiringStatus || '',
  gstNumber: o.gstNumber || '',
  panNumber: o.panNumber || '',
  logo: o.logo || null,
  coverPhoto: o.coverPhoto || null,
  socialProfiles: o.socialProfiles || [],
  offices: (o.offices || []).map(({ _id, ...x }) => x),
  status: o.status || 'active',
  statusReason: o.statusReason || '',
  kycStatus: o.kycStatus || 'not_submitted',
  isVerified: Boolean(o.isVerified),
  verification: { email: false, phone: false, gst: false, domain: false, business: false, ...(o.verification || {}) },
  labels: o.labels || [],
  situationTag: o.situationTag || '',
  maxMembers: o.maxMembers ?? '',
});

/** PRD "Edit Company/Consultancy - All Details, Profile Photo, Cover Photo, Sectors, Departments, Address ...". */
const CompanyForm = ({ org, onSaved }) => {
  const lookups = useLookups('employer_type', 'organization_type', 'company_size', 'hiring_status', 'office_type', 'social_platform', 'situation_tag');
  const [form, setForm] = useState(() => orgForm(org));
  useEffect(() => setForm(orgForm(org)), [org]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e }));
  const setList = (key, i, patch) => setForm((f) => ({ ...f, [key]: f[key].map((x, n) => (n === i ? { ...x, ...patch } : x)) }));
  const save = useAction(
    () => {
      const body = { ...form, maxMembers: form.maxMembers === '' ? undefined : Number(form.maxMembers), foundedDate: form.foundedDate || undefined, socialProfiles: form.socialProfiles.filter((s) => s.url) };
      if (!body.logo) delete body.logo;
      if (!body.coverPhoto) delete body.coverPhoto;
      return adminApi.patch(`/employers/${org._id}`, body);
    },
    { success: 'Company saved', invalidate: ['admin'], onSuccess: onSaved },
  );
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <Section title="Branding">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <MediaField label="Logo" value={form.logo} onChange={set('logo')} />
          <MediaField label="Cover photo" value={form.coverPhoto} onChange={set('coverPhoto')} />
        </div>
      </Section>
      <Section title="Company details">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SelectField label="Employer" placeholder={null} options={opts(['company', 'consultancy'])} value={form.type} onChange={set('type')} />
          <TextField label="Display name" required value={form.name} onChange={set('name')} />
          <TextField label="Legal name" value={form.legalName} onChange={set('legalName')} />
          <TextField label="Username (public page)" value={form.username} onChange={set('username')} />
          <SelectField label="Company type" options={lookups.employer_type} value={form.employerType} onChange={set('employerType')} />
          <SelectField label="Organization type" options={lookups.organization_type} value={form.organizationType} onChange={set('organizationType')} />
          <SelectField label="Total employees" options={lookups.company_size} value={form.employeeCount} onChange={set('employeeCount')} />
          <TextField label="Founded on" type="date" max={new Date()} value={form.foundedDate} onChange={set('foundedDate')} />
          <SelectField label="Current hiring status" options={lookups.hiring_status} value={form.hiringStatus} onChange={set('hiringStatus')} />
          <TextField label="Website" value={form.website} onChange={set('website')} placeholder="https://" />
          <TextField label="Company e-mail" type="email" value={form.email} onChange={set('email')} />
          <MobileField label="Company phone" value={form.phone} onChange={set('phone')} />
          <TextField label="GST number" value={form.gstNumber} onChange={(e) => set('gstNumber')(e.target.value.toUpperCase())} maxLength={15} />
          <TextField label="PAN" value={form.panNumber} onChange={(e) => set('panNumber')(e.target.value.toUpperCase())} maxLength={10} />
          <HierarchyField kind="industry" label="Industry / sector" value={{ parents: form.industries, children: form.subIndustries }} onChange={({ parents, children }) => setForm((f) => ({ ...f, industries: parents, subIndustries: children }))} />
          <HierarchyField kind="department" label="Departments" value={{ parents: form.departments, children: form.functions }} onChange={({ parents, children }) => setForm((f) => ({ ...f, departments: parents, functions: children }))} />
        </div>
        <TextAreaField className="mt-4" label="About company" rows={5} value={form.about} onChange={set('about')} maxLength={10000} />
      </Section>
      <Section
        title="Office addresses"
        actions={
          <Button size="sm" variant="outline" onClick={() => setForm((f) => ({ ...f, offices: [...f.offices, { type: '', address: '', city: '', state: '', pincode: '', mapUrl: '', isPrimary: !f.offices.length }] }))}>
            Add office
          </Button>
        }
      >
        {!form.offices.length && <p className="text-sm text-brand-gray-muted">No office added.</p>}
        <div className="space-y-3">
          {form.offices.map((o, i) => (
            <div key={i} className="rounded-lg border border-brand-border p-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <SelectField label="Type" options={lookups.office_type} value={o.type} onChange={(e) => setList('offices', i, { type: e.target.value })} />
                <TextField label="City" value={o.city || ''} onChange={(e) => setList('offices', i, { city: e.target.value })} />
                <TextField label="State" value={o.state || ''} onChange={(e) => setList('offices', i, { state: e.target.value })} />
                <TextField className="sm:col-span-2" label="Full address" value={o.address || ''} onChange={(e) => setList('offices', i, { address: e.target.value })} />
                <TextField label="Pincode" inputMode="numeric" maxLength={6} value={o.pincode || ''} onChange={(e) => setList('offices', i, { pincode: e.target.value.replace(/\D/g, '') })} />
                <TextField className="sm:col-span-2" label="Google Map link" value={o.mapUrl || ''} onChange={(e) => setList('offices', i, { mapUrl: e.target.value })} />
              </div>
              <div className="mt-2 flex items-center justify-between">
                <CheckboxField label="Primary office" checked={Boolean(o.isPrimary)} onChange={(e) => setForm((f) => ({ ...f, offices: f.offices.map((x, n) => ({ ...x, isPrimary: n === i ? e.target.checked : e.target.checked ? false : x.isPrimary })) }))} />
                <Button size="sm" variant="dangerGhost" onClick={() => setForm((f) => ({ ...f, offices: f.offices.filter((_, n) => n !== i) }))}>
                  Remove
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Section>
      <Section
        title="Social links"
        actions={
          <Button size="sm" variant="outline" onClick={() => setForm((f) => ({ ...f, socialProfiles: [...f.socialProfiles, { platform: '', url: '' }] }))}>
            Add link
          </Button>
        }
      >
        <div className="space-y-2">
          {form.socialProfiles.map((sp, i) => (
            <div key={i} className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <SelectField className="sm:w-48" label="Platform" options={lookups.social_platform} value={sp.platform} onChange={(e) => setList('socialProfiles', i, { platform: e.target.value })} />
              <TextField className="flex-1" label="Link" value={sp.url} onChange={(e) => setList('socialProfiles', i, { url: e.target.value })} />
              <Button size="sm" variant="ghost" aria-label="Remove link" onClick={() => setForm((f) => ({ ...f, socialProfiles: f.socialProfiles.filter((_, n) => n !== i) }))}>
                <Icon name="close" size={18} />
              </Button>
            </div>
          ))}
          {!form.socialProfiles.length && <p className="text-sm text-brand-gray-muted">No social links.</p>}
        </div>
      </Section>
      <Section title="Status, verification and labels">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <SelectField label="Account status" placeholder={null} options={opts(STATUSES)} value={form.status} onChange={set('status')} />
          <TextField label="Status reason" value={form.statusReason} onChange={set('statusReason')} />
          <SelectField label="KYC status" placeholder={null} options={opts(KYC)} value={form.kycStatus} onChange={set('kycStatus')} />
          <TextField label="Max team members" type="number" min="1" value={form.maxMembers} onChange={set('maxMembers')} />
          <SelectField label="Situation tag" options={lookups.situation_tag} value={form.situationTag} onChange={set('situationTag')} />
        </div>
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
          <CheckboxField label="Verified employer badge" checked={form.isVerified} onChange={set('isVerified')} />
          {['email', 'phone', 'gst', 'domain', 'business'].map((k) => (
            <CheckboxField key={k} label={`${titleCase(k)} verified`} checked={Boolean(form.verification[k])} onChange={(e) => setForm((f) => ({ ...f, verification: { ...f.verification, [k]: e.target.checked } }))} />
          ))}
        </div>
        <Field className="mt-4" label="Employer labels">
          <ChoiceChips multiple options={opts(EMPLOYER_LABELS)} value={form.labels} onChange={set('labels')} />
        </Field>
      </Section>
      <div className="sticky bottom-0 flex justify-end gap-2 surface p-3">
        <Button type="button" variant="ghost" size="sm" onClick={() => setForm(orgForm(org))}>
          Reset
        </Button>
        <Button type="submit" variant="primaryBlue" size="sm" loading={save.isPending}>
          Save company
        </Button>
      </div>
    </form>
  );
};

const AddMember = ({ orgId, onClose }) => {
  const [form, setForm] = useState({ fullName: '', email: '', mobile: '', designation: '', memberRole: 'recruiter' });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? e.target.value : e }));
  const save = useAction(() => adminApi.post(`/employers/${orgId}/members`, { ...form, mobile: form.mobile || undefined, designation: form.designation || undefined }), {
    success: 'Member added. A set-password link was e-mailed',
    invalidate: ['admin'],
    onSuccess: onClose,
  });
  return (
    <Modal open onClose={onClose} title="Add team member" footer={<Button size="sm" variant="primaryBlue" disabled={!form.fullName || !form.email} loading={save.isPending} onClick={() => save.mutate()}>Add member</Button>}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <TextField label="Full name" required value={form.fullName} onChange={set('fullName')} />
        <TextField label="E-mail" required type="email" value={form.email} onChange={set('email')} />
        <MobileField value={form.mobile} onChange={set('mobile')} />
        <TextField label="Designation" value={form.designation} onChange={set('designation')} />
        <SelectField label="Role" placeholder={null} options={opts(['employer_admin', 'recruiter', 'team_lead', 'manager'])} value={form.memberRole} onChange={set('memberRole')} />
      </div>
    </Modal>
  );
};

const Team = ({ org, members, onChanged }) => {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  const ownerId = String(org.owner?._id || org.owner || '');
  return (
    <div className="space-y-4">
      <Section title={`Team (${members.length}${org.maxMembers ? ` of ${org.maxMembers}` : ''})`} actions={<Button size="sm" variant="outline" leftIcon={<Icon name="person_add" size={16} />} onClick={() => setAdding(true)}>Add member</Button>}>
        <DataTable
          columns={[
            {
              key: 'name',
              header: 'Member',
              render: (m) => (
                <span className="flex items-center gap-2">
                  <Avatar name={m.fullName} size={30} />
                  <span>
                    <span className="block font-medium">{m.fullName} {String(m._id) === ownerId && <Badge tone="blue">Owner</Badge>}</span>
                    <span className="text-xs text-brand-gray-muted">{m.email}</span>
                  </span>
                </span>
              ),
            },
            { key: 'role', header: 'Role', render: (m) => titleCase(m.employer?.memberRole || '') },
            { key: 'status', header: 'Status', render: (m) => <StatusBadge status={m.status} /> },
            { key: 'login', header: 'Last login', render: (m) => (m.lastLoginAt ? timeAgo(m.lastLoginAt) : 'Never') },
          ]}
          rows={members}
          empty={<EmptyState icon="group" title="No members" />}
          actions={(m) => (
            <>
              <Button size="sm" variant="ghost" onClick={() => setEditing(m._id)}>
                Edit
              </Button>
              <Button size="sm" variant="ghost" onClick={() => loginAs(m._id)}>
                Login as
              </Button>
            </>
          )}
        />
      </Section>
      {editing && <MemberAccount userId={editing} onClose={() => { setEditing(null); onChanged(); }} />}
      {adding && <AddMember orgId={org._id} onClose={() => { setAdding(false); onChanged(); }} />}
    </div>
  );
};

const MemberAccount = ({ userId, onClose }) => {
  const q = useQuery({ queryKey: ['admin', 'user', userId], queryFn: () => adminApi.get(`/users/${userId}`) });
  const user = q.data?.user || q.data;
  return (
    <Modal open onClose={onClose} title="Edit member account" size="xl">
      {q.isPending ? <PageLoader className="min-h-[20vh]" /> : q.isError ? <ErrorState error={q.error} onRetry={q.refetch} /> : <AccountPanel user={user} labels={[]} onSaved={onClose} />}
    </Modal>
  );
};

const OrgJobs = ({ orgId }) => {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const q = useQuery({ queryKey: ['admin', 'org-jobs', orgId, page], queryFn: () => adminApi.list('/jobs', { organization: orgId, page, limit: 20 }), placeholderData: keepPreviousData });
  return (
    <Section title="Jobs and internships" actions={<Button asChild size="sm" variant="primary"><Link to="/admin/jobs/post">Post for this employer</Link></Button>}>
      <DataTable
        columns={[
          { key: 'title', header: 'Title', render: (j) => <span className="font-medium">{j.title}</span> },
          { key: 'kind', header: 'Type', render: (j) => titleCase(j.kind) },
          { key: 'status', header: 'Status', render: (j) => <StatusBadge status={j.status} /> },
          { key: 'apps', header: 'Responses', render: (j) => formatNumber(j.stats?.applications || 0) },
          { key: 'date', header: 'Posted', render: (j) => formatDate(j.publishedAt || j.createdAt) },
        ]}
        rows={q.data?.data}
        query={q}
        onRowClick={(j) => navigate(`/admin/jobs/${j._id}/edit`)}
        empty={<EmptyState icon="work" title="No jobs yet" />}
      />
      <Pagination meta={q.data?.meta} onPage={setPage} />
    </Section>
  );
};

const Kyc = ({ org, onChanged }) => {
  const [remarks, setRemarks] = useState({});
  const review = useAction(({ docId, status }) => adminApi.patch(`/employers/${org._id}/documents/${docId}`, { status, remarks: remarks[docId] || '' }), { success: 'Document updated', invalidate: ['admin'], onSuccess: onChanged });
  const remind = useAction(() => adminApi.post('/employers/kyc-reminders', { ids: [org._id] }), { success: 'Reminder sent' });
  const docs = org.documents || [];
  return (
    <Section title="KYC documents" actions={<Button size="sm" variant="outline" loading={remind.isPending} onClick={() => remind.mutate()}>Send upload reminder</Button>}>
      {!docs.length && <EmptyState icon="folder_open" title="No documents uploaded" />}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {docs.map((d) => (
          <div key={d._id} className="rounded-xl border border-brand-border p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-brand-dark">{d.type}</p>
                <p className="text-xs text-brand-gray-muted">{d.number || 'No number'} · uploaded {formatDate(d.createdAt || d.file?.uploadedAt)}</p>
              </div>
              <StatusBadge status={d.status} />
            </div>
            {d.file?.downloadUrl && (
              <a href={d.file.downloadUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-brand-blue">
                <Icon name="open_in_new" size={16} /> View document
              </a>
            )}
            <TextField className="mt-3" label="Remarks to employer" value={remarks[d._id] ?? d.remarks ?? ''} onChange={(e) => setRemarks((r) => ({ ...r, [d._id]: e.target.value }))} />
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" variant="primaryBlue" onClick={() => review.mutate({ docId: d._id, status: 'verified' })}>Approve</Button>
              <Button size="sm" variant="outline" onClick={() => review.mutate({ docId: d._id, status: 'resubmission_required' })}>Ask to re-upload</Button>
              <Button size="sm" variant="dangerGhost" onClick={() => review.mutate({ docId: d._id, status: 'rejected' })}>Reject</Button>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
};

const Billing = ({ org, onChanged }) => {
  const [credits, setCredits] = useState({ metric: 'job_post', amount: '', note: '' });
  const grant = useAction(() => adminApi.post(`/employers/${org._id}/credits`, { credits: { [credits.metric]: Number(credits.amount) }, note: credits.note || 'Admin adjustment' }), {
    success: 'Credits updated',
    invalidate: ['admin'],
    onSuccess: () => { setCredits({ metric: 'job_post', amount: '', note: '' }); onChanged(); },
  });
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {CREDIT_KEYS.map((k) => (
          <StatTile key={k} icon="toll" label={titleCase(k)} value={formatNumber(org.credits?.[k] || 0)} />
        ))}
      </div>
      <PlanAndWallet target={{ organizationId: org._id }} audience="employer" />
      <Section title="Adjust credits">
        <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-4">
          <SelectField label="Credit" placeholder={null} options={opts(CREDIT_KEYS)} value={credits.metric} onChange={(e) => setCredits((c) => ({ ...c, metric: e.target.value }))} />
          <TextField label="Amount (+/-)" type="number" value={credits.amount} onChange={(e) => setCredits((c) => ({ ...c, amount: e.target.value }))} />
          <TextField label="Note" value={credits.note} onChange={(e) => setCredits((c) => ({ ...c, note: e.target.value }))} />
          <Button size="sm" variant="primaryBlue" disabled={!credits.amount} loading={grant.isPending} onClick={() => grant.mutate()}>
            Apply
          </Button>
        </div>
      </Section>
    </div>
  );
};

const Notes = ({ org, tracking, onChanged }) => {
  const [note, setNote] = useState('');
  const add = useAction(() => adminApi.patch(`/employers/${org._id}`, { note }), { success: 'Note added', invalidate: ['admin'], onSuccess: () => { setNote(''); onChanged(); } });
  const comment = useAction((body) => adminApi.patch(`/employers/${org._id}/tracking`, body), { success: 'Saved', invalidate: ['admin'], onSuccess: onChanged });
  const notes = [...(org.adminNotes || [])].reverse();
  return (
    <Section title="Admin notes">
      <form className="flex flex-col gap-2 sm:flex-row sm:items-end" onSubmit={(e) => { e.preventDefault(); if (note.trim()) add.mutate(); }}>
        <TextAreaField className="flex-1" label="Add a note (visible to admins only)" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        <Button type="submit" size="sm" variant="primaryBlue" disabled={!note.trim()} loading={add.isPending}>Add</Button>
      </form>
      <ul className="mt-4 space-y-3">
        {notes.map((n, i) => (
          <li key={n._id || i} className="rounded-lg bg-brand-tint p-3 text-sm">
            <p className="whitespace-pre-line">{n.note}</p>
            <p className="mt-1 text-xs text-brand-gray-muted">{n.by?.admin?.nickname || n.by?.fullName || 'Admin'} · {formatDateTime(n.at || n.createdAt)}</p>
          </li>
        ))}
        {(tracking?.comments || []).map((c) => (
          <li key={c._id} className="rounded-lg bg-brand-tint p-3 text-sm">
            <p className="whitespace-pre-line">{c.body}</p>
            <p className="mt-1 text-xs text-brand-gray-muted">{formatDateTime(c.at)}</p>
          </li>
        ))}
        {!notes.length && !tracking?.comments?.length && <p className="text-sm text-brand-gray-muted">No notes yet.</p>}
      </ul>
      <p className="mt-3 text-xs text-brand-gray-muted">Calling status: </p>
      <div className="mt-1 flex flex-wrap gap-2">
        {['call_done', 'not_picked', 'not_reachable', 'switched_off', 'call_cut'].map((s) => (
          <button key={s} type="button" onClick={() => comment.mutate({ callingStatus: s })} className={`rounded-full border px-3 py-1 text-xs ${tracking?.callingStatus === s ? 'border-brand-blue bg-brand-blue-tint text-brand-blue' : 'border-brand-border text-brand-gray'}`}>
            {titleCase(s)}
          </button>
        ))}
      </div>
    </Section>
  );
};

/** Admin view of one company / consultancy: every detail editable plus team, jobs, KYC, billing and notes. */
const AdminEmployer = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState('company');
  const [confirm, setConfirm] = useState(null);
  const [duplicating, setDuplicating] = useState(false);
  const query = useQuery({ queryKey: ['admin', 'employer', id], queryFn: () => adminApi.get(`/employers/${id}`) });
  const link = useAction(({ userId, type }) => adminApi.post(`/users/${userId}/send-link`, { type }), { success: 'E-mail sent' });
  const bulk = useAction((action) => adminApi.post('/employers/bulk', { ids: [id], action }), {
    success: 'Updated',
    invalidate: ['admin'],
    onSuccess: () => {
      if (confirm === 'trash') navigate('/admin/employers');
      setConfirm(null);
    },
  });
  useDocumentTitle(query.data?.organization?.name || 'Employer');
  if (query.isPending) return <PageLoader />;
  if (query.isError) return <ErrorState error={query.error} onRetry={query.refetch} />;
  const org = query.data.organization || query.data;
  const members = query.data.members || [];
  const jobs = query.data.jobs || {};
  const owner = org.owner || {};
  const ownerId = owner._id || owner;
  const blocked = ['blocked', 'suspended'].includes(org.status);
  const refetch = () => query.refetch();
  const publicPath = `/${org.type === 'consultancy' ? 'recruiters' : 'companies'}/${org.slug || org.username}`;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <Link to="/admin/employers" className="inline-flex items-center gap-1 text-sm font-medium text-brand-blue">
        <Icon name="arrow_back" size={16} /> Employers
      </Link>
      <div className="surface overflow-hidden">
        <div className="h-24 bg-cover bg-center" style={{ backgroundImage: org.coverPhoto?.url ? `url(${org.coverPhoto.url})` : 'linear-gradient(90deg,#0A6CB5,#4F8FD6)' }} />
        <div className="-mt-9 flex flex-col gap-4 px-5 pb-5 lg:flex-row lg:items-end">
          <Avatar name={org.name} src={org.logo?.url} size={84} square className="bg-white ring-4 ring-white" />
          <div className="min-w-0 flex-1">
            <h1 className="flex flex-wrap items-center gap-2 text-xl font-bold text-brand-dark">
              {org.name}
              {org.isVerified && <Icon name="verified" size={18} fill className="text-brand-green" />}
              <StatusBadge status={org.status} />
            </h1>
            <p className="text-sm text-brand-gray">{[titleCase(org.type || ''), org.employerType, org.industries?.[0], org.employeeCount && `${org.employeeCount} employees`].filter(Boolean).join(' · ')}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-brand-gray-muted">
              <span className="font-mono">{org.uid}</span>
              {owner.fullName && <span className="flex items-center gap-1"><Icon name="person" size={14} /> {owner.fullName}</span>}
              {owner.email && <span className="flex items-center gap-1"><Icon name="mail" size={14} /> {owner.email}</span>}
              {owner.mobile && <span className="flex items-center gap-1"><Icon name="call" size={14} /> +91 {owner.mobile}</span>}
              <span>KYC: {titleCase(org.kycStatus || '')}</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(org.labels || []).map((l) => <Badge key={l} tone="orange">{titleCase(l)}</Badge>)}
              {org.situationTag && <Badge tone="purple">{org.situationTag}</Badge>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {ownerId && <Button size="sm" variant="primaryBlue" leftIcon={<Icon name="login" size={16} />} onClick={() => loginAs(ownerId)}>Login as employer</Button>}
            {ownerId && <Button size="sm" variant="outline" loading={link.isPending} onClick={() => link.mutate({ userId: ownerId, type: 'activation' })}>Activation link</Button>}
            {ownerId && <Button size="sm" variant="outline" loading={link.isPending} onClick={() => link.mutate({ userId: ownerId, type: 'password_reset' })}>Password reset link</Button>}
            {org.status !== 'active' && !blocked && <Button size="sm" variant="primary" onClick={() => setConfirm('approve')}>Approve</Button>}
            <Button size="sm" variant={blocked ? 'outline' : 'danger'} onClick={() => setConfirm(blocked ? 'approve' : 'block')}>{blocked ? 'Unblock' : 'Block'}</Button>
            {org.slug && <Button asChild size="sm" variant="ghost"><a href={publicPath} target="_blank" rel="noopener noreferrer" aria-label="Open public page"><Icon name="open_in_new" size={18} /></a></Button>}
            <Button size="sm" variant="ghost" aria-label="Duplicate company" title="Duplicate company" onClick={() => setDuplicating(true)}><Icon name="content_copy" size={18} /></Button>
            <Button size="sm" variant="ghost" aria-label="Move to trash" onClick={() => setConfirm('trash')}><Icon name="delete" size={18} /></Button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-px border-t border-brand-border bg-brand-border sm:grid-cols-5">
          {[
            ['Active jobs', jobs.active || 0],
            ['Total jobs', Object.values(jobs).reduce((a, b) => a + b, 0)],
            ['Team', members.length],
            ['Followers', org.stats?.followers || 0],
            ['Joined', formatDate(org.createdAt)],
          ].map(([label, value]) => (
            <div key={label} className="bg-white px-5 py-3">
              <p className="text-xs text-brand-gray-muted">{label}</p>
              <p className="text-sm font-semibold text-brand-dark">{value}</p>
            </div>
          ))}
        </div>
      </div>

      <Tabs value={tab} onChange={setTab} tabs={TABS.map((t) => ({ value: t, label: TAB_LABELS[t], count: t === 'kyc' ? (org.documents || []).filter((d) => d.status === 'under_review').length || undefined : undefined }))} />

      {tab === 'company' && <CompanyForm org={org} onSaved={refetch} />}
      {tab === 'team' && <Team org={org} members={members} onChanged={refetch} />}
      {tab === 'jobs' && <OrgJobs orgId={id} />}
      {tab === 'kyc' && <Kyc org={org} onChanged={refetch} />}
      {tab === 'billing' && <Billing org={org} onChanged={refetch} />}
      {tab === 'notes' && <Notes org={org} tracking={query.data.adminTracking} onChanged={refetch} />}
      {tab === 'activity' && (ownerId ? <UserActivity userId={ownerId} /> : <EmptyState title="No owner account" />)}

      {duplicating && <DuplicateEmployer org={org} onClose={() => setDuplicating(false)} />}
      <ConfirmDialog
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        title={{ block: 'Block this employer?', approve: 'Approve / unblock this employer?', trash: 'Move to trash?' }[confirm] || ''}
        message={{ block: 'Their jobs are paused and every team member is logged out.', approve: 'The employer can sign in and their pending jobs go live.', trash: 'The employer and its jobs are hidden everywhere.' }[confirm]}
        confirmLabel={{ block: 'Block', approve: 'Approve', trash: 'Move to trash' }[confirm]}
        danger={confirm !== 'approve'}
        loading={bulk.isPending}
        onConfirm={() => bulk.mutate(confirm)}
      />
    </div>
  );
};

export default AdminEmployer;
