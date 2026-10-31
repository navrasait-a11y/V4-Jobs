import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { AuthShell } from './Login';
import Button from '../../components/ui/Button';
import { Alert, Icon, Spinner } from '../../components/ui/feedback';
import { Tabs } from '../../components/ui/data';
import { MobileField, PasswordField, TextField } from '../../components/ui/form';
import { useDocumentTitle } from '../../hooks/useData';
import { authApi } from '../../services';

export const ForgotPassword = () => {
  useDocumentTitle('Forgot password');
  const navigate = useNavigate();
  const [mode, setMode] = useState('email');
  const [form, setForm] = useState({ email: '', mobile: '', otp: '', password: '' });
  const [stage, setStage] = useState('request');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? e.target.value : e }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (stage === 'request') {
        await authApi.forgot(mode === 'email' ? { email: form.email } : { mobile: form.mobile });
        setStage(mode === 'email' ? 'sent' : 'otp');
      } else {
        await authApi.reset({ mobile: form.mobile, otp: form.otp, password: form.password });
        toast.success('Password changed. Please log in');
        navigate('/login');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell
      title="Reset your password"
      subtitle="We will send you a reset link or an OTP"
      footer={
        <Link to="/login" className="font-semibold text-brand-blue hover:underline">
          Back to login
        </Link>
      }
    >
      {stage === 'sent' ? (
        <Alert tone="success">If this e-mail is registered, a reset link is on its way. Check your inbox and spam folder.</Alert>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          {stage === 'request' && (
            <Tabs
              value={mode}
              onChange={setMode}
              tabs={[
                { value: 'email', label: 'E-mail' },
                { value: 'mobile', label: 'Mobile' },
              ]}
            />
          )}
          {error && <Alert tone="error">{error}</Alert>}
          {stage === 'request' && mode === 'email' && <TextField label="Email" required type="email" autoComplete="email" value={form.email} onChange={set('email')} />}
          {stage === 'request' && mode === 'mobile' && <MobileField required value={form.mobile} onChange={set('mobile')} />}
          {stage === 'otp' && (
            <>
              <TextField label="OTP" required inputMode="numeric" autoComplete="one-time-code" value={form.otp} onChange={set('otp')} />
              <PasswordField label="New password" required autoComplete="new-password" value={form.password} onChange={set('password')} hint="At least 8 characters with a letter and a digit" />
            </>
          )}
          <Button type="submit" variant="primaryBlue" fullWidth size="lg" loading={busy}>
            {stage === 'otp' ? 'Change password' : 'Continue'}
          </Button>
        </form>
      )}
    </AuthShell>
  );
};

/** Handles both reset links and account activation links. */
export const ResetPassword = ({ activation = false }) => {
  useDocumentTitle(activation ? 'Set your password' : 'Reset password');
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (password !== confirm) return setError('Passwords do not match');
    setError('');
    setBusy(true);
    try {
      await authApi.reset({ token, password });
      toast.success('Password saved. Please log in');
      navigate('/login');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
    return undefined;
  };

  return (
    <AuthShell title={activation ? 'Activate your account' : 'Choose a new password'} subtitle="Use at least 8 characters with a letter and a digit">
      {!token ? (
        <Alert tone="error">This link is invalid. Please request a new one.</Alert>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          {error && <Alert tone="error">{error}</Alert>}
          <PasswordField label="New password" required autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <PasswordField label="Confirm password" required autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          <Button type="submit" variant="primaryBlue" fullWidth size="lg" loading={busy}>
            Save password
          </Button>
        </form>
      )}
    </AuthShell>
  );
};

export const VerifyEmail = () => {
  useDocumentTitle('Verify e-mail');
  const [params] = useSearchParams();
  const token = params.get('token');
  const [state, setState] = useState(token ? 'loading' : 'error');
  const [message, setMessage] = useState('This verification link is invalid.');
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    authApi
      .verifyEmail(token)
      .then(() => setState('done'))
      .catch((e) => {
        setMessage(e.message);
        setState('error');
      });
  }, [token]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 p-6 text-center">
      {state === 'loading' && <Spinner />}
      {state === 'done' && (
        <>
          <Icon name="check_circle" size={48} className="text-brand-green" />
          <h1 className="text-xl font-bold text-brand-dark">E-mail verified</h1>
        </>
      )}
      {state === 'error' && (
        <>
          <Icon name="error" size={48} className="text-brand-red" />
          <h1 className="text-xl font-bold text-brand-dark">Could not verify</h1>
          <p className="text-sm text-brand-gray">{message}</p>
        </>
      )}
      {state !== 'loading' && (
        <Button asChild variant="primaryBlue" size="md">
          <Link to="/">Continue</Link>
        </Button>
      )}
    </div>
  );
};
