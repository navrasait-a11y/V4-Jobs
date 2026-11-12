import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Button from '../ui/Button';
import { Alert, Modal } from '../ui/feedback';
import { Badge, Section } from '../ui/data';
import { PasswordField, TextField } from '../ui/form';
import useAuth from '../../hooks/useAuth';
import { useAction } from '../../hooks/useData';
import { authApi } from '../../services';
import { formatDateTime } from '../../utils/format';

const PasswordCard = () => {
  const blank = { currentPassword: '', newPassword: '' };
  const [form, setForm] = useState(blank);
  const change = useAction(() => authApi.changePassword(form), { success: 'Password changed. Other devices were logged out', onSuccess: () => setForm(blank) });
  return (
    <Section title="Change password">
      <form
        className="max-w-md space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          change.mutate();
        }}
      >
        <PasswordField label="Current password" required autoComplete="current-password" value={form.currentPassword} onChange={(e) => setForm((f) => ({ ...f, currentPassword: e.target.value }))} />
        <PasswordField label="New password" required autoComplete="new-password" value={form.newPassword} onChange={(e) => setForm((f) => ({ ...f, newPassword: e.target.value }))} hint="At least 8 characters with a letter and a digit" />
        <Button type="submit" size="sm" variant="primaryBlue" loading={change.isPending}>
          Update password
        </Button>
      </form>
    </Section>
  );
};

const TwoFactorCard = () => {
  const { user, loadMe } = useAuth();
  const enabled = user.twoFactor?.enabled;
  const [setup, setSetup] = useState(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [backup, setBackup] = useState(null);
  const [disabling, setDisabling] = useState(false);
  const start = useAction(authApi.setup2fa, { onSuccess: setSetup });
  const enable = useAction(() => authApi.enable2fa(code), {
    success: 'Two-factor authentication is on',
    onSuccess: (r) => {
      setSetup(null);
      setCode('');
      setBackup(r.backupCodes);
      loadMe();
    },
  });
  const disable = useAction(() => authApi.disable2fa({ password, code }), {
    success: 'Two-factor authentication is off',
    onSuccess: () => {
      setDisabling(false);
      setCode('');
      setPassword('');
      loadMe();
    },
  });
  return (
    <Section title="Two-factor authentication" actions={<Badge tone={enabled ? 'green' : 'gray'}>{enabled ? 'On' : 'Off'}</Badge>}>
      <p className="mb-3 text-sm text-brand-gray">Protect your account with a code from an authenticator app.</p>
      {enabled ? (
        <Button size="sm" variant="outline" onClick={() => setDisabling(true)}>
          Turn off
        </Button>
      ) : (
        <Button size="sm" variant="primaryBlue" loading={start.isPending} onClick={() => start.mutate()}>
          Set up
        </Button>
      )}
      <Modal open={Boolean(setup)} onClose={() => setSetup(null)} title="Scan this QR code" size="sm" footer={<Button size="sm" variant="primaryBlue" loading={enable.isPending} onClick={() => enable.mutate()}>Verify</Button>}>
        {setup?.qrCode && <img src={setup.qrCode} alt="Two-factor QR code" className="mx-auto h-48 w-48" />}
        <p className="mt-2 break-all text-center text-xs text-brand-gray-muted">{setup?.secret}</p>
        <TextField className="mt-3" label="6 digit code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} />
      </Modal>
      <Modal open={Boolean(backup)} onClose={() => setBackup(null)} title="Save your backup codes" size="sm">
        <Alert tone="warning">These codes are shown once. Keep them somewhere safe.</Alert>
        <ul className="mt-3 grid grid-cols-2 gap-1 font-mono text-sm text-brand-dark">
          {backup?.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </Modal>
      <Modal open={disabling} onClose={() => setDisabling(false)} title="Turn off two-factor" size="sm" footer={<Button size="sm" variant="danger" loading={disable.isPending} onClick={() => disable.mutate()}>Turn off</Button>}>
        <div className="space-y-4">
          <PasswordField required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <TextField label="Authenticator code" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} />
        </div>
      </Modal>
    </Section>
  );
};

const SessionsCard = () => {
  const { logout } = useAuth();
  const { data } = useQuery({ queryKey: ['sessions'], queryFn: authApi.sessions });
  const revoke = useAction(authApi.revokeSession, { success: 'Device logged out', invalidate: ['sessions'] });
  const sessions = Array.isArray(data) ? data : data?.items || [];
  return (
    <Section
      title="Devices"
      actions={
        <Button size="sm" variant="dangerGhost" onClick={() => logout({ allDevices: true })}>
          Log out everywhere
        </Button>
      }
    >
      <ul className="divide-y divide-brand-border">
        {sessions.map((s) => (
          <li key={s._id} className="flex items-center justify-between gap-3 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-brand-dark">{s.deviceName || (s.userAgent ? s.userAgent.split(' ').slice(-1)[0].split('/')[0] : '')} {s.platform ? `(${s.platform})` : ''}</p>
              <p className="text-xs text-brand-gray-muted">Last active {formatDateTime(s.lastUsedAt || s.updatedAt)}</p>
            </div>
            {s.isCurrent ? (
              <Badge tone="green">This device</Badge>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => revoke.mutate(s._id)}>
                Log out
              </Button>
            )}
          </li>
        ))}
      </ul>
    </Section>
  );
};

const MyDataCard = () => {
  const download = useAction(authApi.downloadMyData, { success: 'Your data file has been downloaded' });
  return (
    <Section title="Your data">
      <p className="max-w-xl text-sm text-brand-gray">Download a copy of everything stored on your account: profile, applications, job alerts, saved items, orders and login history. The file is in JSON format.</p>
      <Button size="sm" variant="outline" className="mt-3" loading={download.isPending} onClick={() => download.mutate()}>
        Download my data
      </Button>
    </Section>
  );
};

const AccountSecurity = () => (
  <div className="space-y-4">
    <PasswordCard />
    <TwoFactorCard />
    <SessionsCard />
    <MyDataCard />
  </div>
);

export default AccountSecurity;
