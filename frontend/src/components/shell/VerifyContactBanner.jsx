import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { Icon, Modal } from '../ui/feedback';
import { MobileField, TextField } from '../ui/form';
import Button from '../ui/Button';
import useAuth from '../../hooks/useAuth';
import { useAction } from '../../hooks/useData';
import { authApi } from '../../services';

const CLOSED = { kind: null, adding: false, sent: false };

/**
 * Nudges users to finish e-mail and mobile verification; the verified badge depends on both.
 * Accounts missing one (a Google sign-up has no mobile) add it here, confirmed by OTP.
 */
const VerifyContactBanner = () => {
  const { user, loadMe } = useAuth();
  const [flow, setFlow] = useState(CLOSED);
  const [value, setValue] = useState('');
  const [otp, setOtp] = useState('');

  const finish = () => {
    setFlow(CLOSED);
    setValue('');
    setOtp('');
    loadMe();
  };
  const open = (next) => {
    setValue('');
    setOtp('');
    setFlow({ ...CLOSED, ...next });
  };
  const sendEmail = useAction(authApi.sendEmailVerification, { success: 'Verification link sent to your e-mail' });
  const sendOtp = useAction(() => authApi.sendMobileOtp({}), { onSuccess: () => open({ kind: 'mobile', sent: true }) });
  const sendNew = useAction(() => authApi.changeContact({ [flow.kind]: value }), { success: 'OTP sent', onSuccess: () => setFlow((f) => ({ ...f, sent: true })) });
  const verify = useAction(() => authApi.verifyMobile(otp), { success: 'Mobile number verified', onSuccess: finish });
  const confirmNew = useAction(() => authApi.confirmContact({ [flow.kind]: value, otp }), { success: 'Contact added and verified', onSuccess: finish });

  if (!user || (user.isEmailVerified && user.isMobileVerified)) return null;

  const isMobile = flow.kind === 'mobile';
  const asking = flow.adding && !flow.sent;
  const validValue = isMobile ? value.length === 10 : /^\S+@\S+\.\S+$/.test(value);
  const pending = sendNew.isPending || verify.isPending || confirmNew.isPending;
  const destination = flow.adding ? (isMobile ? `+91 ${value}` : value) : user.mobile;
  const submit = () => {
    if (asking) return validValue ? sendNew.mutate() : toast.error(isMobile ? 'Enter a 10 digit mobile number' : 'Enter a valid e-mail');
    if (otp.length < 4) return toast.error('Enter the OTP');
    return flow.adding ? confirmNew.mutate() : verify.mutate();
  };
  const resend = () => (flow.adding ? sendNew.mutate() : sendOtp.mutate());
  const link = 'font-semibold text-brand-blue underline disabled:opacity-50';

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-amber-200 bg-brand-amber-tint px-4 py-2 text-xs text-brand-dark">
      <Icon name="mark_email_unread" size={16} />
      <span>Verify your contact details to earn the verified badge.</span>
      {!user.isEmailVerified &&
        (user.email ? (
          <button className={link} disabled={sendEmail.isPending} onClick={() => sendEmail.mutate()}>
            Verify e-mail
          </button>
        ) : (
          <button className={link} onClick={() => open({ kind: 'email', adding: true })}>
            Add e-mail
          </button>
        ))}
      {!user.isMobileVerified &&
        (user.mobile ? (
          <button className={link} disabled={sendOtp.isPending} onClick={() => sendOtp.mutate()}>
            Verify mobile
          </button>
        ) : (
          <button className={link} onClick={() => open({ kind: 'mobile', adding: true })}>
            Add mobile number
          </button>
        ))}
      <Modal
        open={Boolean(flow.kind)}
        onClose={() => setFlow(CLOSED)}
        title={`${flow.adding ? 'Add' : 'Verify'} ${isMobile ? 'mobile number' : 'e-mail'}`}
        subtitle={asking ? 'We will send a one-time code to confirm it' : `OTP sent to ${destination}`}
        size="sm"
        footer={
          <>
            {!asking && (
              <Button size="sm" variant="ghost" disabled={pending || sendOtp.isPending} onClick={resend}>
                Resend OTP
              </Button>
            )}
            <Button size="sm" variant="primaryBlue" loading={pending} onClick={submit}>
              {asking ? 'Send OTP' : 'Verify'}
            </Button>
          </>
        }
      >
        {asking ? (
          isMobile ? (
            <MobileField value={value} onChange={setValue} />
          ) : (
            <TextField label="E-mail" type="email" autoComplete="email" value={value} onChange={(e) => setValue(e.target.value.trim())} />
          )
        ) : (
          <TextField label="OTP" inputMode="numeric" autoComplete="one-time-code" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} maxLength={6} />
        )}
      </Modal>
    </div>
  );
};

export default VerifyContactBanner;
