import React, { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import Button from '../../components/ui/Button';
import { Section } from '../../components/ui/data';
import { Alert } from '../../components/ui/feedback';
import { CheckboxField, LocationField, MobileField, SelectField, SuggestField, TextAreaField, TextField } from '../../components/ui/form';
import { useAction, useDocumentTitle } from '../../hooks/useData';
import { jobApi } from '../../services';
import useAuthStore from '../../store/useAuthStore';

/** Post a job without an account. The API creates the employer and e-mails a set-password link. */
const PostJobGuest = () => {
  useDocumentTitle('Post a job');
  const user = useAuthStore((s) => s.user);
  const [form, setForm] = useState({ employerType: 'company', organizationName: '', fullName: '', email: '', mobile: '', designation: '', title: '', description: '', keySkills: [], locations: [], authorized: false, noCandidateFee: false, acceptTerms: false });
  const [errors, setErrors] = useState({});
  const [done, setDone] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e }));
  const consultancy = form.employerType === 'consultancy';
  const submit = useAction(
    () =>
      jobApi.guestPost({
        employer: { employerType: form.employerType, organizationName: form.organizationName, fullName: form.fullName, email: form.email, mobile: form.mobile, designation: form.designation || undefined, declarations: { authorized: form.authorized, noCandidateFee: consultancy ? form.noCandidateFee : true }, acceptTerms: true },
        job: { title: form.title, description: form.description, keySkills: form.keySkills, locations: form.locations },
      }),
    { onSuccess: () => setDone(true), onError: (e) => setErrors(e.fieldErrors || {}) },
  );
  if (user?.role === 'employer') return <Navigate to="/employer/jobs/post" replace />;
  if (done) {
    return (
      <div className="mx-auto max-w-xl px-4 py-12">
        <Alert tone="success">Your job is received. Check {form.email} for a link to set your password and manage it.</Alert>
      </div>
    );
  }
  return (
    <div className="bg-brand-tint px-4 py-6">
      <form
        className="mx-auto max-w-2xl space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit.mutate();
        }}
      >
        <div>
          <h1 className="text-xl font-bold text-brand-dark sm:text-2xl">Post a job</h1>
          <p className="mt-1 text-sm text-brand-gray">
            No account needed. Already registered?{' '}
            <Link to="/employer/login" className="font-semibold text-brand-blue">
              Log in
            </Link>
          </p>
        </div>
        <Section title="Job">
          <div className="space-y-4">
            <SuggestField label="Job title" required lookup="job_title" allowCreate value={form.title} onChange={set('title')} />
            <TextAreaField label="Job description" required rows={5} value={form.description} onChange={set('description')} />
            <SuggestField label="Key skills" lookup="key_skill" multiple max={30} allowCreate value={form.keySkills} onChange={set('keySkills')} />
            <LocationField label="Job location" required multiple max={15} value={form.locations} onChange={set('locations')} />
          </div>
        </Section>
        <Section title="Your details">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <SelectField label="You are" required placeholder={null} options={[{ value: 'company', label: 'Company' }, { value: 'consultancy', label: 'Consultancy' }]} value={form.employerType} onChange={set('employerType')} />
            <TextField label="Organization name" required value={form.organizationName} onChange={set('organizationName')} error={errors['employer.organizationName']} />
            <TextField label="Your name" required value={form.fullName} onChange={set('fullName')} />
            <TextField label="Designation" value={form.designation} onChange={set('designation')} />
            <TextField label="Official email" required type="email" value={form.email} onChange={set('email')} error={errors['employer.email']} />
            <MobileField required value={form.mobile} onChange={set('mobile')} error={errors['employer.mobile']} />
          </div>
          <div className="mt-4 space-y-2">
            <CheckboxField required checked={form.authorized} onChange={set('authorized')} label="I am authorized to hire for this organization" />
            {consultancy && <CheckboxField required checked={form.noCandidateFee} onChange={set('noCandidateFee')} label="We do not charge candidates any fee" />}
            <CheckboxField required checked={form.acceptTerms} onChange={set('acceptTerms')} label="I accept the Employer Terms and Privacy Policy" />
          </div>
        </Section>
        <Button type="submit" variant="primary" size="lg" fullWidth loading={submit.isPending}>
          Post job
        </Button>
      </form>
    </div>
  );
};

export default PostJobGuest;
