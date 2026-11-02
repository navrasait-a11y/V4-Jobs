import React, { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { AuthShell } from './Login';
import { GoogleButton } from '../../components/auth/LoginPanel';
import VerifyMobileStep from '../../components/auth/VerifyMobileStep';
import Button from '../../components/ui/Button';
import { Alert } from '../../components/ui/feedback';
import { CheckboxField, ChoiceChips, Field, MobileField, PasswordField, SelectField, TextField } from '../../components/ui/form';
import { useDocumentTitle, useLookups } from '../../hooks/useData';
import { authApi } from '../../services';
import useAuthStore, { dashboardPath } from '../../store/useAuthStore';

/** Registration wording from the client's Excel, mapped onto the experience level master data. */
const EXPERIENCE_LABELS = { Experienced: 'I have Experience', Fresher: 'I am a Fresher', Internship: 'I did an Internship', Apprenticeship: 'I did an Apprenticeship' };

const Register = () => {
  useDocumentTitle('Create account');
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { user, setSession } = useAuthStore();
  const lookups = useLookups('experience_level', 'gender', 'heard_from');
  const [form, setForm] = useState({ experienceLevel: '', fullName: '', gender: '', email: '', password: '', mobile: '', heardFrom: '', username: '', referralCode: params.get('ref') || '', consentCommunication: true, acceptTerms: false });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showReferral, setShowReferral] = useState(false);
  const [done, setDone] = useState(false);
  const [verifyMobile, setVerifyMobile] = useState('');
  if (user && !done) return <Navigate to={dashboardPath(user.role)} replace />;

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e }));
  const finish = () => navigate('/candidate/complete-profile', { replace: true });
  const welcome = (data) => {
    setDone(true);
    setSession(data);
    toast.success('Account created');
    // Mobile sign-ups get the OTP step first (Excel: "Enter OTP & Verify"); Google sign-ups have no mobile yet.
    if (data.user?.mobile && !data.user?.isMobileVerified) setVerifyMobile(data.user.mobile);
    else finish();
  };
  const submit = async (e) => {
    e.preventDefault();
    if (!form.experienceLevel) return setErrors({ experienceLevel: 'Please choose your experience' });
    setErrors({});
    setError('');
    setBusy(true);
    try {
      const body = Object.fromEntries(Object.entries(form).filter(([, v]) => v !== ''));
      welcome(await authApi.registerCandidate(body));
    } catch (err) {
      setErrors(err.fieldErrors || {});
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (verifyMobile) {
    return (
      <AuthShell title="Verify your mobile" subtitle="One last step to secure your account">
        <VerifyMobileStep mobile={verifyMobile} onDone={finish} />
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="It takes less than a minute"
      footer={
        <>
          Already registered?{' '}
          <Link to="/login" className="font-semibold text-brand-blue hover:underline">
            Log in
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        <Field label="Your experience" required error={errors.experienceLevel}>
          <ChoiceChips options={lookups.experience_level.map((value) => ({ value, label: EXPERIENCE_LABELS[value] || value }))} value={form.experienceLevel} onChange={set('experienceLevel')} />
        </Field>
        <TextField label="Full name" required autoComplete="name" value={form.fullName} onChange={set('fullName')} error={errors.fullName} />
        <SelectField label="Gender" required options={lookups.gender} value={form.gender} onChange={set('gender')} error={errors.gender} />
        <TextField label="Email" required type="email" autoComplete="email" value={form.email} onChange={set('email')} error={errors.email} />
        <PasswordField required autoComplete="new-password" value={form.password} onChange={set('password')} error={errors.password} hint="At least 8 characters with a letter and a digit" />
        <MobileField required value={form.mobile} onChange={set('mobile')} error={errors.mobile} />
        <SelectField label="From where you heard about us" options={lookups.heard_from} value={form.heardFrom} onChange={set('heardFrom')} error={errors.heardFrom} />
        {(form.referralCode || showReferral) ? (
          <TextField label="Referral code" value={form.referralCode} onChange={set('referralCode')} error={errors.referralCode} />
        ) : (
          <button type="button" onClick={() => setShowReferral(true)} className="text-sm font-semibold text-brand-blue">
            Have a referral code?
          </button>
        )}
        <CheckboxField label="I agree to receive important updates via SMS, Email & WhatsApp." checked={form.consentCommunication} onChange={set('consentCommunication')} />
        <CheckboxField
          required
          checked={form.acceptTerms}
          onChange={set('acceptTerms')}
          label={
            <>
              By clicking Register, you agree to the{' '}
              <Link to="/legal/privacy-policy" target="_blank" className="text-brand-blue underline">
                Privacy Policy
              </Link>{' '}
              and{' '}
              <Link to="/legal/terms-and-conditions" target="_blank" className="text-brand-blue underline">
                Terms & Conditions
              </Link>{' '}
              of Freejobwala.
            </>
          }
        />
        <Button type="submit" variant="primary" fullWidth size="lg" loading={busy}>
          Register
        </Button>
      </form>
      <GoogleButton
        onCredential={async (idToken) => {
          try {
            welcome(await authApi.google({ idToken, role: 'candidate' }));
          } catch (err) {
            setError(err.message);
          }
        }}
      />
    </AuthShell>
  );
};

export default Register;
