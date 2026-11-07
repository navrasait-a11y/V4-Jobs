import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { MODULES } from './modules';
import ResourcePage from '../../components/admin/ResourcePage';
import { MediaField } from '../../components/admin/AdminActions';
import RichTextEditor from '../../components/admin/RichTextEditor';
import AccountSecurity from '../../components/shared/AccountSecurity';
import Button from '../../components/ui/Button';
import { DataTable, PageHeader, Pagination, SearchInput, Section, SimpleSelect, Tabs } from '../../components/ui/data';
import { ConfirmDialog, EmptyState, ErrorState, Icon, Modal, PageLoader } from '../../components/ui/feedback';
import { CheckboxField, Field, ChoiceChips, SelectField, TextAreaField, TextField } from '../../components/ui/form';
import useAuth from '../../hooks/useAuth';
import useDebounce from '../../hooks/useDebounce';
import { useAction, useDocumentTitle } from '../../hooks/useData';
import { useSocketEvent } from '../../hooks/useRealtime';
import { adminApi, lookupApi } from '../../services';
import { TIMESPAN_OPTIONS, formatDate, formatDateTime, timeAgo, titleCase } from '../../utils/format';

/** One config-driven screen per URL segment. */
export const AdminModule = ({ name }) => <ResourcePage key={name} config={MODULES[name]} />;

export const MediaLibrary = () => {
  useDocumentTitle('Media');
  const [file, setFile] = useState(null);
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Media" subtitle="Upload an image, then copy its link into a blog or ad" />
      <Section>
        <MediaField label="Image" value={file} onChange={setFile} />
        {file?.url && <p className="mt-3 break-all text-sm text-brand-blue">{file.url}</p>}
      </Section>
    </div>
  );
};

export const AdminAnalytics = () => {
  useDocumentTitle('Analytics');
  const [timespan, setTimespan] = useState('30d');
  const query = useQuery({ queryKey: ['admin', 'analytics', timespan], queryFn: () => adminApi.get('/analytics', { timespan }) });
  if (query.isPending) return <PageLoader />;
  if (query.isError) return <ErrorState error={query.error} onRetry={query.refetch} />;
  const d = query.data;
  const revenue = d.revenue?.daily || [];
  const growth = Object.values((d.userGrowth || []).reduce((acc, g) => ({ ...acc, [g.date]: { date: g.date, count: (acc[g.date]?.count || 0) + g.count } }), {}));
  const skills = d.topSkills || [];
  return (
    <div>
      <PageHeader title="Analytics" actions={<SimpleSelect ariaLabel="Time range" value={timespan} onChange={setTimespan} options={TIMESPAN_OPTIONS} />} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section title="Revenue">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenue}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E3E9F0" vertical={false} />
                <XAxis dataKey="_id" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} width={44} />
                <Tooltip />
                <Area dataKey="count" name="Revenue" stroke="#18A86B" fill="#E8F8F0" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Section>
        <Section title="New users">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={growth}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E3E9F0" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={32} />
                <Tooltip />
                <Area dataKey="count" name="Users" stroke="#0151A0" fill="#EDF4FC" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Section>
        {skills.length > 0 && (
          <Section title="Top skills" className="lg:col-span-2">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={skills.slice(0, 12)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E3E9F0" vertical={false} />
                  <XAxis dataKey="_id" tick={{ fontSize: 10 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={32} />
                  <Tooltip />
                  <Bar dataKey="count" name="Jobs" fill="#0151A0" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Section>
        )}
      </div>
    </div>
  );
};

/** PRD Employer Actions: "Duplicate Company" - a copy of the profile under a new owner login. */
export const DuplicateEmployer = ({ org, onClose }) => {
  const navigate = useNavigate();
  const [form, setForm] = useState({ organizationName: `${org.name} (copy)`, fullName: '', email: '', mobile: '' });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const save = useAction(() => adminApi.post(`/employers/${org._id}/duplicate`, form), {
    success: 'Employer duplicated. An activation link was sent to the new owner',
    onSuccess: (r) => {
      onClose();
      const id = r?.organization?._id || r?._id;
      if (id) navigate(`/admin/employers/${id}`);
    },
  });
  return (
    <Modal
      open
      onClose={onClose}
      title="Duplicate company"
      subtitle="Copies the profile, offices and settings. Jobs and users are not copied."
      footer={
        <Button size="sm" variant="primaryBlue" loading={save.isPending} disabled={!form.fullName || !form.email || !/^[6-9]\d{9}$/.test(form.mobile)} onClick={() => save.mutate()}>
          Duplicate
        </Button>
      }
    >
      <div className="space-y-3">
        <TextField label="New organization name" value={form.organizationName} onChange={set('organizationName')} />
        <TextField label="Owner full name" required value={form.fullName} onChange={set('fullName')} />
        <TextField label="Owner e-mail" required type="email" value={form.email} onChange={set('email')} />
        <TextField label="Owner mobile" required inputMode="numeric" maxLength={10} value={form.mobile} onChange={(e) => setForm((f) => ({ ...f, mobile: e.target.value.replace(/\D/g, '') }))} />
      </div>
    </Modal>
  );
};

export const KycQueue = () => {
  useDocumentTitle('KYC queue');
  const navigate = useNavigate();
  const query = useQuery({ queryKey: ['admin', 'kyc'], queryFn: () => adminApi.list('/employers/kyc-queue', { limit: 100 }) });
  return (
    <div>
      <PageHeader title="KYC Queue" subtitle="Documents waiting for review" />
      <DataTable
        rowKey={(r) => r.document?._id || r._id}
        columns={[
          { key: 'org', header: 'Employer', render: (r) => r.organization?.name || r.name },
          { key: 'type', header: 'Document', render: (r) => r.document?.type || r.type },
          { key: 'date', header: 'Uploaded', render: (r) => formatDate(r.document?.uploadedAt || r.uploadedAt) },
        ]}
        rows={query.data?.data}
        query={query}
        onRowClick={(r) => navigate(`/admin/employers/${r.organization?._id || r._id}`)}
        empty={<EmptyState icon="verified_user" title="Nothing to review" />}
      />
    </div>
  );
};

/** Child list -> its parent list, as in the client's Excel (Industry > Sub Industry, Level > Course > Specialisation). */
const PARENT_OF = { sub_industry: 'industry', department_function: 'department', degree: 'education_level', specialisation: 'degree' };

const RenameOption = ({ option, onClose }) => {
  const [name, setName] = useState(option.name);
  const save = useAction(() => adminApi.patch(`/master-data/item/${option._id}`, { name: name.trim() }), { success: 'Option renamed', invalidate: ['admin'], onSuccess: onClose });
  return (
    <Modal
      open
      onClose={onClose}
      title="Rename option"
      size="sm"
      footer={
        <Button size="sm" variant="primaryBlue" disabled={!name.trim()} loading={save.isPending} onClick={() => save.mutate()}>
          Save
        </Button>
      }
    >
      <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} />
    </Modal>
  );
};

export const Taxonomy = () => {
  useDocumentTitle('Master data');
  const { data: types } = useQuery({ queryKey: ['lookup-types'], queryFn: lookupApi.types });
  const [type, setTypeState] = useState('key_skill');
  const [q, setQ] = useState('');
  const term = useDebounce(q, 300);
  const [page, setPage] = useState(1);
  const [parentFilter, setParentFilter] = useState('');
  const [name, setName] = useState('');
  const [parent, setParent] = useState('');
  const [renaming, setRenaming] = useState(null);
  const [removing, setRemoving] = useState(null);
  const parentType = PARENT_OF[type];
  const setType = (t) => {
    setTypeState(t);
    setPage(1);
    setQ('');
    setParentFilter('');
    setParent('');
  };

  const query = useQuery({
    queryKey: ['admin', 'master', type, term, page, parentFilter],
    queryFn: () => adminApi.list(`/master-data/${type}`, { q: term || undefined, parent: parentFilter || undefined, page, limit: 50 }),
    placeholderData: keepPreviousData,
  });
  // Parent choices. Degrees are shown with their education level because names like "Other" repeat.
  const parents = useQuery({ queryKey: ['admin', 'master-parents', parentType], queryFn: () => lookupApi.search(parentType, { limit: 500 }), enabled: Boolean(parentType) });
  const levels = useQuery({ queryKey: ['admin', 'master-parents', 'education_level'], queryFn: () => lookupApi.search('education_level', { limit: 50 }), enabled: type === 'specialisation' });
  const levelName = Object.fromEntries((levels.data || []).map((l) => [l._id, l.name]));
  const parentOptions = (parents.data || []).map((o) => ({ value: o._id, label: type === 'specialisation' && levelName[o.parent] ? `${levelName[o.parent]} > ${o.name}` : o.name }));

  const add = useAction(() => adminApi.post(`/master-data/${type}`, { name: name.trim(), ...(parentType ? { parent } : {}) }), { success: 'Option added', invalidate: ['admin'], onSuccess: () => setName('') });
  const toggle = useAction(({ id, isActive }) => adminApi.patch(`/master-data/item/${id}`, { isActive }), { invalidate: ['admin'] });
  const importList = useAction((file) => adminApi.upload(`/master-data/${type}/import`, { file }), {
    success: (r) => `Import finished: ${r.inserted} added, ${r.updated} updated${r.errors?.length ? `, ${r.errors.length} rows skipped` : ''}`,
    invalidate: ['admin'],
  });
  const remove = useAction((id) => adminApi.del(`/master-data/item/${id}`), { success: 'Option deleted', invalidate: ['admin'], onSuccess: () => setRemoving(null) });
  const parentLabel = (o) => (o.parent ? (type === 'specialisation' && o.parent.parent?.name ? `${o.parent.parent.name} > ${o.parent.name}` : o.parent.name) : '—');

  return (
    <div>
      <PageHeader title="Master Data" subtitle="Every dropdown and suggestion list on the site" />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SimpleSelect ariaLabel="List" value={type} onChange={setType} options={(types || []).map((t) => ({ value: t.key, label: t.label }))} className="min-w-[220px] max-w-xs" />
        {parentType && <SimpleSelect ariaLabel="Filter by parent" value={parentFilter} onChange={(v) => { setParentFilter(v); setPage(1); }} options={[{ value: '', label: 'All parents' }, ...parentOptions]} className="min-w-[220px] max-w-xs" />}
        <SearchInput className="min-w-[200px] flex-1" value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search options" />
        <Button size="sm" variant="outline" className="h-10" onClick={() => adminApi.download(`/master-data/${type}/export`, {}, `${type}.xlsx`)}>
          Export
        </Button>
        <label className="inline-flex h-10 cursor-pointer items-center rounded-md border border-brand-border px-3.5 text-[13px] font-semibold text-brand-dark hover:border-[#AEB7C4]" title="Excel columns: Name, Parent, Order, Active">
          Import
          <input type="file" accept=".xlsx,.csv" hidden onChange={(e) => e.target.files?.[0] && importList.mutate(e.target.files[0])} />
        </label>
      </div>
      <form
        className="mb-4 flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          if (parentType && !parent) {
            toast.error('Choose the parent for this option');
            return;
          }
          add.mutate();
        }}
      >
        {parentType && <SimpleSelect ariaLabel="Parent of the new option" value={parent} onChange={setParent} options={[{ value: '', label: 'Choose parent' }, ...parentOptions]} className="min-w-[220px] max-w-xs" />}
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New option" aria-label="New option" maxLength={200} className="h-10 min-w-[180px] flex-1 rounded-lg border border-brand-border px-3 text-sm outline-none focus:border-[#98A2B3]" />
        <Button type="submit" size="sm" variant="primary" loading={add.isPending}>
          Add option
        </Button>
      </form>
      <DataTable
        columns={[
          { key: 'name', header: 'Name' },
          ...(parentType ? [{ key: 'parent', header: 'Parent', render: parentLabel }] : []),
          { key: 'active', header: 'Active', render: (o) => <input type="checkbox" aria-label={`${o.name} active`} checked={o.isActive !== false} onChange={(e) => toggle.mutate({ id: o._id, isActive: e.target.checked })} /> },
          { key: 'added', header: 'Added by users', render: (o) => (o.isUserAdded ? 'Yes' : 'No') },
          { key: 'used', header: 'Used', render: (o) => o.usageCount || 0 },
        ]}
        rows={query.data?.data}
        query={query}
        actions={(o) => (
          <span className="inline-flex gap-1">
            <Button size="sm" variant="ghost" onClick={() => setRenaming(o)}>
              Rename
            </Button>
            <Button size="sm" variant="dangerGhost" onClick={() => setRemoving(o)}>
              Delete
            </Button>
          </span>
        )}
      />
      <Pagination meta={query.data?.meta} onPage={setPage} />
      {renaming && <RenameOption option={renaming} onClose={() => setRenaming(null)} />}
      <ConfirmDialog
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        title={`Delete "${removing?.name}"?`}
        message="Profiles and jobs that already use it keep their value. To hide it from new forms only, untick Active instead."
        danger
        confirmLabel="Delete"
        loading={remove.isPending}
        onConfirm={() => remove.mutate(removing._id)}
      />
    </div>
  );
};

export const SupportChat = () => {
  useDocumentTitle('Support chat');
  const client = useQueryClient();
  const [active, setActive] = useState(null);
  const [text, setText] = useState('');
  const list = useQuery({ queryKey: ['admin', 'chats'], queryFn: () => adminApi.list('/chat/conversations', { type: 'support', limit: 100 }) });
  const stats = useQuery({ queryKey: ['admin', 'chat-stats'], queryFn: () => adminApi.get('/chat/stats') });
  const messages = useQuery({ queryKey: ['admin', 'chat', active?._id], queryFn: () => adminApi.get(`/chat/conversations/${active._id}/messages`), enabled: Boolean(active) });
  useSocketEvent('chat:message', () => client.invalidateQueries({ queryKey: ['admin', 'chat'] }));
  useSocketEvent('chat:conversation', () => client.invalidateQueries({ queryKey: ['admin', 'chats'] }));
  const send = useAction(() => adminApi.post(`/chat/conversations/${active._id}/messages`, { body: text }), { invalidate: ['admin'], onSuccess: () => setText('') });
  const close = useAction(() => adminApi.patch(`/chat/conversations/${active._id}`, { status: 'closed' }), { success: 'Chat closed', invalidate: ['admin'], onSuccess: () => setActive(null) });
  const items = Array.isArray(messages.data) ? messages.data : [];
  const nameOf = (c) => c.participants?.[0]?.profile?.name || c.participants?.[0]?.user?.fullName || c.subject || 'Support chat';
  return (
    <div>
      <PageHeader title="Support Chat" subtitle={stats.data ? `${stats.data.openSupport ?? 0} open` : undefined} />
      <div className="grid h-[calc(100vh-13rem)] overflow-hidden surface md:grid-cols-3">
        <div className={`overflow-y-auto border-r border-brand-border ${active ? 'hidden md:block' : ''}`}>
          {list.data && !list.data.data.length && <EmptyState className="m-3 border-0" icon="support_agent" title="No support chats" />}
          {list.data?.data.map((c) => (
            <button key={c._id} onClick={() => setActive(c)} className={`block w-full border-b border-brand-border/60 p-3 text-left hover:bg-brand-tint ${active?._id === c._id ? 'bg-brand-blue-tint' : ''}`}>
              <p className="truncate text-sm font-semibold text-brand-dark">{nameOf(c)}</p>
              <p className="truncate text-xs text-brand-gray">{c.lastMessage?.body}</p>
              <p className="text-[11px] text-brand-gray-muted">{timeAgo(c.updatedAt)}</p>
            </button>
          ))}
        </div>
        {active ? (
          <div className="flex min-h-0 flex-col md:col-span-2">
            <div className="flex items-center justify-between gap-2 border-b border-brand-border p-3">
              <button onClick={() => setActive(null)} aria-label="Back" className="md:hidden">
                <Icon name="arrow_back" />
              </button>
              <p className="truncate text-sm font-semibold text-brand-dark">{nameOf(active)}</p>
              <Button size="sm" variant="outline" onClick={() => close.mutate()}>
                Close chat
              </Button>
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto bg-brand-tint p-3">
              {items.map((m) => (
                <div key={m._id} className="w-fit max-w-[80%] rounded-lg border border-brand-border bg-white px-3 py-2 text-sm text-brand-dark">
                  {m.body}
                  <p className="text-[10px] text-brand-gray-muted">{formatDateTime(m.createdAt)}</p>
                </div>
              ))}
            </div>
            <form
              className="flex gap-2 border-t border-brand-border p-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (text.trim()) send.mutate();
              }}
            >
              <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Reply" aria-label="Reply" className="h-10 min-w-0 flex-1 rounded-lg border border-brand-border px-3 text-sm outline-none focus:border-[#98A2B3]" />
              <Button type="submit" size="sm" variant="primaryBlue" loading={send.isPending}>
                Send
              </Button>
            </form>
          </div>
        ) : (
          <div className="hidden items-center justify-center text-sm text-brand-gray-muted md:col-span-2 md:flex">Select a chat</div>
        )}
      </div>
    </div>
  );
};

export const Communications = () => {
  useDocumentTitle('Bulk messages');
  const blank = { audience: 'candidates', channels: ['email'], subject: '', message: '', html: '' };
  const [form, setForm] = useState(blank);
  const [confirm, setConfirm] = useState(false);
  const send = useAction(() => adminApi.post('/messages/bulk', { ...form, html: form.channels.includes('email') && form.html ? form.html : undefined }), {
    success: 'Messages queued',
    onSuccess: () => {
      setConfirm(false);
      setForm(blank);
    },
  });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? e.target.value : e }));
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Bulk Messages" subtitle="Send alerts to a group of users" />
      <Section>
        <div className="space-y-4">
          <SelectField label="Audience" placeholder={null} options={['candidates', 'employers', 'companies', 'consultancies'].map((v) => ({ value: v, label: titleCase(v) }))} value={form.audience} onChange={set('audience')} />
          <Field label="Channels">
            <ChoiceChips multiple options={['email', 'sms', 'whatsapp', 'in_app', 'push'].map((v) => ({ value: v, label: titleCase(v) }))} value={form.channels} onChange={set('channels')} />
          </Field>
          <TextField label="Subject" required value={form.subject} onChange={set('subject')} />
          <TextAreaField label="Short message" required rows={3} value={form.message} onChange={set('message')} hint="Used for SMS, WhatsApp, push and in-app. Keep it short and plain." maxLength={5000} />
          {form.channels.includes('email') && (
            <RichTextEditor label="E-mail content (formatted)" value={form.html} onChange={set('html')} minHeight={260} hint="Optional. Leave empty to e-mail the short message." />
          )}
          <Button size="sm" variant="primary" disabled={!form.subject || !form.message || !form.channels.length} onClick={() => setConfirm(true)}>
            Review and send
          </Button>
        </div>
      </Section>
      <Modal open={confirm} onClose={() => setConfirm(false)} title="Send to everyone in this audience?" size="sm" footer={<Button size="sm" variant="primary" loading={send.isPending} onClick={() => send.mutate()}>Send now</Button>}>
        <p className="text-sm text-brand-gray">This sends real messages to {form.audience} on {form.channels.join(', ')} and cannot be undone.</p>
      </Modal>
    </div>
  );
};

const SettingEditor = ({ item }) => {
  const isBool = typeof item.value === 'boolean';
  const isObject = item.value !== null && typeof item.value === 'object';
  const [value, setValue] = useState(isObject ? JSON.stringify(item.value, null, 2) : item.value ?? '');
  const save = useAction(
    () => {
      let v = value;
      if (isObject) v = JSON.parse(value);
      else if (typeof item.value === 'number') v = Number(value);
      return adminApi.put(`/settings/${item.key}`, { value: v });
    },
    { success: 'Setting saved', invalidate: ['admin'] },
  );
  return (
    <div className="border-b border-brand-border py-3 last:border-0">
      {isBool ? (
        <CheckboxField label={item.key} description={item.description} checked={Boolean(value)} onChange={(e) => setValue(e.target.checked)} />
      ) : isObject ? (
        <TextAreaField label={item.key} hint={item.description} rows={4} value={value} onChange={(e) => setValue(e.target.value)} />
      ) : (
        <TextField label={item.key} hint={item.description} value={value} onChange={(e) => setValue(e.target.value)} />
      )}
      <Button size="sm" variant="outline" className="mt-2" loading={save.isPending} onClick={() => save.mutate()}>
        Save
      </Button>
    </div>
  );
};

export const AdminSettings = () => {
  useDocumentTitle('Settings');
  const [group, setGroup] = useState('platform');
  const [to, setTo] = useState('');
  const [mobile, setMobile] = useState('');
  const query = useQuery({ queryKey: ['admin', 'settings', group], queryFn: () => adminApi.get('/settings', { group }) });
  const testEmail = useAction(() => adminApi.post('/settings/test-email', { to }), { success: 'Test e-mail sent' });
  const testSms = useAction(() => adminApi.post('/settings/test-sms', { mobile, template: 'generic' }), { success: 'Test SMS sent' });
  const rows = Array.isArray(query.data) ? query.data : query.data?.items || Object.entries(query.data || {}).map(([key, value]) => ({ key, value }));
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Settings" />
      <Tabs className="mb-4" value={group} onChange={setGroup} tabs={['platform', 'payments', 'ads', 'ai', 'integrations'].map((g) => ({ value: g, label: titleCase(g) }))} />
      <Section>
        {query.isPending && <PageLoader className="h-40" />}
        {query.isError && <ErrorState error={query.error} />}
        {rows.map((item) => (
          <SettingEditor key={item.key} item={item} />
        ))}
      </Section>
      {group === 'integrations' && (
        <Section title="Provider tests" className="mt-4">
          <p className="mb-3 text-sm text-brand-gray">Each test sends one real message.</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex items-end gap-2">
              <TextField className="flex-1" label="Test e-mail to" type="email" value={to} onChange={(e) => setTo(e.target.value)} />
              <Button size="sm" variant="outline" className="h-11" disabled={!to} loading={testEmail.isPending} onClick={() => testEmail.mutate()}>
                Send
              </Button>
            </div>
            <div className="flex items-end gap-2">
              <TextField className="flex-1" label="Test SMS to" value={mobile} onChange={(e) => setMobile(e.target.value)} />
              <Button size="sm" variant="outline" className="h-11" disabled={!mobile} loading={testSms.isPending} onClick={() => testSms.mutate()}>
                Send
              </Button>
            </div>
          </div>
        </Section>
      )}
    </div>
  );
};

export const AdminProfile = () => {
  useDocumentTitle('My profile');
  const { loadMe } = useAuth();
  const query = useQuery({ queryKey: ['admin', 'profile'], queryFn: () => adminApi.get('/profile') });
  const [form, setForm] = useState(null);
  useEffect(() => {
    if (query.data) setForm({ fullName: query.data.fullName || '', nickname: query.data.admin?.nickname || '', designation: query.data.admin?.designation || '', bio: query.data.admin?.bio || '' });
  }, [query.data]);
  const save = useAction(() => adminApi.patch('/profile', form), { success: 'Profile saved', invalidate: ['admin'], onSuccess: loadMe });
  if (!form) return <PageLoader />;
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader title="My Profile" />
      <Section title="Blog author details">
        <div className="space-y-4">
          <TextField label="Full name" value={form.fullName} onChange={set('fullName')} />
          <TextField label="Nickname" value={form.nickname} onChange={set('nickname')} />
          <TextField label="Designation" value={form.designation} onChange={set('designation')} />
          <TextAreaField label="Bio" value={form.bio} onChange={set('bio')} />
          <Button size="sm" variant="primaryBlue" loading={save.isPending} onClick={() => save.mutate()}>
            Save
          </Button>
        </div>
      </Section>
      <AccountSecurity />
    </div>
  );
};
