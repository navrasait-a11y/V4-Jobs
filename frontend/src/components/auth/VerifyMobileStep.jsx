import React, { useState } from 'react';
import Button from '../ui/Button';
import { Alert, Icon } from '../ui/feedback';
import { TextField } from '../ui/form';
import { useAction } from '../../hooks/useData';
import { authApi } from '../../services';

/** "Enter OTP & Verify" step shown right after registration. The account already exists, so skipping is allowed. */
const VerifyMobileStep = ({ mobile, onDone }) => {
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const verify = useAction(() => authApi.verifyMobile(otp), { success: 'Mobile number verified', silent: true, onSuccess: () => onDone(true), onError: (e) => setError(e.message) });
  const resend = useAction(() => authApi.sendMobileOtp({}), { success: 'A new OTP is on its way', silent: true, onError: (e) => setError(e.message) });
  return (
    <form
      className="space-y-4 text-center"
      onSubmit={(e) => {
        e.preventDefault();
        if (!/^\d{4,8}$/.test(otp)) return setError('Enter the OTP sent to your mobile');
        setError('');
        return verify.mutate();
      }}
    >
      <Icon name="sms" size={40} className="mx-auto text-brand-blue" />
      <div>
        <h2 className="text-lg font-semibold text-brand-dark">Enter OTP and verify</h2>
        <p className="mt-1 text-sm text-brand-gray">We sent a 6 digit code to +91 {mobile}</p>
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      <TextField label="OTP" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} inputClassName="text-center text-lg tracking-[0.4em]" />
      <Button type="submit" variant="primary" fullWidth size="lg" loading={verify.isPending}>
        Verify
      </Button>
      <div className="flex justify-center gap-5 text-sm">
        <button type="button" disabled={resend.isPending} onClick={() => resend.mutate()} className="font-semibold text-brand-blue disabled:opacity-50">
          Resend OTP
        </button>
        <button type="button" onClick={() => onDone(false)} className="font-semibold text-brand-gray">
          Verify later
        </button>
      </div>
    </form>
  );
};

export default VerifyMobileStep;
