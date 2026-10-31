import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import AccountSecurity from '../../components/shared/AccountSecurity';
import Button from '../../components/ui/Button';
import { PageHeader, Pagination, Section, Tabs } from '../../components/ui/data';
import { ConfirmDialog, ErrorState, PageLoader } from '../../components/ui/feedback';
import { CheckboxField, SelectField, TextAreaField, TextField } from '../../components/ui/form';
import useAuth from '../../hooks/useAuth';
import { useAction, useCandidateProfile, useDocumentTitle, usePublicSettings } from '../../hooks/useData';
import { authApi, candidateApi, moderationApi } from '../../services';
import { formatDateTime, titleCase } from '../../utils/format';

const PREFS = [
  ['email', 'E-mail'],
  ['sms', 'SMS'],
  ['whatsapp', 'WhatsApp'],
  ['push', 'Push notifications'],
  ['jobAlerts', 'Job alerts'],
  ['recruiterMessages', 'Recruiter messages'],
  ['marketing', 'Offers and news'],
];

const Preferences = ({ data }) => {
  const [prefs, setPrefs] = useState(data.user?.notificationPrefs || data.profile?.notificationPrefs || {});
  const [privacy, setPrivacy] = useState(data.profile?.privacy || {});
  const save = useAction(() => candidateApi.update({ notificationPrefs: prefs, privacy }), { success: 'Preferences saved', invalidate: ['candidate-me'] });
  return (
    <div className="space-y-4">
      <Section title="Notifications">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {PREFS.map(([k, label]) => (
            <CheckboxField key={k} label={label} checked={prefs[k] !== false} onChange={(e) => setPrefs((p) => ({ ...p, [k]: e.target.checked }))} />
          ))}
        </div>
      </Section>
      <Section title="Privacy">
        <div className="max-w-md space-y-4">
          <SelectField
            label="Who can see my profile"
            placeholder={null}
            options={[
              { value: 'public', label: 'Everyone' },
              { value: 'recruiters', label: 'Recruiters only' },
              { value: 'hidden', label: 'Hidden' },
            ]}
            value={privacy.profileVisibility || 'public'}
            onChange={(e) => setPrivacy((p) => ({ ...p, profileVisibility: e.target.value }))}
          />
          <CheckboxField label="Show my contact details to recruiters" checked={privacy.showContact !== false} onChange={(e) => setPrivacy((p) => ({ ...p, showContact: e.target.checked }))} />
        </div>
      </Section>
      <Button variant="primaryBlue" size="sm" loading={save.isPending} onClick={() => save.mutate()}>
        Save preferences
      </Button>
    </div>
  );
};

const Blocked = () => {
  const { data } = useQuery({ queryKey: ['blocks'], queryFn: () => moderationApi.blocks({ limit: 100 }) });
  const unblock = useAction(moderationApi.unblock, { success: 'Employer unblocked', invalidate: ['blocks'] });
  const items = data?.data || [];
  return (
    <Section title="Blocked employers">
      {!items.length && <p className="text-sm text-brand-gray">You have not blocked anyone.</p>}
      <ul className="divide-y divide-brand-border">
        {items.map((b) => {
          const org = b.organization || b;
          return (
            <li key={b._id} className="flex items-center justify-between py-2 text-sm">
              {org.name}
              <Button size="sm" variant="ghost" onClick={() => unblock.mutate(org._id)}>
                Unblock
              </Button>
            </li>
          );
        })}
      </ul>
    </Section>
  );
};

const Activity = () => {
  const [page, setPage] = useState(1);
  const { data } = useQuery({ queryKey: ['activity', page], queryFn: () => authApi.activity({ page, limit: 20 }) });
  return (
    <Section title="Account activity">
      <ul className="divide-y divide-brand-border">
        {data?.data.map((a) => (
          <li key={a._id} className="flex justify-between gap-3 py-2 text-sm">
            <span className="text-brand-dark">{a.description || titleCase(a.type || a.action || '')}</span>
            <span className="shrink-0 text-xs text-brand-gray-muted">{formatDateTime(a.createdAt)}</span>
          </li>
        ))}
      </ul>
      <Pagination meta={data?.meta} onPage={setPage} />
    </Section>
  );
};

const ChangeContact = () => {
  const { user, loadMe } = useAuth();
  const [kind, setKind] = useState('email');
  const [value, setValue] = useState('');
  const [otp, setOtp] = useState('');
  const [sent, setSent] = useState(false);
  const request = useAction(() => authApi.changeContact({ [kind]: value }), { success: 'OTP sent to the new contact', onSuccess: () => setSent(true) });
  const confirm = useAction(() => authApi.confirmContact({ [kind]: value, otp }), {
    success: 'Contact updated',
    onSuccess: () => {
      setSent(false);
      setValue('');
      setOtp('');
      loadMe();
    },
  });
  return (
    <Section title="Change e-mail or mobile">
      <p className="mb-3 text-sm text-brand-gray">
        Current: {user.email} · {user.mobile}
      </p>
      <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[140px_1fr_auto]">
        <SelectField label="Change" placeholder={null} options={[{ value: 'email', label: 'E-mail' }, { value: 'mobile', label: 'Mobile' }]} value={kind} onChange={(e) => { setKind(e.target.value); setSent(false); setValue(''); }} />
        <TextField label={kind === 'email' ? 'New e-mail' : 'New mobile'} type={kind === 'email' ? 'email' : 'tel'} value={value} disabled={sent} onChange={(e) => setValue(e.target.value)} />
        {!sent && (
          <Button size="sm" variant="outline" className="h-11" disabled={!value} loading={request.isPending} onClick={() => request.mutate()}>
            Send OTP
          </Button>
        )}
      </div>
      {sent && (
        <div className="mt-3 flex items-end gap-2">
          <TextField className="flex-1" label="OTP" inputMode="numeric" autoComplete="one-time-code" value={otp} onChange={(e) => setOtp(e.target.value)} />
          <Button size="sm" variant="primaryBlue" className="h-11" disabled={!otp} loading={confirm.isPending} onClick={() => confirm.mutate()}>
            Confirm
          </Button>
        </div>
      )}
    </Section>
  );
};

const Danger = () => {
  const settings = usePublicSettings();
  const { clear } = useAuth();
  const navigate = useNavigate();
  const [action, setAction] = useState(null);
  const [reason, setReason] = useState('');
  const done = () => {
    clear();
    navigate('/');
  };
  const deactivate = useAction(() => candidateApi.deactivate(reason), { success: 'Account deactivated', onSuccess: done });
  const remove = useAction(() => candidateApi.remove(reason), { success: 'Account deleted', onSuccess: done });
  return (
    <Section title="Close account">
      <TextAreaField label="Reason (optional)" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => setAction('deactivate')}>
          Deactivate
        </Button>
        {settings.platform?.profileDeleteEnabled !== false && (
          <Button size="sm" variant="danger" onClick={() => setAction('delete')}>
            Delete account
          </Button>
        )}
      </div>
      <ConfirmDialog open={action === 'deactivate'} onClose={() => setAction(null)} title="Deactivate account?" message="Your profile is hidden until you log in again." confirmLabel="Deactivate" loading={deactivate.isPending} onConfirm={() => deactivate.mutate()} />
      <ConfirmDialog open={action === 'delete'} onClose={() => setAction(null)} title="Delete account permanently?" message="Your personal data is erased. This cannot be undone." danger confirmLabel="Delete" loading={remove.isPending} onConfirm={() => remove.mutate()} />
    </Section>
  );
};

const Settings = () => {
  useDocumentTitle('Settings');
  const [tab, setTab] = useState('preferences');
  const query = useCandidateProfile();
  if (query.isPending) return <PageLoader />;
  if (query.isError) return <ErrorState error={query.error} onRetry={query.refetch} />;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Settings" />
      <Tabs
        className="mb-4"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'preferences', label: 'Preferences' },
          { value: 'security', label: 'Security' },
          { value: 'blocked', label: 'Blocked' },
          { value: 'activity', label: 'Activity' },
          { value: 'account', label: 'Account' },
        ]}
      />
      {tab === 'preferences' && <Preferences data={query.data} />}
      {tab === 'security' && <AccountSecurity />}
      {tab === 'blocked' && <Blocked />}
      {tab === 'activity' && <Activity />}
      {tab === 'account' && (
        <div className="space-y-4">
          <ChangeContact />
          <Danger />
        </div>
      )}
    </div>
  );
};

export default Settings;
