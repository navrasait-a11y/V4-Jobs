import React, { useState } from 'react';
import Button from '../ui/Button';
import { Section } from '../ui/data';
import { MobileField, SelectField, TextField } from '../ui/form';
import useAuth from '../../hooks/useAuth';
import { useAction } from '../../hooks/useData';
import { authApi } from '../../services';

/** Change the login e-mail or mobile. The new contact is confirmed by an OTP sent to it. */
const ChangeContact = () => {
  const { user, loadMe } = useAuth();
  const [kind, setKind] = useState('email');
  const [value, setValue] = useState('');
  const [otp, setOtp] = useState('');
  const [sent, setSent] = useState(false);
  const reset = () => {
    setSent(false);
    setValue('');
    setOtp('');
  };
  const request = useAction(() => authApi.changeContact({ [kind]: value }), { success: 'OTP sent to the new contact', onSuccess: () => setSent(true) });
  const confirm = useAction(() => authApi.confirmContact({ [kind]: value, otp }), {
    success: 'Contact updated',
    onSuccess: () => {
      reset();
      loadMe();
    },
  });
  return (
    <Section title="Change e-mail or mobile">
      <p className="mb-3 text-sm text-brand-gray">Current: {[user.email, user.mobile && `+91 ${user.mobile}`].filter(Boolean).join(' · ') || '—'}</p>
      <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[140px_1fr_auto]">
        <SelectField
          label="Change"
          placeholder={null}
          options={[
            { value: 'email', label: 'E-mail' },
            { value: 'mobile', label: 'Mobile' },
          ]}
          value={kind}
          onChange={(e) => {
            setKind(e.target.value);
            reset();
          }}
        />
        {kind === 'mobile' ? (
          <MobileField label="New mobile" value={value} disabled={sent} onChange={setValue} />
        ) : (
          <TextField label="New e-mail" type="email" value={value} disabled={sent} onChange={(e) => setValue(e.target.value.trim())} />
        )}
        {!sent && (
          <Button size="sm" variant="outline" className="h-11" disabled={!value} loading={request.isPending} onClick={() => request.mutate()}>
            Send OTP
          </Button>
        )}
      </div>
      {sent && (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <TextField className="min-w-[160px] flex-1" label="OTP" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} />
          <Button size="sm" variant="primaryBlue" className="h-11" disabled={!otp} loading={confirm.isPending} onClick={() => confirm.mutate()}>
            Confirm
          </Button>
          <Button size="sm" variant="ghost" className="h-11" onClick={reset}>
            Cancel
          </Button>
        </div>
      )}
    </Section>
  );
};

export default ChangeContact;
