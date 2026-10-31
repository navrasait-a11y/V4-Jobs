import React, { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import AccountSecurity from '../../components/shared/AccountSecurity';
import Button from '../../components/ui/Button';
import { Avatar, DataTable, PageHeader, Section, StatusBadge, Tabs } from '../../components/ui/data';
import { Alert, ConfirmDialog, EmptyState, ErrorState, Modal, PageLoader } from '../../components/ui/feedback';
import { CheckboxField, SelectField, SuggestField, TextAreaField, TextField } from '../../components/ui/form';
import useAuth from '../../hooks/useAuth';
import { useAction, useDocumentTitle, useLookups, useUrlFilters } from '../../hooks/useData';
import { authApi, orgApi } from '../../services';
import { formatDate, toInputDate } from '../../utils/format';

const CompanyTab = ({ org }) => {
  const { loadMe } = useAuth();
  const lookups = useLookups('organization_type', 'company_size', 'hiring_status');
  const [form, setForm] = useState({ name: org.name || '', legalName: org.legalName || '', organizationType: org.organizationType || '', industries: org.industries || [], employeeCount: org.employeeCount || '', foundedDate: toInputDate(org.foundedDate), website: org.website || '', about: org.about || '', hiringStatus: org.hiringStatus || '', gstNumber: org.gstNumber || '', panNumber: org.panNumber || '', email: org.email || '', phone: org.phone || '' });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? e.target.value : e }));
  const logoRef = useRef(null);
  const coverRef = useRef(null);
  const after = { invalidate: ['organization'], onSuccess: loadMe };
  const save = useAction(() => orgApi.update(Object.fromEntries(Object.entries(form).filter(([, v]) => v !== ''))), { ...after, success: 'Company profile saved' });
  const logo = useAction(orgApi.logo, { ...after, success: 'Logo updated' });
  const cover = useAction(orgApi.cover, { ...after, success: 'Cover updated' });
  return (
    <div className="space-y-4">
      <Section title="Branding">
        <div className="flex flex-wrap items-center gap-4">
          <Avatar name={org.name} src={org.logo?.url} size={72} square />
          <Button size="sm" variant="outline" loading={logo.isPending} onClick={() => logoRef.current?.click()}>
            Change logo
          </Button>
          <Button size="sm" variant="outline" loading={cover.isPending} onClick={() => coverRef.current?.click()}>
            Change cover
          </Button>
          <input ref={logoRef} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && logo.mutate(e.target.files[0])} />
          <input ref={coverRef} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && cover.mutate(e.target.files[0])} />
        </div>
      </Section>
      <Section title="Company details">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TextField label="Company name" required value={form.name} onChange={set('name')} />
            <TextField label="Legal name" value={form.legalName} onChange={set('legalName')} />
            <SelectField label="Organization type" options={lookups.organization_type} value={form.organizationType} onChange={set('organizationType')} />
            <SelectField label="Employees" options={lookups.company_size} value={form.employeeCount} onChange={set('employeeCount')} />
            <TextField label="Founded" type="date" value={form.foundedDate} onChange={set('foundedDate')} />
            <TextField label="Website" type="url" value={form.website} onChange={set('website')} />
            <TextField label="Public email" type="email" value={form.email} onChange={set('email')} />
            <TextField label="Public phone" value={form.phone} onChange={set('phone')} />
            <TextField label="GST number" value={form.gstNumber} onChange={set('gstNumber')} />
            <TextField label="PAN number" value={form.panNumber} onChange={set('panNumber')} />
            <SelectField label="Hiring status" options={lookups.hiring_status} value={form.hiringStatus} onChange={set('hiringStatus')} />
            <SuggestField label="Industries" lookup="industry" multiple max={5} value={form.industries} onChange={set('industries')} />
          </div>
          <TextAreaField label="About" rows={6} value={form.about} onChange={set('about')} />
          <Button type="submit" size="sm" variant="primaryBlue" loading={save.isPending}>
            Save
          </Button>
        </form>
      </Section>
    </div>
  );
};

const OfficeModal = ({ office, onClose }) => {
  const lookups = useLookups('office_type');
  const [form, setForm] = useState({ type: office?.type || '', address: office?.address || '', city: office?.city || '', state: office?.state || '', pincode: office?.pincode || '', country: office?.country || 'India', isPrimary: Boolean(office?.isPrimary) });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const save = useAction(() => (office ? orgApi.updateOffice(office._id, form) : orgApi.addOffice(form)), { success: 'Office saved', invalidate: ['organization'], onSuccess: onClose });
  return (
    <Modal open onClose={onClose} title={office ? 'Edit office' : 'Add office'} footer={<Button type="submit" form="office-form" size="sm" variant="primaryBlue" loading={save.isPending}>Save</Button>}>
      <form
        id="office-form"
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <SelectField label="Type" required options={lookups.office_type} value={form.type} onChange={set('type')} />
        <TextAreaField label="Address" required rows={2} value={form.address} onChange={set('address')} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <TextField label="City" required value={form.city} onChange={set('city')} />
          <TextField label="State" required value={form.state} onChange={set('state')} />
          <TextField label="Pincode" value={form.pincode} onChange={set('pincode')} />
        </div>
        <CheckboxField label="Primary office" checked={form.isPrimary} onChange={set('isPrimary')} />
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
      title="Offices"
      actions={
        <Button size="sm" variant="outline" onClick={() => setEditing({})}>
          Add office
        </Button>
      }
    >
      <DataTable
        columns={[
          { key: 'type', header: 'Type' },
          { key: 'address', header: 'Address' },
          { key: 'city', header: 'City' },
        ]}
        rows={org.offices}
        empty={<EmptyState icon="location_on" title="No offices added" />}
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

const DECLARATIONS = [
  ['accurate', 'All information provided is accurate'],
  ['authorized', 'I am authorized to act for this organization'],
  ['employerTerms', 'I accept the Employer Terms'],
  ['privacy', 'I accept the Privacy Policy'],
  ['postingPolicy', 'I accept the Job Posting Policy'],
  ['fraudWarning', 'I understand fraudulent activity leads to removal'],
];

const VerificationTab = ({ org }) => {
  const { loadMe } = useAuth();
  const lookups = useLookups('document_type');
  const [doc, setDoc] = useState({ type: '', number: '' });
  const [file, setFile] = useState(null);
  const [checks, setChecks] = useState({});
  const [domain, setDomain] = useState(org.website?.replace(/^https?:\/\//, '').split('/')[0] || '');
  const [txt, setTxt] = useState(null);
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
  const submit = useAction(() => orgApi.submitVerification(Object.fromEntries(DECLARATIONS.map(([k]) => [k, true]))), { ...inv, success: 'Submitted for verification', onSuccess: loadMe });
  const start = useAction(() => orgApi.domainStart({ domain }), { onSuccess: setTxt });
  const check = useAction(orgApi.domainCheck, { ...inv, success: 'Domain verified' });
  const documents = org.documents || [];
  const allChecked = DECLARATIONS.every(([k]) => checks[k]);
  return (
    <div className="space-y-4">
      <Section title="KYC documents" actions={<StatusBadge status={org.kycStatus} />}>
        <DataTable
          columns={[
            { key: 'type', header: 'Document' },
            { key: 'number', header: 'Number', render: (d) => d.number || '—' },
            { key: 'status', header: 'Status', render: (d) => <StatusBadge status={d.status} /> },
            { key: 'remarks', header: 'Remarks', render: (d) => d.remarks || '—' },
            { key: 'date', header: 'Uploaded', render: (d) => formatDate(d.uploadedAt || d.createdAt) },
          ]}
          rows={documents}
          empty={<EmptyState icon="description" title="No documents uploaded" />}
          actions={(d) =>
            d.status !== 'verified' && (
              <Button size="sm" variant="dangerGhost" onClick={() => remove.mutate(d._id)}>
                Delete
              </Button>
            )
          }
        />
        {documents.length < 3 && (
          <form
            className="mt-4 grid grid-cols-1 items-end gap-3 sm:grid-cols-4"
            onSubmit={(e) => {
              e.preventDefault();
              upload.mutate();
            }}
          >
            <SelectField label="Type" required options={lookups.document_type} value={doc.type} onChange={(e) => setDoc((d) => ({ ...d, type: e.target.value }))} />
            <TextField label="Number" value={doc.number} onChange={(e) => setDoc((d) => ({ ...d, number: e.target.value }))} />
            <input type="file" required aria-label="Document file" accept=".pdf,image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} className="pb-2 text-sm" />
            <Button type="submit" size="sm" variant="primaryBlue" loading={upload.isPending}>
              Upload
            </Button>
          </form>
        )}
      </Section>
      <Section title="Declaration">
        <div className="space-y-2">
          {DECLARATIONS.map(([k, label]) => (
            <CheckboxField key={k} label={label} checked={Boolean(checks[k])} onChange={(e) => setChecks((c) => ({ ...c, [k]: e.target.checked }))} />
          ))}
        </div>
        <Button size="sm" variant="primary" className="mt-3" disabled={!allChecked || !documents.length} loading={submit.isPending} onClick={() => submit.mutate()}>
          Submit for verification
        </Button>
      </Section>
      <Section title="Domain verification" actions={org.verification?.domain ? <StatusBadge status="verified" /> : null}>
        {!org.verification?.domain && (
          <>
            <div className="flex flex-wrap items-end gap-2">
              <TextField className="min-w-[220px] flex-1" label="Domain" value={domain} onChange={(e) => setDomain(e.target.value)} />
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

const AccountTab = () => {
  const { user, loadMe } = useAuth();
  const [form, setForm] = useState({ fullName: user.fullName || '', designation: user.employer?.designation || '' });
  const ref = useRef(null);
  const save = useAction(() => authApi.updateMe(form), { success: 'Profile saved', onSuccess: loadMe });
  const photo = useAction(authApi.uploadAvatar, { success: 'Photo updated', onSuccess: loadMe });
  return (
    <Section title="My profile">
      <div className="mb-4 flex items-center gap-3">
        <Avatar name={user.fullName} src={user.avatar?.url} size={56} />
        <Button size="sm" variant="outline" loading={photo.isPending} onClick={() => ref.current?.click()}>
          Change photo
        </Button>
        <input ref={ref} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && photo.mutate(e.target.files[0])} />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField label="Full name" value={form.fullName} onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))} />
        <TextField label="Designation" value={form.designation} onChange={(e) => setForm((f) => ({ ...f, designation: e.target.value }))} />
      </div>
      <Button size="sm" variant="primaryBlue" className="mt-4" loading={save.isPending} onClick={() => save.mutate()}>
        Save
      </Button>
    </Section>
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
      <PageHeader title="Settings" />
      <Tabs
        className="mb-4"
        value={filters.tab}
        onChange={(tab) => setFilters({ tab })}
        tabs={[
          { value: 'company', label: 'Company' },
          { value: 'offices', label: 'Offices' },
          { value: 'verification', label: 'Verification' },
          { value: 'account', label: 'My profile' },
          { value: 'security', label: 'Security' },
        ]}
      />
      {filters.tab === 'company' && <CompanyTab key={org.updatedAt} org={org} />}
      {filters.tab === 'offices' && <OfficesTab org={org} />}
      {filters.tab === 'verification' && <VerificationTab org={org} />}
      {filters.tab === 'account' && <AccountTab />}
      {filters.tab === 'security' && <AccountSecurity />}
    </div>
  );
};

export default Settings;
