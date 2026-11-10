import React, { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import AccountSecurity from '../../components/shared/AccountSecurity';
import ChangeContact from '../../components/shared/ChangeContact';
import Button from '../../components/ui/Button';
import { Avatar, Badge, DataTable, PageHeader, Section, StatusBadge, Tabs } from '../../components/ui/data';
import { Alert, ConfirmDialog, EmptyState, ErrorState, Icon, Modal, PageLoader } from '../../components/ui/feedback';
import { CheckboxField, Field, FileDropzone, LocationField, SelectField, SuggestField, TextAreaField, TextField } from '../../components/ui/form';
import HierarchyField from '../../components/ui/HierarchyField';
import useAuth from '../../hooks/useAuth';
import { useAction, useDocumentTitle, useLookups, useUrlFilters } from '../../hooks/useData';
import { authApi, orgApi } from '../../services';
import { gstinHint } from '../../utils/gstin';
import { formatDate, placeLabel, toInputMonth } from '../../utils/format';

/*
 * Employer profile and documentation, following the "Employer Profile & Documentation" sheet of the
 * client's Excel: branding and hiring status, the hiring manager, the organization, its offices and
 * the verification documents with declarations.
 */

const USERNAME = /^(?!_)[A-Za-z0-9_]{3,30}(?<!_)$/;
const ABOUT_WORDS = 1000;
const words = (text = '') => (text.trim() ? text.trim().split(/\s+/).length : 0);
const withScheme = (url = '') => (url && !/^https?:\/\//i.test(url) ? `https://${url.trim()}` : url.trim());
const clean = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== '' && v !== null && v !== undefined));

const Block = ({ title, hint, children }) => (
  <fieldset className="space-y-4">
    <legend className="mb-3 w-full border-b border-brand-border pb-2">
      <span className="text-sm font-semibold text-brand-dark">{title}</span>
      {hint && <span className="mt-0.5 block text-xs text-brand-gray-muted">{hint}</span>}
    </legend>
    {children}
  </fieldset>
);
const Grid = ({ children }) => <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>;

/* ------------------------------------------------------------- company */

const CompanyTab = ({ org }) => {
  const { loadMe } = useAuth();
  const consultancy = org.type === 'consultancy';
  const lookups = useLookups('employer_type', 'organization_type', 'company_size', 'hiring_status', 'social_platform');
  const [form, setForm] = useState({
    name: org.name || '',
    username: org.username || '',
    hiringStatus: org.hiringStatus || '',
    employerType: org.employerType || (consultancy ? 'Consultancy' : ''),
    legalName: org.legalName || '',
    organizationType: org.organizationType || '',
    industries: org.industries || [],
    subIndustries: org.subIndustries || [],
    employeeCount: org.employeeCount || '',
    foundedDate: toInputMonth(org.foundedDate),
    website: org.website || '',
    about: org.about || '',
    email: org.email || '',
    phone: org.phone || '',
    gstNumber: org.gstNumber || '',
    panNumber: org.panNumber || '',
  });
  const [socials, setSocials] = useState(org.socialProfiles || []);
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? e.target.value : e }));
  const logoRef = useRef(null);
  const coverRef = useRef(null);
  const after = { invalidate: ['organization'], onSuccess: loadMe };
  const save = useAction(
    () =>
      orgApi.update({
        ...clean({ ...form, website: withScheme(form.website), foundedDate: form.foundedDate && `${form.foundedDate}-01`, username: form.username === org.username ? undefined : form.username }),
        about: form.about,
        socialProfiles: socials.filter((s) => s.platform && s.url).map((s) => ({ platform: s.platform, url: withScheme(s.url) })),
      }),
    { ...after, success: 'Company profile saved' },
  );
  const logo = useAction(orgApi.logo, { ...after, success: 'Logo updated' });
  const cover = useAction(orgApi.cover, { ...after, success: 'Cover photo updated' });
  const aboutWords = words(form.about);
  const usernameError = form.username && !USERNAME.test(form.username) ? '3 to 30 letters, numbers or _ . Cannot start or end with _' : '';

  const submit = (e) => {
    e.preventDefault();
    if (usernameError) return setError(usernameError);
    if (aboutWords > ABOUT_WORDS) return setError(`About the company is limited to ${ABOUT_WORDS} words`);
    if (socials.some((s) => (s.platform && !s.url) || (!s.platform && s.url))) return setError('Each social profile needs a platform and a link');
    setError('');
    return save.mutate();
  };

  return (
    <div className="space-y-4">
      <Section title="Logo and public profile">
        <div className="flex flex-wrap items-center gap-4">
          <Avatar name={org.name} src={org.logo?.url} size={76} square />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" loading={logo.isPending} onClick={() => logoRef.current?.click()}>
              <Icon name="upload" size={16} /> Employer logo
            </Button>
            <Button size="sm" variant="outline" loading={cover.isPending} onClick={() => coverRef.current?.click()}>
              <Icon name="wallpaper" size={16} /> Cover photo
            </Button>
          </div>
          {org.slug && org.status === 'active' && (
            <Link to={`/${consultancy ? 'recruiters' : 'companies'}/${org.slug}`} target="_blank" className="ml-auto text-sm font-semibold text-brand-blue">
              View public page
            </Link>
          )}
          <input ref={logoRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => e.target.files?.[0] && logo.mutate(e.target.files[0])} />
          <input ref={coverRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => e.target.files?.[0] && cover.mutate(e.target.files[0])} />
        </div>
      </Section>
      <Section title="Tell us about your organization">
        <form className="space-y-6" onSubmit={submit}>
          {error && <Alert tone="error">{error}</Alert>}
          <Block title="Identity">
            <Grid>
              <TextField label={consultancy ? 'Consultancy name' : 'Company name'} required value={form.name} onChange={set('name')} maxLength={200} />
              <TextField label="Legal / registered name" value={form.legalName} onChange={set('legalName')} maxLength={200} />
              <TextField label="Employer username" value={form.username} onChange={(e) => set('username')(e.target.value.trim())} error={usernameError} maxLength={30} hint="Used in your public page link" />
              <SelectField label="Current hiring status" options={lookups.hiring_status} value={form.hiringStatus} onChange={set('hiringStatus')} />
              <SelectField label="Employer type" options={lookups.employer_type} value={form.employerType} onChange={set('employerType')} />
              <SelectField label="Organization type" options={lookups.organization_type} value={form.organizationType} onChange={set('organizationType')} />
            </Grid>
          </Block>
          <Block title="Size and industry">
            <HierarchyField kind="industry" label="Industry" value={{ parents: form.industries, children: form.subIndustries }} onChange={({ parents, children }) => setForm((f) => ({ ...f, industries: parents, subIndustries: children }))} />
            <Grid>
              <SelectField label="Total employees count" options={lookups.company_size} value={form.employeeCount} onChange={set('employeeCount')} />
              <TextField label="Establishment / founded date" type="month" max={new Date()} value={form.foundedDate} onChange={set('foundedDate')} />
            </Grid>
          </Block>
          <Block title="About and contact">
            <TextAreaField label="About the company" rows={6} value={form.about} onChange={set('about')} hint={`${aboutWords}/${ABOUT_WORDS} words`} error={aboutWords > ABOUT_WORDS ? `Keep it under ${ABOUT_WORDS} words` : ''} />
            <Grid>
              <TextField label="Company website" inputMode="url" autoCapitalize="off" value={form.website} onChange={set('website')} placeholder="https://" />
              <TextField label="Public email" type="email" value={form.email} onChange={set('email')} />
              <TextField label="Public phone" inputMode="numeric" maxLength={10} value={form.phone} onChange={(e) => set('phone')(e.target.value.replace(/\D/g, ''))} />
              <TextField label="GST number" value={form.gstNumber} onChange={(e) => set("gstNumber")(e.target.value.toUpperCase().replace(/s/g, ""))} maxLength={15} {...gstinHint(form.gstNumber)} />
              <TextField label="PAN number" value={form.panNumber} onChange={(e) => set('panNumber')(e.target.value.toUpperCase())} maxLength={10} />
            </Grid>
          </Block>
          <Block title="Online social profiles">
            {socials.map((s, i) => (
              <div key={i} className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[180px_1fr_auto]">
                <SelectField label="Platform" options={lookups.social_platform} value={s.platform} onChange={(e) => setSocials((all) => all.map((x, j) => (j === i ? { ...x, platform: e.target.value } : x)))} />
                <TextField label="Profile link" inputMode="url" autoCapitalize="off" value={s.url} onChange={(e) => setSocials((all) => all.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} placeholder="https://" />
                <Button type="button" size="sm" variant="dangerGhost" className="h-11" aria-label="Remove" onClick={() => setSocials((all) => all.filter((_, j) => j !== i))}>
                  <Icon name="delete" size={18} />
                </Button>
              </div>
            ))}
            {socials.length < 10 && (
              <Button type="button" size="sm" variant="outline" onClick={() => setSocials((all) => [...all, { platform: '', url: '' }])}>
                <Icon name="add" size={16} /> Add social profile
              </Button>
            )}
          </Block>
          <div className="flex justify-end border-t border-brand-border pt-4">
            <Button type="submit" size="sm" variant="primaryBlue" loading={save.isPending}>
              Save company profile
            </Button>
          </div>
        </form>
      </Section>
    </div>
  );
};

/* ------------------------------------------------------- hiring manager */

/** "Who will manage hiring on this account?" The signed-in user's own recruiter details. */
/** LinkedIn-style profile viewing mode: show who you are to candidates, or browse privately. */
const ViewingMode = () => {
  const { user, loadMe } = useAuth();
  const isPrivate = Boolean(user.employer?.privateBrowsing);
  const save = useAction((v) => orgApi.viewingMode(v), { success: (r) => (r?.private ? 'Private mode on' : 'Your name and company are now shown'), onSuccess: loadMe });
  const options = [
    { value: false, icon: 'badge', title: 'Your name and company', body: 'Candidates see that your company viewed their profile. Profiles you open feel more personal and candidates respond faster.' },
    { value: true, icon: 'visibility_off', title: 'Private mode', body: 'Candidates only see "a recruiter" with your industry and city. Useful for confidential hiring.' },
  ];
  return (
    <Section title="Profile viewing mode" className="mt-4">
      <p className="mb-3 text-sm text-brand-gray">Choose what candidates see when you open their profile or application.</p>
      <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Profile viewing mode">
        {options.map((o) => {
          const on = isPrivate === o.value;
          return (
            <button
              key={String(o.value)}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={save.isPending}
              onClick={() => !on && save.mutate(o.value)}
              className={`flex items-start gap-3 rounded-xl border p-4 text-left transition-colors ${on ? 'border-brand-blue bg-brand-blue-tint/60 ring-1 ring-brand-blue' : 'border-brand-border hover:border-brand-blue'}`}
            >
              <Icon name={o.icon} size={22} className={on ? 'text-brand-blue' : 'text-brand-gray-muted'} />
              <span>
                <span className="block text-sm font-semibold text-brand-dark">{o.title}</span>
                <span className="mt-0.5 block text-xs text-brand-gray">{o.body}</span>
              </span>
              <span className={`ml-auto mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 ${on ? 'border-brand-blue bg-brand-blue shadow-[inset_0_0_0_2px_#fff]' : 'border-[#B4BCC8]'}`} />
            </button>
          );
        })}
      </div>
    </Section>
  );
};

const HiringTab = () => {
  const { user, loadMe } = useAuth();
  const lookups = useLookups('gender', 'hiring_authority');
  const [form, setForm] = useState({
    fullName: user.fullName || '',
    gender: user.gender || '',
    designation: user.employer?.designation || '',
    department: user.employer?.department || [],
    functions: user.employer?.functions || [],
    hiringAuthority: user.employer?.hiringAuthority || '',
  });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? e.target.value : e }));
  const ref = useRef(null);
  const save = useAction(() => authApi.updateMe({ ...clean(form), department: form.department, functions: form.functions }), { success: 'Hiring manager details saved', onSuccess: loadMe });
  const photo = useAction(authApi.uploadAvatar, { success: 'Photo updated', onSuccess: loadMe });
  return (
    <Section title="Who will manage hiring on this account?">
      <form
        className="space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <div className="flex items-center gap-3">
          <Avatar name={user.fullName} src={user.avatar?.url} size={56} />
          <Button type="button" size="sm" variant="outline" loading={photo.isPending} onClick={() => ref.current?.click()}>
            Change photo
          </Button>
          <input ref={ref} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => e.target.files?.[0] && photo.mutate(e.target.files[0])} />
        </div>
        <Grid>
          <TextField label="User or HR full name" required value={form.fullName} onChange={set('fullName')} maxLength={120} />
          <SelectField label="Gender" options={lookups.gender} value={form.gender} onChange={set('gender')} />
          <Field label="Mobile number">
            <p className="flex h-11 items-center justify-between gap-2 rounded-[var(--radius-input)] bg-brand-tint px-3 text-sm">
              <span className="truncate">{user.mobile ? `+91 ${user.mobile}` : 'Not added'}</span>
              {user.isMobileVerified ? <Badge tone="green">Verified</Badge> : <Badge tone="amber">Not verified</Badge>}
            </p>
          </Field>
          <Field label="Email ID">
            <p className="flex h-11 items-center justify-between gap-2 rounded-[var(--radius-input)] bg-brand-tint px-3 text-sm">
              <span className="truncate">{user.email}</span>
              {user.isEmailVerified ? <Badge tone="green">Verified</Badge> : <Badge tone="amber">Not verified</Badge>}
            </p>
          </Field>
          <SuggestField label="Job title / designation" lookup="job_title" allowCreate value={form.designation} onChange={set('designation')} placeholder="e.g. HR Manager" />
          <SelectField label="Hiring authority type" options={lookups.hiring_authority} value={form.hiringAuthority} onChange={set('hiringAuthority')} />
        </Grid>
        <HierarchyField kind="department" label="Department / functions you hire for" value={{ parents: form.department, children: form.functions }} onChange={({ parents, children }) => setForm((f) => ({ ...f, department: parents, functions: children }))} />
        <p className="text-xs text-brand-gray-muted">To change the mobile number or e-mail, open the Security tab. Both are verified by OTP.</p>
        <div className="flex justify-end border-t border-brand-border pt-4">
          <Button type="submit" size="sm" variant="primaryBlue" loading={save.isPending}>
            Save
          </Button>
        </div>
      </form>
    </Section>
  );
};

/* ------------------------------------------------------------- offices */

const OfficeModal = ({ office, onClose }) => {
  const lookups = useLookups('office_type');
  const [form, setForm] = useState({
    type: office?.type || '',
    address: office?.address || '',
    place: office?.city ? { locality: office.locality, district: office.district, city: office.city, state: office.state, country: office.country || 'India', location: office.location } : null,
    pincode: office?.pincode || '',
    isPrimary: Boolean(office?.isPrimary),
  });
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e }));
  const save = useAction(
    () => {
      const p = form.place || {};
      const body = clean({ type: form.type, address: form.address, locality: p.locality, district: p.district, city: p.city, state: p.state, country: p.country || 'India', location: p.location, pincode: form.pincode, isPrimary: form.isPrimary });
      return office ? orgApi.updateOffice(office._id, body) : orgApi.addOffice(body);
    },
    { success: 'Office saved', invalidate: ['organization'], onSuccess: onClose },
  );
  const submit = (e) => {
    e.preventDefault();
    if (!form.place?.city) return setError('Choose the office city from the list');
    if (!form.place?.state) return setError('Pick a city with its state from the suggestions');
    if (form.pincode && !/^\d{6}$/.test(form.pincode)) return setError('Pincode must be 6 digits');
    setError('');
    return save.mutate();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={office ? 'Edit office' : 'Add office location'}
      size="lg"
      footer={
        <Button type="submit" form="office-form" size="sm" variant="primaryBlue" loading={save.isPending}>
          Save
        </Button>
      }
    >
      <form id="office-form" className="space-y-4" onSubmit={submit}>
        {error && <Alert tone="error">{error}</Alert>}
        <SelectField label="Office address type" required options={lookups.office_type} value={form.type} onChange={set('type')} />
        <TextAreaField label="Office address / locality" required rows={2} value={form.address} onChange={set('address')} maxLength={500} placeholder="Building, street, area" />
        <Grid>
          <LocationField label="Office city / state / country" required value={form.place} onChange={set('place')} placeholder="Search locality or city" />
          <TextField label="Office area pincode" inputMode="numeric" maxLength={6} value={form.pincode} onChange={(e) => set('pincode')(e.target.value.replace(/\D/g, ''))} />
        </Grid>
        <CheckboxField label="This is our primary office" checked={form.isPrimary} onChange={set('isPrimary')} />
      </form>
    </Modal>
  );
};

const OfficesTab = ({ org }) => {
  const [editing, setEditing] = useState(null);
  const [removing, setRemoving] = useState(null);
  const remove = useAction(orgApi.removeOffice, { success: 'Office removed', invalidate: ['organization'], onSuccess: () => setRemoving(null) });
  return (
    <Section
      title="Where is your organization located?"
      actions={
        <Button size="sm" variant="outline" onClick={() => setEditing({})}>
          <Icon name="add" size={16} /> Add office
        </Button>
      }
    >
      <DataTable
        columns={[
          { key: 'type', header: 'Type', render: (o) => <span className="flex items-center gap-2">{o.type}{o.isPrimary && <Badge tone="blue">Primary</Badge>}</span> },
          { key: 'address', header: 'Address' },
          { key: 'city', header: 'City', render: (o) => [placeLabel(o), o.pincode].filter(Boolean).join(' - ') },
        ]}
        rows={org.offices}
        empty={<EmptyState icon="location_on" title="No offices added" description="Add your registered office and work locations. Candidates see them on your page." />}
        actions={(o) => (
          <>
            <Button size="sm" variant="ghost" onClick={() => setEditing(o)}>
              Edit
            </Button>
            <Button size="sm" variant="dangerGhost" onClick={() => setRemoving(o._id)}>
              Delete
            </Button>
          </>
        )}
      />
      {editing && <OfficeModal office={editing._id ? editing : null} onClose={() => setEditing(null)} />}
      <ConfirmDialog open={Boolean(removing)} onClose={() => setRemoving(null)} title="Delete office?" danger confirmLabel="Delete" loading={remove.isPending} onConfirm={() => remove.mutate(removing)} />
    </Section>
  );
};

/* -------------------------------------------------------- verification */

/** Excel "Terms & Declaration" wording, mapped to the API's declaration keys. */
const DECLARATIONS = [
  ['accurate', 'I confirm that the information provided is accurate and complete.'],
  ['authorized', 'I confirm that I am authorized to represent this organization.'],
  ['employerTerms', 'I agree to the Employer Terms & Conditions.', '/legal/employer-terms'],
  ['privacy', 'I agree to the Privacy Policy.', '/legal/privacy-policy'],
  ['postingPolicy', 'I agree to the Employer Recruitment & Job Posting Policy.', '/legal/job-posting-policy'],
  ['fraudWarning', 'I understand that fraudulent or misleading job postings may result in account suspension or termination.'],
];
const MAX_DOCUMENTS = 3;

const VerificationTab = ({ org }) => {
  const { loadMe } = useAuth();
  const lookups = useLookups('document_type');
  const [doc, setDoc] = useState({ type: '', number: '' });
  const [file, setFile] = useState(null);
  const [checks, setChecks] = useState(() => Object.fromEntries(DECLARATIONS.map(([k]) => [k, Boolean(org.termsDeclaration?.[k])])));
  const [consultancy, setConsultancy] = useState({ authorized: Boolean(org.consultancyDeclaration?.authorized), noCandidateFee: Boolean(org.consultancyDeclaration?.noCandidateFee) });
  const [domain, setDomain] = useState(org.website?.replace(/^https?:\/\//, '').split('/')[0] || '');
  const [txt, setTxt] = useState(null);
  const [error, setError] = useState('');
  const inv = { invalidate: ['organization'] };
  const upload = useAction(() => orgApi.addDocument({ ...doc, file }), {
    ...inv,
    success: 'Document uploaded',
    onSuccess: () => {
      setDoc({ type: '', number: '' });
      setFile(null);
    },
  });
  const remove = useAction(orgApi.removeDocument, { ...inv, success: 'Document removed' });
  const saveConsultancy = useAction(() => orgApi.update({ consultancyDeclaration: consultancy }), { ...inv, silent: true });
  const submit = useAction(
    async () => {
      if (org.type === 'consultancy') await saveConsultancy.mutateAsync();
      return orgApi.submitVerification(Object.fromEntries(DECLARATIONS.map(([k]) => [k, true])));
    },
    { ...inv, success: 'Submitted for verification', onSuccess: loadMe },
  );
  const start = useAction(() => orgApi.domainStart({ domain }), { onSuccess: setTxt });
  const check = useAction(orgApi.domainCheck, { ...inv, success: 'Domain verified' });
  const documents = org.documents || [];
  const used = new Set(documents.map((d) => d.type));
  const allChecked = DECLARATIONS.every(([k]) => checks[k]) && (org.type !== 'consultancy' || (consultancy.authorized && consultancy.noCandidateFee));
  const submitted = ['under_review', 'verified'].includes(org.kycStatus);

  const addDocument = (e) => {
    e.preventDefault();
    if (!doc.type) return setError('Choose the document type');
    if (!file) return setError('Attach the document file');
    setError('');
    return upload.mutate();
  };

  return (
    <div className="space-y-4">
      <Section title="Upload valid documents for verification" actions={<StatusBadge status={org.kycStatus} />}>
        <p className="mb-4 text-sm text-brand-gray">Upload up to {MAX_DOCUMENTS} documents. Our team checks them and gives your organization the verified badge.</p>
        <DataTable
          columns={[
            { key: 'type', header: 'Document' },
            { key: 'number', header: 'Document ID number', render: (d) => d.number || '—' },
            { key: 'status', header: 'Status', render: (d) => <StatusBadge status={d.status} /> },
            { key: 'remarks', header: 'Remarks', render: (d) => d.remarks || '—' },
            { key: 'date', header: 'Uploaded', render: (d) => formatDate(d.uploadedAt || d.createdAt) },
          ]}
          rows={documents}
          empty={<EmptyState icon="description" title="No documents uploaded" description="GST certificate, company PAN or incorporation certificate work best." />}
          actions={(d) => (
            <span className="inline-flex gap-1">
              {d.file?.downloadUrl && (
                <a href={d.file.downloadUrl} target="_blank" rel="noopener noreferrer" className="rounded-md px-2 py-1 text-xs font-semibold text-brand-blue hover:bg-brand-tint">
                  View
                </a>
              )}
              {d.status !== 'verified' && (
                <Button size="sm" variant="dangerGhost" onClick={() => remove.mutate(d._id)}>
                  Delete
                </Button>
              )}
            </span>
          )}
        />
        {documents.length < MAX_DOCUMENTS && (
          <form className="mt-5 space-y-4 rounded-lg border border-brand-border p-4" onSubmit={addDocument}>
            {error && <Alert tone="error">{error}</Alert>}
            <Grid>
              <SelectField label="Documents list" required options={lookups.document_type.filter((t) => !used.has(t))} value={doc.type} onChange={(e) => setDoc((d) => ({ ...d, type: e.target.value }))} />
              <TextField label="Document ID number" value={doc.number} onChange={(e) => setDoc((d) => ({ ...d, number: e.target.value.toUpperCase() }))} maxLength={60} />
            </Grid>
            {file ? (
              <div className="flex items-center justify-between gap-2 rounded-lg bg-brand-tint p-3 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <Icon name="description" className="text-brand-blue" />
                  <span className="truncate">{file.name}</span>
                </span>
                <Button type="button" size="sm" variant="ghost" onClick={() => setFile(null)}>
                  Change
                </Button>
              </div>
            ) : (
              <FileDropzone accept=".pdf,.jpg,.jpeg,.png,.webp" maxSizeMb={5} onFile={setFile} label="Upload document" hint="PDF or image up to 5 MB" />
            )}
            <div className="flex justify-end">
              <Button type="submit" size="sm" variant="primaryBlue" loading={upload.isPending}>
                Add document
              </Button>
            </div>
          </form>
        )}
      </Section>

      <Section title="Terms and declaration">
        {submitted && (
          <Alert tone="success" className="mb-4">
            Submitted on {formatDate(org.termsDeclaration?.acceptedAt)}. You will get an e-mail once the review is done.
          </Alert>
        )}
        <div className="space-y-3">
          {org.type === 'consultancy' && (
            <div className="space-y-3 rounded-lg bg-brand-tint p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-brand-gray">Consultancy client declaration</p>
              <CheckboxField label="I confirm that I am authorized to provide recruitment services and that the jobs I post will represent genuine hiring requirements." checked={consultancy.authorized} onChange={(e) => setConsultancy((c) => ({ ...c, authorized: e.target.checked }))} />
              <CheckboxField label="I agree not to charge candidates any unauthorized recruitment, registration, interview, security or placement fee through this platform." checked={consultancy.noCandidateFee} onChange={(e) => setConsultancy((c) => ({ ...c, noCandidateFee: e.target.checked }))} />
            </div>
          )}
          {DECLARATIONS.map(([k, label, link]) => (
            <CheckboxField
              key={k}
              checked={Boolean(checks[k])}
              onChange={(e) => setChecks((c) => ({ ...c, [k]: e.target.checked }))}
              label={
                link ? (
                  <>
                    {label}{' '}
                    <Link to={link} target="_blank" className="text-brand-blue underline">
                      Read
                    </Link>
                  </>
                ) : (
                  label
                )
              }
            />
          ))}
        </div>
        <Button size="sm" variant="primary" className="mt-4" disabled={!allChecked || !documents.length} loading={submit.isPending} onClick={() => submit.mutate()}>
          {submitted ? 'Submit again' : 'Submit for verification'}
        </Button>
        {!documents.length && <p className="mt-2 text-xs text-brand-gray-muted">Upload at least one document first.</p>}
      </Section>

      <Section title="Domain verification" actions={org.verification?.domain ? <StatusBadge status="verified" /> : null}>
        {org.verification?.domain ? (
          <p className="text-sm text-brand-gray">Your website domain is verified.</p>
        ) : (
          <>
            <p className="mb-3 text-sm text-brand-gray">Optional. Prove you own your website domain by adding a DNS TXT record.</p>
            <div className="flex flex-wrap items-end gap-2">
              <TextField className="min-w-[220px] flex-1" label="Domain" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="example.com" />
              <Button size="sm" variant="outline" className="h-11" loading={start.isPending} onClick={() => start.mutate()}>
                Get TXT record
              </Button>
            </div>
            {txt && (
              <Alert className="mt-3">
                Add this DNS TXT record, then check: <code className="break-all">{txt.record || txt.txtRecord || txt.token}</code>
                <Button size="sm" variant="primaryBlue" className="mt-2 block" loading={check.isPending} onClick={() => check.mutate()}>
                  Check now
                </Button>
              </Alert>
            )}
          </>
        )}
      </Section>
    </div>
  );
};

const Settings = () => {
  useDocumentTitle('Settings');
  const [filters, setFilters] = useUrlFilters({ tab: 'company' });
  const query = useQuery({ queryKey: ['organization'], queryFn: orgApi.get });
  if (query.isPending) return <PageLoader />;
  if (query.isError) return <ErrorState error={query.error} onRetry={query.refetch} />;
  const org = query.data.organization || query.data;
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Settings" subtitle={org.type === 'consultancy' ? 'Consultancy profile and verification' : 'Company profile and verification'} />
      <Tabs
        className="mb-4"
        value={filters.tab === 'account' ? 'hiring' : filters.tab}
        onChange={(tab) => setFilters({ tab })}
        tabs={[
          { value: 'company', label: 'Organization' },
          { value: 'hiring', label: 'Hiring manager' },
          { value: 'offices', label: 'Offices' },
          { value: 'verification', label: 'Verification' },
          { value: 'security', label: 'Security' },
        ]}
      />
      {filters.tab === 'company' && <CompanyTab key={org.updatedAt} org={org} />}
      {(filters.tab === 'hiring' || filters.tab === 'account') && (
        <>
          <HiringTab />
          <ViewingMode />
        </>
      )}
      {filters.tab === 'offices' && <OfficesTab org={org} />}
      {filters.tab === 'verification' && <VerificationTab org={org} />}
      {filters.tab === 'security' && (
        <div className="space-y-4">
          <ChangeContact />
          <AccountSecurity />
        </div>
      )}
    </div>
  );
};

export default Settings;
