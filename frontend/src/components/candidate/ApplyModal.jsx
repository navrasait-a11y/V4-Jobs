import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import Button from '../ui/Button';
import { Alert, Modal } from '../ui/feedback';
import { CheckboxField, FileDropzone, MobileField, SelectField, TextAreaField, TextField } from '../ui/form';
import { useAction, useLookups } from '../../hooks/useData';
import { jobApi } from '../../services';
import useAuthStore from '../../store/useAuthStore';

const QuestionField = ({ q, value, onChange }) => {
  if (q.type === 'yes_no') return <SelectField label={q.question} required={q.required} options={['Yes', 'No']} value={value} onChange={(e) => onChange(e.target.value)} />;
  if (q.type === 'choice') return <SelectField label={q.question} required={q.required} options={q.options || []} value={value} onChange={(e) => onChange(e.target.value)} />;
  return <TextField label={q.question} required={q.required} type={q.type === 'number' ? 'number' : 'text'} value={value} onChange={(e) => onChange(e.target.value)} />;
};

const Questions = ({ job, answers, setAnswers }) =>
  (job.questions || []).map((q) => <QuestionField key={q.question} q={q} value={answers[q.question] || ''} onChange={(v) => setAnswers((a) => ({ ...a, [q.question]: v }))} />);

const toAnswers = (answers) => Object.entries(answers).map(([question, answer]) => ({ question, answer }));

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
          apply.mutate();
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

/** Apply without login: OTP on mobile, then a full session is created by the API. */
const GuestApply = ({ job, onClose, onApplied, eventId }) => {
  const setSession = useAuthStore((s) => s.setSession);
  const lookups = useLookups('gender', 'experience_level');
  const [form, setForm] = useState({ fullName: '', mobile: '', email: '', gender: '', experienceLevel: '', otp: '', acceptTerms: false });
  const [answers, setAnswers] = useState({});
  const [resume, setResume] = useState(null);
  const [otpSent, setOtpSent] = useState(false);
  const [errors, setErrors] = useState({});
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e }));

  const sendOtp = useAction(() => jobApi.guestOtp(job._id, form.mobile), { success: 'OTP sent to your mobile', onSuccess: () => setOtpSent(true) });
  const apply = useAction(() => jobApi.guestApply(job._id, { ...form, acceptTerms: form.acceptTerms, answers: toAnswers(answers), resume, eventId }), {
    success: 'Application submitted. Your account is ready',
    onSuccess: (data) => {
      setSession(data);
      onApplied();
    },
    onError: (e) => setErrors(e.fieldErrors || {}),
  });
  const submit = (e) => {
    e.preventDefault();
    if (otpSent) apply.mutate();
    else sendOtp.mutate();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Apply to ${job.title}`}
      subtitle="No account needed"
      footer={
        <Button type="submit" form="guest-apply" variant="primary" size="sm" loading={apply.isPending || sendOtp.isPending}>
          {otpSent ? 'Submit application' : 'Send OTP'}
        </Button>
      }
    >
      <form id="guest-apply" onSubmit={submit} className="space-y-4">
        <p className="text-sm text-brand-gray">
          Have an account?{' '}
          <Link to="/login" state={{ from: `/jobs/${job.slug}` }} className="font-semibold text-brand-blue">
            Log in
          </Link>
        </p>
        <TextField label="Full name" required value={form.fullName} onChange={set('fullName')} error={errors.fullName} />
        <MobileField required value={form.mobile} onChange={set('mobile')} disabled={otpSent} error={errors.mobile} />
        <TextField label="Email" required type="email" value={form.email} onChange={set('email')} error={errors.email} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SelectField label="Gender" options={lookups.gender} value={form.gender} onChange={set('gender')} />
          <SelectField label="Experience" options={lookups.experience_level} value={form.experienceLevel} onChange={set('experienceLevel')} />
        </div>
        <Questions job={job} answers={answers} setAnswers={setAnswers} />
        {resume ? <Alert tone="success">{resume.name}</Alert> : <FileDropzone accept=".pdf,.doc,.docx" maxSizeMb={5} onFile={setResume} hint="PDF, DOC or DOCX up to 5 MB" label="Upload your resume" />}
        {otpSent && <TextField label="OTP" required inputMode="numeric" autoComplete="one-time-code" value={form.otp} onChange={set('otp')} error={errors.otp} />}
        <CheckboxField
          required
          checked={form.acceptTerms}
          onChange={set('acceptTerms')}
          label={
            <>
              I accept the{' '}
              <Link to="/legal/terms-and-conditions" target="_blank" className="text-brand-blue underline">
                Terms
              </Link>
            </>
          }
        />
      </form>
    </Modal>
  );
};

const ApplyModal = (props) => {
  const user = useAuthStore((s) => s.user);
  return user ? <CandidateApply {...props} /> : <GuestApply {...props} />;
};

export default ApplyModal;
