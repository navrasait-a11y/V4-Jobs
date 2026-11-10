import React, { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import JobPostForm, { JOB_BLANK, JOB_STEPS, jobFormErrors, toJobPayload } from '../../components/employer/JobPostForm';
import { StepNav, Stepper, useSteps } from '../../components/ui/stepper';
import Button from '../../components/ui/Button';
import { Section } from '../../components/ui/data';
import { Alert } from '../../components/ui/feedback';
import { CheckboxField, ChoiceChips, Field, MobileField, SelectField, TextField } from '../../components/ui/form';
import { useAction, useLookups } from '../../hooks/useData';
import { jobApi } from '../../services';
import useAuthStore from '../../store/useAuthStore';
import { EMPLOYER_TYPE_OPTIONS } from '../../utils/options';
import useSeo from '../../hooks/useSeo';

const DRAFT_KEY = 'fjw.guestJobDraft';
const EMPLOYER_BLANK = {
  employerType: 'company',
  organizationName: '',
  fullName: '',
  email: '',
  mobile: '',
  heardFrom: '',
  authorized: false,
  noCandidateFee: false,
  consentCommunication: true,
  acceptTerms: false,
  otp: '',
};

const STEPS = [
  { key: 'company', title: 'About your company', short: 'Company', fields: ['employerType', 'organizationName'] },
  ...JOB_STEPS,
  { key: 'verify', title: 'Your details & verify', short: 'Verify', fields: ['fullName', 'email', 'mobile', 'otp', 'heardFrom', 'declarations', 'authorized', 'noCandidateFee', 'acceptTerms', 'consentCommunication'] },
];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const readDraft = () => {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
    return d && typeof d === 'object' ? d : null;
  } catch {
    return null;
  }
};

/** Post a Job / Internship without an account ("Other Forms" Excel). OTP on the mobile, then the API creates the employer. */
const PostJobGuest = () => {
  useSeo({ title: 'Post a job for free', description: 'Post a job or internship in minutes, no account needed. Verify your mobile and start receiving applications.', path: '/post-job' });
  const user = useAuthStore((s) => s.user);
  const lookups = useLookups('heard_from');
  const draft = readDraft();
  const [job, setJob] = useState(() => ({ ...JOB_BLANK, ...(draft?.job || {}) }));
  const [employer, setEmployer] = useState(() => ({ ...EMPLOYER_BLANK, ...(draft?.employer || {}), otp: '' }));
  const [errors, setErrors] = useState({});
  const [otpSent, setOtpSent] = useState(false);
  const [done, setDone] = useState(false);
  const set = (k) => (e) => setEmployer((f) => ({ ...f, [k]: e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e }));
  const consultancy = employer.employerType === 'consultancy';
  const word = job.kind === 'internship' ? 'Post an Internship' : 'Post a Job';
  const validate = () => {
    const e = jobFormErrors(job, { requireAll: true });
    if (employer.organizationName.trim().length < 2) e.organizationName = consultancy ? 'Enter your consultancy name' : 'Enter your company name';
    if (employer.fullName.trim().length < 2) e.fullName = 'Enter your full name';
    if (!/^[6-9]\d{9}$/.test(employer.mobile || '')) e.mobile = 'Enter a valid 10-digit mobile number';
    if (!EMAIL.test(employer.email || '')) e.email = 'Enter a valid e-mail ID';
    if (!employer.authorized || !employer.noCandidateFee || !employer.acceptTerms) e.acceptTerms = 'Please accept the declarations and terms to continue';
    return e;
  };
  const { step, reached, goTo, next, validateAll, showErrors, errorSteps, last } = useSteps(STEPS, { validate, setErrors, watch: `${JSON.stringify(job)}|${JSON.stringify(employer)}` });

  // "Draft or Resume Form In Case of any Error": kept in this browser until the posting completes.
  useEffect(() => {
    if (done) return undefined;
    const t = setTimeout(() => {
      try {
        const { otp: _otp, ...rest } = employer;
        localStorage.setItem(DRAFT_KEY, JSON.stringify({ job, employer: rest }));
      } catch {
        /* storage blocked: the form still works */
      }
    }, 800);
    return () => clearTimeout(t);
  }, [job, employer, done]);

  const sendOtp = useAction(() => jobApi.guestPostOtp(employer.mobile), { success: 'OTP sent to your mobile', onSuccess: () => setOtpSent(true) });
  const submit = useAction(
    () =>
      jobApi.guestPost({
        employer: {
          otp: employer.otp,
          employerType: employer.employerType,
          organizationName: employer.organizationName,
          fullName: employer.fullName,
          email: employer.email,
          mobile: employer.mobile,
          heardFrom: employer.heardFrom || undefined,
          declarations: { authorized: employer.authorized, noCandidateFee: employer.noCandidateFee },
          consentCommunication: employer.consentCommunication,
          acceptTerms: employer.acceptTerms,
        },
        job: toJobPayload(job),
      }),
    {
      silent: true,
      onSuccess: () => {
        try {
          localStorage.removeItem(DRAFT_KEY);
        } catch {
          /* ignore */
        }
        setDone(true);
        window.scrollTo({ top: 0 });
      },
      onError: (e) => {
        const fe = e.fieldErrors || {};
        setErrors(Object.fromEntries(Object.entries(fe).map(([k, v]) => [k.replace(/^(employer|job)\./, ''), v])));
        showErrors(fe);
        toast.error(e.message);
      },
    },
  );

  if (user?.role === 'employer') return <Navigate to="/employer/jobs/post" replace />;
  if (done) {
    return (
      <div className="mx-auto max-w-xl px-4 py-12">
        <Alert tone="success">
          Your {job.kind === 'internship' ? 'internship' : 'job'} is received and goes live after review. Check {employer.email} for a link to set your password and manage it.
        </Alert>
      </div>
    );
  }

  const onSubmit = (e) => {
    e.preventDefault();
    if (!last) return next();
    if (!validateAll()) return undefined;
    if (!otpSent) return sendOtp.mutate();
    return submit.mutate();
  };

  return (
    <div className="bg-brand-tint px-4 py-6">
      <form className="mx-auto max-w-4xl space-y-4" onSubmit={onSubmit} onKeyDown={(e) => e.key === 'Enter' && e.target.tagName === 'INPUT' && !last && e.preventDefault()}>
        <div>
          <h1 className="text-xl font-bold text-brand-dark sm:text-2xl">{word}</h1>
          <p className="mt-1 text-sm text-brand-gray">
            No account needed. Your form is saved on this device until you finish. Already registered?{' '}
            <Link to="/employer/login" className="font-semibold text-brand-blue">
              Log in
            </Link>
          </p>
        </div>

        <Stepper steps={STEPS} current={step} reached={reached} onStep={goTo} errorSteps={errorSteps(errors)} />

        {step === 0 && (
          <Section title="We are a">
            <div className="space-y-4">
              <ChoiceChips options={EMPLOYER_TYPE_OPTIONS} value={employer.employerType} onChange={(v) => v && set('employerType')(v)} />
              <TextField label={consultancy ? 'Your consultancy name' : 'Your company name'} required value={employer.organizationName} onChange={set('organizationName')} error={errors.organizationName} />
            </div>
          </Section>
        )}

        {step > 0 && !last && <JobPostForm step={step - 1} form={job} setForm={setJob} errors={errors} consultancy={consultancy} />}

        {last && (
          <Section title="Employer user details">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <TextField label="User full name" required value={employer.fullName} onChange={set('fullName')} error={errors.fullName} />
              <MobileField required value={employer.mobile} onChange={set('mobile')} disabled={otpSent} error={errors.mobile} />
              <TextField label="Official email ID" required type="email" value={employer.email} onChange={set('email')} error={errors.email} />
              <SelectField label="How did you hear about us?" options={lookups.heard_from} value={employer.heardFrom} onChange={set('heardFrom')} />
            </div>
            <div className="mt-4 space-y-2">
              <CheckboxField
                required
                checked={employer.authorized}
                onChange={set('authorized')}
                label="I confirm that I am authorized to provide recruitment services and that the jobs or internship I post will represent genuine hiring requirements."
              />
              <CheckboxField
                required
                checked={employer.noCandidateFee}
                onChange={set('noCandidateFee')}
                label="I agree not to charge candidates any unauthorized recruitment, registration, interview, security or placement fee through this platform."
              />
              <CheckboxField checked={employer.consentCommunication} onChange={set('consentCommunication')} label="I agree to receive important updates via SMS, Email & WhatsApp." />
              <CheckboxField
                required
                checked={employer.acceptTerms}
                onChange={set('acceptTerms')}
                label={
                  <>
                    By clicking {word}, you agree to the{' '}
                    <Link to="/legal/privacy-policy" target="_blank" className="text-brand-blue underline">
                      Privacy Policy
                    </Link>{' '}
                    and{' '}
                    <Link to="/legal/terms-and-conditions" target="_blank" className="text-brand-blue underline">
                      Terms &amp; Conditions
                    </Link>{' '}
                    of Freejobwala.
                  </>
                }
              />
            </div>
            {errors.acceptTerms && <p className="mt-2 text-xs font-medium text-brand-red">{errors.acceptTerms}</p>}
            {otpSent && (
              <Field className="mt-4" label="Enter OTP & verify" required error={errors.otp} hint={`Sent to +91 ${employer.mobile}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <TextField
                    className="w-40"
                    required
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={employer.otp}
                    onChange={(e) => set('otp')(e.target.value.replace(/\D/g, ''))}
                    aria-label="OTP"
                  />
                  <Button size="sm" variant="ghost" loading={sendOtp.isPending} onClick={() => sendOtp.mutate()}>
                    Resend OTP
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setOtpSent(false);
                      set('otp')('');
                    }}
                  >
                    Change number
                  </Button>
                </div>
              </Field>
            )}
          </Section>
        )}

        <StepNav
          current={step}
          total={STEPS.length}
          onBack={() => goTo(step - 1)}
          onNext={next}
          submitLabel={otpSent ? 'Verify & post' : `Send OTP & ${word.toLowerCase()}`}
          loading={submit.isPending || sendOtp.isPending}
        />
      </form>
    </div>
  );
};

export default PostJobGuest;
