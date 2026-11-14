import React, { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import AccountPanel, { CANDIDATE_LABELS } from '../../components/admin/AccountPanel';
import { PlanAndWallet } from '../../components/admin/AdminActions';
import UserActivity from '../../components/admin/UserActivity';
import UsageReport from '../../components/admin/UsageReport';
import { ProfileApiContext } from '../../components/candidate/ProfileForms';
import Button from '../../components/ui/Button';
import { Avatar, Badge, DataTable, Section, SimpleSelect, StatTile, StatusBadge, Tabs } from '../../components/ui/data';
import { ConfirmDialog, EmptyState, ErrorState, Icon, PageLoader } from '../../components/ui/feedback';
import { CheckboxField, Field, TextAreaField } from '../../components/ui/form';
import { useAction, useDocumentTitle } from '../../hooks/useData';
import { adminApi } from '../../services';
import { loginAs } from '../../components/admin/loginAs';
import { CALLING_LABELS, MESSAGING_LABELS, SCREENING_LABELS, formatDate, formatDateTime, monthsToExperience, placeLabel, timeAgo, titleCase } from '../../utils/format';
import { ProfileView } from '../candidate/Profile';

const TABS = [
  { value: 'profile', label: 'Profile' },
  { value: 'account', label: 'Account & access' },
  { value: 'applications', label: 'Applications' },
  { value: 'screening', label: 'Screening & notes' },
  { value: 'billing', label: 'Packages & wallet' },
  { value: 'activity', label: 'Activity' },
];
const opts = (map) => Object.entries(map).map(([value, label]) => ({ value, label }));


/** Candidate screening, calling and messaging status plus admin comments (PRD 4.1 Candidates). */
const Screening = ({ id, tracking }) => {
  const [comment, setComment] = useState('');
  const save = useAction((body) => adminApi.patch(`/candidates/${id}/tracking`, body), { success: 'Saved', invalidate: ['admin'] });
  const t = tracking || {};
  return (
    <div className="space-y-4">
      <Section title="Status">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Screening status">
            <SimpleSelect className="w-full" placeholder="Not set" value={t.screeningStatus} onChange={(v) => v && save.mutate({ screeningStatus: v })} options={opts(SCREENING_LABELS)} />
          </Field>
          <Field label="Calling status">
            <SimpleSelect className="w-full" placeholder="Not set" value={t.callingStatus} onChange={(v) => v && save.mutate({ callingStatus: v })} options={opts(CALLING_LABELS)} />
          </Field>
        </div>
        <Field className="mt-4" label="Messaging status">
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {Object.entries(MESSAGING_LABELS).map(([k, label]) => (
              <CheckboxField key={k} label={label} checked={(t.messagingStatus || []).includes(k)} onChange={(e) => e.target.checked && save.mutate({ messagingStatus: [k] })} />
            ))}
          </div>
        </Field>
      </Section>
      <Section title="Admin comments">
        <form
          className="flex flex-col gap-2 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            if (comment.trim()) save.mutate({ comment: comment.trim() }, { onSuccess: () => setComment('') });
          }}
        >
          <TextAreaField className="flex-1" label="Add a comment" rows={2} value={comment} onChange={(e) => setComment(e.target.value)} maxLength={2000} />
          <Button type="submit" size="sm" variant="primaryBlue" disabled={!comment.trim()} loading={save.isPending}>
            Add
          </Button>
        </form>
        <ul className="mt-4 space-y-3">
          {[...(t.comments || [])].reverse().map((c) => (
            <li key={c._id} className="rounded-lg bg-brand-tint p-3 text-sm">
              <p className="whitespace-pre-line text-brand-dark">{c.body}</p>
              <p className="mt-1 text-xs text-brand-gray-muted">
                {c.by?.admin?.nickname || c.by?.fullName || 'Admin'} · {timeAgo(c.at)}
              </p>
            </li>
          ))}
          {!t.comments?.length && <p className="text-sm text-brand-gray-muted">No comments yet.</p>}
        </ul>
      </Section>
    </div>
  );
};

/** Admin view of one candidate: every detail editable, plus applications, screening, billing and activity. */
const AdminCandidate = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState('profile');
  const [confirm, setConfirm] = useState(null);
  const query = useQuery({ queryKey: ['admin', 'candidate', id], queryFn: () => adminApi.get(`/candidates/${id}`) });
  const profileQuery = useQuery({ queryKey: ['admin', 'candidate-profile', id], queryFn: () => adminApi.get(`/candidates/${id}/profile`), enabled: tab === 'profile' });
  const base = `/candidates/${id}/profile`;
  const ctx = useMemo(
    () => ({
      invalidate: ['admin'],
      api: {
        update: (body) => adminApi.patch(base, body),
        addItem: (kind, body) => adminApi.post(`${base}/${kind}`, body),
        updateItem: (kind, itemId, body) => adminApi.patch(`${base}/${kind}/${itemId}`, body),
        removeItem: (kind, itemId) => adminApi.del(`${base}/${kind}/${itemId}`),
        uploadResume: (file) => adminApi.upload(`${base}/resume`, { resume: file }),
        deleteResume: () => adminApi.del(`${base}/resume`),
        resumeLink: () => adminApi.get(`${base}/resume/download`),
        uploadAvatar: (file) => adminApi.upload(`${base}/avatar`, { avatar: file }),
      },
    }),
    [base],
  );
  const link = useAction((type) => adminApi.post(`/users/${id}/send-link`, { type }), { success: 'E-mail sent' });
  const bulk = useAction((action) => adminApi.post('/candidates/bulk', { ids: [id], action }), {
    success: 'Updated',
    invalidate: ['admin'],
    onSuccess: () => {
      if (confirm === 'delete') navigate('/admin/candidates');
      setConfirm(null);
    },
  });
  useDocumentTitle(query.data?.user?.fullName || 'Candidate');
  if (query.isPending) return <PageLoader />;
  if (query.isError) return <ErrorState error={query.error} onRetry={query.refetch} />;
  const { user = {}, profile = {}, applications = [], adminTracking } = query.data;
  const blocked = ['blocked', 'suspended'].includes(user.status);

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <Link to="/admin/candidates" className="inline-flex items-center gap-1 text-sm font-medium text-brand-blue">
        <Icon name="arrow_back" size={16} /> Candidates
      </Link>
      <div className="surface overflow-hidden">
        <div className="relative h-20 overflow-hidden bg-gradient-to-r from-[#0A4F8C] via-brand-blue to-[#4F8FD6] sm:h-24" aria-hidden="true">
          <div className="absolute -right-10 -top-12 h-40 w-40 rounded-full bg-white/10" />
          <div className="absolute right-24 top-6 h-20 w-20 rounded-full bg-white/10" />
        </div>
        {/* Only the photo overlaps the banner; the name and details always sit on the white card. */}
        <div className="flex flex-col gap-3 px-4 pb-5 sm:px-5 lg:flex-row lg:items-start lg:gap-5">
          <Avatar name={user.fullName} src={user.avatar?.url} size={96} className="relative z-10 -mt-12 shrink-0 shadow-md ring-4 ring-white" />
          <div className="min-w-0 flex-1 lg:pt-3">
            <h1 className="flex flex-wrap items-center gap-x-2 gap-y-1 break-words text-xl font-bold leading-tight text-brand-dark sm:text-2xl">
              {user.fullName}
              {user.isVerified && <Icon name="verified" size={18} fill className="text-brand-green" />}
              <StatusBadge status={user.status} />
            </h1>
            <p className="mt-1 text-[15px] text-brand-gray">{[profile.currentJobTitle, profile.currentEmployer].filter(Boolean).join(' at ') || profile.resumeHeadline || 'No headline yet'}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-brand-gray-muted">
              <span className="font-mono">{user.uid}</span>
              {user.email && <span className="flex items-center gap-1"><Icon name="mail" size={14} /> {user.email} {user.emailVerifiedAt && <Icon name="check_circle" size={13} className="text-brand-green" />}</span>}
              {user.mobile && <span className="flex items-center gap-1"><Icon name="call" size={14} /> +91 {user.mobile} {user.mobileVerifiedAt && <Icon name="check_circle" size={13} className="text-brand-green" />}</span>}
              {profile.currentLocation && <span className="flex items-center gap-1"><Icon name="location_on" size={14} /> {placeLabel(profile.currentLocation)}</span>}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(user.labels || []).map((l) => (
                <Badge key={l} tone="orange">{titleCase(l)}</Badge>
              ))}
              {user.situationTag && <Badge tone="purple">{user.situationTag}</Badge>}
              <Badge tone="gray">Source: {titleCase(user.source || 'direct')}</Badge>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 lg:max-w-[46%] lg:justify-end lg:pt-3">
            <Button size="sm" variant="primaryBlue" leftIcon={<Icon name="login" size={16} />} onClick={() => loginAs(id, user.fullName)}>
              Login as user
            </Button>
            <Button size="sm" variant="outline" loading={link.isPending} onClick={() => link.mutate('activation')}>
              Activation link
            </Button>
            <Button size="sm" variant="outline" loading={link.isPending} onClick={() => link.mutate('password_reset')}>
              Password reset link
            </Button>
            <Button size="sm" variant={blocked ? 'outline' : 'danger'} onClick={() => setConfirm(blocked ? 'approve' : 'block')}>
              {blocked ? 'Unblock' : 'Block'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirm('trash')} aria-label="Move to trash">
              <Icon name="delete" size={18} />
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-px border-t border-brand-border bg-brand-border sm:grid-cols-4">
          {[
            ['Experience', monthsToExperience(profile.totalExperienceMonths)],
            ['Applications', applications.length],
            ['Profile strength', `${profile.profileCompletion || 0}%`],
            ['Last login', user.lastLoginAt ? timeAgo(user.lastLoginAt) : 'Never'],
          ].map(([label, value]) => (
            <div key={label} className="bg-white px-5 py-3">
              <p className="text-xs text-brand-gray-muted">{label}</p>
              <p className="text-sm font-semibold text-brand-dark">{value}</p>
            </div>
          ))}
        </div>
      </div>

      <Tabs value={tab} onChange={setTab} tabs={TABS.map((t) => ({ ...t, count: t.value === 'applications' ? applications.length : undefined }))} />

      {tab === 'profile' &&
        (profileQuery.isPending ? (
          <PageLoader className="min-h-[30vh]" />
        ) : profileQuery.isError ? (
          <ErrorState error={profileQuery.error} onRetry={profileQuery.refetch} />
        ) : (
          <ProfileApiContext.Provider value={ctx}>
            <ProfileView query={profileQuery} onChanged={() => query.refetch()} />
          </ProfileApiContext.Provider>
        ))}
      {tab === 'account' && <AccountPanel user={user} labels={CANDIDATE_LABELS} onSaved={() => query.refetch()} />}
      {tab === 'applications' && (
        <Section title="Applications">
          <DataTable
            columns={[
              { key: 'job', header: 'Job', render: (a) => <span className="font-medium">{a.job?.title}</span> },
              { key: 'company', header: 'Company', render: (a) => a.job?.orgSnapshot?.name },
              { key: 'stage', header: 'Stage', render: (a) => <StatusBadge status={a.stage} /> },
              { key: 'screening', header: 'Screening', render: (a) => (a.screeningStatus ? SCREENING_LABELS[a.screeningStatus] : '—') },
              { key: 'source', header: 'Source', render: (a) => titleCase(a.source || '') },
              { key: 'date', header: 'Applied', render: (a) => formatDate(a.createdAt) },
            ]}
            rows={applications}
            empty={<EmptyState icon="description" title="No applications yet" />}
          />
        </Section>
      )}
      {tab === 'screening' && <Screening id={id} tracking={adminTracking} />}
      {tab === 'billing' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatTile icon="rocket_launch" label="Profile booster" value={profile.boostUntil && new Date(profile.boostUntil) > new Date() ? `Till ${formatDate(profile.boostUntil)}` : 'Not active'} />
            <StatTile icon="visibility" label="Profile views" value={profile.stats?.profileViews || 0} />
            <StatTile icon="download" label="Resume downloads" value={profile.stats?.resumeDownloads || 0} />
          </div>
          <PlanAndWallet target={{ userId: id }} audience="candidate" />
        </div>
      )}
      {tab === 'activity' && (
        <div className="space-y-4">
          <Section title="Account timeline">
            <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
              <div><dt className="text-xs text-brand-gray-muted">Registered</dt><dd>{formatDateTime(user.createdAt)}</dd></div>
              <div><dt className="text-xs text-brand-gray-muted">Last login</dt><dd>{user.lastLoginAt ? formatDateTime(user.lastLoginAt) : 'Never'}</dd></div>
              <div><dt className="text-xs text-brand-gray-muted">Last active</dt><dd>{user.lastActiveAt ? formatDateTime(user.lastActiveAt) : '—'}</dd></div>
            </dl>
          </Section>
          <UsageReport userId={id} candidate />
          <UserActivity userId={id} />
        </div>
      )}

      <ConfirmDialog
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        title={{ block: 'Block this candidate?', approve: 'Unblock this candidate?', trash: 'Move to trash?' }[confirm] || ''}
        message={{ block: 'They are logged out and cannot sign in until unblocked.', approve: 'They can sign in again.', trash: 'The account is hidden everywhere. You can restore it from the Trash filter.' }[confirm]}
        confirmLabel={{ block: 'Block', approve: 'Unblock', trash: 'Move to trash' }[confirm]}
        danger={confirm !== 'approve'}
        loading={bulk.isPending}
        onConfirm={() => bulk.mutate(confirm)}
      />
    </div>
  );
};

export default AdminCandidate;
