import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import Button from '../ui/Button';
import { Alert, Modal } from '../ui/feedback';
import { CheckboxField, ChoiceChips, Field, FileDropzone, LocationField, MobileField, SelectField, SuggestField, TextAreaField, TextField } from '../ui/form';
import HierarchyField from '../ui/HierarchyField';
import { Icon } from '../ui/feedback';
import { Stepper, useSteps } from '../ui/stepper';
import { useAction, useLookups } from '../../hooks/useData';
import { jobApi } from '../../services';
import useAuthStore from '../../store/useAuthStore';
import { DISTANCE_OPTIONS, EXPERIENCE_LEVEL_LABELS, EXPERIENCE_OPTIONS } from '../../utils/options';

/** Screening question by type: single / multiple choice, short answer, text only, numbers only. */
const QuestionField = ({ q, value, onChange }) => {
  const label = q.question;
  if (q.type === 'yes_no') return <SelectField label={label} required={q.required} options={['Yes', 'No']} value={value} onChange={(e) => onChange(e.target.value)} />;
  if (q.type === 'choice' || q.type === 'single_choice')
    return (
      <Field label={label} required={q.required}>
        <ChoiceChips options={q.options || []} value={value} onChange={onChange} />
      </Field>
    );
  if (q.type === 'multiple_choice')
    return (
      <Field label={label} required={q.required} hint="Pick all that apply">
        <ChoiceChips multiple options={q.options || []} value={Array.isArray(value) ? value : []} onChange={onChange} />
      </Field>
    );
  if (q.type === 'number') return <TextField label={label} required={q.required} inputMode="decimal" value={value || ''} onChange={(e) => onChange(e.target.value.replace(/[^\d.-]/g, ''))} hint="Numbers only" />;
  if (q.type === 'text') return <TextField label={label} required={q.required} value={value || ''} onChange={(e) => onChange(e.target.value.replace(/\d/g, ''))} hint="Text only" />;
  return <TextField label={label} required={q.required} value={value || ''} onChange={(e) => onChange(e.target.value)} maxLength={500} />;
};

const Questions = ({ job, answers, setAnswers }) => (job.questions || []).map((q) => <QuestionField key={q.question} q={q} value={answers[q.question]} onChange={(v) => setAnswers((a) => ({ ...a, [q.question]: v }))} />);

const toAnswers = (answers) => Object.entries(answers).map(([question, answer]) => ({ question, answer: answer ?? '' }));
const missingAnswer = (job, answers) => (job.questions || []).find((q) => q.required && !(Array.isArray(answers[q.question]) ? answers[q.question].length : String(answers[q.question] ?? '').trim()));

/** Logged-in apply: profile resume by default, optional cover letter and replacement resume. */
const CandidateApply = ({ job, onClose, onApplied, eventId }) => {
  const [answers, setAnswers] = useState({});
  const [coverLetter, setCoverLetter] = useState('');
  const [resume, setResume] = useState(null);
  const apply = useAction(() => jobApi.apply(job._id, { answers: resume ? JSON.stringify(toAnswers(answers)) : toAnswers(answers), coverLetter: coverLetter || undefined, resume, eventId }), {
    success: 'Application submitted',
    invalidate: ['applications', 'candidate-dashboard', 'job'],
    silent: true,
    onSuccess: onApplied,
    onError: (e) => {
      if (e.code === 'EXTERNAL_APPLY' && e.details?.url) window.open(e.details.url, '_blank', 'noopener');
      else toast.error(e.message);
    },
  });
  return (
    <Modal
      open
      onClose={onClose}
      title={`Apply to ${job.title}`}
      subtitle={job.orgSnapshot?.name}
      footer={
        <Button type="submit" form="apply-form" variant="primary" size="sm" loading={apply.isPending}>
          Submit application
        </Button>
      }
    >
      <form
        id="apply-form"
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const missing = missingAnswer(job, answers);
          if (missing) return toast.error(`Please answer: ${missing.question}`);
          return apply.mutate();
        }}
      >
        <Questions job={job} answers={answers} setAnswers={setAnswers} />
        <TextAreaField label="Cover letter (optional)" rows={3} value={coverLetter} onChange={(e) => setCoverLetter(e.target.value)} />
        {resume ? (
          <Alert tone="success">
            {resume.name}{' '}
            <button type="button" className="font-semibold underline" onClick={() => setResume(null)}>
              Remove
            </button>
          </Alert>
        ) : (
          <FileDropzone accept=".pdf,.doc,.docx" maxSizeMb={5} onFile={setResume} label="Use a different resume (optional)" hint="Your profile resume is used by default. PDF, DOC or DOCX up to 5 MB" />
        )}
      </form>
    </Modal>
  );
};

const GUEST_STEPS = [
  { key: 'details', title: 'Your details', short: 'Details', fields: ['experienceLevel', 'totalExperienceMonths', 'fullName', 'gender', 'email', 'mobile', 'dob', 'currentJobTitle', 'resume'] },
  {
    key: 'preferences',
    title: 'Job preferences',
    short: 'Preferences',
    fields: ['preferredLocations', 'distanceKm', 'relocation', 'keySkills', 'industries', 'subIndustries', 'roles', 'departments', 'functions', 'currentSalary', 'heardFrom'],
  },
  { key: 'verify', title: 'Questions & verify', short: 'Verify', fields: ['answers', 'otp', 'acceptTerms', 'consentCommunication'] },
];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const DRAFT_KEY = 'fjw.applyDraft';
const GUEST_BLANK = {
  experienceLevel: '',
  experienceMonths: '',
  fullName: '',
  gender: '',
  email: '',
  mobile: '',
  dob: '',
  preferredLocations: [],
  distanceKm: '',
  relocation: [],
  currentJobTitle: '',
  keySkills: [],
  industries: [],
  subIndustries: [],
  roles: [],
  departments: [],
  functions: [],
  currentSalary: '',
  heardFrom: '',
  consentCommunication: true,
  acceptTerms: false,
  otp: '',
};
const readDraft = () => {
  try {
    return JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null') || {};
  } catch {
    return {};
  }
};
const writeDraft = (v) => {
  try {
    if (v) localStorage.setItem(DRAFT_KEY, JSON.stringify(v));
    else localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* storage blocked */
  }
};

/**
 * Job Apply Form without login ("Other Forms" Excel): candidate details, preferred job criteria,
 * consents, "Apply Now" -> "Enter OTP & Verify" -> "Setup Profile and Job Preference".
 */
const GuestApply = ({ job, onClose, onApplied, eventId }) => {
  const setSession = useAuthStore((s) => s.setSession);
  const lookups = useLookups('experience_level', 'heard_from', 'relocate_option');
  const [form, setForm] = useState(() => ({ ...GUEST_BLANK, ...readDraft(), otp: '' }));
  const [answers, setAnswers] = useState({});
  const [resume, setResume] = useState(null);
  const [otpSent, setOtpSent] = useState(false);
  const [applied, setApplied] = useState(null);
  const [errors, setErrors] = useState({});
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e }));
  const fresher = form.experienceLevel === 'Fresher';
  const topRef = useRef(null);
  const validate = () => {
    const e = {};
    if (!form.experienceLevel) e.experienceLevel = 'Pick your experience level';
    if (form.fullName.trim().length < 2) e.fullName = 'Enter your full name';
    if (!EMAIL.test(form.email || '')) e.email = 'Enter a valid e-mail ID';
    if (!/^[6-9]\d{9}$/.test(form.mobile || '')) e.mobile = 'Enter a valid 10 digit mobile number';
    const missing = missingAnswer(job, answers);
    if (missing) e.answers = `Please answer: ${missing.question}`;
    if (!form.acceptTerms) e.acceptTerms = 'Please accept the terms to apply';
    return e;
  };
  const { step, reached, goTo, next, validateAll, showErrors, errorSteps, last } = useSteps(GUEST_STEPS, { validate, setErrors, scrollRef: topRef, watch: `${JSON.stringify(form)}|${JSON.stringify(answers)}` });

  // "Draft or Resume Form In Case of any Error"
  useEffect(() => {
    if (applied) return undefined;
    const t = setTimeout(() => {
      const { otp: _o, acceptTerms: _a, ...rest } = form;
      writeDraft(rest);
    }, 600);
    return () => clearTimeout(t);
  }, [form, applied]);

  const relocation = (values) => {
    const added = values.find((v) => !form.relocation.includes(v));
    set('relocation')(added && /^no/i.test(added) ? [added] : values.filter((v) => !/^no/i.test(v) || !added));
  };

  const sendOtp = useAction(() => jobApi.guestOtp(job._id, form.mobile), { success: 'OTP sent to your mobile', onSuccess: () => setOtpSent(true) });
  const apply = useAction(
    () => {
      const { experienceMonths, distanceKm, currentSalary, otp, ...rest } = form;
      return jobApi.guestApply(job._id, {
        ...rest,
        otp,
        dob: rest.dob || undefined,
        totalExperienceMonths: fresher ? 0 : experienceMonths ? Number(experienceMonths) : undefined,
        distanceKm: distanceKm ? Number(distanceKm) : undefined,
        currentSalary: currentSalary ? Number(currentSalary) : undefined,
        answers: toAnswers(answers),
        resume,
        eventId,
      });
    },
    {
      silent: true,
      onSuccess: (data) => {
        writeDraft(null);
        setSession(data);
        setApplied(data);
      },
      onError: (e) => {
        setErrors(e.fieldErrors || {});
        showErrors(e.fieldErrors);
        toast.error(e.message);
      },
    },
  );
  const submit = (e) => {
    e.preventDefault();
    if (!last) return next();
    if (!validateAll()) return undefined;
    return otpSent ? apply.mutate() : sendOtp.mutate();
  };

  if (applied) {
    return (
      <Modal open onClose={onApplied} title="Application submitted" subtitle={job.title}>
        <div className="space-y-4">
          <Alert tone="success">Your account is ready and your application has reached {job.orgSnapshot?.name || 'the employer'}.</Alert>
          <p className="text-sm text-brand-gray">Complete your profile and job preferences to get matching jobs and more recruiter views.</p>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="primary" size="sm">
              <Link to="/candidate/complete-profile">Setup profile and job preference</Link>
            </Button>
            <Button variant="outline" size="sm" onClick={onApplied}>
              Later
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      title={`Apply to ${job.title}`}
      subtitle="No account needed. Your answers are saved on this device until you apply"
      footer={
        <div className="flex w-full items-center gap-2">
          {step > 0 && (
            <Button variant="outline" size="sm" leftIcon={<Icon name="arrow_back" size={16} />} onClick={() => goTo(step - 1)}>
              Back
            </Button>
          )}
          <Button className="ml-auto" type="submit" form="guest-apply" variant="primary" size="sm" loading={apply.isPending || sendOtp.isPending} rightIcon={last ? undefined : <Icon name="arrow_forward" size={16} />}>
            {last ? (otpSent ? 'Verify & apply' : 'Send OTP & apply') : 'Continue'}
          </Button>
        </div>
      }
    >
      <form id="guest-apply" onSubmit={submit} className="space-y-5" noValidate>
        <div ref={topRef} className="scroll-mt-4 space-y-3">
          <p className="text-sm text-brand-gray">
            Have an account?{' '}
            <Link to="/login" state={{ from: `/jobs/${job.slug}` }} className="font-semibold text-brand-blue">
              Log in
            </Link>
          </p>
          <Stepper plain steps={GUEST_STEPS} current={step} reached={reached} onStep={goTo} errorSteps={errorSteps(errors)} />
        </div>

        {step === 0 && (
          <section className="space-y-4 animate-fade-in">
            <h3 className="text-sm font-semibold text-brand-dark">Candidate details</h3>
            <Field label="Experience level" required error={errors.experienceLevel}>
              <ChoiceChips options={lookups.experience_level.map((v) => ({ value: v, label: EXPERIENCE_LEVEL_LABELS[v] || v }))} value={form.experienceLevel} onChange={set('experienceLevel')} />
            </Field>
            {!fresher && form.experienceLevel && <SelectField label="Duration of experience" options={EXPERIENCE_OPTIONS.slice(1)} value={form.experienceMonths} onChange={set('experienceMonths')} />}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <TextField label="Full name" required value={form.fullName} onChange={set('fullName')} error={errors.fullName} />
              <Field label="Gender">
                <ChoiceChips options={['Male', 'Female', 'Other']} value={form.gender} onChange={set('gender')} />
              </Field>
              <TextField label="Email ID" required type="email" value={form.email} onChange={set('email')} error={errors.email} />
              <MobileField required value={form.mobile} onChange={set('mobile')} disabled={otpSent} error={errors.mobile} />
              <TextField label="Date of birth" type="date" max={new Date()} openTo="year" value={form.dob} onChange={set('dob')} />
              <SuggestField label="Current job title" lookup="job_title" allowCreate value={form.currentJobTitle} onChange={set('currentJobTitle')} placeholder="Type or select" />
            </div>
            {resume ? (
              <Alert tone="success">
                {resume.name}{' '}
                <button type="button" className="font-semibold underline" onClick={() => setResume(null)}>
                  Remove
                </button>
              </Alert>
            ) : (
              <FileDropzone accept=".pdf,.doc,.docx" maxSizeMb={5} onFile={setResume} hint="PDF or Word up to 5 MB" label="Upload your resume" />
            )}
          </section>
        )}

        {step === 1 && (
          <section className="space-y-4 animate-fade-in">
            <h3 className="text-sm font-semibold text-brand-dark">Preferred job criteria</h3>
            <LocationField label="Preferred job locations" multiple max={4} value={form.preferredLocations} onChange={set('preferredLocations')} hint="Up to 4" />
            <SelectField label="Show jobs within" options={DISTANCE_OPTIONS} value={form.distanceKm} onChange={set('distanceKm')} placeholder="Only these locations" />
            <Field label="Ready to relocate" hint="Up to 4">
              <ChoiceChips multiple max={4} options={lookups.relocate_option} value={form.relocation} onChange={relocation} />
            </Field>
            <SuggestField label="Key skills" lookup="key_skill" limit={20} multiple max={20} allowCreate value={form.keySkills} onChange={set('keySkills')} hint={`${form.keySkills.length}/20`} />
            <HierarchyField
              kind="industry"
              label="Preferred industry"
              value={{ parents: form.industries, children: form.subIndustries }}
              onChange={({ parents, children }) => setForm((f) => ({ ...f, industries: parents, subIndustries: children }))}
            />
            <SuggestField label="Preferred job roles" lookup="job_role" limit={20} multiple max={15} value={form.roles} onChange={set('roles')} hint={`Up to 15 (${form.roles.length}/15)`} />
            <HierarchyField
              kind="department"
              label="Preferred department"
              value={{ parents: form.departments, children: form.functions }}
              onChange={({ parents, children }) => setForm((f) => ({ ...f, departments: parents, functions: children }))}
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <TextField label="Monthly in-hand salary" type="number" min="0" value={form.currentSalary} onChange={set('currentSalary')} placeholder="25000" />
              <SelectField label="How did you hear about us?" options={lookups.heard_from} value={form.heardFrom} onChange={set('heardFrom')} />
            </div>
          </section>
        )}

        {last && (
          <div className="space-y-5 animate-fade-in">
            {(job.questions || []).length > 0 && (
              <section className="space-y-4">
                <h3 className="text-sm font-semibold text-brand-dark">Questions from the employer</h3>
                <Questions job={job} answers={answers} setAnswers={setAnswers} />
                {errors.answers && <p className="text-xs font-medium text-brand-red">{errors.answers}</p>}
              </section>
            )}

            <div className="space-y-2">
              <CheckboxField checked={form.consentCommunication} onChange={set('consentCommunication')} label="I agree to receive important updates via SMS, Email & WhatsApp." />
              <CheckboxField
                required
                checked={form.acceptTerms}
                onChange={set('acceptTerms')}
                label={
                  <>
                    By applying, you agree to the{' '}
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
              {errors.acceptTerms && <p className="text-xs font-medium text-brand-red">{errors.acceptTerms}</p>}
            </div>
            {otpSent && (
              <Field label="Enter OTP & verify" required error={errors.otp} hint={`Sent to +91 ${form.mobile}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <TextField className="w-40" required inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={form.otp} onChange={(e) => set('otp')(e.target.value.replace(/\D/g, ''))} aria-label="OTP" />
                  <Button size="sm" variant="ghost" loading={sendOtp.isPending} onClick={() => sendOtp.mutate()}>
                    Resend OTP
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setOtpSent(false);
                      goTo(0);
                      set('otp')('');
                    }}
                  >
                    Change number
                  </Button>
                </div>
              </Field>
            )}
          </div>
        )}
      </form>
    </Modal>
  );
};

const ApplyModal = (props) => {
  const user = useAuthStore((s) => s.user);
  // Fixed at open: a guest who applies gets a session but should still see the success step.
  const [guest] = useState(!user);
  return guest ? <GuestApply {...props} /> : <CandidateApply {...props} />;
};

export default ApplyModal;
