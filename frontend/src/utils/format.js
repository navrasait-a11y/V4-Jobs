import { format, formatDistanceToNow, isValid } from 'date-fns';

const toDate = (value) => {
  if (!value) return null;
  const d = new Date(value);
  return isValid(d) ? d : null;
};

export const timeAgo = (value) => {
  const d = toDate(value);
  return d ? formatDistanceToNow(d, { addSuffix: true }) : '';
};
export const formatDate = (value, pattern = 'd MMM yyyy') => {
  const d = toDate(value);
  return d ? format(d, pattern) : '—';
};
export const formatDateTime = (value) => formatDate(value, 'd MMM yyyy, h:mm a');
export const toInputDate = (value) => formatDate(value, 'yyyy-MM-dd').replace('—', '');
export const toInputMonth = (value) => formatDate(value, 'yyyy-MM').replace('—', '');
export const toInputDateTime = (value) => formatDate(value, "yyyy-MM-dd'T'HH:mm").replace('—', '');

export const formatNumber = (value) => (value === undefined || value === null ? '—' : Number(value).toLocaleString('en-IN'));
export const formatCurrency = (value) => (value === undefined || value === null ? '—' : `₹${Number(value).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`);

const compactRupee = (n) => {
  if (n >= 100000) return `₹${(n / 100000).toFixed(n % 100000 === 0 ? 0 : 1)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`;
  return `₹${n}`;
};

export function formatSalary(job) {
  const s = job?.salary;
  if (job?.kind === 'internship' && (job?.stipend?.min || job?.stipend?.max)) {
    const { min, max } = job.stipend;
    return `${min ? compactRupee(min) : ''}${min && max ? ' - ' : ''}${max ? compactRupee(max) : ''} /month stipend`;
  }
  if (!s || s.hidden || (!s.min && !s.max)) return 'Not disclosed';
  const unit = s.period === 'yearly' ? 'PA' : 'PM';
  return `${s.min ? compactRupee(s.min) : ''}${s.min && s.max ? ' - ' : ''}${s.max ? compactRupee(s.max) : ''} ${unit}`;
}

export function formatExperience(job) {
  const e = job?.experience;
  if (!e || (!e.min && !e.max)) return job?.kind === 'internship' ? 'Internship' : 'Fresher';
  if (e.max === undefined || e.max === null) return `${e.min}+ Yrs`;
  return `${e.min} - ${e.max} Yrs`;
}

export const formatLocations = (job, max = 2) => {
  const cities = (job?.locations || []).map((l) => l.city).filter(Boolean);
  if (job?.isRemote && !cities.length) return 'Remote';
  if (!cities.length) return 'Location not specified';
  return cities.length > max ? `${cities.slice(0, max).join(', ')} +${cities.length - max}` : cities.join(', ');
};

export const placeLabel = (p) => [p?.locality, p?.city, p?.state].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(', ');

export const monthsToExperience = (months) => {
  if (!months) return 'Fresher';
  const y = Math.floor(months / 12);
  const m = months % 12;
  return [y && `${y} yr${y > 1 ? 's' : ''}`, m && `${m} mo`].filter(Boolean).join(' ');
};

export const initials = (name = '') =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('') || '?';

export const titleCase = (s = '') => String(s).replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export const STAGE_LABELS = {
  applied: 'Applied',
  screened: 'Screened',
  interview_scheduled: 'Interview Scheduled',
  offered: 'Offered',
  hired: 'Hired',
  rejected: 'Not Selected',
  withdrawn: 'Withdrawn',
};

export const SCREENING_LABELS = {
  shortlisted: 'Shortlist',
  maybe_shortlist: 'Maybe Shortlist',
  rejected: 'Reject',
  on_hold: 'On Hold',
  consider_other_role: 'Consider for Other Role',
  not_interested: 'Not Interested',
  future_requirement: 'Add to Future Requirements',
  maybe_relevant: 'Maybe Relevant',
};
export const CALLING_LABELS = { call_done: 'Call Done', not_picked: 'Not Picked', not_reachable: 'Not Reachable', switched_off: 'Switched Off', call_cut: 'Call Cut' };
export const MESSAGING_LABELS = {
  sms_done: 'Text Message Done',
  whatsapp_done: 'WhatsApp Message Done',
  email_done: 'Email Done',
  whatsapp_not_delivered: 'WhatsApp Not Delivered',
  sms_not_delivered: 'Text Message Not Delivered',
  email_not_delivered: 'Email Not Delivered',
};
export const REPORT_REASON_LABELS = {
  spam_misleading: 'Spam or misleading',
  job_not_available: 'The job is no longer available',
  employer_not_available: 'The employer is no longer available',
  not_searching_job: 'Not searching for a job',
  offensive_inappropriate: 'Offensive or inappropriate content',
  asking_money: 'Asking for money on behalf of the job',
  abusive_language: 'Using abusive language',
  wrong_contact_details: 'Wrong contact details mentioned',
  other: 'Other',
};

export const TIMESPAN_OPTIONS = [
  { value: '24h', label: 'Last 24 hours' },
  { value: '7d', label: 'Last 7 days' },
  { value: '14d', label: 'Last 14 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: '120d', label: 'Last 120 days' },
  { value: '6m', label: 'Last 6 months' },
  { value: '9m', label: 'Last 9 months' },
  { value: '12m', label: 'Last 12 months' },
];
