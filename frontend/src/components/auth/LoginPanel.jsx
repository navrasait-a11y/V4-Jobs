import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import Button from '../ui/Button';
import { Alert } from '../ui/feedback';
import { Tabs } from '../ui/data';
import { MobileField, PasswordField, TextField } from '../ui/form';
import { authApi } from '../../services';
import useAuthStore, { dashboardPath } from '../../store/useAuthStore';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

function loadGoogle() {
  if (window.google?.accounts) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

/** Google Identity Services button. Hidden until VITE_GOOGLE_CLIENT_ID is configured. */
export const GoogleButton = ({ onCredential }) => {
  const ref = useRef(null);
  const handler = useRef(onCredential);
  useEffect(() => {
    handler.current = onCredential;
  });
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;
    loadGoogle()
      .then(() => {
        window.google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: (r) => handler.current(r.credential) });
        window.google.accounts.id.renderButton(ref.current, { theme: 'outline', size: 'large', width: 320, text: 'continue_with' });
      })
      .catch(() => {});
  }, []);
  if (!GOOGLE_CLIENT_ID) return null;
  return (
    <div>
      <div className="my-4 flex items-center gap-3 text-xs text-brand-gray-muted">
        <span className="h-px flex-1 bg-brand-border" /> or <span className="h-px flex-1 bg-brand-border" />
      </div>
      <div ref={ref} className="flex justify-center" />
    </div>
  );
};

/** Password, OTP, Google and 2FA login for one portal. `role` enforces the portal on the API. */
const LoginPanel = ({ role, identifierLabel = 'Email, mobile or username', allowOtp = true, allowGoogle = true, forgotPath = '/forgot-password' }) => {
  const setSession = useAuthStore((s) => s.setSession);
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState('password');
  const [form, setForm] = useState({ identifier: '', password: '', mobile: '', otp: '', code: '' });
  const [otpSent, setOtpSent] = useState(false);
  const [challenge, setChallenge] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? e.target.value : e }));

  const finish = (data) => {
    if (data.twoFactorRequired) return setChallenge(data.challengeToken);
    setSession(data);
    toast.success(`Welcome, ${data.user.fullName?.split(' ')[0] || 'back'}`);
    return navigate(location.state?.from || dashboardPath(data.user.role), { replace: true });
  };
  const run = async (fn) => {
    setError('');
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const submit = (e) => {
    e.preventDefault();
    run(async () => {
      if (challenge) return finish(await authApi.verify2fa({ challengeToken: challenge, code: form.code }));
      if (mode === 'password') return finish(await authApi.login({ identifier: form.identifier.trim(), password: form.password, role }));
      if (!otpSent) {
        await authApi.sendOtp({ mobile: form.mobile });
        setOtpSent(true);
        return toast.success('OTP sent to your mobile');
      }
      return finish(await authApi.otpLogin({ mobile: form.mobile, otp: form.otp, role }));
    });
  };

  if (challenge) {
    return (
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-brand-gray">Enter the 6 digit code from your authenticator app, or a backup code.</p>
        {error && <Alert tone="error">{error}</Alert>}
        <TextField label="Authentication code" required autoFocus autoComplete="one-time-code" value={form.code} onChange={set('code')} />
        <Button type="submit" variant="primaryBlue" fullWidth size="lg" loading={busy}>
          Verify
        </Button>
      </form>
    );
  }

  return (
    <div>
      {allowOtp && (
        <Tabs
          className="mb-4"
          value={mode}
          onChange={(m) => {
            setMode(m);
            setError('');
          }}
          tabs={[
            { value: 'password', label: 'Password' },
            { value: 'otp', label: 'Mobile OTP' },
          ]}
        />
      )}
      <form onSubmit={submit} className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        {mode === 'password' ? (
          <>
            <TextField label={identifierLabel} required autoComplete="username" value={form.identifier} onChange={set('identifier')} />
            <PasswordField required autoComplete="current-password" value={form.password} onChange={set('password')} />
            <div className="text-right">
              <Link to={forgotPath} className="text-sm font-medium text-brand-blue hover:underline">
                Forgot password?
              </Link>
            </div>
          </>
        ) : (
          <>
            <MobileField required value={form.mobile} onChange={set('mobile')} disabled={otpSent} />
            {otpSent && <TextField label="OTP" required autoFocus inputMode="numeric" autoComplete="one-time-code" value={form.otp} onChange={set('otp')} hint="Valid for a few minutes" />}
          </>
        )}
        <Button type="submit" variant="primaryBlue" fullWidth size="lg" loading={busy}>
          {mode === 'otp' && !otpSent ? 'Send OTP' : 'Log in'}
        </Button>
      </form>
      {allowGoogle && <GoogleButton onCredential={(idToken) => run(async () => finish(await authApi.google({ idToken, role })))} />}
    </div>
  );
};

export default LoginPanel;
