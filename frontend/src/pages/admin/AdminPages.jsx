import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { MODULES } from './modules';
import ResourcePage from '../../components/admin/ResourcePage';
import { MediaField, PlanAndWallet } from '../../components/admin/AdminActions';
import AccountSecurity from '../../components/shared/AccountSecurity';
import Button from '../../components/ui/Button';
import { Avatar, DataTable, DetailRow, PageHeader, Section, SimpleSelect, StatTile, StatusBadge, Tabs } from '../../components/ui/data';
import { EmptyState, ErrorState, Icon, Modal, PageLoader } from '../../components/ui/feedback';
import { CheckboxField, Field, ChoiceChips, SelectField, TextAreaField, TextField } from '../../components/ui/form';
import useAuth from '../../hooks/useAuth';
import { useAction, useDocumentTitle } from '../../hooks/useData';
import { useSocketEvent } from '../../hooks/useRealtime';
import { adminApi, lookupApi } from '../../services';
import { TIMESPAN_OPTIONS, formatCurrency, formatDate, formatDateTime, formatNumber, timeAgo, titleCase } from '../../utils/format';

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

export const Overview = () => {
  useDocumentTitle('Admin overview');
  const [timespan, setTimespan] = useState('30d');
  const query = useQuery({ queryKey: ['admin', 'dashboard', timespan], queryFn: () => adminApi.get('/dashboard', { timespan }) });
  const logins = useQuery({ queryKey: ['admin', 'logins', timespan], queryFn: () => adminApi.get('/stats/logins', { timespan }) });
  const messaging = useQuery({ queryKey: ['admin', 'messaging', timespan], queryFn: () => adminApi.get('/stats/messaging', { timespan }) });
  if (query.isError) return <ErrorState error={query.error} onRetry={query.refetch} />;
  const d = query.data || {};
  const q = d.pending || {};
  const employers = (d.employers?.company?.total || 0) + (d.employers?.consultancy?.total || 0);
  const L = query.isPending;
  return (
    <div>
      <PageHeader title="Overview" actions={<SimpleSelect ariaLabel="Time range" value={timespan} onChange={setTimespan} options={TIMESPAN_OPTIONS} />} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile loading={L} icon="person" label="Candidates" value={formatNumber(d.users?.candidate?.total ?? 0)} to="/admin/candidates" />
        <StatTile loading={L} icon="apartment" tone="orange" label="Employers" value={formatNumber(employers)} to="/admin/employers" />
        <StatTile loading={L} icon="work" tone="green" label="Active jobs" value={formatNumber(d.jobs?.active ?? 0)} to="/admin/jobs" />
        <StatTile loading={L} icon="payments" tone="purple" label="Revenue" value={formatCurrency(d.revenue?.revenue ?? 0)} to="/admin/orders" />
      </div>
      <h2 className="mb-2 mt-6 font-bold text-brand-dark">Needs attention</h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile loading={L} icon="flag" tone="red" label="Open reports" value={q.reports ?? 0} to="/admin/moderation?status=open" />
        <StatTile loading={L} icon="verified_user" tone="orange" label="KYC documents" value={q.kycReviews ?? 0} to="/admin/kyc" />
        <StatTile loading={L} icon="rule" tone="blue" label="Jobs to review" value={q.jobReviews ?? 0} to="/admin/jobs?status=admin_review" />
        <StatTile loading={L} icon="support_agent" tone="green" label="Support chats" value={q.supportChats ?? 0} to="/admin/support-chat" />
      </div>
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section title="Logins">
          <div className="grid grid-cols-3 gap-2 text-center text-sm">
            {[['Attempts', logins.data?.totalAttempts], ['Successful', logins.data?.successful], ['Failed', logins.data?.failed]].map(([k, v]) => (
              <div key={k}>
                <p className="text-xl font-bold text-brand-dark">{formatNumber(v ?? 0)}</p>
                <p className="text-xs text-brand-gray-muted">{k}</p>
              </div>
            ))}
          </div>
        </Section>
        <Section title="E-mail delivery">
          <div className="grid grid-cols-3 gap-2 text-center text-sm">
            {[['Sent', messaging.data?.emails?.sent], ['Failed', messaging.data?.emails?.failed], ['Queued', messaging.data?.emails?.queued]].map(([k, v]) => (
              <div key={k}>
                <p className="text-xl font-bold text-brand-dark">{formatNumber(v ?? 0)}</p>
                <p className="text-xs text-brand-gray-muted">{k}</p>
              </div>
            ))}
          </div>
        </Section>
      </div>
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

export const CandidateDetail = () => {
  const { id } = useParams();
  useDocumentTitle('Candidate');
  const query = useQuery({ queryKey: ['admin', 'candidate', id], queryFn: () => adminApi.get(`/candidates/${id}`) });
  const link = useAction((type) => adminApi.post(`/users/${id}/send-link`, { type }), { success: 'Link sent' });
  if (query.isPending) return <PageLoader />;
  if (query.isError) return <ErrorState error={query.error} onRetry={query.refetch} />;
  const { user = {}, profile = {}, applications = [] } = query.data;
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Link to="/admin/candidates" className="text-sm font-medium text-brand-blue">← Candidates</Link>
      <Section>
        <div className="flex flex-wrap items-center gap-4">
          <Avatar name={user.fullName} src={user.avatar?.url} size={64} />
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold text-brand-dark">{user.fullName}</h1>
            <p className="text-xs text-brand-gray-muted">{user.uid}</p>
          </div>
          <StatusBadge status={user.status} />
        </div>
        <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <DetailRow label="Email" value={user.email} />
          <DetailRow label="Mobile" value={user.mobile} />
          <DetailRow label="Source" value={titleCase(user.source || '')} />
          <DetailRow label="Experience" value={profile.experienceLevel} />
          <DetailRow label="Headline" value={profile.resumeHeadline} />
          <DetailRow label="Joined" value={formatDate(user.createdAt)} />
        </dl>
        <div className="mt-4 flex gap-2">
          <Button size="sm" variant="outline" onClick={() => link.mutate('password_reset')}>
            Send password reset
          </Button>
          <Button size="sm" variant="outline" onClick={() => link.mutate('activation')}>
            Send activation
          </Button>
        </div>
      </Section>
      <PlanAndWallet target={{ userId: id }} audience="candidate" />
      <Section title="Applications">
        <DataTable
          columns={[
            { key: 'job', header: 'Job', render: (a) => a.job?.title },
            { key: 'stage', header: 'Stage', render: (a) => <StatusBadge status={a.stage} /> },
            { key: 'date', header: 'Applied', render: (a) => formatDate(a.createdAt) },
          ]}
          rows={applications}
          empty={<EmptyState title="No applications" />}
        />
      </Section>
    </div>
  );
};

export const EmployerDetail = () => {
  const { id } = useParams();
  useDocumentTitle('Employer');
  const query = useQuery({ queryKey: ['admin', 'employer', id], queryFn: () => adminApi.get(`/employers/${id}`) });
  const [credits, setCredits] = useState({ metric: 'job_post', amount: '', note: '' });
  const grant = useAction(() => adminApi.post(`/employers/${id}/credits`, { credits: { [credits.metric]: Number(credits.amount) }, note: credits.note || 'Admin adjustment' }), { success: 'Credits updated', invalidate: ['admin'] });
  const remind = useAction(() => adminApi.post('/employers/kyc-reminders', { ids: [id] }), { success: 'Reminder sent' });
  const review = useAction(({ docId, status }) => adminApi.patch(`/employers/${id}/documents/${docId}`, { status }), { success: 'Document updated', invalidate: ['admin'] });
  if (query.isPending) return <PageLoader />;
  if (query.isError) return <ErrorState error={query.error} onRetry={query.refetch} />;
  const org = query.data.organization || query.data;
  const members = query.data.members || [];
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Link to="/admin/employers" className="text-sm font-medium text-brand-blue">← Employers</Link>
      <Section>
        <div className="flex flex-wrap items-center gap-4">
          <Avatar name={org.name} src={org.logo?.url} size={64} square />
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold text-brand-dark">{org.name}</h1>
            <p className="text-xs text-brand-gray-muted">{org.uid} · {titleCase(org.type || '')}</p>
          </div>
          <StatusBadge status={org.status} />
          <StatusBadge status={org.kycStatus} />
        </div>
        <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <DetailRow label="Website" value={org.website} />
          <DetailRow label="GST" value={org.gstNumber} />
          <DetailRow label="PAN" value={org.panNumber} />
        </dl>
      </Section>
      <Section
        title="KYC documents"
        actions={
          <Button size="sm" variant="outline" loading={remind.isPending} onClick={() => remind.mutate()}>
            Send reminder
          </Button>
        }
      >
        <DataTable
          columns={[
            { key: 'type', header: 'Type' },
            { key: 'number', header: 'Number', render: (d) => d.number || '—' },
            { key: 'status', header: 'Status', render: (d) => <StatusBadge status={d.status} /> },
            { key: 'file', header: 'File', render: (d) => (d.downloadUrl || d.url ? <a href={d.downloadUrl || d.url} target="_blank" rel="noopener noreferrer" className="text-brand-blue underline">Open</a> : '—') },
          ]}
          rows={org.documents || query.data.documents}
          empty={<EmptyState title="No documents" />}
          actions={(d) => (
            <>
              <Button size="sm" variant="ghost" onClick={() => review.mutate({ docId: d._id, status: 'verified' })}>
                Verify
              </Button>
              <Button size="sm" variant="dangerGhost" onClick={() => review.mutate({ docId: d._id, status: 'rejected' })}>
                Reject
              </Button>
            </>
          )}
        />
      </Section>
      <Section title="Team">
        <ul className="divide-y divide-brand-border text-sm">
          {members.map((m) => (
            <li key={m._id} className="flex justify-between gap-2 py-2">
              {m.fullName} <span className="text-xs text-brand-gray-muted">{m.email}</span>
            </li>
          ))}
        </ul>
      </Section>
      <PlanAndWallet target={{ organizationId: id }} audience="employer" />
      <Section title="Adjust credits">
        <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-4">
          <SelectField label="Credit" placeholder={null} options={['job_post', 'featured_job', 'resume_view', 'resume_download', 'invite', 'excel_download', 'resume_search'].map((v) => ({ value: v, label: titleCase(v) }))} value={credits.metric} onChange={(e) => setCredits((c) => ({ ...c, metric: e.target.value }))} />
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

export const Taxonomy = () => {
  useDocumentTitle('Master data');
  const { data: types } = useQuery({ queryKey: ['lookup-types'], queryFn: lookupApi.types });
  const [type, setType] = useState('key_skill');
  const [name, setName] = useState('');
  const query = useQuery({ queryKey: ['admin', 'master', type], queryFn: () => adminApi.list(`/master-data/${type}`, { limit: 200 }) });
  const add = useAction(() => adminApi.post(`/master-data/${type}`, { name }), { success: 'Option added', invalidate: ['admin'], onSuccess: () => setName('') });
  const toggle = useAction(({ id, isActive }) => adminApi.patch(`/master-data/item/${id}`, { isActive }), { invalidate: ['admin'] });
  const importList = useAction((file) => adminApi.upload(`/master-data/${type}/import`, { file }), { success: 'Import finished', invalidate: ['admin'] });
  const remove = useAction((id) => adminApi.del(`/master-data/item/${id}`), { success: 'Option deleted', invalidate: ['admin'] });
  return (
    <div>
      <PageHeader title="Master Data" subtitle="All dropdowns on the site" />
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <SimpleSelect ariaLabel="List" value={type} onChange={setType} options={(types || []).map((t) => ({ value: t.key, label: t.label }))} className="max-w-xs" />
        <Button size="sm" variant="outline" className="h-10" onClick={() => adminApi.download(`/master-data/${type}/export`, {}, `${type}.xlsx`)}>
          Export
        </Button>
        <label className="inline-flex h-10 cursor-pointer items-center rounded-md border border-brand-border px-3.5 text-[13px] font-semibold text-brand-dark hover:border-brand-blue">
          Import
          <input type="file" accept=".xlsx,.csv" hidden onChange={(e) => e.target.files?.[0] && importList.mutate(e.target.files[0])} />
        </label>
        <form
          className="flex flex-1 gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) add.mutate();
          }}
        >
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New option" aria-label="New option" className="h-10 min-w-0 flex-1 rounded-lg border border-brand-border px-3 text-sm outline-none focus:border-[#98A2B3]" />
          <Button type="submit" size="sm" variant="primary" loading={add.isPending}>
            Add
          </Button>
        </form>
      </div>
      <DataTable
        columns={[
          { key: 'name', header: 'Name' },
          { key: 'active', header: 'Active', render: (o) => <input type="checkbox" aria-label="Active" checked={o.isActive !== false} onChange={(e) => toggle.mutate({ id: o._id, isActive: e.target.checked })} /> },
          { key: 'added', header: 'Added by users', render: (o) => (o.isUserAdded ? 'Yes' : 'No') },
        ]}
        rows={query.data?.data}
        query={query}
        actions={(o) => (
          <Button size="sm" variant="dangerGhost" onClick={() => remove.mutate(o._id)}>
            Delete
          </Button>
        )}
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
  const blank = { audience: 'candidates', channels: ['email'], subject: '', message: '' };
  const [form, setForm] = useState(blank);
  const [confirm, setConfirm] = useState(false);
  const send = useAction(() => adminApi.post('/messages/bulk', form), {
    success: 'Messages queued',
    onSuccess: () => {
      setConfirm(false);
      setForm(blank);
    },
  });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? e.target.value : e }));
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Bulk Messages" subtitle="Send alerts to a group of users" />
      <Section>
        <div className="space-y-4">
          <SelectField label="Audience" placeholder={null} options={['candidates', 'employers', 'companies', 'consultancies'].map((v) => ({ value: v, label: titleCase(v) }))} value={form.audience} onChange={set('audience')} />
          <Field label="Channels">
            <ChoiceChips multiple options={['email', 'sms', 'whatsapp', 'in_app', 'push'].map((v) => ({ value: v, label: titleCase(v) }))} value={form.channels} onChange={set('channels')} />
          </Field>
          <TextField label="Subject" required value={form.subject} onChange={set('subject')} />
          <TextAreaField label="Message" required rows={6} value={form.message} onChange={set('message')} />
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
