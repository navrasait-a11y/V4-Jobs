import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Button from '../ui/Button';
import { Modal } from '../ui/feedback';
import { CheckboxField, SelectField, TextAreaField, TextField } from '../ui/form';
import { Section } from '../ui/data';
import { useAction } from '../../hooks/useData';
import { adminApi } from '../../services';
import { formatCurrency } from '../../utils/format';

const inv = { invalidate: ['admin'] };

/** Grants a plan and adjusts the wallet of an organization or a user. */
export const PlanAndWallet = ({ target, audience }) => {
  const plans = useQuery({ queryKey: ['admin', 'plans-options'], queryFn: () => adminApi.list('/billing/plans', { limit: 100 }) });
  const [planId, setPlanId] = useState('');
  const [wallet, setWallet] = useState({ type: 'credit', amount: '', note: '' });
  const assign = useAction(() => adminApi.post('/billing/assign-plan', { planId, ...target }), { ...inv, success: 'Plan assigned', onSuccess: () => setPlanId('') });
  const adjust = useAction(() => adminApi.post('/billing/wallet/adjust', { ...target, type: wallet.type, amount: Number(wallet.amount), note: wallet.note || 'Admin adjustment' }), { ...inv, success: 'Wallet updated', onSuccess: () => setWallet({ type: 'credit', amount: '', note: '' }) });
  const options = (plans.data?.data || []).filter((p) => p.audience === audience).map((p) => ({ value: p._id, label: `${p.name} (${formatCurrency(p.price)})` }));
  return (
    <Section title="Plan and wallet">
      <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_auto]">
        <SelectField label="Assign plan" options={options} value={planId} onChange={(e) => setPlanId(e.target.value)} />
        <Button size="sm" variant="primaryBlue" className="h-11" disabled={!planId} loading={assign.isPending} onClick={() => assign.mutate()}>
          Assign
        </Button>
      </div>
      <div className="mt-4 grid grid-cols-1 items-end gap-3 sm:grid-cols-[120px_1fr_1fr_auto]">
        <SelectField label="Wallet" placeholder={null} options={[{ value: 'credit', label: 'Credit' }, { value: 'debit', label: 'Debit' }]} value={wallet.type} onChange={(e) => setWallet((w) => ({ ...w, type: e.target.value }))} />
        <TextField label="Amount" type="number" min="1" value={wallet.amount} onChange={(e) => setWallet((w) => ({ ...w, amount: e.target.value }))} />
        <TextField label="Note" value={wallet.note} onChange={(e) => setWallet((w) => ({ ...w, note: e.target.value }))} />
        <Button size="sm" variant="outline" className="h-11" disabled={!wallet.amount} loading={adjust.isPending} onClick={() => adjust.mutate()}>
          Apply
        </Button>
      </div>
    </Section>
  );
};

/** Sends an e-mail template to a list of addresses. */
export const SendTemplate = ({ template, onClose }) => {
  const [emails, setEmails] = useState('');
  const [copy, setCopy] = useState(false);
  const send = useAction(() => adminApi.post('/cms/email-templates/send', { templateId: template._id, emails: emails.split(',').map((e) => e.trim()).filter(Boolean), sendMeCopy: copy }), { success: 'E-mails queued', onSuccess: onClose });
  return (
    <Modal open onClose={onClose} title={`Send ${template.name}`} footer={<Button size="sm" variant="primary" disabled={!emails.trim()} loading={send.isPending} onClick={() => send.mutate()}>Send</Button>}>
      <div className="space-y-4">
        <TextAreaField label="Recipient e-mails" hint="Comma separated. Real e-mail will be sent." rows={3} value={emails} onChange={(e) => setEmails(e.target.value)} />
        <CheckboxField label="Send me a copy" checked={copy} onChange={(e) => setCopy(e.target.checked)} />
      </div>
    </Modal>
  );
};

/** Assigns candidates to a job, or invites them. */
export const JobCandidates = ({ job, onClose }) => {
  const [mode, setMode] = useState('invites');
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState([]);
  const [message, setMessage] = useState('');
  const found = useQuery({ queryKey: ['admin', 'pick-candidates', q], queryFn: () => adminApi.list('/candidates', { q: q || undefined, limit: 20 }) });
  const send = useAction(() => adminApi.post(`/jobs/${job._id}/${mode}`, { candidateIds: picked, ...(mode === 'invites' ? { message: message || `You are invited to apply for ${job.title}` } : {}) }), { ...inv, success: 'Done', onSuccess: onClose });
  return (
    <Modal open onClose={onClose} title={job.title} size="lg" footer={<Button size="sm" variant="primaryBlue" disabled={!picked.length} loading={send.isPending} onClick={() => send.mutate()}>{mode === 'invites' ? 'Send invites' : 'Assign'} ({picked.length})</Button>}>
      <div className="space-y-3">
        <SelectField label="Action" placeholder={null} options={[{ value: 'invites', label: 'Invite candidates' }, { value: 'assign-applicants', label: 'Assign as applicants' }]} value={mode} onChange={(e) => setMode(e.target.value)} />
        <TextField label="Search candidates" value={q} onChange={(e) => setQ(e.target.value)} />
        <ul className="max-h-56 divide-y divide-brand-border overflow-y-auto rounded-md border border-brand-border">
          {(found.data?.data || []).map((c) => (
            <li key={c._id} className="px-3 py-2">
              <CheckboxField label={c.fullName} description={c.email} checked={picked.includes(c._id)} onChange={() => setPicked((p) => (p.includes(c._id) ? p.filter((x) => x !== c._id) : [...p, c._id]))} />
            </li>
          ))}
        </ul>
        {mode === 'invites' && <TextAreaField label="Message" rows={2} value={message} onChange={(e) => setMessage(e.target.value)} />}
      </div>
    </Modal>
  );
};

/** Upload field for images stored through the CMS media endpoint. */
export const MediaField = ({ label, value, onChange }) => {
  const upload = useAction((file) => adminApi.upload('/cms/media', { file }), { onSuccess: (m) => onChange({ key: m.key, url: m.url }) });
  return (
    <div>
      <p className="mb-1.5 text-sm font-medium text-brand-dark">{label}</p>
      {value?.url && <img src={value.url} alt="" className="mb-2 h-24 rounded-md object-cover" />}
      <input type="file" accept="image/*" aria-label={label} className="w-full" onChange={(e) => e.target.files?.[0] && upload.mutate(e.target.files[0])} />
    </div>
  );
};
