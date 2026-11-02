import React, { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import VerifyMobileStep from '../../components/auth/VerifyMobileStep';
import Button from '../../components/ui/Button';
import { Alert } from '../../components/ui/feedback';
import { CheckboxField, ChoiceChips, Field, MobileField, PasswordField, SelectField, TextField } from '../../components/ui/form';
import { useDocumentTitle, useLookups } from '../../hooks/useData';
import { authApi } from '../../services';
import useAuthStore, { dashboardPath } from '../../store/useAuthStore';

const EmployerRegister = () => {
  useDocumentTitle('Register as employer');
  const navigate = useNavigate();
  const { user, setSession } = useAuthStore();
  const lookups = useLookups('gender', 'heard_from');
  const [form, setForm] = useState({ employerType: 'company', organizationName: '', fullName: '', gender: '', email: '', password: '', mobile: '', heardFrom: '', authorized: false, noCandidateFee: false, consentCommunication: true, acceptTerms: false });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [verifyMobile, setVerifyMobile] = useState('');
  if (user && !done) return <Navigate to={dashboardPath(user.role)} replace />;
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e }));
  const consultancy = form.employerType === 'consultancy';
  const finish = () => navigate('/employer/settings?tab=company', { replace: true });

  if (verifyMobile) {
    return (
      <div className="bg-brand-tint px-4 py-8">
        <div className="mx-auto max-w-[460px] surface p-5 sm:p-8">
          <VerifyMobileStep mobile={verifyMobile} onDone={finish} />
        </div>
      </div>
    );
  }

  const submit = async (e) => {
    e.preventDefault();
    setErrors({});
    setError('');
    setBusy(true);
    try {
      const { authorized, noCandidateFee, ...rest } = form;
      const body = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== ''));
      const data = await authApi.registerEmployer({ ...body, declarations: { authorized, noCandidateFee } });
      setDone(true);
      setSession(data);
      toast.success('Account created. Complete your company profile');
      if (data.user?.mobile && !data.user?.isMobileVerified) setVerifyMobile(data.user.mobile);
      else finish();
    } catch (err) {
      setErrors(err.fieldErrors || {});
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-brand-tint px-4 py-8">
      <form onSubmit={submit} className="mx-auto max-w-[640px] space-y-4 surface p-5 sm:p-8">
        <div>
          <h1 className="text-2xl font-bold text-brand-dark">Register as an employer</h1>
          <p className="mt-1 text-sm text-brand-gray">Your account goes live after a quick review by our team.</p>
        </div>
        {error && <Alert tone="error">{error}</Alert>}
        <Field label="We are a" required>
          <ChoiceChips options={[{ value: 'company', label: 'Company' }, { value: 'consultancy', label: 'Consultancy' }]} value={form.employerType} onChange={(v) => v && set('employerType')(v)} />
        </Field>
        <TextField label={consultancy ? 'Consultancy name' : 'Company name'} required value={form.organizationName} onChange={set('organizationName')} error={errors.organizationName} maxLength={200} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField label="Full name (user)" required autoComplete="name" value={form.fullName} onChange={set('fullName')} error={errors.fullName} maxLength={120} />
          <SelectField label="Gender" options={lookups.gender} value={form.gender} onChange={set('gender')} error={errors.gender} />
        </div>
        <TextField label="Official email ID" type="email" required autoComplete="email" value={form.email} onChange={set('email')} error={errors.email} hint="Use your company e-mail. It speeds up verification" />
        <PasswordField required autoComplete="new-password" value={form.password} onChange={set('password')} error={errors.password} hint="At least 8 characters with a letter and a digit" />
        <MobileField required value={form.mobile} onChange={set('mobile')} error={errors.mobile} />
        <SelectField label="From where you heard about us" options={lookups.heard_from} value={form.heardFrom} onChange={set('heardFrom')} />
        <CheckboxField
          required
          checked={form.authorized}
          onChange={set('authorized')}
          label={consultancy ? 'I confirm that I am authorized to provide recruitment services and that the jobs I post will represent genuine hiring requirements.' : 'I confirm that I am authorized to hire for this company and that the jobs I post will represent genuine hiring requirements.'}
        />
        <CheckboxField required checked={form.noCandidateFee} onChange={set('noCandidateFee')} label="I agree not to charge candidates any unauthorized recruitment, registration, interview, security or placement fee through this platform." />
        <CheckboxField checked={form.consentCommunication} onChange={set('consentCommunication')} label="I agree to receive important updates via SMS, Email & WhatsApp." />
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
              <Link to="/legal/employer-terms" target="_blank" className="text-brand-blue underline">
                Terms & Conditions
              </Link>{' '}
              of Freejobwala.
            </>
          }
        />
        <Button type="submit" variant="primary" fullWidth size="lg" loading={busy}>
          Register
        </Button>
        <p className="text-center text-sm text-brand-gray">
          Already registered?{' '}
          <Link to="/employer/login" className="font-semibold text-brand-blue hover:underline">
            Log in
          </Link>
        </p>
      </form>
    </div>
  );
};

export default EmployerRegister;
