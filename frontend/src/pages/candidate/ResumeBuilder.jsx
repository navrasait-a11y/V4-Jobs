/**
 * Advanced Resume Builder (Naukri.com Standard)
 * - 4 Professional ATS-friendly templates (Modern Executive, Classic Corporate, Minimal ATS, Tech Slate)
 * - Dynamic Theme Customization (6 curated professional palette accents)
 * - Real-Time ATS Readiness Score & Smart Live Recommendations
 * - Step-by-Step Interactive Form Additions:
 *     - Languages: Language Name + Proficiency Dropdown + 1-Click Popular Language Pills + Live Added Cards
 *     - Certifications: Title + Issuing Authority + Year + 1-Click Suggestions + Live Added Cards
 *     - Key Skills: Skill Name + 1-Click Popular Tech Pills + Live Chips
 *     - Achievements: Award Title + Organization/Event + Year + Live Added Cards
 *     - Experiences & Education: Full structured editors with live card summaries
 * - Instant Live Real-Time Preview on every keystroke and item addition
 * - Auto-pre-fill & safe normalization from candidate profile via GET /candidates/me/resume-builder
 * - Reset directly restores candidate's actual platform profile data (never leaves hardcoded sample data)
 * - Bulletproof Save & Persistence via PUT /candidates/me/resume-builder
 * - Clean Print & PDF generation without DOM mutation
 * - 1-Click ATS Plain-Text Export for external job applications
 * - 1-Click Sample Data loader for quick review & freshers
 * - Fully responsive (Desktop 2-pane live preview / Mobile segmented tabs + floating preview)
 */

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { clsx } from 'clsx';
import Button from '../../components/ui/Button';
import { Icon, PageLoader, ErrorState, Modal, ConfirmDialog } from '../../components/ui/feedback';
import { PageHeader, Section, Tabs } from '../../components/ui/data';
import { useAction, useDocumentTitle } from '../../hooks/useData';
import { candidateApi } from '../../services';
import useAuthStore from '../../store/useAuthStore';

// ─────────────────────────────────────────────────────────────────────────────
// SAFE HELPERS & SANITIZATION
// ─────────────────────────────────────────────────────────────────────────────
const uid = () => Math.random().toString(36).slice(2, 9);

export const formatLocation = (loc) => {
  if (!loc) return '';
  if (typeof loc === 'string') return loc;
  if (typeof loc === 'object') {
    return [loc.city, loc.state].filter(Boolean).join(', ') || loc.city || loc.locality || loc.state || loc.country || '';
  }
  return String(loc);
};

export const safeMonth = (d) => {
  if (!d) return '';
  if (typeof d === 'string') {
    if (/^\d{4}-\d{2}$/.test(d)) return d;
    if (/^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 7);
  }
  try {
    const dt = new Date(d);
    if (!isNaN(dt.getTime())) return dt.toISOString().slice(0, 7);
  } catch {
    // fallback
  }
  return '';
};

export const fmtMonth = (d) => {
  if (!d) return '';
  try {
    const str = String(d);
    const dateStr = /^\d{4}-\d{2}$/.test(str) ? `${str}-01` : str;
    const dt = new Date(dateStr);
    if (isNaN(dt.getTime())) return str;
    return dt.toLocaleString('en-IN', { month: 'short', year: 'numeric' });
  } catch {
    return String(d);
  }
};

export const fmtRange = (s, e, cur) => {
  const start = fmtMonth(s);
  const end = cur ? 'Present' : fmtMonth(e);
  if (!start && !end) return '';
  if (start && end) return `${start} – ${end}`;
  return start || end;
};

export const formatLanguage = (lang) => {
  if (!lang) return '';
  if (typeof lang === 'string') return lang;
  if (typeof lang === 'object') {
    const name = lang.name || lang.language || '';
    const prof = lang.proficiency || '';
    if (name && prof) return `${name} (${prof})`;
    return name || prof || '';
  }
  return String(lang);
};

export const formatCertification = (cert) => {
  if (!cert) return '';
  if (typeof cert === 'string') return cert;
  if (typeof cert === 'object') {
    const title = cert.name || cert.title || '';
    const issuer = cert.issuer || cert.organization || '';
    const year = cert.year ? ` - ${cert.year}` : '';
    if (title && issuer) return `${title} (${issuer}${year})`;
    return title || issuer || '';
  }
  return String(cert);
};

export const formatAchievement = (ach) => {
  if (!ach) return '';
  if (typeof ach === 'string') return ach;
  if (typeof ach === 'object') {
    const title = ach.title || ach.name || '';
    const org = ach.issuer || ach.organization || '';
    const year = ach.year ? ` (${ach.year})` : '';
    if (title && org) return `${title} — ${org}${year}`;
    return title || org || '';
  }
  return String(ach);
};

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS & TEMPLATES
// ─────────────────────────────────────────────────────────────────────────────
const BLANK = {
  template: 'modern',
  accent: '#0A6CB5',
  personal: {
    fullName: '',
    headline: '',
    email: '',
    mobile: '',
    location: '',
    website: '',
    linkedin: '',
    github: '',
  },
  summary: '',
  experiences: [],
  educations: [],
  skills: [],
  languages: [],
  certifications: [],
  projects: [],
  achievements: [],
};

const TEMPLATES = [
  { id: 'modern', label: 'Modern Executive', desc: 'Clean header banner, structured timeline, modern badges' },
  { id: 'classic', label: 'Classic Corporate', desc: 'Traditional two-column layout with sidebar and high density' },
  { id: 'minimal', label: 'Minimal ATS-Clean', desc: 'Single-column text focus, optimal for automated ATS screening' },
  { id: 'tech', label: 'Tech & Portfolio', desc: 'Slate-accented, emphasizes projects, repositories and tech stack' },
];

const ACCENT_COLORS = [
  { id: 'naukri-blue', label: 'Naukri Blue', hex: '#0A6CB5' },
  { id: 'corporate-navy', label: 'Corporate Navy', hex: '#1E3A8A' },
  { id: 'emerald', label: 'Emerald Green', hex: '#059669' },
  { id: 'violet', label: 'Royal Violet', hex: '#6D28D9' },
  { id: 'slate', label: 'Slate Charcoal', hex: '#334155' },
  { id: 'crimson', label: 'Crimson Red', hex: '#DC2626' },
];

const POPULAR_SKILLS = [
  'React', 'Node.js', 'JavaScript', 'TypeScript', 'Python', 'Java', 'SQL',
  'MongoDB', 'Docker', 'AWS', 'Git', 'HTML5/CSS3', 'REST APIs', 'System Design',
  'Agile / Scrum', 'Problem Solving', 'Team Leadership', 'UI/UX Design',
];

const POPULAR_LANGUAGES = [
  'English', 'Hindi', 'Bengali', 'Marathi', 'Telugu', 'Tamil',
  'Gujarati', 'Urdu', 'Kannada', 'Malayalam', 'Punjabi', 'German', 'French', 'Spanish',
];

const PROFICIENCY_OPTIONS = [
  { value: 'Native / Mother Tongue', label: 'Native / Mother Tongue', badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { value: 'Fluent / Proficient', label: 'Fluent / Proficient', badgeClass: 'bg-blue-50 text-blue-700 border-blue-200' },
  { value: 'Intermediate / Conversational', label: 'Intermediate / Conversational', badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  { value: 'Basic / Beginner', label: 'Basic / Beginner', badgeClass: 'bg-slate-100 text-slate-700 border-slate-200' },
];

const POPULAR_CERTIFICATIONS = [
  { name: 'AWS Certified Solutions Architect', issuer: 'Amazon Web Services' },
  { name: 'Microsoft Certified: Azure Fundamentals', issuer: 'Microsoft' },
  { name: 'Google Cloud Associate Cloud Engineer', issuer: 'Google' },
  { name: 'Certified ScrumMaster (CSM)', issuer: 'Scrum Alliance' },
  { name: 'Project Management Professional (PMP)', issuer: 'PMI' },
  { name: 'Certified Kubernetes Administrator (CKA)', issuer: 'Cloud Native Computing Foundation' },
  { name: 'Cisco Certified Network Associate (CCNA)', issuer: 'Cisco' },
];

const SAMPLE_RESUME = {
  template: 'modern',
  accent: '#0A6CB5',
  personal: {
    fullName: 'Rahul Sharma',
    headline: 'Senior Full Stack Developer (React & Node.js)',
    email: 'rahul.sharma@example.com',
    mobile: '+91 98765 43210',
    location: 'Bengaluru, Karnataka',
    website: 'https://rahulsharma.dev',
    linkedin: 'https://linkedin.com/in/rahulsharma',
    github: 'https://github.com/rahulsharma',
  },
  summary: 'Results-driven Senior Full Stack Developer with 5+ years of experience designing scalable web architectures, microservices, and modern user interfaces. Proven track record of improving site performance by 40% and mentoring high-velocity engineering teams.',
  experiences: [
    {
      id: 'exp-1',
      jobTitle: 'Senior Software Engineer',
      company: 'Innovatech Solutions',
      location: 'Bengaluru',
      startDate: '2022-04',
      endDate: '',
      current: true,
      description: '• Spearheaded frontend re-architecture using React, Vite, and Tailwind CSS, slashing load times by 45%.\n• Designed and maintained resilient RESTful microservices on Node.js and MongoDB handling 2M+ monthly active requests.\n• Mentored 6 junior and mid-level engineers in clean architecture, unit testing, and CI/CD best practices.',
    },
    {
      id: 'exp-2',
      jobTitle: 'Software Engineer',
      company: 'TechWave Infotech',
      location: 'Pune',
      startDate: '2019-07',
      endDate: '2022-03',
      current: false,
      description: '• Developed end-to-end recruiter dashboards and candidate search portals with Elasticsearch.\n• Reduced database query response times by 35% through indexing optimizations and Redis caching layers.\n• Collaborated with product designers to implement pixel-perfect, accessible UI components.',
    },
  ],
  educations: [
    {
      id: 'edu-1',
      degree: 'B.Tech in Computer Science & Engineering',
      institution: 'National Institute of Technology (NIT)',
      startDate: '2015-08',
      endDate: '2019-05',
      current: false,
      grade: '8.7 CGPA',
      description: 'Focus: Data Structures, Distributed Systems, Database Management.',
    },
  ],
  skills: ['React', 'JavaScript', 'TypeScript', 'Node.js', 'Express', 'MongoDB', 'PostgreSQL', 'Redis', 'Docker', 'AWS', 'Git', 'REST APIs'],
  languages: [
    { id: 'lang-1', name: 'English', proficiency: 'Fluent / Proficient' },
    { id: 'lang-2', name: 'Hindi', proficiency: 'Native / Mother Tongue' },
  ],
  certifications: [
    { id: 'cert-1', name: 'AWS Certified Solutions Architect – Associate', issuer: 'Amazon Web Services', year: '2023' },
    { id: 'cert-2', name: 'MongoDB Certified Developer Associate', issuer: 'MongoDB Inc.', year: '2022' },
  ],
  projects: [
    {
      id: 'proj-1',
      name: 'HirePulse – Real-Time ATS & Recruitment Platform',
      url: 'https://github.com/rahulsharma/hirepulse',
      tech: 'React, Node.js, Socket.IO, Redis, Tailwind CSS',
      description: 'Built a full-featured applicant tracking system with real-time candidate pipeline stages, automated email notifications, and resume parsing.',
    },
    {
      id: 'proj-2',
      name: 'CloudMetrics – Serverless Performance Monitor',
      url: 'https://github.com/rahulsharma/cloudmetrics',
      tech: 'AWS Lambda, DynamoDB, Python, React',
      description: 'Created a lightweight telemetry dashboard for microservices monitoring with sub-second alert triggers.',
    },
  ],
  achievements: [
    { id: 'ach-1', title: 'Innovator of the Year Award', issuer: 'Innovatech Solutions', year: '2023' },
    { id: 'ach-2', title: 'Top 5% Contributor in Global Open Source Hackathon', issuer: 'GitHub Community', year: '2022' },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// PROFILE TO FORM NORMALIZER
// ─────────────────────────────────────────────────────────────────────────────
export const buildFormFromProfile = (d, authUser, authProfile) => {
  if (!d && !authUser) return BLANK;

  const rawPersonal = d?.personal || {};
  const safePersonal = {
    fullName: rawPersonal.fullName || d?.user?.fullName || authUser?.fullName || authUser?.displayName || '',
    headline: rawPersonal.headline || d?.headline || d?.profile?.resumeHeadline || authProfile?.resumeHeadline || '',
    email: rawPersonal.email || d?.user?.email || authUser?.email || '',
    mobile: rawPersonal.mobile || d?.user?.mobile || authUser?.mobile || '',
    location: formatLocation(rawPersonal.location || d?.profile?.currentLocation || authProfile?.currentLocation),
    website: rawPersonal.website || '',
    linkedin: rawPersonal.linkedin || '',
    github: rawPersonal.github || '',
  };

  const safeExp = (d?.experiences || d?.employments || authProfile?.employments || []).map((e) => ({
    id: e.id || e._id || uid(),
    jobTitle: e.jobTitle || '',
    company: e.employerName || e.company || '',
    location: formatLocation(e.location),
    startDate: safeMonth(e.startDate),
    endDate: safeMonth(e.endDate),
    current: Boolean(e.isCurrent || e.current),
    description: e.description || '',
  }));

  const safeEdu = (d?.educations || authProfile?.educations || []).map((e) => ({
    id: e.id || e._id || uid(),
    degree: e.degree || e.level || '',
    institution: e.institution || '',
    startDate: safeMonth(e.startDate),
    endDate: safeMonth(e.endDate),
    current: Boolean(e.isCurrentlyPursuing || e.current || e.status === 'Pursuing'),
    grade: e.marks || e.grade || '',
    description: e.description || '',
  }));

  const safeProj = (d?.projects || d?.portfolios || authProfile?.portfolios || []).map((pr) => ({
    id: pr.id || pr._id || uid(),
    name: pr.name || '',
    description: pr.description || '',
    url: pr.url || '',
    tech: pr.tech || '',
  }));

  // Normalize languages
  const rawLang = d?.languages || d?.profile?.languages || authProfile?.languages || [];
  const safeLanguages = rawLang.map((l) => {
    if (typeof l === 'object' && l !== null) {
      return {
        id: l.id || uid(),
        name: l.name || l.language || '',
        proficiency: l.proficiency || 'Fluent / Proficient',
      };
    }
    const match = String(l).match(/^([^(]+)(?:\(([^)]+)\))?/);
    return {
      id: uid(),
      name: match ? match[1].trim() : String(l).trim(),
      proficiency: match && match[2] ? match[2].trim() : 'Fluent / Proficient',
    };
  });

  // Normalize certifications
  const rawCert = d?.certifications || d?.profile?.certifications || authProfile?.certifications || [];
  const safeCertifications = rawCert.map((c) => {
    if (typeof c === 'object' && c !== null) {
      return {
        id: c.id || uid(),
        name: c.name || c.title || '',
        issuer: c.issuer || c.organization || '',
        year: c.year || '',
      };
    }
    return { id: uid(), name: String(c).trim(), issuer: '', year: '' };
  });

  // Normalize achievements
  const rawAch = d?.achievements || [];
  const safeAchievements = rawAch.map((a) => {
    if (typeof a === 'object' && a !== null) {
      return {
        id: a.id || uid(),
        title: a.title || a.name || '',
        issuer: a.issuer || a.organization || '',
        year: a.year || '',
      };
    }
    return { id: uid(), title: String(a).trim(), issuer: '', year: '' };
  });

  const allSkills = Array.from(
    new Set([
      ...(d?.skills || []),
      ...(d?.profile?.keySkills || []),
      ...(d?.itSkills || []),
      ...(authProfile?.keySkills || []),
      ...(authProfile?.itSkills || []),
    ]),
  ).filter(Boolean);

  return {
    ...BLANK,
    template: d?.template || 'modern',
    accent: d?.accent || '#0A6CB5',
    personal: safePersonal,
    summary: d?.summary || d?.profile?.profileSummary || authProfile?.profileSummary || '',
    experiences: safeExp,
    educations: safeEdu,
    skills: allSkills,
    languages: safeLanguages,
    certifications: safeCertifications,
    projects: safeProj,
    achievements: safeAchievements,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// ATS READINESS SCORER
// ─────────────────────────────────────────────────────────────────────────────
function calculateAtsScore(data) {
  if (!data) return { score: 0, tips: [] };
  let score = 0;
  const tips = [];

  const p = data.personal || {};
  if (p.fullName && (p.email || p.mobile)) score += 20;
  else tips.push('Add full name, email, and phone number.');

  if (p.headline && data.summary && data.summary.trim().length >= 40) score += 20;
  else if (!p.headline) tips.push('Add a professional headline (e.g. Senior Full Stack Developer).');
  else tips.push('Write a professional summary (at least 40 characters) highlighting your value.');

  if (Array.isArray(data.experiences) && data.experiences.length > 0) {
    score += 25;
    const hasDesc = data.experiences.some((e) => e.description && e.description.trim().length > 20);
    if (!hasDesc) tips.push('Add bullet points describing your achievements in work experience.');
  } else {
    tips.push('Add at least one work experience or internship.');
  }

  if (Array.isArray(data.educations) && data.educations.length > 0) score += 15;
  else tips.push('Add your highest degree and institution.');

  if (Array.isArray(data.skills) && data.skills.length >= 4) score += 15;
  else tips.push('Add at least 4 key skills to improve recruiter discoverability.');

  if (
    (Array.isArray(data.projects) && data.projects.length > 0) ||
    (Array.isArray(data.certifications) && data.certifications.length > 0)
  ) {
    score += 5;
  }

  return { score: Math.min(100, score), tips };
}

// ─────────────────────────────────────────────────────────────────────────────
// PLAIN TEXT GENERATOR (FOR ATS PASTE)
// ─────────────────────────────────────────────────────────────────────────────
function generatePlainText(data) {
  if (!data) return '';
  const p = data.personal || {};
  const lines = [];

  lines.push((p.fullName || 'RESUME').toUpperCase());
  if (p.headline) lines.push(p.headline);
  lines.push([p.email, p.mobile, formatLocation(p.location), p.linkedin, p.github, p.website].filter(Boolean).join(' | '));
  lines.push('\n' + '='.repeat(50));

  if (data.summary) {
    lines.push('\nPROFESSIONAL SUMMARY');
    lines.push('-'.repeat(30));
    lines.push(data.summary);
  }

  if (data.skills?.length) {
    lines.push('\nKEY SKILLS');
    lines.push('-'.repeat(30));
    lines.push(data.skills.join(', '));
  }

  if (data.experiences?.length) {
    lines.push('\nWORK EXPERIENCE');
    lines.push('-'.repeat(30));
    data.experiences.forEach((e) => {
      lines.push(`${e.jobTitle || 'Job Title'} at ${e.company || 'Company'}${e.location ? ' (' + formatLocation(e.location) + ')' : ''}`);
      lines.push(fmtRange(e.startDate, e.endDate, e.current));
      if (e.description) lines.push(e.description);
      lines.push('');
    });
  }

  if (data.educations?.length) {
    lines.push('EDUCATION');
    lines.push('-'.repeat(30));
    data.educations.forEach((ed) => {
      lines.push(`${ed.degree || 'Degree'} - ${ed.institution || 'Institution'}`);
      lines.push(fmtRange(ed.startDate, ed.endDate, ed.current) + (ed.grade ? ` | Grade: ${ed.grade}` : ''));
      if (ed.description) lines.push(ed.description);
      lines.push('');
    });
  }

  if (data.projects?.length) {
    lines.push('PROJECTS');
    lines.push('-'.repeat(30));
    data.projects.forEach((pr) => {
      lines.push(`${pr.name}${pr.url ? ' (' + pr.url + ')' : ''}`);
      if (pr.tech) lines.push(`Tech Stack: ${pr.tech}`);
      if (pr.description) lines.push(pr.description);
      lines.push('');
    });
  }

  if (data.certifications?.length) {
    lines.push('CERTIFICATIONS');
    lines.push('-'.repeat(30));
    data.certifications.forEach((c) => lines.push(`• ${formatCertification(c)}`));
  }

  if (data.languages?.length) {
    lines.push('\nLANGUAGES');
    lines.push('-'.repeat(30));
    lines.push(data.languages.map(formatLanguage).join(' · '));
  }

  if (data.achievements?.length) {
    lines.push('\nACHIEVEMENTS');
    lines.push('-'.repeat(30));
    data.achievements.forEach((a) => lines.push(`• ${formatAchievement(a)}`));
  }

  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// BASE INPUT COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────
const TF = ({ label, value, onChange, placeholder, type = 'text', multiline, rows = 3, required, hint }) => {
  const id = useId();
  return (
    <div>
      {label && (
        <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-brand-dark">
          {label}
          {required && <span className="text-brand-red"> *</span>}
        </label>
      )}
      {multiline ? (
        <textarea
          id={id}
          rows={rows}
          value={typeof value === 'string' ? value : ''}
          onChange={onChange}
          placeholder={placeholder}
          className="field-control w-full resize-y rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-brand-dark placeholder:text-slate-400 focus:border-brand-blue focus:ring-2 focus:ring-blue-100 outline-none transition"
        />
      ) : (
        <input
          id={id}
          type={type}
          value={typeof value === 'string' ? value : ''}
          onChange={onChange}
          placeholder={placeholder}
          required={required}
          className="field-control h-10 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-brand-dark placeholder:text-slate-400 focus:border-brand-blue focus:ring-2 focus:ring-blue-100 outline-none transition"
        />
      )}
      {hint && <p className="mt-1 text-xs text-brand-gray-muted">{hint}</p>}
    </div>
  );
};

const Grid2 = ({ children }) => <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">{children}</div>;

// ─────────────────────────────────────────────────────────────────────────────
// HIGH-IMPACT INTERACTIVE SECTION EDITORS
// ─────────────────────────────────────────────────────────────────────────────

// ── 1. Languages Editor (Interactive Step-by-Step with Beautiful UI) ──────────
const LanguageEditor = ({ items = [], onChange }) => {
  const [langName, setLangName] = useState('');
  const [proficiency, setProficiency] = useState('Fluent / Proficient');
  const [editingId, setEditingId] = useState(null);
  const inputRef = useRef(null);

  const list = useMemo(() => {
    return (Array.isArray(items) ? items : []).map((it) => {
      if (typeof it === 'object' && it !== null) {
        return {
          id: it.id || uid(),
          name: it.name || it.language || '',
          proficiency: it.proficiency || 'Fluent / Proficient',
        };
      }
      const match = String(it).match(/^([^(]+)(?:\(([^)]+)\))?/);
      return {
        id: uid(),
        name: match ? match[1].trim() : String(it).trim(),
        proficiency: match && match[2] ? match[2].trim() : 'Fluent / Proficient',
      };
    });
  }, [items]);

  const handleSelectSuggestion = (lang) => {
    setLangName(lang);
    inputRef.current?.focus();
  };

  const handleAdd = () => {
    const targetName = langName.trim();
    if (!targetName) return;

    if (editingId) {
      const updated = list.map((x) =>
        x.id === editingId ? { ...x, name: targetName, proficiency } : x,
      );
      onChange(updated);
      setEditingId(null);
      setLangName('');
      return;
    }

    const exists = list.some((x) => x.name.toLowerCase() === targetName.toLowerCase());
    if (exists) {
      setLangName('');
      return;
    }

    const updated = [
      ...list,
      { id: uid(), name: targetName, proficiency },
    ];
    onChange(updated);
    setLangName('');
  };

  const handleEdit = (item) => {
    setEditingId(item.id);
    setLangName(item.name);
    setProficiency(item.proficiency || 'Fluent / Proficient');
    inputRef.current?.focus();
  };

  const handleRemove = (id) => {
    if (editingId === id) {
      setEditingId(null);
      setLangName('');
    }
    onChange(list.filter((x) => x.id !== id));
  };

  const getToneBadge = (prof) => {
    const match = PROFICIENCY_OPTIONS.find((p) => p.value === prof);
    return match ? match.badgeClass : 'bg-slate-100 text-slate-700 border-slate-200';
  };

  return (
    <div className="space-y-5">
      {/* Input Card */}
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-b from-slate-50/80 to-white p-4 sm:p-5 shadow-xs">
        <div className="flex items-center gap-2.5 pb-3.5 border-b border-slate-200/80">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-brand-blue shadow-2xs">
            <Icon name="translate" size={20} />
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-900">
              {editingId ? 'Edit Language' : 'Add Language Known'}
            </h4>
            <p className="text-xs text-slate-500">
              {editingId ? 'Modify language details and save' : 'Select a suggestion or type custom language, adjust proficiency, then click Add'}
            </p>
          </div>
        </div>

        <div className="mt-4 space-y-3.5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-700">
                Language Name <span className="text-brand-red">*</span>
              </label>
              <input
                ref={inputRef}
                type="text"
                value={langName}
                onChange={(e) => setLangName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAdd();
                  }
                }}
                placeholder="e.g. English, Hindi, German"
                className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-blue focus:ring-2 focus:ring-blue-100 outline-none transition"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-700">
                Proficiency Level
              </label>
              <select
                value={proficiency}
                onChange={(e) => setProficiency(e.target.value)}
                className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-brand-blue focus:ring-2 focus:ring-blue-100 outline-none transition"
              >
                {PROFICIENCY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <p className="text-xs text-slate-500">
              {langName.trim() ? (
                <span className="text-brand-blue font-medium">Ready: Click button or press Enter to add</span>
              ) : (
                'Select a suggestion below or type a language'
              )}
            </p>
            <div className="flex items-center gap-2">
              {(langName.trim() || editingId) && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 px-3 text-slate-600 hover:text-brand-red hover:border-red-300 hover:bg-red-50"
                  onClick={() => {
                    setLangName('');
                    setEditingId(null);
                    setProficiency('Fluent / Proficient');
                  }}
                >
                  <Icon name="close" size={15} /> Clear
                </Button>
              )}
              <Button
                type="button"
                variant="primaryBlue"
                size="sm"
                className="h-9 px-4 font-semibold shadow-xs"
                onClick={handleAdd}
                disabled={!langName.trim()}
              >
                <Icon name={editingId ? 'check' : 'add'} size={16} />
                {editingId ? 'Update Language' : 'Add Language'}
              </Button>
            </div>
          </div>
        </div>

        {/* Suggested Languages */}
        <div className="mt-4 pt-3.5 border-t border-slate-200/80">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Suggested Languages (Click to load into form)
            </p>
            <span className="text-[10px] text-slate-400">Click to fill fields, edit as needed, then click Add</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {POPULAR_LANGUAGES.map((lang) => {
              const alreadyAdded = list.some((x) => x.name.toLowerCase() === lang.toLowerCase());
              const isSelected = langName.trim().toLowerCase() === lang.toLowerCase();
              return (
                <button
                  key={lang}
                  type="button"
                  disabled={alreadyAdded}
                  onClick={() => handleSelectSuggestion(lang)}
                  title={alreadyAdded ? `${lang} already added` : `Click to fill "${lang}" in the form`}
                  className={clsx(
                    'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition cursor-pointer',
                    alreadyAdded
                      ? 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed'
                      : isSelected
                      ? 'border-brand-blue bg-blue-50 text-brand-blue ring-2 ring-brand-blue/30 shadow-xs font-bold'
                      : 'border-slate-300 bg-white text-slate-700 hover:border-brand-blue hover:bg-blue-50 hover:text-brand-blue shadow-2xs',
                  )}
                >
                  <Icon
                    name={alreadyAdded ? 'check' : isSelected ? 'edit' : 'touch_app'}
                    size={13}
                    className={alreadyAdded ? 'text-emerald-600' : isSelected ? 'text-brand-blue' : 'text-slate-400'}
                  />
                  {lang}
                  {isSelected && <span className="text-[10px] uppercase font-bold text-brand-blue">• In Form</span>}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Added List */}
      <div>
        <div className="flex items-center justify-between mb-2.5">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
            Added Languages ({list.length})
          </h4>
          <span className="text-xs text-slate-500">Updates live in preview</span>
        </div>

        {list.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center bg-white">
            <Icon name="translate" size={28} className="mx-auto text-slate-400 mb-2" />
            <p className="text-sm font-semibold text-slate-700">No languages added yet</p>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              Click any suggested pill above to populate the form, adjust proficiency, and add to your resume.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2.5">
            {list.map((item) => (
              <div
                key={item.id}
                className={clsx(
                  'flex items-center justify-between rounded-xl border bg-white p-3.5 shadow-2xs transition',
                  editingId === item.id ? 'border-brand-blue ring-2 ring-brand-blue/20 bg-blue-50/30' : 'border-slate-200 hover:border-brand-blue/50',
                )}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-brand-blue">
                    <Icon name="translate" size={18} />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-900">{item.name}</p>
                    <span className={clsx('inline-block rounded-md border px-2 py-0.5 text-[10px] font-bold mt-0.5', getToneBadge(item.proficiency))}>
                      {item.proficiency}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleEdit(item)}
                    className="rounded-lg p-2 text-slate-400 transition hover:bg-blue-50 hover:text-brand-blue cursor-pointer"
                    title={`Edit ${item.name}`}
                  >
                    <Icon name="edit" size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemove(item.id)}
                    className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600 cursor-pointer"
                    title={`Remove ${item.name}`}
                  >
                    <Icon name="delete" size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ── 2. Certifications Editor (Step-by-Step with Beautiful UI) ────────────────
const CertificationEditor = ({ items = [], onChange }) => {
  const [name, setName] = useState('');
  const [issuer, setIssuer] = useState('');
  const [year, setYear] = useState('');
  const [editingId, setEditingId] = useState(null);
  const nameInputRef = useRef(null);

  const list = useMemo(() => {
    return (Array.isArray(items) ? items : []).map((it) => {
      if (typeof it === 'object' && it !== null) {
        return {
          id: it.id || uid(),
          name: it.name || it.title || '',
          issuer: it.issuer || it.organization || '',
          year: it.year || '',
        };
      }
      return { id: uid(), name: String(it), issuer: '', year: '' };
    });
  }, [items]);

  const handleSelectSuggestion = (cert) => {
    setName(cert.name);
    setIssuer(cert.issuer || '');
    if (!year) {
      setYear(new Date().getFullYear().toString());
    }
    nameInputRef.current?.focus();
  };

  const handleAdd = () => {
    const certName = name.trim();
    if (!certName) return;
    const certIssuer = issuer.trim();
    const certYear = year.trim();

    if (editingId) {
      const updated = list.map((x) =>
        x.id === editingId ? { ...x, name: certName, issuer: certIssuer, year: certYear } : x,
      );
      onChange(updated);
      setEditingId(null);
      setName('');
      setIssuer('');
      setYear('');
      return;
    }

    const exists = list.some((x) => x.name.toLowerCase() === certName.toLowerCase());
    if (exists) {
      setName('');
      setIssuer('');
      setYear('');
      return;
    }

    const updated = [
      ...list,
      { id: uid(), name: certName, issuer: certIssuer, year: certYear },
    ];
    onChange(updated);
    setName('');
    setIssuer('');
    setYear('');
  };

  const handleEdit = (item) => {
    setEditingId(item.id);
    setName(item.name);
    setIssuer(item.issuer || '');
    setYear(item.year || '');
    nameInputRef.current?.focus();
  };

  const handleRemove = (id) => {
    if (editingId === id) {
      setEditingId(null);
      setName('');
      setIssuer('');
      setYear('');
    }
    onChange(list.filter((x) => x.id !== id));
  };

  return (
    <div className="space-y-5">
      {/* Input Card */}
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-b from-slate-50/80 to-white p-4 sm:p-5 shadow-xs">
        <div className="flex items-center gap-2.5 pb-3.5 border-b border-slate-200/80">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 shadow-2xs">
            <Icon name="verified" size={20} />
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-900">
              {editingId ? 'Edit Certification' : 'Add Certification / Course'}
            </h4>
            <p className="text-xs text-slate-500">
              {editingId ? 'Modify credential details and save' : 'Click a suggestion to pre-fill the form, edit details, then click Add Certification'}
            </p>
          </div>
        </div>

        <div className="mt-4 space-y-3.5">
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-700">
              Certificate / License Title <span className="text-brand-red">*</span>
            </label>
            <input
              ref={nameInputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAdd();
                }
              }}
              placeholder="e.g. AWS Certified Solutions Architect, PMP, Scrum Master"
              className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-blue focus:ring-2 focus:ring-blue-100 outline-none transition"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-700">
                Issuing Organization
              </label>
              <input
                type="text"
                value={issuer}
                onChange={(e) => setIssuer(e.target.value)}
                placeholder="e.g. Amazon Web Services, Google, Coursera"
                className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-blue focus:ring-2 focus:ring-blue-100 outline-none transition"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-700">
                Year Issued / Validity
              </label>
              <input
                type="text"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                placeholder="e.g. 2024 or 2023 - 2026"
                className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-blue focus:ring-2 focus:ring-blue-100 outline-none transition"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <p className="text-xs text-slate-500">
              {name.trim() ? (
                <span className="text-brand-blue font-medium">Ready: You can edit fields above and click Add</span>
              ) : (
                'Select a suggestion below or type your certificate'
              )}
            </p>
            <div className="flex items-center gap-2">
              {(name || issuer || year || editingId) && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 px-3 text-slate-600 hover:text-brand-red hover:border-red-300 hover:bg-red-50"
                  onClick={() => {
                    setName('');
                    setIssuer('');
                    setYear('');
                    setEditingId(null);
                  }}
                >
                  <Icon name="close" size={15} /> Clear
                </Button>
              )}
              <Button
                type="button"
                variant="primaryBlue"
                size="sm"
                className="h-9 px-4 font-semibold shadow-xs"
                onClick={handleAdd}
                disabled={!name.trim()}
              >
                <Icon name={editingId ? 'check' : 'add'} size={16} />
                {editingId ? 'Update Certification' : 'Add Certification'}
              </Button>
            </div>
          </div>
        </div>

        {/* Popular Certifications */}
        <div className="mt-4 pt-3.5 border-t border-slate-200/80">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Suggested Popular Certifications (Click to load into form)
            </p>
            <span className="text-[10px] text-slate-400">Click to fill fields, edit as needed, then click Add</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {POPULAR_CERTIFICATIONS.map((cert) => {
              const alreadyAdded = list.some((x) => x.name.toLowerCase() === cert.name.toLowerCase());
              const isSelected = name.trim().toLowerCase() === cert.name.toLowerCase();
              return (
                <button
                  key={cert.name}
                  type="button"
                  disabled={alreadyAdded}
                  onClick={() => handleSelectSuggestion(cert)}
                  title={alreadyAdded ? `${cert.name} already added` : `Click to fill "${cert.name}" in the form`}
                  className={clsx(
                    'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition cursor-pointer',
                    alreadyAdded
                      ? 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed'
                      : isSelected
                      ? 'border-brand-blue bg-blue-50 text-brand-blue ring-2 ring-brand-blue/30 shadow-xs font-bold'
                      : 'border-slate-300 bg-white text-slate-700 hover:border-brand-blue hover:bg-blue-50 hover:text-brand-blue shadow-2xs',
                  )}
                >
                  <Icon
                    name={alreadyAdded ? 'check' : isSelected ? 'edit' : 'touch_app'}
                    size={13}
                    className={alreadyAdded ? 'text-emerald-600' : isSelected ? 'text-brand-blue' : 'text-slate-400'}
                  />
                  {cert.name}
                  {isSelected && <span className="text-[10px] uppercase font-bold text-brand-blue">• In Form</span>}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Added List */}
      <div>
        <div className="flex items-center justify-between mb-2.5">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
            Certifications Added ({list.length})
          </h4>
          <span className="text-xs text-slate-500">Updates live in preview</span>
        </div>

        {list.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center bg-white">
            <Icon name="verified" size={28} className="mx-auto text-slate-400 mb-2" />
            <p className="text-sm font-semibold text-slate-700">No certifications added yet</p>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              Click any suggested certificate above to populate title and issuer, enter your completion year, and add it.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {list.map((item) => (
              <div
                key={item.id}
                className={clsx(
                  'flex items-center justify-between rounded-xl border bg-white p-3.5 shadow-2xs transition',
                  editingId === item.id ? 'border-brand-blue ring-2 ring-brand-blue/20 bg-blue-50/30' : 'border-slate-200 hover:border-brand-blue/50',
                )}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                    <Icon name="verified" size={18} />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-900">{item.name}</p>
                    <p className="text-xs text-slate-500">
                      {item.issuer || 'Issuing Authority'} {item.year ? `· ${item.year}` : ''}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleEdit(item)}
                    className="rounded-lg p-2 text-slate-400 transition hover:bg-blue-50 hover:text-brand-blue cursor-pointer"
                    title={`Edit ${item.name}`}
                  >
                    <Icon name="edit" size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemove(item.id)}
                    className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600 cursor-pointer"
                    title="Remove certification"
                  >
                    <Icon name="delete" size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ── 3. Skills Editor (Interactive Add + 1-Click Pills) ────────────────────────
const SkillEditor = ({ items = [], onChange }) => {
  const [skillText, setSkillText] = useState('');
  const safeList = Array.isArray(items) ? items : [];

  const handleAdd = (raw) => {
    const trimmed = (raw || skillText).trim();
    if (!trimmed) return;
    if (safeList.some((v) => v.toLowerCase() === trimmed.toLowerCase())) {
      setSkillText('');
      return;
    }
    onChange([...safeList, trimmed]);
    setSkillText('');
  };

  const handleRemove = (idx) => {
    onChange(safeList.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-5">
      {/* Input Row */}
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-b from-slate-50/80 to-white p-4 sm:p-5 shadow-xs space-y-3.5">
        <div className="flex items-center gap-2.5 pb-3.5 border-b border-slate-200/80">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-brand-blue shadow-2xs">
            <Icon name="psychology" size={20} />
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-900">Add Technical & Soft Skills</h4>
            <p className="text-xs text-slate-500">Type a skill or click popular tags below to add</p>
          </div>
        </div>

        <div className="flex gap-2.5">
          <input
            type="text"
            value={skillText}
            onChange={(e) => setSkillText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                handleAdd();
              }
            }}
            placeholder="Type skill (e.g. React, Node.js, Python, SQL) and press Enter"
            className="h-10 flex-1 rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-blue focus:ring-2 focus:ring-blue-100 outline-none transition"
          />
          <Button
            type="button"
            variant="primaryBlue"
            size="md"
            className="h-10 font-semibold px-5 shadow-xs"
            onClick={() => handleAdd()}
            disabled={!skillText.trim()}
          >
            <Icon name="add" size={18} /> Add Skill
          </Button>
        </div>

        {/* Popular Skills Pills */}
        <div className="pt-2 border-t border-slate-200/80">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Suggested Popular Skills (Click to Add)
          </p>
          <div className="flex flex-wrap gap-1.5">
            {POPULAR_SKILLS.map((s) => {
              const alreadyAdded = safeList.some((v) => v.toLowerCase() === s.toLowerCase());
              return (
                <button
                  key={s}
                  type="button"
                  disabled={alreadyAdded}
                  onClick={() => handleAdd(s)}
                  className={clsx(
                    'inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium transition cursor-pointer',
                    alreadyAdded
                      ? 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed'
                      : 'border-slate-300 bg-white text-slate-700 hover:border-brand-blue hover:bg-blue-50 hover:text-brand-blue shadow-2xs',
                  )}
                >
                  <Icon name={alreadyAdded ? 'check' : 'add'} size={12} className={alreadyAdded ? 'text-emerald-600' : 'text-slate-400'} />
                  {s}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Added Skills Tags */}
      <div>
        <div className="flex items-center justify-between mb-2.5">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
            Skills on Resume ({safeList.length})
          </h4>
          <span className="text-xs text-slate-500">Live preview reflects these instantly</span>
        </div>

        {safeList.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center bg-white">
            <Icon name="psychology" size={28} className="mx-auto text-slate-400 mb-2" />
            <p className="text-sm font-semibold text-slate-700">No skills added yet</p>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              Add at least 4 key skills to improve your recruiter visibility and ATS matching score.
            </p>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
            {safeList.map((skill, idx) => (
              <span
                key={idx}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 border border-blue-200/60 px-3 py-1.5 text-xs font-semibold text-brand-blue shadow-2xs"
              >
                {skill}
                <button
                  type="button"
                  onClick={() => handleRemove(idx)}
                  className="rounded p-0.5 text-blue-400 hover:bg-blue-100 hover:text-brand-red transition cursor-pointer"
                  title={`Remove ${skill}`}
                >
                  <Icon name="close" size={13} />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ── 4. Achievements Editor ───────────────────────────────────────────────────
const AchievementEditor = ({ items = [], onChange }) => {
  const [title, setTitle] = useState('');
  const [issuer, setIssuer] = useState('');
  const [year, setYear] = useState('');

  const list = useMemo(() => {
    return (Array.isArray(items) ? items : []).map((it) => {
      if (typeof it === 'object' && it !== null) {
        return {
          id: it.id || uid(),
          title: it.title || it.name || '',
          issuer: it.issuer || it.organization || '',
          year: it.year || '',
        };
      }
      return { id: uid(), title: String(it), issuer: '', year: '' };
    });
  }, [items]);

  const handleAdd = () => {
    const trimmed = title.trim();
    if (!trimmed) return;

    const updated = [
      ...list,
      { id: uid(), title: trimmed, issuer: issuer.trim(), year: year.trim() },
    ];
    onChange(updated);
    setTitle('');
    setIssuer('');
    setYear('');
  };

  const handleRemove = (id) => {
    onChange(list.filter((x) => x.id !== id));
  };

  return (
    <div className="space-y-5">
      {/* Input Card */}
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-b from-slate-50/80 to-white p-4 sm:p-5 shadow-xs">
        <div className="flex items-center gap-2.5 pb-3.5 border-b border-slate-200/80">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-600 shadow-2xs">
            <Icon name="emoji_events" size={20} />
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-900">Add Key Achievement or Award</h4>
            <p className="text-xs text-slate-500">Honors, competitions, patents, and top-performer awards</p>
          </div>
        </div>

        <div className="mt-4 space-y-3.5">
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-700">
              Achievement / Award Title <span className="text-brand-red">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAdd();
                }
              }}
              placeholder="e.g. Employee of the Year 2023, 1st Place at National Hackathon"
              className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-blue focus:ring-2 focus:ring-blue-100 outline-none transition"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-700">
                Event / Organization / Issuer
              </label>
              <input
                type="text"
                value={issuer}
                onChange={(e) => setIssuer(e.target.value)}
                placeholder="e.g. TechCorp Solutions, Ministry of Education"
                className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-blue focus:ring-2 focus:ring-blue-100 outline-none transition"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-700">
                Year
              </label>
              <input
                type="text"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                placeholder="e.g. 2023"
                className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-blue focus:ring-2 focus:ring-blue-100 outline-none transition"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            {(title || issuer || year) && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 px-3 text-slate-600 hover:text-brand-red hover:border-red-300 hover:bg-red-50"
                onClick={() => {
                  setTitle('');
                  setIssuer('');
                  setYear('');
                }}
              >
                <Icon name="close" size={15} /> Clear
              </Button>
            )}
            <Button
              type="button"
              variant="primaryBlue"
              size="sm"
              className="h-9 px-4 font-semibold shadow-xs"
              onClick={handleAdd}
              disabled={!title.trim()}
            >
              <Icon name="add" size={16} /> Add Achievement
            </Button>
          </div>
        </div>
      </div>

      {/* Added List */}
      <div>
        <div className="flex items-center justify-between mb-2.5">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
            Key Achievements ({list.length})
          </h4>
          <span className="text-xs text-slate-500">Updates live in preview</span>
        </div>

        {list.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center bg-white">
            <Icon name="emoji_events" size={28} className="mx-auto text-slate-400 mb-2" />
            <p className="text-sm font-semibold text-slate-700">No achievements added yet</p>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              Include awards, honors, hackathons, or patents to stand out from other applicants.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {list.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs transition hover:border-brand-blue/50"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                    <Icon name="emoji_events" size={18} />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-900">{item.title}</p>
                    <p className="text-xs text-slate-500">
                      {item.issuer || 'Event / Body'} {item.year ? `· ${item.year}` : ''}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleRemove(item.id)}
                  className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600 cursor-pointer"
                  title="Remove achievement"
                >
                  <Icon name="delete" size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ── 5. Personal Info Editor ──────────────────────────────────────────────────
const PersonalEditor = ({ data = {}, onChange }) => {
  const set = (k) => (e) => onChange({ ...data, [k]: e.target.value });
  return (
    <div className="space-y-3.5">
      <Grid2>
        <TF label="Full Name" required value={data.fullName} onChange={set('fullName')} placeholder="e.g. Rahul Sharma" />
        <TF label="Professional Headline" value={data.headline} onChange={set('headline')} placeholder="e.g. Senior Full Stack Developer" />
      </Grid2>
      <Grid2>
        <TF label="Email Address" type="email" required value={data.email} onChange={set('email')} placeholder="rahul@example.com" />
        <TF label="Mobile Phone" type="tel" required value={data.mobile} onChange={set('mobile')} placeholder="+91 98765 43210" />
      </Grid2>
      <Grid2>
        <TF label="Current Location" value={formatLocation(data.location)} onChange={set('location')} placeholder="e.g. Bengaluru, Karnataka" />
        <TF label="Portfolio / Website" value={data.website} onChange={set('website')} placeholder="https://rahul.dev" />
      </Grid2>
      <Grid2>
        <TF label="LinkedIn Profile" value={data.linkedin} onChange={set('linkedin')} placeholder="https://linkedin.com/in/rahul" />
        <TF label="GitHub Profile" value={data.github} onChange={set('github')} placeholder="https://github.com/rahul" />
      </Grid2>
    </div>
  );
};

// ── 6. Experience Item Form & List ───────────────────────────────────────────
const ExperienceItem = ({ item, onSave, onClose }) => {
  const [f, setF] = useState({
    ...item,
    location: formatLocation(item.location),
    startDate: safeMonth(item.startDate),
    endDate: safeMonth(item.endDate),
    current: Boolean(item.current),
  });
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const toggle = (k) => () => setF((p) => ({ ...p, [k]: !p[k] }));

  return (
    <div className="space-y-3.5">
      <Grid2>
        <TF label="Job Title / Role" required value={f.jobTitle} onChange={set('jobTitle')} placeholder="Software Engineer" />
        <TF label="Company / Employer" required value={f.company} onChange={set('company')} placeholder="Infosys Ltd." />
      </Grid2>
      <Grid2>
        <TF label="Location" value={f.location} onChange={set('location')} placeholder="e.g. Bengaluru" />
        <div className="flex items-center pt-6">
          <label className="flex cursor-pointer select-none items-center gap-2 text-sm font-medium text-brand-dark">
            <input type="checkbox" checked={Boolean(f.current)} onChange={toggle('current')} className="rounded border-gray-300 text-brand-blue" />
            I am currently working here
          </label>
        </div>
      </Grid2>
      <Grid2>
        <TF label="Start Date" type="month" value={f.startDate} onChange={set('startDate')} />
        {!f.current && <TF label="End Date" type="month" value={f.endDate} onChange={set('endDate')} />}
      </Grid2>
      <TF
        label="Roles & Key Achievements (Bullet points recommended)"
        multiline
        rows={5}
        value={f.description}
        onChange={set('description')}
        placeholder="• Led development of core microservices, increasing throughput by 30%&#10;• Mentored a team of 4 frontend engineers&#10;• Reduced production latency by 45% using Redis caching"
        hint="Tip: Start each line with • for neat formatting in the preview."
      />
      <div className="flex justify-end gap-2 border-t border-brand-border pt-4">
        <Button size="sm" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          size="sm"
          variant="primaryBlue"
          onClick={() => {
            if (f.jobTitle && f.company) onSave(f);
          }}
        >
          Save Experience
        </Button>
      </div>
    </div>
  );
};

// ── 7. Education Item Form ───────────────────────────────────────────────────
const EducationItem = ({ item, onSave, onClose }) => {
  const [f, setF] = useState({
    ...item,
    startDate: safeMonth(item.startDate),
    endDate: safeMonth(item.endDate),
    current: Boolean(item.current),
  });
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const toggle = (k) => () => setF((p) => ({ ...p, [k]: !p[k] }));

  return (
    <div className="space-y-3.5">
      <Grid2>
        <TF label="Degree / Course" required value={f.degree} onChange={set('degree')} placeholder="e.g. B.Tech Computer Science" />
        <TF label="College / University" required value={f.institution} onChange={set('institution')} placeholder="e.g. IIT Delhi" />
      </Grid2>
      <Grid2>
        <TF label="Start Date" type="month" value={f.startDate} onChange={set('startDate')} />
        {!f.current && <TF label="End Date" type="month" value={f.endDate} onChange={set('endDate')} />}
      </Grid2>
      <div className="flex items-center">
        <label className="flex cursor-pointer select-none items-center gap-2 text-sm font-medium text-brand-dark">
          <input type="checkbox" checked={Boolean(f.current)} onChange={toggle('current')} className="rounded border-gray-300 text-brand-blue" />
          Currently pursuing this degree
        </label>
      </div>
      <Grid2>
        <TF label="Score / CGPA / Percentage" value={f.grade} onChange={set('grade')} placeholder="e.g. 8.8 CGPA / 85%" />
        <TF label="Field of Specialization" value={f.description} onChange={set('description')} placeholder="e.g. Artificial Intelligence, Cloud Systems" />
      </Grid2>
      <div className="flex justify-end gap-2 border-t border-brand-border pt-4">
        <Button size="sm" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          size="sm"
          variant="primaryBlue"
          onClick={() => {
            if (f.degree && f.institution) onSave(f);
          }}
        >
          Save Education
        </Button>
      </div>
    </div>
  );
};

// ── 8. Project Item Form ─────────────────────────────────────────────────────
const ProjectItem = ({ item, onSave, onClose }) => {
  const [f, setF] = useState(item);
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  return (
    <div className="space-y-3.5">
      <Grid2>
        <TF label="Project Name" required value={f.name} onChange={set('name')} placeholder="e.g. Online Job Portal" />
        <TF label="Project / Demo URL" value={f.url} onChange={set('url')} placeholder="https://github.com/my-project" />
      </Grid2>
      <TF label="Technologies Used" value={f.tech} onChange={set('tech')} placeholder="e.g. React, Node.js, MongoDB, Tailwind" />
      <TF
        label="Project Summary & Impact"
        multiline
        rows={4}
        value={f.description}
        onChange={set('description')}
        placeholder="Designed and deployed a full-stack platform supporting 10k concurrent users with real-time analytics."
      />
      <div className="flex justify-end gap-2 border-t border-brand-border pt-4">
        <Button size="sm" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          size="sm"
          variant="primaryBlue"
          onClick={() => {
            if (f.name) onSave(f);
          }}
        >
          Save Project
        </Button>
      </div>
    </div>
  );
};

// ── Generic List Editor Component ────────────────────────────────────────────
const ListEditor = ({
  items = [],
  onAdd,
  onUpdate,
  onRemove,
  addLabel,
  renderSummary,
  FormComponent,
  blankItem,
}) => {
  const [editing, setEditing] = useState(null);
  const safeItems = Array.isArray(items) ? items : [];
  const editItem = safeItems.find((x) => x.id === editing) || (editing === 'new' ? blankItem : null);

  return (
    <div className="space-y-3">
      {safeItems.map((item) => (
        <div
          key={item.id}
          className="flex items-start justify-between gap-3 rounded-2xl border border-brand-border bg-white p-4 shadow-xs transition hover:border-brand-blue/60"
        >
          <div className="min-w-0 flex-1">{renderSummary(item)}</div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => setEditing(item.id)}
              className="rounded-lg p-1.5 text-brand-gray transition hover:bg-blue-50 hover:text-brand-blue"
              title="Edit item"
            >
              <Icon name="edit" size={16} />
            </button>
            <button
              type="button"
              onClick={() => onRemove(item.id)}
              className="rounded-lg p-1.5 text-brand-gray transition hover:bg-red-50 hover:text-brand-red"
              title="Delete item"
            >
              <Icon name="delete" size={16} />
            </button>
          </div>
        </div>
      ))}

      {safeItems.length < 15 && (
        <button
          type="button"
          onClick={() => setEditing('new')}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-brand-border py-3 text-sm font-semibold text-brand-gray transition hover:border-brand-blue hover:bg-blue-50/50 hover:text-brand-blue cursor-pointer"
        >
          <Icon name="add" size={18} /> {addLabel}
        </button>
      )}

      {editItem && (
        <Modal
          open
          title={editing === 'new' ? `Add ${addLabel.replace('Add ', '')}` : 'Edit Details'}
          onClose={() => setEditing(null)}
          size="lg"
        >
          <FormComponent
            item={editItem}
            onSave={(updated) => {
              if (editing === 'new') onAdd({ ...updated, id: uid() });
              else onUpdate(updated);
              setEditing(null);
            }}
            onClose={() => setEditing(null)}
          />
        </Modal>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// RESUME PREVIEWS (4 NAUKRI.COM STANDARD TEMPLATES)
// ─────────────────────────────────────────────────────────────────────────────

// ── Template 1: Modern Executive ─────────────────────────────────────────────
const ModernPreview = ({ data = {} }) => {
  const {
    personal: p = {},
    summary = '',
    experiences = [],
    educations = [],
    skills = [],
    languages = [],
    certifications = [],
    projects = [],
    achievements = [],
    accent = '#0A6CB5',
  } = data;

  return (
    <div className="bg-white text-[13px] leading-relaxed text-slate-700 font-sans">
      {/* Top Banner Accent */}
      <div className="h-2 w-full" style={{ backgroundColor: accent }} />

      <div className="px-8 pb-5 pt-7 border-b border-slate-200">
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">{p.fullName || 'Your Name'}</h1>
        {p.headline && <p className="mt-1 text-sm font-semibold" style={{ color: accent }}>{p.headline}</p>}
        <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-600">
          {p.email && <span className="flex items-center gap-1 font-medium">✉ {p.email}</span>}
          {p.mobile && <span className="flex items-center gap-1 font-medium">📞 {p.mobile}</span>}
          {p.location && <span className="flex items-center gap-1">📍 {formatLocation(p.location)}</span>}
          {p.linkedin && <span className="flex items-center gap-1">🔗 {p.linkedin}</span>}
          {p.github && <span className="flex items-center gap-1">💻 {p.github}</span>}
          {p.website && <span className="flex items-center gap-1">🌐 {p.website}</span>}
        </div>
      </div>

      <div className="p-8 space-y-5">
        {summary && (
          <div className="page-break-avoid">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: accent }}>Professional Summary</span>
              <div className="flex-1 border-t" style={{ borderColor: accent }} />
            </div>
            <p className="text-xs leading-relaxed text-slate-600 whitespace-pre-line">{summary}</p>
          </div>
        )}

        {skills.length > 0 && (
          <div className="page-break-avoid">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: accent }}>Key Skills</span>
              <div className="flex-1 border-t" style={{ borderColor: accent }} />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {skills.map((s, idx) => (
                <span
                  key={idx}
                  className="rounded px-2.5 py-0.5 text-[11px] font-semibold text-white shadow-xs"
                  style={{ backgroundColor: accent }}
                >
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}

        {experiences.length > 0 && (
          <div>
            <div className="mb-3 flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: accent }}>Work Experience</span>
              <div className="flex-1 border-t" style={{ borderColor: accent }} />
            </div>
            <div className="space-y-4">
              {experiences.map((e) => (
                <div key={e.id} className="page-break-avoid">
                  <div className="flex flex-wrap items-baseline justify-between gap-1">
                    <div>
                      <span className="font-bold text-slate-900">{e.jobTitle || 'Job Title'}</span>
                      <span className="font-semibold ml-1.5" style={{ color: accent }}>
                        · {e.company || 'Company'}{e.location ? ` (${formatLocation(e.location)})` : ''}
                      </span>
                    </div>
                    <span className="text-[11px] font-medium text-slate-500">{fmtRange(e.startDate, e.endDate, e.current)}</span>
                  </div>
                  {e.description && (
                    <ul className="mt-1.5 space-y-1 pl-4">
                      {e.description.split('\n').filter(Boolean).map((line, i) => (
                        <li key={i} className="list-disc text-xs text-slate-600">
                          {line.replace(/^[•-]\s*/, '')}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {educations.length > 0 && (
          <div>
            <div className="mb-3 flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: accent }}>Education</span>
              <div className="flex-1 border-t" style={{ borderColor: accent }} />
            </div>
            <div className="space-y-3">
              {educations.map((ed) => (
                <div key={ed.id} className="page-break-avoid flex flex-wrap items-baseline justify-between gap-1">
                  <div>
                    <p className="font-bold text-slate-900">{ed.degree || 'Degree'}</p>
                    <p className="text-xs text-slate-600">{ed.institution}{ed.grade ? ` · Grade: ${ed.grade}` : ''}</p>
                    {ed.description && <p className="text-[11px] text-slate-500">{ed.description}</p>}
                  </div>
                  <span className="text-[11px] font-medium text-slate-500">{fmtRange(ed.startDate, ed.endDate, ed.current)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {projects.length > 0 && (
          <div>
            <div className="mb-3 flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: accent }}>Projects</span>
              <div className="flex-1 border-t" style={{ borderColor: accent }} />
            </div>
            <div className="space-y-3">
              {projects.map((pr) => (
                <div key={pr.id} className="page-break-avoid">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="font-bold text-slate-900">{pr.name}</span>
                    {pr.url && (
                      <a href={pr.url} target="_blank" rel="noopener noreferrer" className="text-xs underline" style={{ color: accent }}>
                        {pr.url}
                      </a>
                    )}
                  </div>
                  {pr.tech && <p className="text-[11px] font-medium text-slate-500 italic">Tech: {pr.tech}</p>}
                  {pr.description && <p className="mt-0.5 text-xs text-slate-600">{pr.description}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {(certifications.length > 0 || languages.length > 0 || achievements.length > 0) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
            {certifications.length > 0 && (
              <div className="page-break-avoid">
                <p className="mb-1.5 text-xs font-bold uppercase tracking-wider" style={{ color: accent }}>Certifications</p>
                <ul className="space-y-1 pl-4 text-xs text-slate-600">
                  {certifications.map((c, i) => (
                    <li key={i} className="list-disc">
                      {typeof c === 'object' ? (
                        <span>
                          <strong className="text-slate-800">{c.name}</strong>
                          {c.issuer ? ` — ${c.issuer}` : ''}
                          {c.year ? ` (${c.year})` : ''}
                        </span>
                      ) : (
                        c
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {languages.length > 0 && (
              <div className="page-break-avoid">
                <p className="mb-1.5 text-xs font-bold uppercase tracking-wider" style={{ color: accent }}>Languages</p>
                <div className="flex flex-wrap gap-1.5 text-xs text-slate-600">
                  {languages.map((l, i) => (
                    <span key={i} className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5">
                      <span className="font-semibold text-slate-800">{typeof l === 'object' ? l.name : l}</span>
                      {typeof l === 'object' && l.proficiency && (
                        <span className="text-[10px] text-slate-500 font-normal">({l.proficiency})</span>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {achievements.length > 0 && (
              <div className="page-break-avoid sm:col-span-2">
                <p className="mb-1.5 text-xs font-bold uppercase tracking-wider" style={{ color: accent }}>Achievements & Recognition</p>
                <ul className="space-y-1 pl-4 text-xs text-slate-600">
                  {achievements.map((a, i) => (
                    <li key={i} className="list-disc">
                      {typeof a === 'object' ? (
                        <span>
                          <strong className="text-slate-800">{a.title}</strong>
                          {a.issuer ? ` — ${a.issuer}` : ''}
                        </span>
                      ) : (
                        a
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// ── Template 2: Classic Corporate ────────────────────────────────────────────
const ClassicPreview = ({ data = {} }) => {
  const {
    personal: p = {},
    summary = '',
    experiences = [],
    educations = [],
    skills = [],
    languages = [],
    certifications = [],
    projects = [],
    achievements = [],
    accent = '#0A6CB5',
  } = data;

  return (
    <div className="flex flex-col sm:flex-row min-h-full bg-white text-[13px] leading-relaxed text-slate-800">
      {/* Left Sidebar */}
      <div className="w-full sm:w-60 shrink-0 bg-slate-900 p-6 text-white space-y-6">
        <div className="text-center sm:text-left">
          <div
            className="mx-auto sm:mx-0 mb-3 flex h-14 w-14 items-center justify-center rounded-xl text-xl font-extrabold text-white shadow-md"
            style={{ backgroundColor: accent }}
          >
            {(p.fullName || 'Y').charAt(0).toUpperCase()}
          </div>
          <h2 className="text-lg font-bold leading-tight text-white">{p.fullName || 'Your Name'}</h2>
          {p.headline && <p className="mt-1 text-xs text-slate-300 font-medium">{p.headline}</p>}
        </div>

        <div className="space-y-2 text-xs text-slate-300 border-t border-slate-700/60 pt-4">
          <p className="font-semibold text-white uppercase text-[10px] tracking-wider mb-2">Contact Info</p>
          {p.email && <p className="break-all">✉ {p.email}</p>}
          {p.mobile && <p>📞 {p.mobile}</p>}
          {p.location && <p>📍 {formatLocation(p.location)}</p>}
          {p.linkedin && <p className="truncate">🔗 {p.linkedin}</p>}
          {p.github && <p className="truncate">💻 {p.github}</p>}
          {p.website && <p className="truncate">🌐 {p.website}</p>}
        </div>

        {skills.length > 0 && (
          <div className="border-t border-slate-700/60 pt-4">
            <p className="font-semibold text-white uppercase text-[10px] tracking-wider mb-2.5">Core Skills</p>
            <div className="flex flex-wrap gap-1.5">
              {skills.map((s, idx) => (
                <span key={idx} className="rounded bg-slate-800 border border-slate-700 px-2 py-0.5 text-[11px] text-slate-200">
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}

        {languages.length > 0 && (
          <div className="border-t border-slate-700/60 pt-4">
            <p className="font-semibold text-white uppercase text-[10px] tracking-wider mb-2">Languages</p>
            <div className="space-y-1.5 text-xs text-slate-300">
              {languages.map((l, i) => (
                <div key={i}>
                  <p className="font-semibold text-white">{typeof l === 'object' ? l.name : l}</p>
                  {typeof l === 'object' && l.proficiency && (
                    <p className="text-[10px] text-slate-400">{l.proficiency}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {certifications.length > 0 && (
          <div className="border-t border-slate-700/60 pt-4">
            <p className="font-semibold text-white uppercase text-[10px] tracking-wider mb-2">Certifications</p>
            <div className="space-y-1.5 text-xs text-slate-300">
              {certifications.map((c, i) => (
                <div key={i}>
                  <p className="font-semibold text-white">{typeof c === 'object' ? c.name : c}</p>
                  {typeof c === 'object' && c.issuer && (
                    <p className="text-[10px] text-slate-400">{c.issuer}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Right Content */}
      <div className="flex-1 p-6 sm:p-8 space-y-6">
        {summary && (
          <div className="page-break-avoid">
            <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-900 border-b-2 border-slate-900 pb-1">
              Professional Profile
            </h3>
            <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-line">{summary}</p>
          </div>
        )}

        {experiences.length > 0 && (
          <div>
            <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-900 border-b-2 border-slate-900 pb-1">
              Experience History
            </h3>
            <div className="space-y-4">
              {experiences.map((e) => (
                <div key={e.id} className="page-break-avoid">
                  <div className="flex flex-wrap items-baseline justify-between gap-1">
                    <p className="font-bold text-slate-900 text-sm">{e.jobTitle}</p>
                    <span className="text-[11px] font-medium text-slate-500">{fmtRange(e.startDate, e.endDate, e.current)}</span>
                  </div>
                  <p className="text-xs font-semibold text-slate-600">{e.company}{e.location ? ` · ${formatLocation(e.location)}` : ''}</p>
                  {e.description && (
                    <ul className="mt-1.5 space-y-1 pl-4">
                      {e.description.split('\n').filter(Boolean).map((line, i) => (
                        <li key={i} className="list-disc text-xs text-slate-600">
                          {line.replace(/^[•-]\s*/, '')}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {educations.length > 0 && (
          <div>
            <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-900 border-b-2 border-slate-900 pb-1">
              Education & Qualifications
            </h3>
            <div className="space-y-3">
              {educations.map((ed) => (
                <div key={ed.id} className="page-break-avoid flex flex-wrap items-baseline justify-between gap-1">
                  <div>
                    <p className="font-bold text-slate-900">{ed.degree}</p>
                    <p className="text-xs text-slate-600">{ed.institution}{ed.grade ? ` (${ed.grade})` : ''}</p>
                  </div>
                  <span className="text-[11px] text-slate-500 font-medium">{fmtRange(ed.startDate, ed.endDate, ed.current)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {projects.length > 0 && (
          <div>
            <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-900 border-b-2 border-slate-900 pb-1">
              Key Projects
            </h3>
            <div className="space-y-3">
              {projects.map((pr) => (
                <div key={pr.id} className="page-break-avoid">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="font-bold text-slate-900">{pr.name}</span>
                    {pr.url && <a href={pr.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-700 underline">{pr.url}</a>}
                  </div>
                  {pr.tech && <p className="text-[11px] italic text-slate-500">{pr.tech}</p>}
                  {pr.description && <p className="mt-0.5 text-xs text-slate-600">{pr.description}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {achievements.length > 0 && (
          <div className="page-break-avoid">
            <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-900 border-b-2 border-slate-900 pb-1">
              Honours & Awards
            </h3>
            <ul className="space-y-1 pl-4 text-xs text-slate-600">
              {achievements.map((a, i) => (
                <li key={i} className="list-disc">
                  {typeof a === 'object' ? (
                    <span>
                      <strong className="text-slate-900">{a.title}</strong>
                      {a.issuer ? ` — ${a.issuer}` : ''}
                    </span>
                  ) : (
                    a
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};

// ── Template 3: Minimal ATS-Clean ────────────────────────────────────────────
const MinimalPreview = ({ data = {} }) => {
  const {
    personal: p = {},
    summary = '',
    experiences = [],
    educations = [],
    skills = [],
    languages = [],
    certifications = [],
    projects = [],
    achievements = [],
    accent = '#0A6CB5',
  } = data;

  return (
    <div className="p-8 sm:p-10 bg-white text-[13px] leading-relaxed text-slate-800 font-sans">
      {/* Header */}
      <div className="mb-6 border-b pb-4" style={{ borderColor: accent }}>
        <h1 className="text-2xl font-black text-slate-900">{p.fullName || 'Your Name'}</h1>
        {p.headline && <p className="mt-0.5 text-sm font-semibold text-slate-600">{p.headline}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 font-medium">
          {p.email && <span>{p.email}</span>}
          {p.mobile && <span>{p.mobile}</span>}
          {p.location && <span>{formatLocation(p.location)}</span>}
          {p.linkedin && <span>{p.linkedin}</span>}
          {p.github && <span>{p.github}</span>}
          {p.website && <span>{p.website}</span>}
        </div>
      </div>

      <div className="space-y-5">
        {summary && (
          <div className="page-break-avoid">
            <h2 className="mb-1 text-xs font-bold uppercase tracking-widest" style={{ color: accent }}>Summary</h2>
            <p className="text-xs text-slate-600 leading-relaxed">{summary}</p>
          </div>
        )}

        {skills.length > 0 && (
          <div className="page-break-avoid">
            <h2 className="mb-1.5 text-xs font-bold uppercase tracking-widest" style={{ color: accent }}>Core Skills</h2>
            <p className="text-xs text-slate-700 font-medium leading-relaxed">{skills.join('  •  ')}</p>
          </div>
        )}

        {experiences.length > 0 && (
          <div>
            <h2 className="mb-2.5 text-xs font-bold uppercase tracking-widest" style={{ color: accent }}>Experience</h2>
            <div className="space-y-4">
              {experiences.map((e) => (
                <div key={e.id} className="page-break-avoid">
                  <div className="flex flex-wrap items-baseline justify-between gap-1">
                    <span className="font-bold text-slate-900 text-sm">{e.jobTitle}</span>
                    <span className="text-[11px] font-medium text-slate-500">{fmtRange(e.startDate, e.endDate, e.current)}</span>
                  </div>
                  <p className="text-xs font-medium text-slate-600">{e.company}{e.location ? ` | ${formatLocation(e.location)}` : ''}</p>
                  {e.description && (
                    <ul className="mt-1 space-y-0.5 pl-4">
                      {e.description.split('\n').filter(Boolean).map((line, i) => (
                        <li key={i} className="list-disc text-xs text-slate-600">
                          {line.replace(/^[•-]\s*/, '')}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {educations.length > 0 && (
          <div>
            <h2 className="mb-2 text-xs font-bold uppercase tracking-widest" style={{ color: accent }}>Education</h2>
            <div className="space-y-2">
              {educations.map((ed) => (
                <div key={ed.id} className="page-break-avoid flex flex-wrap items-baseline justify-between gap-1">
                  <div>
                    <span className="font-bold text-slate-900">{ed.degree}</span>
                    <span className="text-xs text-slate-600 ml-2">— {ed.institution}{ed.grade ? ` (${ed.grade})` : ''}</span>
                  </div>
                  <span className="text-[11px] font-medium text-slate-500">{fmtRange(ed.startDate, ed.endDate, ed.current)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {projects.length > 0 && (
          <div>
            <h2 className="mb-2 text-xs font-bold uppercase tracking-widest" style={{ color: accent }}>Projects</h2>
            <div className="space-y-2.5">
              {projects.map((pr) => (
                <div key={pr.id} className="page-break-avoid">
                  <div className="flex items-baseline gap-2">
                    <span className="font-bold text-slate-900">{pr.name}</span>
                    {pr.url && <a href={pr.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 underline">{pr.url}</a>}
                  </div>
                  {pr.tech && <p className="text-[11px] text-slate-500 italic">Stack: {pr.tech}</p>}
                  {pr.description && <p className="text-xs text-slate-600 mt-0.5">{pr.description}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {(certifications.length > 0 || languages.length > 0 || achievements.length > 0) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
            {certifications.length > 0 && (
              <div className="page-break-avoid">
                <h2 className="mb-1 text-xs font-bold uppercase tracking-widest" style={{ color: accent }}>Certifications</h2>
                <ul className="space-y-0.5 pl-4 text-xs text-slate-600">
                  {certifications.map((c, i) => (
                    <li key={i} className="list-disc">{formatCertification(c)}</li>
                  ))}
                </ul>
              </div>
            )}

            {languages.length > 0 && (
              <div className="page-break-avoid">
                <h2 className="mb-1 text-xs font-bold uppercase tracking-widest" style={{ color: accent }}>Languages</h2>
                <p className="text-xs text-slate-600">{languages.map(formatLanguage).join('  •  ')}</p>
              </div>
            )}

            {achievements.length > 0 && (
              <div className="page-break-avoid sm:col-span-2">
                <h2 className="mb-1 text-xs font-bold uppercase tracking-widest" style={{ color: accent }}>Key Highlights</h2>
                <ul className="space-y-0.5 pl-4 text-xs text-slate-600">
                  {achievements.map((a, i) => (
                    <li key={i} className="list-disc">{formatAchievement(a)}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// ── Template 4: Tech & Portfolio ─────────────────────────────────────────────
const TechPreview = ({ data = {} }) => {
  const {
    personal: p = {},
    summary = '',
    experiences = [],
    educations = [],
    skills = [],
    languages = [],
    certifications = [],
    projects = [],
    accent = '#334155',
  } = data;

  return (
    <div className="p-8 bg-white text-[13px] leading-relaxed text-slate-800 font-mono sm:font-sans">
      <div className="rounded-xl bg-slate-900 p-6 text-white mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-white">{p.fullName || 'Your Name'}</h1>
        {p.headline && (
          <p className="mt-1 text-sm font-semibold text-emerald-400" style={accent !== '#334155' ? { color: accent } : undefined}>
            {p.headline}
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-slate-300">
          {p.email && <span>📧 {p.email}</span>}
          {p.mobile && <span>📱 {p.mobile}</span>}
          {p.location && <span>📍 {formatLocation(p.location)}</span>}
          {p.github && <span className="text-emerald-300 font-mono">⚡ {p.github}</span>}
          {p.linkedin && <span>🔗 {p.linkedin}</span>}
          {p.website && <span>🌐 {p.website}</span>}
        </div>
      </div>

      <div className="space-y-5">
        {summary && (
          <div className="page-break-avoid border-l-3 border-emerald-500 pl-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 mb-1">About Me</h3>
            <p className="text-xs text-slate-600 whitespace-pre-line">{summary}</p>
          </div>
        )}

        {skills.length > 0 && (
          <div className="page-break-avoid">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 mb-2">Technical Arsenal</h3>
            <div className="flex flex-wrap gap-1.5">
              {skills.map((s, idx) => (
                <span key={idx} className="rounded-md border border-slate-300 bg-slate-100 px-2 py-0.5 text-xs font-mono font-semibold text-slate-800">
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}

        {projects.length > 0 && (
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 mb-3">Featured Projects & Contributions</h3>
            <div className="grid grid-cols-1 gap-3">
              {projects.map((pr) => (
                <div key={pr.id} className="page-break-avoid rounded-lg border border-slate-200 bg-slate-50/50 p-3.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-1">
                    <span className="font-bold text-slate-900">{pr.name}</span>
                    {pr.url && (
                      <a href={pr.url} target="_blank" rel="noopener noreferrer" className="text-xs font-mono text-emerald-600 underline">
                        {pr.url}
                      </a>
                    )}
                  </div>
                  {pr.tech && <p className="text-[11px] font-mono text-slate-500 mt-0.5">Stack: {pr.tech}</p>}
                  {pr.description && <p className="text-xs text-slate-600 mt-1">{pr.description}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {experiences.length > 0 && (
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 mb-3">Work Experience</h3>
            <div className="space-y-3.5">
              {experiences.map((e) => (
                <div key={e.id} className="page-break-avoid border-l-2 border-slate-300 pl-3.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-1">
                    <span className="font-bold text-slate-900">{e.jobTitle}</span>
                    <span className="text-[11px] text-slate-500 font-mono">{fmtRange(e.startDate, e.endDate, e.current)}</span>
                  </div>
                  <p className="text-xs font-medium text-slate-600">{e.company}{e.location ? ` · ${formatLocation(e.location)}` : ''}</p>
                  {e.description && (
                    <ul className="mt-1 space-y-0.5 pl-4 text-xs text-slate-600">
                      {e.description.split('\n').filter(Boolean).map((line, i) => (
                        <li key={i} className="list-disc">{line.replace(/^[•-]\s*/, '')}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {educations.length > 0 && (
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 mb-2">Education</h3>
            <div className="space-y-2">
              {educations.map((ed) => (
                <div key={ed.id} className="page-break-avoid flex justify-between gap-1 text-xs">
                  <div>
                    <span className="font-bold text-slate-900">{ed.degree}</span>
                    <span className="text-slate-600 ml-1.5">— {ed.institution}</span>
                  </div>
                  <span className="text-slate-500 font-mono text-[11px]">{fmtRange(ed.startDate, ed.endDate, ed.current)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {(languages.length > 0 || certifications.length > 0) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-200">
            {languages.length > 0 && (
              <div className="page-break-avoid">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 mb-1.5">Languages</h3>
                <div className="flex flex-wrap gap-1 text-xs text-slate-600">
                  {languages.map((l, i) => (
                    <span key={i} className="rounded bg-slate-100 px-2 py-0.5 font-mono text-[11px]">
                      {typeof l === 'object' ? `${l.name} (${l.proficiency})` : l}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {certifications.length > 0 && (
              <div className="page-break-avoid">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 mb-1.5">Certifications</h3>
                <ul className="space-y-0.5 text-xs text-slate-600">
                  {certifications.map((c, i) => (
                    <li key={i}>• {formatCertification(c)}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const PREVIEWS = {
  modern: ModernPreview,
  classic: ClassicPreview,
  minimal: MinimalPreview,
  tech: TechPreview,
};

// ─────────────────────────────────────────────────────────────────────────────
// FORM SECTIONS CONFIG
// ─────────────────────────────────────────────────────────────────────────────
const SECTIONS = [
  { id: 'personal', label: 'Personal Info', icon: 'person' },
  { id: 'summary', label: 'Summary', icon: 'subject' },
  { id: 'experience', label: 'Experience', icon: 'work' },
  { id: 'education', label: 'Education', icon: 'school' },
  { id: 'skills', label: 'Key Skills', icon: 'psychology' },
  { id: 'projects', label: 'Projects', icon: 'rocket_launch' },
  { id: 'certifications', label: 'Certifications', icon: 'verified' },
  { id: 'languages', label: 'Languages', icon: 'translate' },
  { id: 'achievements', label: 'Achievements', icon: 'emoji_events' },
];

// ─────────────────────────────────────────────────────────────────────────────
// PRINT STYLES (CLEAN CSS ISOLATION)
// ─────────────────────────────────────────────────────────────────────────────
const PRINT_STYLE_ID = 'resume-builder-print-stylesheet';

function injectPrintStyles() {
  if (document.getElementById(PRINT_STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = PRINT_STYLE_ID;
  s.textContent = `
    @media print {
      @page {
        size: A4 portrait;
        margin: 8mm;
      }
      body * {
        visibility: hidden !important;
      }
      #resume-printable-area, #resume-printable-area * {
        visibility: visible !important;
      }
      #resume-printable-area {
        position: absolute !important;
        left: 0 !important;
        top: 0 !important;
        width: 100% !important;
        margin: 0 !important;
        padding: 0 !important;
        background: white !important;
        box-shadow: none !important;
        border: none !important;
      }
      .page-break-avoid {
        break-inside: avoid !important;
        page-break-inside: avoid !important;
      }
    }
  `;
  document.head.appendChild(s);
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export const ResumeBuilder = () => {
  useDocumentTitle('Resume Builder | Naukri-Grade ATS Resume');

  const authUser = useAuthStore((s) => s.user);
  const authProfile = useAuthStore((s) => s.profile);

  const query = useQuery({
    queryKey: ['resume-builder'],
    queryFn: candidateApi.resumeBuilder,
    retry: 1,
  });

  const [form, setForm] = useState(null);
  const [activeSection, setActiveSection] = useState('personal');
  const [mobileTab, setMobileTab] = useState('edit'); // 'edit' | 'preview'
  const [showTemplates, setShowTemplates] = useState(false);
  const [showPlainModal, setShowPlainModal] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [previewScale, setPreviewScale] = useState(1);
  const [copiedText, setCopiedText] = useState(false);

  // Auto pre-fill from query data or auth state
  useEffect(() => {
    if (query.isPending) return;
    if (query.isError && !authUser) return;

    setForm((prev) => {
      if (prev) return prev;
      return buildFormFromProfile(query.data, authUser, authProfile);
    });
  }, [query.isPending, query.isError, query.data, authUser, authProfile]);

  const save = useAction(
    () => candidateApi.saveResumeBuilder(form),
    { success: 'Resume saved successfully! Recruiter profile updated.', invalidate: ['resume-builder'] },
  );

  const handlePrint = useCallback(() => {
    injectPrintStyles();
    window.print();
  }, []);

  const setField = useCallback((path, value) => {
    setForm((f) => {
      if (!f) return f;
      const parts = path.split('.');
      if (parts.length === 1) return { ...f, [path]: value };
      return { ...f, [parts[0]]: { ...f[parts[0]], [parts[1]]: value } };
    });
  }, []);

  const atsAnalysis = useMemo(() => calculateAtsScore(form), [form]);
  const plainTextResume = useMemo(() => generatePlainText(form), [form]);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(plainTextResume);
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2500);
  };

  if (query.isError && !form) {
    return <ErrorState error={query.error} onRetry={query.refetch} />;
  }

  if (query.isPending || !form) {
    return <PageLoader message="Loading your resume builder..." />;
  }

  const PreviewComponent = PREVIEWS[form.template] || ModernPreview;
  const activeTemplate = TEMPLATES.find((t) => t.id === form.template) || TEMPLATES[0];

  // Render individual form sections
  const renderSection = () => {
    switch (activeSection) {
      case 'personal':
        return (
          <Section title="Personal Information" subtitle="Your primary contact details seen by recruiters">
            <PersonalEditor data={form.personal} onChange={(v) => setForm((f) => ({ ...f, personal: v }))} />
          </Section>
        );

      case 'summary':
        return (
          <Section title="Professional Summary" subtitle="Highlight your years of experience, core value and goals">
            <TF
              multiline
              rows={6}
              value={form.summary}
              onChange={(e) => setField('summary', e.target.value)}
              placeholder="e.g. Dedicated Full Stack Developer with 4+ years building high-traffic cloud platforms with React and Node.js..."
            />
            <div className="mt-2.5 flex items-start gap-2 rounded-xl bg-blue-50 p-3 text-xs text-brand-blue">
              <Icon name="lightbulb" size={16} className="shrink-0 mt-0.5" />
              <span>
                Tip: Resumes with a concise 3-4 sentence summary receive up to <strong>35% more recruiter responses</strong>.
              </span>
            </div>
          </Section>
        );

      case 'experience':
        return (
          <Section title="Work Experience" subtitle="List your previous roles starting with your most recent position">
            <ListEditor
              items={form.experiences}
              onAdd={(item) => setForm((f) => ({ ...f, experiences: [...f.experiences, item] }))}
              onUpdate={(item) => setForm((f) => ({ ...f, experiences: f.experiences.map((x) => (x.id === item.id ? item : x)) }))}
              onRemove={(id) => setForm((f) => ({ ...f, experiences: f.experiences.filter((x) => x.id !== id) }))}
              addLabel="Add Work Experience"
              FormComponent={ExperienceItem}
              blankItem={{ id: 'new', jobTitle: '', company: '', location: '', startDate: '', endDate: '', current: false, description: '' }}
              renderSummary={(e) => (
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold text-brand-dark">{e.jobTitle || 'Job Title'}</p>
                    {e.current && (
                      <span className="rounded bg-emerald-100 px-1.5 py-0.2 text-[10px] font-bold text-emerald-800 uppercase">
                        Current
                      </span>
                    )}
                  </div>
                  <p className="text-xs font-semibold text-brand-gray">{e.company}{e.location ? ` · ${formatLocation(e.location)}` : ''}</p>
                  <p className="text-xs text-brand-gray-muted mt-0.5">{fmtRange(e.startDate, e.endDate, e.current)}</p>
                </div>
              )}
            />
          </Section>
        );

      case 'education':
        return (
          <Section title="Education & Degrees" subtitle="Include your degrees, colleges, and passing years">
            <ListEditor
              items={form.educations}
              onAdd={(item) => setForm((f) => ({ ...f, educations: [...f.educations, item] }))}
              onUpdate={(item) => setForm((f) => ({ ...f, educations: f.educations.map((x) => (x.id === item.id ? item : x)) }))}
              onRemove={(id) => setForm((f) => ({ ...f, educations: f.educations.filter((x) => x.id !== id) }))}
              addLabel="Add Education"
              FormComponent={EducationItem}
              blankItem={{ id: 'new', degree: '', institution: '', startDate: '', endDate: '', current: false, grade: '', description: '' }}
              renderSummary={(ed) => (
                <div>
                  <p className="text-sm font-bold text-brand-dark">{ed.degree || 'Degree / Course'}</p>
                  <p className="text-xs text-brand-gray">{ed.institution}{ed.grade ? ` · Grade: ${ed.grade}` : ''}</p>
                  <p className="text-xs text-brand-gray-muted mt-0.5">{fmtRange(ed.startDate, ed.endDate, ed.current)}</p>
                </div>
              )}
            />
          </Section>
        );

      case 'skills':
        return (
          <Section title="Key Technical & Soft Skills" subtitle="Add keywords that match your dream job descriptions">
            <SkillEditor
              items={form.skills}
              onChange={(v) => setField('skills', v)}
            />
          </Section>
        );

      case 'projects':
        return (
          <Section title="Key Projects & Portfolio" subtitle="Showcase your real-world achievements and code samples">
            <ListEditor
              items={form.projects}
              onAdd={(item) => setForm((f) => ({ ...f, projects: [...f.projects, item] }))}
              onUpdate={(item) => setForm((f) => ({ ...f, projects: f.projects.map((x) => (x.id === item.id ? item : x)) }))}
              onRemove={(id) => setForm((f) => ({ ...f, projects: f.projects.filter((x) => x.id !== id) }))}
              addLabel="Add Project"
              FormComponent={ProjectItem}
              blankItem={{ id: 'new', name: '', description: '', url: '', tech: '' }}
              renderSummary={(pr) => (
                <div>
                  <p className="text-sm font-bold text-brand-dark">{pr.name || 'Project Name'}</p>
                  {pr.tech && <p className="text-xs text-brand-gray">Stack: {pr.tech}</p>}
                  {pr.url && <p className="text-xs text-brand-blue truncate mt-0.5">{pr.url}</p>}
                </div>
              )}
            />
          </Section>
        );

      case 'certifications':
        return (
          <Section title="Certifications & Licences" subtitle="Industry certifications validate your domain expertise">
            <CertificationEditor
              items={form.certifications}
              onChange={(v) => setField('certifications', v)}
            />
          </Section>
        );

      case 'languages':
        return (
          <Section title="Languages Known" subtitle="Add languages one by one with your proficiency level">
            <LanguageEditor
              items={form.languages}
              onChange={(v) => setField('languages', v)}
            />
          </Section>
        );

      case 'achievements':
        return (
          <Section title="Achievements & Awards" subtitle="Awards, patents, hackathon wins, and recognition">
            <AchievementEditor
              items={form.achievements}
              onChange={(v) => setField('achievements', v)}
            />
          </Section>
        );

      default:
        return null;
    }
  };

  return (
    <div className="flex h-full flex-col space-y-4">
      {/* ── Top Bar ───────────────────────────────────────────────────────── */}
      <div className="print:hidden">
        <PageHeader
          title="Resume Builder"
          subtitle="Design ATS-optimized, recruiter-ready resumes with live preview"
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => setShowTemplates(true)}>
                <Icon name="palette" size={16} /> Templates & Colors
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowPlainModal(true)}>
                <Icon name="content_copy" size={16} /> Plain Text
              </Button>
              <Button size="sm" variant="outline" onClick={handlePrint}>
                <Icon name="print" size={16} /> Print / PDF
              </Button>
              <Button size="sm" variant="primaryBlue" loading={save.isPending} onClick={() => save.mutate()}>
                <Icon name="save" size={16} /> Save Resume
              </Button>
            </div>
          }
        />
      </div>

      {/* ── ATS Score Meter Banner ────────────────────────────────────────── */}
      <div className="print:hidden rounded-2xl border border-slate-200 bg-white p-3.5 shadow-xs transition sm:p-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className={clsx(
                'relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border shadow-2xs',
                atsAnalysis.score >= 80
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-600'
                  : 'border-blue-200 bg-blue-50 text-brand-blue',
              )}
            >
              <Icon name={atsAnalysis.score >= 80 ? 'verified' : 'fact_check'} size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-brand-dark">ATS Readiness Score</span>
                <span
                  className={clsx(
                    'rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider',
                    atsAnalysis.score >= 80 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800',
                  )}
                >
                  {atsAnalysis.score >= 80 ? 'ATS Optimized' : 'Needs Work'}
                </span>
              </div>
              <p className="text-xs text-brand-gray mt-0.5">
                {atsAnalysis.tips.length > 0 ? atsAnalysis.tips[0] : 'All key sections are complete and recruiter-ready!'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 self-end sm:self-auto">
            <button
              type="button"
              onClick={() => setForm(SAMPLE_RESUME)}
              className="text-xs font-semibold text-brand-blue hover:underline cursor-pointer"
            >
              Fill Sample Data
            </button>
            <span className="text-slate-300">|</span>
            <button
              type="button"
              onClick={() => setConfirmReset(true)}
              className="text-xs font-semibold text-brand-red hover:underline cursor-pointer"
            >
              Reset to My Profile
            </button>
          </div>
        </div>
      </div>

      {/* ── Mobile Tab Switcher ───────────────────────────────────────────── */}
      <div className="print:hidden lg:hidden">
        <Tabs
          value={mobileTab}
          onChange={setMobileTab}
          tabs={[
            { value: 'edit', label: '1. Edit Sections' },
            { value: 'preview', label: '2. Live Preview' },
          ]}
        />
      </div>

      {/* ── Main Layout (Left Edit | Right Preview) ───────────────────────── */}
      <div className="flex min-h-0 flex-1 gap-5 print:block">
        {/* LEFT: Section Navigation + Form Inputs */}
        <div className={clsx('flex min-h-0 flex-1 gap-4 print:hidden', mobileTab === 'preview' && 'hidden lg:flex')}>
          {/* Vertical Navigation Bar (Desktop) */}
          <div className="hidden w-52 shrink-0 xl:block">
            <nav className="surface rounded-2xl border border-brand-border bg-white p-2 shadow-xs">
              <p className="mb-2 px-2.5 pt-1 text-[10px] font-extrabold uppercase tracking-widest text-brand-gray-muted">
                Resume Sections
              </p>
              <div className="space-y-1">
                {SECTIONS.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setActiveSection(s.id)}
                    className={clsx(
                      'flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm font-medium transition-colors cursor-pointer',
                      activeSection === s.id
                        ? 'bg-blue-50 text-brand-blue font-bold shadow-2xs'
                        : 'text-brand-gray hover:bg-slate-50 hover:text-brand-dark',
                    )}
                  >
                    <Icon name={s.icon} size={16} />
                    {s.label}
                  </button>
                ))}
              </div>
            </nav>
          </div>

          {/* Form Content Area */}
          <div className="flex-1 space-y-4 overflow-y-auto pb-12">
            {/* Horizontal pills on tablet/mobile */}
            <div className="xl:hidden">
              <div className="no-scrollbar flex gap-1.5 overflow-x-auto pb-1">
                {SECTIONS.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setActiveSection(s.id)}
                    className={clsx(
                      'flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer',
                      activeSection === s.id
                        ? 'border-brand-blue bg-blue-50 text-brand-blue'
                        : 'border-brand-border bg-white text-brand-gray',
                    )}
                  >
                    <Icon name={s.icon} size={14} />
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {renderSection()}
          </div>
        </div>

        {/* RIGHT: Live A4 Preview Pane */}
        <div
          className={clsx(
            'shrink-0 overflow-y-auto print:block',
            mobileTab === 'edit' ? 'hidden lg:block' : 'block',
            'lg:w-[500px] xl:w-[580px] 2xl:w-[640px]',
          )}
        >
          {/* Preview Toolbar */}
          <div className="mb-2.5 flex items-center justify-between print:hidden">
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 rounded-full border border-brand-border bg-white px-2.5 py-1 text-xs font-semibold text-brand-gray shadow-xs">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: form.accent || '#0A6CB5' }} />
                {activeTemplate.label}
              </span>
              <button
                type="button"
                onClick={() => setShowTemplates(true)}
                className="text-xs font-semibold text-brand-blue hover:underline cursor-pointer"
              >
                Change Style
              </button>
            </div>

            <div className="flex items-center gap-1 text-xs text-brand-gray">
              <span className="text-[11px] font-medium mr-1">Scale:</span>
              {[1, 0.9, 0.8].map((sc) => (
                <button
                  key={sc}
                  type="button"
                  onClick={() => setPreviewScale(sc)}
                  className={clsx(
                    'rounded-lg px-2 py-0.5 text-[11px] font-bold transition cursor-pointer',
                    previewScale === sc ? 'bg-slate-900 text-white' : 'hover:bg-slate-100 text-slate-700',
                  )}
                >
                  {Math.round(sc * 100)}%
                </button>
              ))}
            </div>
          </div>

          {/* Printable Resume Container */}
          <div
            id="resume-printable-area"
            className="origin-top overflow-hidden rounded-2xl border border-brand-border bg-white shadow-xl transition-transform"
            style={{
              transform: `scale(${previewScale})`,
              transformOrigin: 'top center',
              minHeight: '842px',
            }}
          >
            <PreviewComponent data={form} />
          </div>
        </div>
      </div>

      {/* ── Templates & Colors Modal ─────────────────────────────────────── */}
      <Modal open={showTemplates} onClose={() => setShowTemplates(false)} title="Select Template & Accent Color" size="lg">
        <div className="space-y-6">
          {/* Template Choices */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-brand-gray-muted mb-3">Choose Layout Template</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, template: t.id }))}
                  className={clsx(
                    'flex flex-col text-left rounded-2xl border-2 p-3.5 transition-all cursor-pointer',
                    form.template === t.id
                      ? 'border-brand-blue bg-blue-50/60 shadow-sm ring-1 ring-brand-blue'
                      : 'border-brand-border bg-white hover:border-brand-blue/50',
                  )}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-bold text-brand-dark">{t.label}</span>
                    {form.template === t.id && <Icon name="check_circle" size={18} fill className="text-brand-blue" />}
                  </div>
                  <p className="text-xs text-brand-gray leading-snug">{t.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Accent Color Choices */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-brand-gray-muted mb-3">Choose Accent Color</h4>
            <div className="flex flex-wrap gap-2.5">
              {ACCENT_COLORS.map((col) => (
                <button
                  key={col.id}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, accent: col.hex }))}
                  className={clsx(
                    'flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition cursor-pointer',
                    form.accent === col.hex ? 'border-brand-blue ring-2 ring-brand-blue bg-blue-50' : 'border-slate-200 hover:bg-slate-50',
                  )}
                >
                  <span className="h-4 w-4 rounded-full shadow-xs" style={{ backgroundColor: col.hex }} />
                  {col.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-end pt-2 border-t border-brand-border">
            <Button size="sm" variant="primaryBlue" onClick={() => setShowTemplates(false)}>
              Apply & Close
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Plain Text Resume Modal ──────────────────────────────────────── */}
      <Modal open={showPlainModal} onClose={() => setShowPlainModal(false)} title="ATS Plain Text Resume" size="lg">
        <div className="space-y-4">
          <p className="text-xs text-brand-gray">
            Copy this plain text version directly when applying to portals with text-based application boxes or strict ATS scanners.
          </p>
          <textarea
            readOnly
            rows={14}
            value={plainTextResume}
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-3 font-mono text-xs text-slate-800 outline-none select-all"
          />
          <div className="flex justify-end gap-2 border-t border-brand-border pt-3">
            <Button size="sm" variant="outline" onClick={() => setShowPlainModal(false)}>
              Close
            </Button>
            <Button size="sm" variant="primaryBlue" onClick={copyToClipboard}>
              <Icon name={copiedText ? 'check' : 'content_copy'} size={15} />
              {copiedText ? 'Copied to Clipboard!' : 'Copy Plain Text'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Reset Confirmation Dialog ────────────────────────────────────── */}
      <ConfirmDialog
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="Reset Resume to Profile Data?"
        message="This will discard the sample data or manual edits and restore your official account profile details from Freejobwala."
        confirmLabel="Restore My Profile Data"
        danger={false}
        onConfirm={() => {
          setForm(buildFormFromProfile(query.data, authUser, authProfile));
          setConfirmReset(false);
        }}
      />
    </div>
  );
};

export default ResumeBuilder;
