import React, { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { AlertCriteriaFields, criteriaError, criteriaForm, FREQUENCIES, toCriteria } from '../../components/candidate/JobAlertFields';
import Button from '../../components/ui/Button';
import { Alert, Icon } from '../../components/ui/feedback';
import { CheckboxField, FileDropzone, MobileField, SelectField, TextField } from '../../components/ui/form';
import { useAction, useDocumentTitle, useLookups } from '../../hooks/useData';
import { alertApi } from '../../services';
import useAuthStore from '../../store/useAuthStore';

const Block = ({ title, children }) => (
  <fieldset className="space-y-4">
    <legend className="mb-3 w-full border-b border-brand-border pb-2 text-sm font-semibold text-brand-dark">{title}</legend>
    {children}
  </fieldset>
);

/**
 * Job alert for visitors (Excel "Set Job Alert"). Verifying the mobile by OTP creates the job seeker
 * account automatically and signs the visitor in.
 */
const GuestJobAlert = () => {
  useDocumentTitle('Create job alert');
  const { user, setSession } = useAuthStore();
  const lookups = useLookups('heard_from');
  const [form, setForm] = useState({ name: '', frequency: 'daily', fullName: '', email: '', mobile: '', heardFrom: '', consentCommunication: true, acceptTerms: false, ...criteriaForm() });
  const [resume, setResume] = useState(null);
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState('details');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e }));

  const sendOtp = useAction(() => alertApi.guestOtp(form.mobile), { success: `OTP sent to +91 ${form.mobile}`, onSuccess: () => setStep('otp') });
  const create = useAction(
    () =>
      alertApi.guestCreate({
        name: form.name.trim() || form.jobTitle || 'My job alert',
        frequency: form.frequency,
        fullName: form.fullName,
        email: form.email,
        mobile: form.mobile,
        otp,
        heardFrom: form.heardFrom || undefined,
        consentCommunication: form.consentCommunication,
        acceptTerms: true,
        criteria: toCriteria(form),
        resume: resume || undefined,
      }),
    {
      onSuccess: (data) => {
        if (data.tokens) setSession(data);
        toast.success(data.isNewUser ? 'Job alert created and your account is ready' : 'Job alert created');
        setDone(true);
      },
      onError: (e) => setError(e.message),
    },
  );
  if (done || user?.role === 'candidate') return <Navigate to="/candidate/job-alerts" replace />;

  const details = (e) => {
    e.preventDefault();
    const problem = criteriaError(form) || (!/^[6-9]\d{9}$/.test(form.mobile) ? 'Enter a valid 10 digit mobile number' : '') || (!form.acceptTerms ? 'Please accept the Privacy Policy and Terms to continue' : '');
    setError(problem);
    if (!problem) sendOtp.mutate();
  };
  const verify = (e) => {
    e.preventDefault();
    if (!/^\d{4,8}$/.test(otp)) return setError('Enter the OTP sent to your mobile');
    setError('');
    return create.mutate();
  };

  return (
    <div className="bg-brand-tint px-4 py-8">
      <div className="mx-auto max-w-[760px] surface p-5 sm:p-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-brand-dark">Create a job alert</h1>
          <p className="mt-1 text-sm text-brand-gray">
            Get matching jobs by e-mail, SMS and WhatsApp. Verifying your mobile creates your free job seeker account. Already registered?{' '}
            <Link to="/login" className="font-semibold text-brand-blue">
              Log in
            </Link>
          </p>
        </div>
        {error && (
          <Alert tone="error" className="mb-4">
            {error}
          </Alert>
        )}
        {step === 'details' ? (
          <form className="space-y-6" onSubmit={details}>
            <AlertCriteriaFields form={form} set={set} setForm={setForm} />
            <Block title="Your contact details">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <TextField label="Full name" required autoComplete="name" value={form.fullName} onChange={set('fullName')} maxLength={120} />
                <TextField label="Email ID" type="email" required autoComplete="email" value={form.email} onChange={set('email')} />
                <MobileField required value={form.mobile} onChange={set('mobile')} />
                <SelectField label="From where you heard about us" options={lookups.heard_from} value={form.heardFrom} onChange={set('heardFrom')} />
              </div>
              <div>
                <p className="mb-1.5 text-sm font-medium text-brand-dark">Upload resume (optional)</p>
                {resume ? (
                  <div className="flex items-center justify-between gap-2 rounded-lg border border-brand-border p-3 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <Icon name="description" className="text-brand-blue" />
                      <span className="truncate">{resume.name}</span>
                    </span>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setResume(null)}>
                      Remove
                    </Button>
                  </div>
                ) : (
                  <FileDropzone accept=".pdf,.doc,.docx" maxSizeMb={5} onFile={setResume} label="Drop your resume here" hint="PDF, DOC or DOCX up to 5 MB" />
                )}
              </div>
            </Block>
            <Block title="Alert settings">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <TextField label="Job alert name" value={form.name} onChange={set('name')} maxLength={120} placeholder="e.g. Sales jobs in Jaipur" />
                <SelectField label="Job alert frequency" placeholder={null} options={FREQUENCIES} value={form.frequency} onChange={set('frequency')} />
              </div>
            </Block>
            <div className="space-y-3 rounded-lg bg-brand-tint p-4 text-sm">
              <p className="text-xs text-brand-gray">
                We use these details only to send you matching jobs and to create your job seeker account. Employers see your profile only when you apply or make it visible. Read our{' '}
                <Link to="/legal/disclaimer" target="_blank" className="text-brand-blue underline">
                  disclaimer
                </Link>
                .
              </p>
              <CheckboxField checked={form.consentCommunication} onChange={set('consentCommunication')} label="I agree to receive important updates via SMS, Email & WhatsApp." />
              <CheckboxField
                checked={form.acceptTerms}
                onChange={set('acceptTerms')}
                label={
                  <>
                    By clicking Create alert, I agree to the{' '}
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
            </div>
            <Button type="submit" variant="primary" fullWidth size="lg" loading={sendOtp.isPending}>
              Create alert
            </Button>
          </form>
        ) : (
          <form className="mx-auto max-w-sm space-y-4 py-4 text-center" onSubmit={verify}>
            <Icon name="sms" size={40} className="mx-auto text-brand-blue" />
            <div>
              <h2 className="text-lg font-semibold text-brand-dark">Enter OTP and verify</h2>
              <p className="mt-1 text-sm text-brand-gray">We sent a code to +91 {form.mobile}</p>
            </div>
            <TextField label="OTP" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} inputClassName="text-center text-lg tracking-[0.4em]" />
            <Button type="submit" variant="primary" fullWidth loading={create.isPending}>
              Verify and create alert
            </Button>
            <div className="flex justify-center gap-4 text-sm">
              <button type="button" className="font-semibold text-brand-blue disabled:opacity-50" disabled={sendOtp.isPending} onClick={() => sendOtp.mutate()}>
                Resend OTP
              </button>
              <button
                type="button"
                className="font-semibold text-brand-gray"
                onClick={() => {
                  setStep('details');
                  setOtp('');
                  setError('');
                }}
              >
                Edit details
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default GuestJobAlert;
