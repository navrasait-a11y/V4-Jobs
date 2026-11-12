import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Button from '../ui/Button';
import { Alert, Modal } from '../ui/feedback';
import { CheckboxField, SelectField, TextAreaField, TextField } from '../ui/form';
import { Section } from '../ui/data';
import { useAction } from '../../hooks/useData';
import { adminApi } from '../../services';
import { formatCurrency } from '../../utils/format';
import { AlertCriteriaFields, criteriaError, criteriaForm, FREQUENCIES, toCriteria } from '../candidate/JobAlertFields';

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

/** PRD: "Create Job Alerts Upto 1000 Candidates Selection" - one alert, saved for every ticked candidate. */
export const BulkJobAlert = ({ candidateIds, onDone }) => {
  const MAX = 1000;
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', frequency: 'daily', ...criteriaForm() });
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? e.target.value : e }));
  const create = useAction(() => adminApi.post('/job-alerts/bulk-create', { candidateIds, alert: { name: form.name.trim(), frequency: form.frequency, criteria: toCriteria(form) } }), {
    ...inv,
    success: (r) => `Job alert created for ${r?.created ?? candidateIds.length} candidates`,
    onSuccess: () => {
      setOpen(false);
      onDone?.();
    },
  });
  const submit = () => {
    const problem = form.name.trim().length < 2 ? 'Give the alert a name' : criteriaError(form);
    setError(problem);
    if (!problem) create.mutate();
  };
  return (
    <>
      <Button size="sm" variant="outline" disabled={candidateIds.length > MAX} title={candidateIds.length > MAX ? `Up to ${MAX} candidates at a time` : undefined} onClick={() => setOpen(true)}>
        Create job alert
      </Button>
      {open && (
        <Modal open onClose={() => setOpen(false)} title="Create job alert" subtitle={`For ${candidateIds.length} selected candidate${candidateIds.length === 1 ? '' : 's'}`} size="xl" footer={<Button size="sm" variant="primaryBlue" loading={create.isPending} onClick={submit}>Create alert</Button>}>
          <div className="space-y-5">
            {error && <Alert tone="error">{error}</Alert>}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <TextField label="Alert name" required value={form.name} onChange={set('name')} maxLength={120} placeholder="e.g. Sales jobs in Jaipur" />
              <SelectField label="How often" placeholder={null} options={FREQUENCIES} value={form.frequency} onChange={set('frequency')} />
            </div>
            <AlertCriteriaFields form={form} set={set} setForm={setForm} />
          </div>
        </Modal>
      )}
    </>
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

/** Excel: "Assign Relevant Jobs to the Candidates from Admin Panel". Sends picked active jobs to one alert. */
export const AlertSendJobs = ({ alert, onClose }) => {
  const [q, setQ] = useState(alert.criteria?.jobTitle || alert.criteria?.keySkills?.[0] || '');
  const [picked, setPicked] = useState([]);
  const found = useQuery({ queryKey: ['admin', 'pick-jobs', q], queryFn: () => adminApi.list('/jobs', { q: q || undefined, status: 'active', limit: 20 }) });
  const send = useAction(() => adminApi.post('/job-alerts/send-jobs', { alertIds: [alert._id], jobIds: picked }), { ...inv, success: 'Jobs sent to the job seeker', onSuccess: onClose });
  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= 50 ? p : [...p, id]));
  return (
    <Modal
      open
      onClose={onClose}
      title="Send matching jobs"
      subtitle={alert.name}
      size="lg"
      footer={
        <Button size="sm" variant="primaryBlue" disabled={!picked.length} loading={send.isPending} onClick={() => send.mutate()}>
          Send {picked.length || ''} job{picked.length === 1 ? '' : 's'}
        </Button>
      }
    >
      <div className="space-y-3">
        <TextField label="Search active jobs" value={q} onChange={(e) => setQ(e.target.value)} hint="Pre-filled from the alert. Up to 50 jobs per send" />
        <ul className="max-h-72 divide-y divide-brand-border overflow-y-auto rounded-md border border-brand-border">
          {(found.data?.data || []).map((j) => (
            <li key={j._id} className="px-3 py-2">
              <CheckboxField label={j.title} description={[j.orgSnapshot?.name, (j.locations || []).map((l) => l.city).filter(Boolean).join(', ')].filter(Boolean).join(' · ')} checked={picked.includes(j._id)} onChange={() => toggle(j._id)} />
            </li>
          ))}
          {found.data && !found.data.data?.length && <li className="px-3 py-6 text-center text-sm text-brand-gray">No active job matches this search.</li>}
        </ul>
      </div>
    </Modal>
  );
};

/** Upload field for images stored through the CMS media endpoint. */
/** Image upload into the media library; value is { key, url }. */
export const MediaField = ({ label, value, onChange }) => {
  const upload = useAction((file) => adminApi.upload('/cms/media', { file }), { silent: true, onSuccess: (m) => onChange({ key: m.key, url: m.url }) });
  return (
    <div>
      <p className="mb-1.5 text-sm font-medium text-brand-dark">{label}</p>
      <div className="flex items-center gap-3 rounded-lg border border-dashed border-brand-border p-3">
        <div className="flex h-16 w-24 shrink-0 items-center justify-center overflow-hidden rounded-md bg-brand-tint">
          {value?.url ? <img src={value.url} alt="" className="h-full w-full object-cover" /> : <span className="material-symbols-outlined text-brand-gray-muted">image</span>}
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="cursor-pointer rounded-md border border-brand-border px-3 py-1.5 text-xs font-semibold text-brand-dark hover:border-brand-blue">
            {upload.isPending ? 'Uploading…' : value?.url ? 'Replace' : 'Upload image'}
            <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" aria-label={label} hidden disabled={upload.isPending} onChange={(e) => e.target.files?.[0] && upload.mutate(e.target.files[0])} />
          </label>
          {value?.url && (
            <button type="button" onClick={() => onChange(null)} className="rounded-md px-3 py-1.5 text-xs font-semibold text-brand-red hover:bg-red-50">
              Remove
            </button>
          )}
        </div>
      </div>
      {upload.error && <p className="mt-1 text-xs text-brand-red">{upload.error.message}</p>}
    </div>
  );
};
