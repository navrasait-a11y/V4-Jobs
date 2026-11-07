import React, { useEffect, useState } from 'react';
import Button from '../ui/Button';
import { Section } from '../ui/data';
import { CheckboxField, ChoiceChips, Field, MobileField, PasswordField, SelectField, TextAreaField, TextField } from '../ui/form';
import { useAction, useLookups } from '../../hooks/useData';
import { adminApi } from '../../services';
import { titleCase } from '../../utils/format';

const STATUSES = ['active', 'pending', 'admin_review', 'blocked', 'suspended', 'deactivated', 'trashed'];
export const CANDIDATE_LABELS = ['premium', 'starred', 'featured', 'actively_searching', 'urgent', 'profile_booster'];
export const EMPLOYER_LABELS = ['premium', 'starred', 'featured', 'actively_hiring', 'urgent_hiring'];
const opts = (list) => list.map((v) => ({ value: v, label: titleCase(v) }));

const initial = (u) => ({
  fullName: u.fullName || '',
  displayName: u.displayName || '',
  username: u.username || '',
  gender: u.gender || '',
  email: u.email || '',
  mobile: u.mobile || '',
  status: u.status || 'active',
  statusReason: u.statusReason || '',
  isVerified: Boolean(u.isVerified),
  emailVerified: Boolean(u.emailVerifiedAt),
  mobileVerified: Boolean(u.mobileVerifiedAt),
  labels: u.labels || [],
  situationTag: u.situationTag || '',
  heardFrom: u.heardFrom || '',
  about: u.about || '',
  notificationPrefs: { email: true, sms: true, whatsapp: true, push: true, jobAlerts: true, recruiterMessages: true, marketing: false, ...(u.notificationPrefs || {}) },
  password: '',
});

/**
 * PRD "Admin Can Edit Entire Details of Candidate & Employer": login identity, verification, status,
 * labels, situation tag, notification preferences and a new password, for any user.
 */
const AccountPanel = ({ user, labels = CANDIDATE_LABELS, onSaved }) => {
  const lookups = useLookups('gender', 'situation_tag', 'heard_from');
  const [form, setForm] = useState(() => initial(user));
  useEffect(() => setForm(initial(user)), [user]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e }));
  const setPref = (k) => (e) => setForm((f) => ({ ...f, notificationPrefs: { ...f.notificationPrefs, [k]: e.target.checked } }));
  const save = useAction(
    () => {
      const { password, ...rest } = form;
      return adminApi.patch(`/users/${user._id}`, { user: { ...rest, ...(password ? { password } : {}) } });
    },
    { success: 'Account updated', invalidate: ['admin'], onSuccess: () => { setForm((f) => ({ ...f, password: '' })); onSaved?.(); } },
  );
  const weakPassword = form.password && (form.password.length < 8 || !/\d/.test(form.password) || !/[A-Za-z]/.test(form.password));
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!weakPassword) save.mutate();
      }}
    >
      <Section title="Login and identity">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField label="Full name" required value={form.fullName} onChange={set('fullName')} />
          <TextField label="Display name (shown publicly)" value={form.displayName} onChange={set('displayName')} />
          <TextField label="Username" value={form.username} onChange={set('username')} hint="3-30 letters, numbers or _" />
          <SelectField label="Gender" options={lookups.gender} value={form.gender} onChange={set('gender')} />
          <TextField label="E-mail" type="email" value={form.email} onChange={set('email')} hint="Changing it marks the e-mail unverified" />
          <MobileField value={form.mobile} onChange={set('mobile')} hint="Changing it marks the mobile unverified" />
          <SelectField label="How they heard about us" options={lookups.heard_from} value={form.heardFrom} onChange={set('heardFrom')} />
          <PasswordField label="Set a new password" value={form.password} onChange={set('password')} autoComplete="new-password" error={weakPassword ? 'At least 8 characters with a letter and a number' : undefined} hint="Leave empty to keep the current password" />
        </div>
        <TextAreaField className="mt-4" label="About" rows={2} value={form.about} onChange={set('about')} />
      </Section>
      <Section title="Status and verification">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SelectField label="Account status" placeholder={null} options={opts(STATUSES)} value={form.status} onChange={set('status')} hint="Anything other than Active logs the user out" />
          <TextField label="Status reason" value={form.statusReason} onChange={set('statusReason')} placeholder="Shown in the audit trail" />
        </div>
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
          <CheckboxField label="Verified badge" checked={form.isVerified} onChange={set('isVerified')} />
          <CheckboxField label="E-mail verified" checked={form.emailVerified} onChange={set('emailVerified')} />
          <CheckboxField label="Mobile verified" checked={form.mobileVerified} onChange={set('mobileVerified')} />
        </div>
      </Section>
      <Section title="Labels and situation tag">
        <Field label="Labels">
          <ChoiceChips multiple options={opts(labels)} value={form.labels} onChange={set('labels')} />
        </Field>
        <SelectField className="mt-4 sm:max-w-sm" label="Situation tag" options={lookups.situation_tag} value={form.situationTag} onChange={set('situationTag')} hint="For example Actively Applying or Hidden Talent" />
      </Section>
      <Section title="Notification preferences">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {Object.keys(form.notificationPrefs).map((k) => (
            <CheckboxField key={k} label={titleCase(k)} checked={Boolean(form.notificationPrefs[k])} onChange={setPref(k)} />
          ))}
        </div>
      </Section>
      <div className="sticky bottom-0 flex justify-end gap-2 surface p-3">
        <Button type="button" variant="ghost" size="sm" onClick={() => setForm(initial(user))}>
          Reset
        </Button>
        <Button type="submit" variant="primaryBlue" size="sm" loading={save.isPending}>
          Save account
        </Button>
      </div>
    </form>
  );
};

export default AccountPanel;
