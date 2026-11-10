import React from 'react';
import { clsx } from 'clsx';
import { Icon } from '../ui/feedback';
import { placeLabel } from '../../utils/format';
import { EXPERIENCE_OPTIONS, wordCount } from '../../utils/options';
import { JOB_STEPS } from './JobPostForm';

const optLabel = (opts, v) => {
  const o = opts.find((x) => String(typeof x === 'string' ? x : x.value) === String(v));
  return o ? (typeof o === 'string' ? o : o.label) : v;
};
const list = (a, n = 6) => (a?.length ? `${a.slice(0, n).join(', ')}${a.length > n ? ` +${a.length - n} more` : ''}` : '');
const money = (r) => (r.min || r.max ? `₹${Number(r.min || 0).toLocaleString('en-IN')} – ₹${Number(r.max || r.min).toLocaleString('en-IN')} / month${r.hidden ? ' (hidden)' : ''}` : '');

/** Items that make a post rank and convert better, with the step each one lives on. */
const strengthChecks = (f) => [
  { ok: f.title.trim().length >= 3, label: 'Title', step: 0 },
  { ok: f.keySkills.length >= 3, label: 'At least 3 key skills', step: 0 },
  { ok: f.locations.length > 0, label: 'Location', step: 0 },
  { ok: f.kind === 'internship' ? f.stipend.paid === 'Unpaid' || Boolean(f.stipend.min) : Boolean(f.salary.min), label: f.kind === 'internship' ? 'Stipend' : 'Salary', step: 0 },
  { ok: wordCount(f.description) >= 50, label: 'Description of 50+ words', step: 1 },
  { ok: f.industries.length > 0 || f.departments.length > 0, label: 'Industry or department', step: 1 },
  { ok: f.education.levels.length > 0, label: 'Education', step: 2 },
  { ok: Boolean(f.interviewMode), label: 'Mode of interview', step: 3 },
];

const Row = ({ label, value }) =>
  value ? (
    <div className="grid grid-cols-1 gap-0.5 py-1.5 sm:grid-cols-[180px_1fr] sm:gap-3">
      <dt className="text-xs font-medium text-brand-gray-muted sm:text-sm">{label}</dt>
      <dd className="text-sm text-brand-dark [overflow-wrap:anywhere]">{value}</dd>
    </div>
  ) : null;

/** Read-only summary of the stepped job form, with an Edit link per step and a post-strength meter. */
const JobReview = ({ form: f, onEdit }) => {
  const internship = f.kind === 'internship';
  const checks = strengthChecks(f);
  const score = Math.round((checks.filter((c) => c.ok).length / checks.length) * 100);
  const tone = score >= 85 ? 'bg-brand-green' : score >= 60 ? 'bg-brand-amber' : 'bg-brand-red';
  const exp = f.expMin || f.expMax ? `${optLabel(EXPERIENCE_OPTIONS, f.expMin || 0)} – ${optLabel(EXPERIENCE_OPTIONS, f.expMax || f.expMin)}` : '';
  const groups = [
    [
      ['Type', internship ? 'Internship' : 'Job'],
      ['Title', f.title],
      ['Hiring for', f.consultancyClient?.name && `${f.consultancyClient.name}${f.consultancyClient.hideName ? ' (hidden)' : ''}`],
      ['Key skills', list(f.keySkills, 10)],
      [internship ? 'Internship' : 'Employment type', internship ? [f.internshipType, f.internshipPeriod].filter(Boolean).join(' · ') : f.employmentType],
      [internship ? 'Stipend' : 'Salary', internship ? (f.stipend.paid === 'Unpaid' ? 'Unpaid' : money(f.stipend)) : money(f.salary)],
      ['Experience', [list(f.experienceLevels), exp].filter(Boolean).join(' · ')],
      ['Job mode', f.jobMode],
      ['Locations', f.locations.map(placeLabel).join(' | ')],
      ['Vacancies', f.openings],
      ['Benefits', list(f.perks)],
      ['Last date to apply', f.deadlineAt],
    ],
    [
      ['Description', f.description && `${wordCount(f.description)} words — ${f.description.slice(0, 160)}${f.description.length > 160 ? '…' : ''}`],
      ['Industry', list([...f.industries, ...f.subIndustries])],
      ['Department', list([...f.departments, ...f.functions])],
      ['Roles', list(f.roles)],
      ['Shift', list(f.shifts)],
      ['Notice period', list(f.noticePeriods)],
    ],
    [
      ['Education', list(f.education.levels)],
      ['Degree / course', list(f.education.degrees)],
      ['Certifications', list(f.certifications)],
      ['Gender', list(f.genders)],
      ['Age', f.ageMin || f.ageMax ? `${f.ageMin || 18} – ${f.ageMax || '60+'} yrs` : ''],
      ['English', list(f.englishFluency)],
      ['Languages', list(f.languages)],
      ['Diversity', list(f.diversity)],
    ],
    [
      ['Mode of interview', f.interviewMode],
      ['Walk-in', f.interviewMode === 'Walk-in' && [f.walkIn.startDate, f.walkIn.endDate].filter(Boolean).join(' to ')],
      ['HR contact', [f.contact.name, f.contact.mobile, f.contact.email].filter(Boolean).join(' · ')],
      ['Screening questions', f.questions.length ? `${f.questions.length} question${f.questions.length > 1 ? 's' : ''}` : ''],
      [
        'Response alerts',
        [f.responseAlerts.daily && 'Daily summary', f.responseAlerts.everyResponse && 'Every response', f.responseAlerts.emails.length && `${f.responseAlerts.emails.length} extra e-mail(s)`].filter(Boolean).join(' · '),
      ],
    ],
  ];

  return (
    <div className="space-y-4">
      <div className="surface p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-brand-dark">Post strength</p>
            <p className="text-xs text-brand-gray">Complete posts get more relevant applies and rank higher in search.</p>
          </div>
          <span className="text-2xl font-bold text-brand-dark">{score}%</span>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-brand-tint">
          <div className={clsx('h-full rounded-full transition-[width] duration-500', tone)} style={{ width: `${score}%` }} />
        </div>
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {checks.map((c) => (
            <li key={c.label}>
              <button
                type="button"
                onClick={() => !c.ok && onEdit(c.step)}
                className={clsx(
                  'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium',
                  c.ok ? 'cursor-default bg-brand-green-tint text-brand-green' : 'bg-brand-amber-tint text-[#8A5A00] hover:underline',
                )}
              >
                <Icon name={c.ok ? 'check_circle' : 'add_circle'} size={14} />
                {c.label}
              </button>
            </li>
          ))}
        </ul>
      </div>

      {groups.map((rows, i) => (
        <section key={JOB_STEPS[i].key} className="surface p-4 sm:p-5">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-[15px] font-bold text-brand-dark">{JOB_STEPS[i].title}</h3>
            <button type="button" onClick={() => onEdit(i)} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-brand-blue hover:bg-brand-blue-tint">
              <Icon name="edit" size={14} /> Edit
            </button>
          </div>
          <dl className="divide-y divide-brand-border">
            {rows.map(([l, v]) => (
              <Row key={l} label={l} value={v} />
            ))}
          </dl>
          {!rows.some(([, v]) => v) && <p className="text-sm text-brand-gray-muted">Nothing added yet.</p>}
        </section>
      ))}
    </div>
  );
};

export default JobReview;
