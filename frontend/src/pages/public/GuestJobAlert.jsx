import React, { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import Button from '../../components/ui/Button';
import { CheckboxField, LocationField, MobileField, SelectField, SuggestField, TextField } from '../../components/ui/form';
import { useAction, useDocumentTitle } from '../../hooks/useData';
import { alertApi } from '../../services';
import useAuthStore from '../../store/useAuthStore';

/** Job alert for visitors; verifying the mobile creates their account. */
const GuestJobAlert = () => {
  useDocumentTitle('Create job alert');
  const { user, setSession } = useAuthStore();
  const [form, setForm] = useState({ name: '', fullName: '', email: '', mobile: '', otp: '', frequency: 'daily', jobTitle: '', keySkills: [], locations: [], acceptTerms: false });
  const [otpSent, setOtpSent] = useState(false);
  const [done, setDone] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e }));
  const sendOtp = useAction(() => alertApi.guestOtp(form.mobile), { success: 'OTP sent to your mobile', onSuccess: () => setOtpSent(true) });
  const create = useAction(
    () =>
      alertApi.guestCreate({
        name: form.name || form.jobTitle || 'My job alert',
        fullName: form.fullName,
        email: form.email,
        mobile: form.mobile,
        otp: form.otp,
        frequency: form.frequency,
        acceptTerms: true,
        criteria: { jobTitle: form.jobTitle, keySkills: form.keySkills, locations: form.locations, kind: 'any' },
      }),
    {
      onSuccess: (data) => {
        if (data.tokens) setSession(data);
        toast.success('Job alert created');
        setDone(true);
      },
    },
  );
  if (done) return <Navigate to="/candidate/job-alerts" replace />;
  if (user?.role === 'candidate') return <Navigate to="/candidate/job-alerts" replace />;

  return (
    <div className="bg-brand-tint px-4 py-8">
      <form
        className="mx-auto max-w-[600px] space-y-4 surface p-5 sm:p-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (otpSent) create.mutate();
          else sendOtp.mutate();
        }}
      >
        <div>
          <h1 className="text-2xl font-bold text-brand-dark">Create a job alert</h1>
          <p className="mt-1 text-sm text-brand-gray">Get matching jobs in your inbox. Your account is created when you verify your mobile.</p>
        </div>
        <SuggestField label="Job title" lookup="job_title" allowCreate value={form.jobTitle} onChange={set('jobTitle')} />
        <SuggestField label="Key skills" lookup="key_skill" multiple max={15} allowCreate value={form.keySkills} onChange={set('keySkills')} />
        <LocationField label="Preferred locations" multiple max={3} value={form.locations} onChange={set('locations')} />
        <SelectField label="Frequency" placeholder={null} options={[{ value: 'daily', label: 'Daily' }, { value: 'weekly', label: 'Weekly' }, { value: 'monthly', label: 'Monthly' }]} value={form.frequency} onChange={set('frequency')} />
        <TextField label="Full name" required value={form.fullName} onChange={set('fullName')} />
        <TextField label="Email" type="email" required value={form.email} onChange={set('email')} />
        <MobileField required value={form.mobile} onChange={set('mobile')} disabled={otpSent} />
        {otpSent && <TextField label="OTP" required inputMode="numeric" autoComplete="one-time-code" value={form.otp} onChange={set('otp')} />}
        <CheckboxField
          required
          checked={form.acceptTerms}
          onChange={set('acceptTerms')}
          label={
            <>
              I accept the{' '}
              <Link to="/legal/privacy-policy" target="_blank" className="text-brand-blue underline">
                Privacy Policy
              </Link>
            </>
          }
        />
        <Button type="submit" variant="primary" fullWidth loading={sendOtp.isPending || create.isPending}>
          {otpSent ? 'Create alert' : 'Send OTP'}
        </Button>
      </form>
    </div>
  );
};

export default GuestJobAlert;
