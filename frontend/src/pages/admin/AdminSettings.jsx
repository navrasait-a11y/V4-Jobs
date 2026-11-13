import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';
import Button from '../../components/ui/Button';
import { PageHeader } from '../../components/ui/data';
import { Alert, ConfirmDialog, ErrorState, Icon, PageLoader } from '../../components/ui/feedback';
import { TextAreaField, TextField } from '../../components/ui/form';
import { useAction, useDocumentTitle, useUrlFilters } from '../../hooks/useData';
import { adminApi } from '../../services';

/*
 * Every platform setting, written the way an admin thinks about it. `key` is the stored setting;
 * `field` picks one property of a setting that holds several values (payment methods, top-up limits).
 */
const SECTIONS = [
  {
    id: 'general',
    icon: 'tune',
    title: 'General',
    description: 'Support contacts shown to users and account options.',
    items: [
      { key: 'platform.supportEmail', type: 'email', label: 'Support e-mail', help: 'Shown in the help centre and on the maintenance screen.' },
      { key: 'platform.supportPhone', type: 'text', label: 'Support phone', help: 'Shown in the help centre. Leave empty to hide it.', placeholder: '+91 98765 43210' },
      { key: 'platform.profileDeleteEnabled', type: 'toggle', label: 'Let users delete their own account', help: 'Off hides "Delete account" in user settings. Deactivating an account stays available.' },
    ],
  },
  {
    id: 'jobs',
    icon: 'work',
    title: 'Jobs and approvals',
    description: 'What needs your review before it goes live.',
    items: [
      { key: 'platform.employerApprovalRequired', type: 'toggle', label: 'Approve new employers first', help: 'New companies and consultancies stay pending until an admin approves them.' },
      { key: 'platform.jobApprovalRequired', type: 'toggle', label: 'Review jobs before they go live', help: 'Every new job and internship waits in "Admin review".' },
      { key: 'platform.defaultJobExpiryDays', type: 'number', label: 'Job validity', suffix: 'days', min: 1, max: 365, help: 'How long a job stays open when the employer sets no expiry date.' },
      { key: 'platform.googleJobsEnabled', type: 'toggle', label: 'Show jobs on Google Jobs', help: 'Adds Google for Jobs data to job pages. It can also be switched off per job.' },
    ],
  },
  {
    id: 'maintenance',
    icon: 'construction',
    title: 'Maintenance mode',
    description: 'Close the website and app for a while. Admins can still sign in.',
    items: [
      { key: 'platform.maintenanceMode', type: 'toggle', label: 'Site is under maintenance', help: 'Visitors, candidates and employers see a "We\'ll be back shortly" screen and cannot use the site.', confirmOn: 'This closes the website and the app for everyone except admins. Turn it on?' },
      { key: 'platform.maintenanceMessage', type: 'textarea', label: 'Message for visitors', maxLength: 300, help: 'Optional. For example when you expect to be back.', placeholder: 'We are upgrading our servers and will be back by 6 PM.' },
    ],
  },
  {
    id: 'payments',
    icon: 'payments',
    title: 'Payments',
    description: 'Payment methods at checkout, tax and the wallet.',
    items: [
      { key: 'payments.methods', field: 'razorpay', type: 'toggle', label: 'Accept online payments', help: 'Off stops every checkout and wallet top-up. Plans assigned by an admin still work.', confirmOff: 'Users will not be able to buy plans or add money until you switch this back on. Turn it off?' },
      { heading: 'Methods offered in the payment window' },
      { key: 'payments.methods', field: 'upi', type: 'toggle', label: 'UPI', help: 'Google Pay, PhonePe, Paytm UPI, BHIM and other UPI apps.' },
      { key: 'payments.methods', field: 'card', type: 'toggle', label: 'Credit and debit cards' },
      { key: 'payments.methods', field: 'netbanking', type: 'toggle', label: 'Net banking' },
      { key: 'payments.methods', field: 'wallet', type: 'toggle', label: 'Wallets', help: 'Paytm, PhonePe, Mobikwik and other wallets.' },
      { heading: 'Tax' },
      { key: 'payments.gstPercent', type: 'number', label: 'GST on plans', suffix: '%', min: 0, max: 28, step: 0.5, help: 'Used when a plan has no GST rate of its own.' },
      { heading: 'Wallet' },
      { key: 'payments.walletTopup', field: 'enabled', type: 'toggle', label: 'Let users add money to their wallet', help: 'Wallet balance pays for plans and keeps auto-renew running.' },
      { key: 'payments.walletTopup', field: 'min', type: 'number', label: 'Smallest top-up', prefix: '₹', min: 1, max: 1000000 },
      { key: 'payments.walletTopup', field: 'max', type: 'number', label: 'Largest top-up', prefix: '₹', min: 1, max: 1000000 },
      { key: 'referral.rewardAmount', type: 'number', label: 'Referral reward', prefix: '₹', min: 0, max: 100000, help: 'Added to the referrer\'s wallet when the person they referred makes a first purchase. 0 switches it off.' },
    ],
  },
  {
    id: 'ads',
    icon: 'ads_click',
    title: 'Ads',
    description: 'Banners and Google ads across the site. Individual ads are managed under Content > Ads.',
    items: [
      { key: 'ads.enabled', type: 'toggle', label: 'Show ads', help: 'Off hides every ad on the website and in the app.' },
      { key: 'ads.adsenseClientId', type: 'text', label: 'Google AdSense publisher ID', placeholder: 'ca-pub-1234567890123456', help: 'Needed for ads of type "AdSense". Find it in AdSense > Account > Account information.' },
      { key: 'ads.admobAppId', field: 'android', type: 'text', label: 'AdMob app ID (Android)', placeholder: 'ca-app-pub-…~…' },
      { key: 'ads.admobAppId', field: 'ios', type: 'text', label: 'AdMob app ID (iOS)', placeholder: 'ca-app-pub-…~…' },
    ],
  },
  {
    id: 'matching',
    icon: 'auto_awesome',
    title: 'Job matching',
    description: 'How much each factor counts when jobs are recommended to candidates and candidates are ranked for a job.',
    items: [{ key: 'ai.matchWeights', type: 'weights', fields: [['skills', 'Key skills'], ['role', 'Job role'], ['location', 'Location'], ['experience', 'Experience'], ['salary', 'Salary'], ['education', 'Education']] }],
  },
  {
    id: 'integrations',
    icon: 'hub',
    title: 'Integrations',
    description: 'Keys and templates for outside services. Secret values are stored encrypted and shown masked.',
    items: [
      { heading: 'Arattai Messenger' },
      { key: 'integrations.arattai', field: 'enabled', type: 'toggle', label: 'Send messages on Arattai', help: 'Used for bulk messages when the Arattai channel is ticked.' },
      { key: 'integrations.arattai', field: 'apiUrl', type: 'text', label: 'Arattai API address', placeholder: 'https://…' },
      { key: 'integrations.arattai', field: 'apiKey', type: 'secret', label: 'Arattai API key' },
      { heading: 'Google Maps' },
      { key: 'integrations.googleMapsKey', type: 'secret', label: 'Google Maps API key', help: 'Kept for map features. Restrict the key to your domains in Google Cloud.' },
      { heading: 'SMS templates (DLT)', help: 'Change these only when DLT approved different wording or a new template ID. Leave a row empty to use the built-in text.' },
      { key: 'integrations.smsTemplates', type: 'sms' },
    ],
  },
  {
    id: 'app',
    icon: 'smartphone',
    title: 'Mobile app',
    description: 'Older app versions are asked to update before they can continue.',
    items: [
      { key: 'platform.minAppVersion', field: 'android', type: 'text', label: 'Minimum Android version', placeholder: '1.0.0' },
      { key: 'platform.minAppVersion', field: 'ios', type: 'text', label: 'Minimum iOS version', placeholder: '1.0.0' },
    ],
  },
];

const SMS_KEYS = [
  ['otp', 'Login / verification OTP'],
  ['interview', 'Interview scheduled'],
  ['interview_reminder', 'Interview reminder'],
  ['generic', 'General alert'],
  ['bulk', 'Bulk message'],
];

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const read = (values, item) => (item.field ? values[item.key]?.[item.field] : values[item.key]);

const Switch = ({ checked, onChange, label, disabled }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={clsx('relative h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue focus-visible:ring-offset-2 disabled:opacity-50', checked ? 'bg-brand-blue' : 'bg-[#C9D1DC]')}
  >
    <span className={clsx('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all', checked ? 'left-[22px]' : 'left-0.5')} />
  </button>
);

const Row = ({ label, help, error, changed, children, stacked }) => (
  <div className={clsx('border-b border-brand-border py-4 last:border-0', stacked ? 'space-y-2' : 'flex items-start justify-between gap-4')}>
    <div className="min-w-0">
      <p className="flex items-center gap-2 text-sm font-semibold text-brand-dark">
        {label}
        {changed && <span className="h-1.5 w-1.5 rounded-full bg-brand-orange" title="Not saved yet" />}
      </p>
      {help && <p className="mt-0.5 max-w-xl text-[13px] leading-5 text-brand-gray">{help}</p>}
      {error && (
        <p className="mt-1 text-xs font-medium text-brand-red" role="alert">
          {error}
        </p>
      )}
    </div>
    {children}
  </div>
);

const NumberBox = ({ item, value, onChange }) => (
  <div className="flex h-10 w-36 shrink-0 items-center overflow-hidden rounded-lg border border-brand-border bg-white focus-within:border-brand-blue">
    {item.prefix && <span className="pl-3 text-sm text-brand-gray">{item.prefix}</span>}
    <input type="number" inputMode="decimal" aria-label={item.label} min={item.min} max={item.max} step={item.step || 1} value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))} className="h-full w-full min-w-0 bg-transparent px-3 text-sm text-brand-dark outline-none" />
    {item.suffix && <span className="pr-3 text-sm text-brand-gray">{item.suffix}</span>}
  </div>
);

/** Six sliders that always describe 100% together; the total is shown and must be exact to save. */
const Weights = ({ item, value = {}, onChange, error }) => {
  const total = Math.round(item.fields.reduce((sum, [k]) => sum + (Number(value[k]) || 0) * 100, 0));
  return (
    <div className="py-2">
      <div className="space-y-4">
        {item.fields.map(([k, label]) => {
          const pct = Math.round((Number(value[k]) || 0) * 100);
          return (
            <label key={k} className="grid grid-cols-[110px_1fr_48px] items-center gap-3 text-sm sm:grid-cols-[140px_1fr_48px]">
              <span className="font-medium text-brand-dark">{label}</span>
              <input type="range" min="0" max="100" step="5" value={pct} onChange={(e) => onChange({ ...value, [k]: Number(e.target.value) / 100 })} className="w-full accent-[var(--color-brand-blue)]" />
              <span className="text-right font-semibold tabular-nums text-brand-dark">{pct}%</span>
            </label>
          );
        })}
      </div>
      <p className={clsx('mt-4 rounded-lg px-3 py-2 text-sm font-medium', total === 100 ? 'bg-green-50 text-brand-green' : 'bg-red-50 text-brand-red')}>
        Total {total}%{total === 100 ? '' : ` · ${total < 100 ? `add ${100 - total}%` : `remove ${total - 100}%`} to reach 100%`}
      </p>
      {error && <p className="mt-1 text-xs font-medium text-brand-red">{error}</p>}
    </div>
  );
};

const SmsTemplates = ({ value = {}, onChange }) => {
  const set = (k, field, v) => onChange({ ...value, [k]: { ...value[k], [field]: v } });
  return (
    <div className="space-y-4 py-3">
      {SMS_KEYS.map(([k, label]) => (
        <div key={k} className="rounded-lg border border-brand-border p-3">
          <p className="mb-2 text-sm font-semibold text-brand-dark">{label}</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[200px_1fr]">
            <TextField label="DLT template ID" value={value[k]?.templateId || ''} onChange={(e) => set(k, 'templateId', e.target.value)} maxLength={40} />
            <TextField label="Approved text" value={value[k]?.text || ''} onChange={(e) => set(k, 'text', e.target.value)} maxLength={500} placeholder="Leave empty for the built-in text" hint="Write variables as {{otp}}, {{jobTitle}} …" />
          </div>
        </div>
      ))}
    </div>
  );
};

/** Sends one real e-mail / SMS so a wrong key or DLT template shows up straight away. */
const ProviderTests = () => {
  const [to, setTo] = useState('');
  const [mobile, setMobile] = useState('');
  const email = useAction(() => adminApi.post('/settings/test-email', { to }), { success: 'Test e-mail sent. Check the inbox.' });
  const [result, setResult] = useState(null);
  // An OTP test goes the same way as a real login OTP, so it proves sign-in SMS works end to end.
  const sms = useAction(() => adminApi.post('/settings/test-sms', { mobile, template: 'otp' }), {
    silent: true,
    onSuccess: (data) => setResult({ ok: true, text: data?.providerId ? `Accepted by apitxt (request ${data.providerId}). The SMS should arrive within a minute.` : 'Accepted. The SMS should arrive within a minute.' }),
    onError: (e) => setResult({ ok: false, text: e.message }),
  });
  return (
    <div className="surface mt-4 p-5">
      <h3 className="text-sm font-bold text-brand-dark">Test e-mail and SMS delivery</h3>
      <p className="mt-0.5 text-[13px] text-brand-gray">Each test sends one real message through your provider.</p>
      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
        <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (to) email.mutate(); }}>
          <TextField className="flex-1" label="Send a test e-mail to" type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="you@company.com" />
          <Button type="submit" size="sm" variant="outline" className="h-11" disabled={!to} loading={email.isPending}>
            Send
          </Button>
        </form>
        <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (mobile.length === 10) sms.mutate(); }}>
          <TextField className="flex-1" label="Send a test OTP SMS to" inputMode="numeric" value={mobile} onChange={(e) => setMobile(e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="10-digit mobile" />
          <Button type="submit" size="sm" variant="outline" className="h-11" disabled={mobile.length !== 10} loading={sms.isPending}>
            Send
          </Button>
        </form>
      </div>
      {result && (
        <Alert tone={result.ok ? 'success' : 'error'} className="mt-3">
          {result.text}
        </Alert>
      )}
      <p className="mt-3 text-xs text-brand-gray-muted">Login OTPs go through the apitxt Unified OTP API, which needs only the API key. Alerts, interview and bulk SMS need DLT templates and are skipped until those are added.</p>
    </div>
  );
};

const AdminSettings = () => {
  useDocumentTitle('Settings');
  const client = useQueryClient();
  const [filters, setFilters] = useUrlFilters({});
  const active = SECTIONS.find((s) => s.id === filters.section) || SECTIONS[0];
  const query = useQuery({ queryKey: ['admin', 'settings'], queryFn: () => adminApi.get('/settings') });
  const saved = useMemo(() => Object.fromEntries((query.data || []).map((s) => [s.key, s.value])), [query.data]);
  const [values, setValues] = useState({});
  const [errors, setErrors] = useState({});
  const [confirm, setConfirm] = useState(null);
  const [saving, setSaving] = useState(false);
  // Values the server refused stay in the form after the reload, so the admin can correct them.
  const rejected = useRef({});
  useEffect(() => {
    setValues({ ...structuredClone(saved), ...rejected.current });
    rejected.current = {};
  }, [saved]);

  const dirtyKeys = Object.keys(values).filter((k) => !same(values[k], saved[k]));
  const dirtyIn = (section) => section.items.some((it) => it.key && dirtyKeys.includes(it.key));

  // Leaving with unsaved changes would silently drop them.
  useEffect(() => {
    if (!dirtyKeys.length) return undefined;
    const warn = (e) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirtyKeys.length]);

  const write = (item, v) => {
    setErrors((e) => ({ ...e, [item.key]: undefined }));
    setValues((prev) => ({ ...prev, [item.key]: item.field ? { ...prev[item.key], [item.field]: v } : v }));
  };
  const change = (item, v) => {
    const warning = v === true ? item.confirmOn : v === false ? item.confirmOff : null;
    if (warning) setConfirm({ item, value: v, message: warning });
    else write(item, v);
  };

  const save = async () => {
    setSaving(true);
    const failed = {};
    let done = 0;
    for (const key of dirtyKeys) {
      try {
        await adminApi.put(`/settings/${key}`, { value: values[key] });
        done += 1;
      } catch (e) {
        failed[key] = (e.details?.[0]?.message || e.message).replace(/^value /, 'This ');
        rejected.current[key] = values[key];
      }
    }
    setErrors(failed);
    setSaving(false);
    await client.invalidateQueries({ queryKey: ['admin', 'settings'] });
    client.invalidateQueries({ queryKey: ['settings-public'] });
    const bad = Object.keys(failed).length;
    if (bad) toast.error(`${bad} setting${bad === 1 ? '' : 's'} could not be saved. Check the highlighted fields.`);
    else toast.success(`${done} setting${done === 1 ? '' : 's'} saved`);
  };

  if (query.isPending) return <PageLoader />;
  if (query.isError) return <ErrorState error={query.error} onRetry={query.refetch} />;

  const control = (item) => {
    const value = read(values, item);
    const label = item.label;
    if (item.type === 'toggle') return <Switch checked={Boolean(value)} onChange={(v) => change(item, v)} label={label} />;
    if (item.type === 'number') return <NumberBox item={item} value={value} onChange={(v) => change(item, v)} />;
    return null;
  };

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Settings" subtitle="Platform rules, payments, ads and integrations. Changes apply within a minute of saving." />
      {values['platform.maintenanceMode'] && saved['platform.maintenanceMode'] && (
        <Alert tone="warning" className="mb-4">
          Maintenance mode is on. The website and app are closed for everyone except admins.
        </Alert>
      )}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[220px_1fr]">
        <nav aria-label="Settings sections" className="no-scrollbar -mx-1 flex gap-1 overflow-x-auto px-1 lg:mx-0 lg:block lg:space-y-1 lg:px-0">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              aria-current={active.id === s.id ? 'page' : undefined}
              onClick={() => setFilters({ section: s.id })}
              className={clsx('flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors lg:w-full', active.id === s.id ? 'bg-brand-blue-tint text-brand-blue' : 'text-brand-gray hover:bg-brand-tint')}
            >
              <Icon name={s.icon} size={18} /> {s.title}
              {dirtyIn(s) && <span className="ml-auto h-2 w-2 rounded-full bg-brand-orange" title="Unsaved changes" />}
            </button>
          ))}
        </nav>

        <div>
          <section className="surface p-5" aria-labelledby="settings-section">
            <h2 id="settings-section" className="text-lg font-bold text-brand-dark">
              {active.title}
            </h2>
            <p className="mt-0.5 text-sm text-brand-gray">{active.description}</p>
            <div className="mt-2">
              {active.items.map((item, i) => {
                if (item.heading) {
                  return (
                    <div key={`h-${i}`} className="border-b border-brand-border pb-1 pt-5">
                      <p className="text-xs font-bold uppercase tracking-wide text-brand-gray-muted">{item.heading}</p>
                      {item.help && <p className="mt-1 text-[13px] text-brand-gray">{item.help}</p>}
                    </div>
                  );
                }
                const value = read(values, item);
                const changed = !same(value, item.field ? saved[item.key]?.[item.field] : saved[item.key]);
                const error = errors[item.key];
                const id = `${item.key}${item.field ? `.${item.field}` : ''}`;
                if (item.type === 'weights') return <Weights key={id} item={item} value={value} onChange={(v) => change(item, v)} error={error} />;
                if (item.type === 'sms') return <SmsTemplates key={id} value={value} onChange={(v) => change(item, v)} />;
                if (['toggle', 'number'].includes(item.type)) {
                  return (
                    <Row key={id} label={item.label} help={item.help} error={error} changed={changed}>
                      {control(item)}
                    </Row>
                  );
                }
                return (
                  <Row key={id} label={item.label} help={item.help} error={error} changed={changed} stacked>
                    {item.type === 'textarea' ? (
                      <TextAreaField aria-label={item.label} rows={3} maxLength={item.maxLength} value={value ?? ''} onChange={(e) => change(item, e.target.value)} placeholder={item.placeholder} hint={item.maxLength ? `${(value || '').length}/${item.maxLength}` : undefined} />
                    ) : (
                      <TextField
                        aria-label={item.label}
                        className="max-w-md"
                        type={item.type === 'email' ? 'email' : 'text'}
                        autoComplete="off"
                        value={value ?? ''}
                        onChange={(e) => change(item, e.target.value)}
                        onFocus={item.type === 'secret' ? (e) => /^\*{4}/.test(e.target.value) && e.target.select() : undefined}
                        placeholder={item.type === 'secret' ? 'Not set' : item.placeholder}
                        hint={item.type === 'secret' && /^\*{4}/.test(value || '') ? 'Saved. Type a new value to replace it.' : undefined}
                      />
                    )}
                  </Row>
                );
              })}
            </div>
          </section>
          {active.id === 'integrations' && <ProviderTests />}
          {active.id === 'integrations' && (
            <Alert tone="info" className="mt-4">
              Razorpay, e-mail (Brevo), SMS, WhatsApp, Google sign-in and file storage keys are set on the server (environment file), not here, so they never pass through a browser. Their status is on the Platform Health page.
            </Alert>
          )}
        </div>
      </div>

      {dirtyKeys.length > 0 && (
        <div className="sticky bottom-3 z-30 mt-4 rounded-xl border border-brand-blue/30 bg-white px-4 py-3 shadow-[0_12px_32px_-12px_rgba(17,24,39,0.35)]" role="region" aria-label="Unsaved changes">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-medium text-brand-dark">
              {dirtyKeys.length} unsaved change{dirtyKeys.length === 1 ? '' : 's'}
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={saving} onClick={() => { setValues(structuredClone(saved)); setErrors({}); }}>
                Discard
              </Button>
              <Button size="sm" variant="primaryBlue" loading={saving} onClick={save}>
                Save changes
              </Button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        title={confirm?.item.label}
        message={`${confirm?.message || ''} It takes effect when you press Save changes.`}
        danger
        confirmLabel={confirm?.value ? 'Turn on' : 'Turn off'}
        onConfirm={() => {
          write(confirm.item, confirm.value);
          setConfirm(null);
        }}
      />
    </div>
  );
};

export default AdminSettings;
