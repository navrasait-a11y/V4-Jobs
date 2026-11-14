import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import Button from '../../components/ui/Button';
import { Badge, StatusBadge } from '../../components/ui/data';
import { Icon } from '../../components/ui/feedback';
import { AlertSendJobs, BulkJobAlert, JobCandidates, SendTemplate } from '../../components/admin/AdminActions';
import InvoiceViewer from '../../components/shared/InvoiceViewer';
import { adminApi } from '../../services';
import { loginAs } from '../../components/admin/loginAs';
import { formatCurrency, formatDate, formatDateTime, formatLocations, titleCase } from '../../utils/format';

const opt = (list) => list.map((value) => ({ value, label: titleCase(value) }));
const status = (key = 'status') => ({ key, header: 'Status', render: (r) => <StatusBadge status={r[key]} /> });
const date = (key = 'createdAt', header = 'Created') => ({ key, header, render: (r) => formatDate(r[key]) });
const stamp = (key = 'createdAt', header = 'Time') => ({ key, header, render: (r) => formatDateTime(r[key]) });
const two = (key, header, a, b) => ({
  key,
  header,
  render: (r) => (
    <span>
      <span className="block font-medium">{a(r) || '—'}</span>
      <span className="block text-xs text-brand-gray-muted">{b(r)}</span>
    </span>
  ),
});
const person = two('name', 'Name', (r) => r.fullName, (r) => r.email || r.mobile);

const USER_BULK = [
  { action: 'approve', label: 'Approve' },
  { action: 'verify', label: 'Verify' },
  { action: 'block', label: 'Block', danger: true },
  { action: 'suspend', label: 'Suspend', danger: true },
  { action: 'trash', label: 'Trash', danger: true },
];
// PRD labels: Label Candidate / Employer Label / Label Job; situation tags come from master data.
const CANDIDATE_PICKERS = [{ action: 'label_add', label: 'Add label', options: opt(['premium', 'starred', 'featured', 'actively_searching', 'urgent', 'profile_booster']) }, { action: 'label_remove', label: 'Remove label', options: opt(['premium', 'starred', 'featured', 'actively_searching', 'urgent', 'profile_booster']) }, { action: 'tag', label: 'Set situation tag', lookup: 'situation_tag' }];
const EMPLOYER_PICKERS = [{ action: 'label_add', label: 'Add label', options: opt(['premium', 'starred', 'featured', 'actively_hiring', 'urgent_hiring']) }, { action: 'label_remove', label: 'Remove label', options: opt(['premium', 'starred', 'featured', 'actively_hiring', 'urgent_hiring']) }, { action: 'tag', label: 'Set situation tag', lookup: 'situation_tag' }];
const JOB_PICKERS = [{ action: 'label_add', label: 'Add label', options: opt(['premium', 'starred', 'featured', 'actively_hiring', 'urgent']) }, { action: 'label_remove', label: 'Remove label', options: opt(['premium', 'starred', 'featured', 'actively_hiring', 'urgent']) }];
const USER_STATUS = opt(['active', 'pending', 'admin_review', 'blocked', 'suspended', 'trashed']);


const WithModal = ({ label, render }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        {label}
      </Button>
      {open && render(() => setOpen(false))}
    </>
  );
};

const AlertJobs = ({ alert }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>Send jobs</Button>
      {open && <AlertSendJobs alert={alert} onClose={() => setOpen(false)} />}
    </>
  );
};

const OrderInvoice = ({ order }) => {
  const [open, setOpen] = useState(false);
  if (!order.invoice?._id) return null;
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>Invoice</Button>
      <InvoiceViewer admin invoice={open ? order.invoice : null} onClose={() => setOpen(false)} />
    </>
  );
};

const OrderStatus = ({ order, refresh }) => {
  const set = async (status) => {
    try {
      await adminApi.patch(`/billing/orders/${order._id}/status`, { status });
      toast.success('Order updated');
      refresh();
    } catch (e) {
      toast.error(e.message);
    }
  };
  if (order.status === 'paid') return <Button size="sm" variant="ghost" onClick={() => set('refunded')}>Refund</Button>;
  if (order.status === 'created') return <Button size="sm" variant="ghost" onClick={() => set('paid')}>Mark paid</Button>;
  return null;
};

const LoginAs = ({ id, name }) => (
  <Button size="sm" variant="ghost" onClick={() => loginAs(id, name)}>
    Login as
  </Button>
);
const Open = ({ to, children = 'Open' }) => {
  const navigate = useNavigate();
  return (
    <Button size="sm" variant="ghost" onClick={() => navigate(to)}>
      {children}
    </Button>
  );
};

const JOB_BULK = [
  { action: 'approve', label: 'Approve' },
  { action: 'feature', label: 'Feature' },
  { action: 'close', label: 'Close' },
  { action: 'reject', label: 'Reject', danger: true },
  { action: 'trash', label: 'Trash', danger: true },
];

const plansFields = [
  { key: 'code', label: 'Code', required: true },
  { key: 'name', label: 'Name', required: true },
  { key: 'audience', label: 'Audience', type: 'select', required: true, options: opt(['employer', 'candidate']) },
  { key: 'tier', label: 'Tier', type: 'select', required: true, options: [...opt(['free', 'starter', 'professional', 'enterprise', 'booster', 'custom']), { value: 'addon', label: 'Add-on pack (credits only, keeps current plan)' }] },
  { key: 'price', label: 'Price (excl. GST)', type: 'number', required: true },
  { key: 'mrp', label: 'MRP', type: 'number' },
  { key: 'durationDays', label: 'Duration (days)', type: 'number', required: true },
  { key: 'credits.job_post', label: 'Job post credits', type: 'number' },
  { key: 'credits.featured_job', label: 'Featured job credits', type: 'number' },
  { key: 'credits.resume_view', label: 'Resume view credits', type: 'number' },
  { key: 'credits.resume_download', label: 'Resume download credits', type: 'number' },
  { key: 'credits.invite', label: 'Invite credits', type: 'number' },
  { key: 'credits.excel_download', label: 'Excel download credits', type: 'number' },
  { key: 'credits.resume_search', label: 'Resume search credits', type: 'number' },
  { key: 'features.resumeDbAccess', label: 'Resume database access', type: 'checkbox' },
  { key: 'features.featuredJobs', label: 'Featured jobs', type: 'checkbox' },
  { key: 'features.contactUnlock', label: 'Contact unlock', type: 'checkbox' },
  { key: 'features.advancedAnalytics', label: 'Advanced analytics', type: 'checkbox' },
  { key: 'features.bulkUpload', label: 'Bulk upload', type: 'checkbox' },
  { key: 'features.profileBoost', label: 'Profile boost', type: 'checkbox' },
  { key: 'features.featuredProfile', label: 'Featured profile', type: 'checkbox' },
  { key: 'features.profileViewers', label: 'See all profile viewers (candidate)', type: 'checkbox' },
  { key: 'maxMembers', label: 'Max team members', type: 'number' },
  { key: 'highlights', label: 'Highlights', type: 'list' },
  { key: 'sortOrder', label: 'Sort order', type: 'number' },
  { key: 'isPublic', label: 'Public', type: 'checkbox', default: true },
  { key: 'isActive', label: 'Active', type: 'checkbox', default: true },
];
const couponFields = [
  { key: 'code', label: 'Code', required: true },
  { key: 'type', label: 'Type', type: 'select', required: true, options: opt(['percent', 'flat']) },
  { key: 'value', label: 'Value', type: 'number', required: true },
  { key: 'maxDiscount', label: 'Max discount', type: 'number' },
  { key: 'minAmount', label: 'Min amount', type: 'number' },
  { key: 'validFrom', label: 'Valid from', type: 'datetime' },
  { key: 'validTo', label: 'Valid to', type: 'datetime' },
  { key: 'usageLimit', label: 'Usage limit', type: 'number' },
  { key: 'perUserLimit', label: 'Per user limit', type: 'number' },
  { key: 'isActive', label: 'Active', type: 'checkbox', default: true },
];
const faqFields = [
  { key: 'question', label: 'Question', required: true },
  { key: 'answer', label: 'Answer', type: 'html', rows: 8, required: true, placeholder: 'Write the answer…' },
  { key: 'category', label: 'Category', type: 'lookup', lookup: 'faq_category' },
  { key: 'audience', label: 'Audience', type: 'select', options: opt(['all', 'candidate', 'employer']) },
  { key: 'order', label: 'Order', type: 'number' },
  { key: 'isActive', label: 'Active', type: 'checkbox', default: true },
];
const adFields = [
  { key: 'name', label: 'Name', required: true },
  { key: 'type', label: 'Type', type: 'select', required: true, options: opt(['banner', 'adsense', 'admob', 'html']) },
  { key: 'placement', label: 'Placement', type: 'select', required: true, options: opt(['home_top', 'home_middle', 'jobs_list', 'job_detail_sidebar', 'company_page', 'dashboard', 'career_advice']) },
  { key: 'platforms', label: 'Show on', type: 'multi', options: opt(['web', 'android', 'ios']), default: ['web', 'android', 'ios'] },
  { key: 'audience', label: 'Audience', type: 'select', options: opt(['all', 'guest', 'candidate', 'employer']) },
  { type: 'heading', label: 'Creative' },
  { key: 'image', label: 'Banner image (desktop)', type: 'media' },
  { key: 'mobileImage', label: 'Banner image (mobile)', type: 'media' },
  { key: 'link', label: 'Click-through link', inputType: 'url' },
  { key: 'adUnitId', label: 'AdSense / AdMob ad unit id', hint: 'For AdSense and AdMob types' },
  { key: 'html', label: 'Custom content', type: 'html', rows: 6, hint: 'For the HTML type only' },
  { type: 'heading', label: 'Schedule' },
  { key: 'priority', label: 'Priority', type: 'number', hint: 'Higher shows first' },
  { key: 'startAt', label: 'Starts', type: 'datetime' },
  { key: 'endAt', label: 'Ends', type: 'datetime' },
  { key: 'isActive', label: 'Active', type: 'checkbox', default: true },
];
const templateFields = [
  { key: 'name', label: 'Name', required: true },
  { key: 'subject', label: 'Subject', required: true, hint: 'Variables like {{name}} work here too' },
  { key: 'html', label: 'E-mail body', type: 'html', required: true, full: true, rows: 14, variables: ['name', 'email', 'jobTitle', 'company', 'url', 'date'], hint: 'Click a variable to insert it. It is replaced for each recipient.' },
  { key: 'variables', label: 'Variables used', type: 'list', hint: 'For example name, jobTitle - written as {{name}} in the text' },
  { key: 'category', label: 'Category', type: 'select', options: opt(['general', 'candidate', 'employer', 'marketing', 'transactional']) },
  { key: 'isActive', label: 'Active', type: 'checkbox', default: true },
];
const locationFields = [
  { key: 'locality', label: 'Locality' },
  { key: 'district', label: 'District' },
  { key: 'city', label: 'City', required: true },
  { key: 'state', label: 'State', required: true },
  { key: 'country', label: 'Country', default: 'India' },
  { key: 'pincode', label: 'Pincode' },
  { key: 'geo.lat', label: 'Latitude', type: 'number', hint: 'Used for the "within N km" filters' },
  { key: 'geo.lng', label: 'Longitude', type: 'number' },
  { key: 'isPopular', label: 'Popular (shown first)', type: 'checkbox' },
  { key: 'isActive', label: 'Active', type: 'checkbox', default: true },
];
const ADMIN_PERMISSION_OPTIONS = ['dashboard.view', 'users.manage', 'users.impersonate', 'employers.manage', 'candidates.manage', 'jobs.manage', 'applications.manage', 'documents.verify', 'comments.moderate', 'reports.manage', 'chat.manage', 'payments.manage', 'plans.manage', 'cms.manage', 'ads.manage', 'masterdata.manage', 'notifications.send', 'leads.manage', 'settings.manage', 'audit.view', 'admins.manage'].map((value) => ({ value, label: titleCase(value.replace('.', ' ')) }));
const adminFields = [
  { key: 'fullName', label: 'Full name', required: true },
  { key: 'nickname', label: 'Display name (shown on blogs)' },
  { key: 'designation', label: 'Designation' },
  { key: 'email', label: 'Email', inputType: 'email', required: true },
  { key: 'mobile', label: 'Mobile' },
  { key: 'password', label: 'Password', inputType: 'password', required: true, hint: 'At least 8 characters with a letter and a number' },
  { key: 'role', label: 'Role', type: 'select', options: opt(['admin', 'super_admin']) },
  { key: 'permissions', label: 'Permissions (none selected = full access)', type: 'multi', options: ADMIN_PERMISSION_OPTIONS },
];

export const MODULES = {
  candidates: {
    title: 'Candidates',
    path: '/candidates',
    stats: {
      path: '/stats/candidates',
      tiles: [
        { key: 'all', label: 'All', filter: {} },
        { key: 'active', label: 'Active', filter: { status: 'active' } },
        { key: 'pending', label: 'Pending', filter: { status: 'pending' } },
        { key: 'adminReview', label: 'Admin review', filter: { status: 'admin_review' } },
        { key: 'blocked', label: 'Blocked', filter: { status: 'blocked' } },
        { key: 'directRegistered', label: 'Direct registered', filter: { source: 'direct' } },
        { key: 'jobAppliedRegistered', label: 'Registered by job apply', filter: { source: 'job_apply' } },
        { key: 'excelImported', label: 'Excel imported', filter: { source: 'excel_import' } },
        { key: 'jobApplied', label: 'Applied to a job', filter: { jobApplied: 'true' } },
        { key: 'trashed', label: 'Trash', filter: { status: 'trashed' } },
      ],
    },
    downloads: [{ label: 'Resumes (ZIP)', path: '/candidates/export-resumes', selection: true, name: 'candidate-resumes.zip' }],
    rowLink: (r) => `/admin/candidates/${r._id}`,
    columns: [person, two('job', 'Profile', (r) => r.profile?.currentJobTitle || r.profile?.experienceLevel, (r) => [r.profile?.currentLocation?.city, r.uid].filter(Boolean).join(' · ')), { key: 'source', header: 'Source', render: (r) => titleCase(r.source || '') }, status(), date()],
    filters: [{ key: 'status', label: 'Status', options: USER_STATUS }, { key: 'source', label: 'Source', options: opt(['direct', 'excel_import', 'job_apply', 'event_apply', 'job_alert', 'admin', 'google']) }, { key: 'hasResume', label: 'Resume', options: [{ value: 'true', label: 'Has resume' }] }],
    bulk: { path: '/candidates/bulk', actions: USER_BULK, pickers: CANDIDATE_PICKERS, custom: ({ selected, clear }) => <BulkJobAlert candidateIds={selected} onDone={clear} /> },
    editFields: [
      { key: 'user.fullName', from: 'fullName', label: 'Full name' },
      { key: 'user.email', from: 'email', label: 'Email', inputType: 'email' },
      { key: 'user.mobile', from: 'mobile', label: 'Mobile' },
      { key: 'user.status', from: 'status', label: 'Status', type: 'select', options: USER_STATUS },
    ],
    exportPath: '/candidates/export',
    importPath: '/candidates/import',
    importModes: true,
    createFields: [
      { key: 'fullName', label: 'Full name', required: true },
      { key: 'email', label: 'Email', inputType: 'email', required: true },
      { key: 'mobile', label: 'Mobile (10 digits)', required: true },
      { key: 'gender', label: 'Gender', type: 'lookup', lookup: 'gender' },
      { key: 'experienceLevel', label: 'Experience level', type: 'lookup', lookup: 'experience_level' },
      { key: 'password', label: 'Password', inputType: 'password', hint: 'Leave empty to e-mail a set-password link instead' },
      { key: 'sendActivation', label: 'E-mail an activation link', type: 'checkbox', default: true },
    ],
    rowActions: (r) => (
      <>
        <Open to={`/admin/candidates/${r._id}`}>View</Open>
        <LoginAs id={r._id} name={r.fullName} />
      </>
    ),
  },
  employers: {
    title: 'Employers',
    path: '/employers',
    searchPlaceholder: 'Search by company, owner, e-mail, mobile or ID',
    stats: {
      path: '/stats/employers',
      pick: (data, f) => data[f.type === 'company' ? 'companies' : f.type === 'consultancy' ? 'consultancies' : 'employers'],
      tiles: [
        { key: 'all', label: 'All', filter: {} },
        { key: 'active', label: 'Active', filter: { status: 'active' } },
        { key: 'pending', label: 'Pending', filter: { status: 'pending' } },
        { key: 'adminReview', label: 'Admin review', filter: { status: 'admin_review' } },
        { key: 'blocked', label: 'Blocked', filter: { status: 'blocked' } },
        { key: 'directRegistered', label: 'Direct registered', filter: { source: 'direct' } },
        { key: 'jobPostRegistered', label: 'Registered by job post', filter: { source: 'job_post' } },
        { key: 'excelImported', label: 'Excel imported', filter: { source: 'excel_import' } },
        { key: 'trashed', label: 'Trash', filter: { status: 'trashed' } },
      ],
    },
    rowLink: (r) => `/admin/employers/${r._id}`,
    columns: [two('name', 'Employer', (r) => r.name, (r) => r.uid), { key: 'type', header: 'Type', render: (r) => titleCase(r.type || '') }, { key: 'kyc', header: 'KYC', render: (r) => <StatusBadge status={r.kycStatus} /> }, status(), date()],
    filters: [{ key: 'type', label: 'Type', options: opt(['company', 'consultancy']) }, { key: 'status', label: 'Status', options: USER_STATUS }, { key: 'kycStatus', label: 'KYC', options: opt(['not_submitted', 'under_review', 'verified', 'rejected', 'resubmission_required']) }],
    bulk: { path: '/employers/bulk', actions: USER_BULK, pickers: EMPLOYER_PICKERS },
    editFields: [
      { key: 'name', label: 'Name' },
      { key: 'website', label: 'Website', inputType: 'url' },
      { key: 'status', label: 'Status', type: 'select', options: USER_STATUS },
      { key: 'maxMembers', label: 'Max team members', type: 'number' },
      { key: 'note', label: 'Admin note', type: 'textarea' },
    ],
    exportPath: '/employers/export',
    importPath: '/employers/import',
    createFields: [
      { key: 'employerType', label: 'Employer', type: 'select', required: true, options: opt(['company', 'consultancy']) },
      { key: 'organizationName', label: 'Company / consultancy name', required: true },
      { key: 'website', label: 'Website', inputType: 'url' },
      { key: 'fullName', label: 'Owner full name', required: true },
      { key: 'email', label: 'Owner e-mail', inputType: 'email', required: true },
      { key: 'mobile', label: 'Owner mobile (10 digits)', required: true },
      { key: 'password', label: 'Password', inputType: 'password', hint: 'Leave empty to e-mail a set-password link instead' },
      { key: 'status', label: 'Status', type: 'select', options: opt(['active', 'pending']), default: 'active' },
      { key: 'sendActivation', label: 'E-mail an activation link', type: 'checkbox', default: true },
    ],
    rowActions: (r) => <Open to={`/admin/employers/${r._id}`}>View</Open>,
  },
  jobs: {
    title: 'Jobs',
    path: '/jobs',
    searchPlaceholder: 'Search by job title, employer, client or job ID',
    stats: {
      path: '/stats/jobs',
      tiles: [
        { key: 'all', label: 'All', filter: {} },
        { key: 'active', label: 'Active', filter: { status: 'active' } },
        { key: 'pending', label: 'Pending', filter: { status: 'pending' } },
        { key: 'adminReview', label: 'Admin review', filter: { status: 'admin_review' } },
        { key: 'draft', label: 'Drafts', filter: { status: 'draft' } },
        { key: 'expired', label: 'Expired', filter: { status: 'expired' } },
        { key: 'closed', label: 'Closed', filter: { status: 'closed' } },
        { key: 'rejected', label: 'Rejected', filter: { status: 'rejected' } },
        { key: 'excelImported', label: 'Excel imported', filter: { source: 'excel_import' } },
        { key: 'trashed', label: 'Trash', filter: { status: 'trashed' } },
      ],
    },
    rowLink: (r) => `/admin/jobs/${r._id}/edit`,
    columns: [two('title', 'Job', (r) => r.title, (r) => r.orgSnapshot?.name), { key: 'location', header: 'Location', render: (r) => formatLocations(r) }, { key: 'kind', header: 'Kind', render: (r) => titleCase(r.kind) }, { key: 'apps', header: 'Applications', render: (r) => r.stats?.applications || 0 }, status(), date()],
    filters: [{ key: 'status', label: 'Status', options: opt(['draft', 'pending', 'admin_review', 'active', 'closed', 'expired', 'rejected', 'trashed']) }, { key: 'kind', label: 'Kind', options: opt(['job', 'internship']) }, { key: 'organizationType', label: 'Posted by', options: [{ value: 'company', label: 'Companies' }, { value: 'consultancy', label: 'Consultancies' }] }],
    bulk: { path: '/jobs/bulk', actions: JOB_BULK, pickers: JOB_PICKERS },
    headerActions: (
      <Button asChild size="sm" variant="primary">
        <Link to="/admin/jobs/post">Post job / internship</Link>
      </Button>
    ),
    editFields: [
      { key: 'title', label: 'Title' },
      { key: 'status', label: 'Status', type: 'select', options: opt(['draft', 'pending', 'admin_review', 'active', 'closed', 'expired', 'rejected']) },
      { key: 'statusReason', label: 'Status reason' },
      { key: 'deadlineAt', label: 'Deadline', type: 'datetime' },
      { key: 'expiresAt', label: 'Expires', type: 'datetime' },
    ],
    exportPath: '/jobs/export',
    editLabel: 'Status',
    rowActions: (r) => (
      <>
        <Open to={`/admin/jobs/${r._id}/edit`}>Edit</Open>
        <WithModal label="Invite / assign" render={(close) => <JobCandidates job={r} onClose={close} />} />
        <Button asChild size="sm" variant="ghost">
          <Link to={`/jobs/${r.slug}`} target="_blank" rel="noopener noreferrer" aria-label={`Open the public page of ${r.title}`} title="Open public page">
            <Icon name="open_in_new" size={16} />
          </Link>
        </Button>
      </>
    ),
  },
  responses: {
    title: 'Applications',
    subtitle: 'Every job and internship response across employers',
    path: '/responses',
    columns: [two('name', 'Candidate', (r) => r.snapshot?.fullName, (r) => r.snapshot?.email), { key: 'job', header: 'Job', render: (r) => r.job?.title }, { key: 'stage', header: 'Stage', render: (r) => <StatusBadge status={r.stage} /> }, date('createdAt', 'Applied')],
    rowLink: (r) => `/admin/candidates/${r.candidate?._id || r.candidate}`,
    filters: [
      { key: 'stage', label: 'Stage', options: opt(['applied', 'screened', 'interview_scheduled', 'offered', 'hired', 'rejected', 'withdrawn']) },
      { key: 'view', label: 'Responses', options: [{ value: 'new', label: 'New responses' }, { value: 'pending', label: 'Action pending' }, { value: 'viewed', label: 'Viewed' }] },
      { key: 'screeningStatus', label: 'Screening', options: [{ value: 'shortlisted', label: 'Shortlisted' }, { value: 'maybe_relevant', label: 'Maybe relevant' }, { value: 'maybe_shortlist', label: 'Maybe shortlist' }, { value: 'rejected', label: 'Rejected' }, { value: 'on_hold', label: 'On hold' }, { value: 'not_interested', label: 'Not interested' }] },
      { key: 'kind', label: 'Category', options: [{ value: 'job', label: 'Job vacancy' }, { value: 'internship', label: 'Internship' }] },
      { key: 'source', label: 'Source', options: [{ value: 'direct', label: 'Direct apply' }, { value: 'without_login', label: 'Applied without login' }, { value: 'invite', label: 'Invite response' }, { value: 'job_alert', label: 'Job alert' }, { value: 'event', label: 'Job event' }, { value: 'recommendation', label: 'Recommendation' }, { value: 'admin_assign', label: 'Assigned by admin' }] },
    ],
    search: true,
    editFields: [
      { key: 'stage', label: 'Stage', type: 'select', options: opt(['applied', 'screened', 'interview_scheduled', 'offered', 'hired', 'rejected']) },
      { key: 'screeningStatus', label: 'Screening status', type: 'select', options: opt(['shortlisted', 'maybe_shortlist', 'rejected', 'on_hold', 'consider_other_role', 'not_interested', 'future_requirement', 'maybe_relevant']) },
      { key: 'callingStatus', label: 'Calling status', type: 'select', options: opt(['call_done', 'not_picked', 'not_reachable', 'switched_off', 'call_cut']) },
      { key: 'comment', label: 'Add a comment', type: 'textarea', rows: 3 },
    ],
    exportPath: '/responses/export',
    downloads: [{ label: 'Resumes (ZIP)', path: '/responses/export-resumes', name: 'application-resumes.zip' }],
    searchPlaceholder: 'Search by candidate name, e-mail or mobile',
  },

  'job-alerts': {
    title: 'Job Alerts',
    path: '/job-alerts',
    columns: [two('name', 'Alert', (r) => r.name, (r) => r.email), { key: 'frequency', header: 'Frequency', render: (r) => titleCase(r.frequency) }, { key: 'active', header: 'State', render: (r) => (r.status === 'trashed' ? <StatusBadge status="trashed" label="Deleted" /> : <Badge tone={r.isActive ? 'green' : 'gray'}>{r.isActive ? 'Active' : 'Stopped'}</Badge>) }, date()],
    tabs: { key: 'status', options: [{ value: '', label: 'All' }, ...opt(['active', 'paused']), { value: 'trashed', label: 'Trash' }] },
    filters: [{ key: 'frequency', label: 'Frequency', options: opt(['daily', 'weekly', 'monthly']) }],
    bulk: { path: '/job-alerts/bulk', actions: [{ action: 'start', label: 'Start' }, { action: 'stop', label: 'Stop' }, { action: 'trash', label: 'Trash', danger: true }] },
    exportPath: '/job-alerts/export',
    importPath: '/job-alerts/import',
    rowActions: (r) => <AlertJobs alert={r} />,
    editFields: [
      { key: 'name', label: 'Name' },
      { key: 'frequency', label: 'Frequency', type: 'select', options: opt(['daily', 'weekly', 'monthly']) },
      { key: 'isActive', label: 'Active', type: 'checkbox' },
    ],
  },
  moderation: {
    title: 'Reports',
    path: '/moderation/reports',
    columns: [{ key: 'target', header: 'Target', render: (r) => titleCase(r.targetType) }, { key: 'reason', header: 'Reason', render: (r) => titleCase(r.reason) }, { key: 'details', header: 'Details', render: (r) => <span className="line-clamp-2 max-w-sm">{r.details || '—'}</span> }, status(), date()],
    tabs: { key: 'status', options: [{ value: '', label: 'All' }, ...opt(['open', 'in_review', 'resolved', 'dismissed'])] },
    filters: [{ key: 'targetType', label: 'Target', options: opt(['job', 'organization', 'candidate']) }],
    search: false,
    exportPath: '/moderation/reports/export',
    editFields: [{ key: 'status', label: 'Status', type: 'select', options: opt(['open', 'in_review', 'resolved', 'dismissed']) }, { key: 'adminNotes', label: 'Admin notes', type: 'textarea' }],
  },
  comments: {
    title: 'Comments',
    path: '/moderation/comments',
    columns: [{ key: 'body', header: 'Comment', render: (r) => <span className="line-clamp-2 max-w-md">{r.body}</span> }, { key: 'rating', header: 'Rating', render: (r) => r.rating || '—' }, status(), date()],
    tabs: { key: 'status', options: [{ value: '', label: 'All' }, ...opt(['pending', 'approved', 'spam', 'trashed'])] },
    search: false,
    rowActions: (r, h) => (
      <>
        {['approved', 'spam'].map((s) => (
          <Button
            key={s}
            size="sm"
            variant="ghost"
            onClick={async () => {
              await adminApi.post('/moderation/comments/moderate', { ids: [r._id], status: s }).catch((e) => toast.error(e.message));
              h.refresh();
            }}
          >
            {titleCase(s)}
          </Button>
        ))}
      </>
    ),
  },
  blocklist: {
    title: 'Blocklist',
    path: '/moderation/blocklist',
    columns: [{ key: 'type', header: 'Type', render: (r) => titleCase(r.type) }, { key: 'value', header: 'Value' }, { key: 'reason', header: 'Reason', render: (r) => r.reason || '—' }, date()],
    filters: [{ key: 'type', label: 'Type', options: opt(['email', 'mobile', 'name', 'gst', 'country', 'url', 'domain', 'ip']) }],
    search: false,
    timespan: false,
    remove: true,
  },
  plans: { title: 'Plans', path: '/billing/plans', search: false, timespan: false, columns: [two('name', 'Plan', (r) => r.name, (r) => r.code), { key: 'audience', header: 'Audience', render: (r) => titleCase(r.audience) }, { key: 'price', header: 'Price', render: (r) => formatCurrency(r.price) }, { key: 'days', header: 'Days', render: (r) => r.durationDays }, { key: 'active', header: 'State', render: (r) => <Badge tone={r.isActive ? 'green' : 'gray'}>{r.isActive ? 'Active' : 'Inactive'}</Badge> }], createFields: plansFields, editFields: plansFields, remove: true },
  coupons: { title: 'Coupons', path: '/billing/coupons', search: false, timespan: false, columns: [{ key: 'code', header: 'Code' }, { key: 'value', header: 'Value', render: (r) => (r.type === 'percent' ? `${r.value}%` : formatCurrency(r.value)) }, date('validTo', 'Valid to'), { key: 'used', header: 'Used', render: (r) => r.usedCount ?? 0 }], createFields: couponFields, editFields: couponFields, remove: true },
  orders: {
    title: 'Orders',
    path: '/billing/orders',
    columns: [{ key: 'orderNumber', header: 'Order' }, { key: 'plan', header: 'Item', render: (r) => r.planName || '—' }, { key: 'buyer', header: 'Buyer', render: (r) => r.organization?.name || r.buyer?.fullName || '—' }, { key: 'total', header: 'Total', render: (r) => formatCurrency(r.total ?? r.amount) }, status(), date()],
    filters: [{ key: 'status', label: 'Status', options: opt(['created', 'paid', 'failed', 'cancelled', 'refunded']) }],
    exportPath: '/billing/orders/export',
    rowActions: (r, h) => (
      <>
        <OrderInvoice order={r} />
        <OrderStatus order={r} refresh={h.refresh} />
      </>
    ),
  },
  wallet: {
    title: 'Wallet Transactions',
    subtitle: 'Top-ups, plan payments, refunds and admin adjustments',
    path: '/billing/wallet/transactions',
    search: false,
    columns: [
      two('owner', 'Account', (r) => r.wallet?.organization?.name || r.wallet?.user?.fullName, (r) => r.wallet?.organization?.uid || r.wallet?.user?.email),
      { key: 'reason', header: 'Reason', render: (r) => titleCase(r.reason || '') },
      { key: 'amount', header: 'Amount', render: (r) => <span className={r.type === 'credit' ? 'font-semibold text-brand-green' : 'font-semibold text-brand-red'}>{r.type === 'credit' ? '+' : '-'}{formatCurrency(r.amount)}</span> },
      { key: 'balance', header: 'Balance after', render: (r) => formatCurrency(r.balanceAfter ?? 0) },
      { key: 'ref', header: 'Reference', render: (r) => r.order?.orderNumber || r.note || (r.by?.fullName ? `By ${r.by.fullName}` : '—') },
      stamp(),
    ],
    filters: [{ key: 'type', label: 'Type', options: opt(['credit', 'debit']) }, { key: 'reason', label: 'Reason', options: opt(['topup', 'purchase', 'refund', 'referral_reward', 'admin_adjustment', 'auto_renew']) }],
  },
  subscriptions: { title: 'Subscriptions', path: '/billing/subscriptions', search: false, columns: [{ key: 'plan', header: 'Plan', render: (r) => r.planSnapshot?.name || r.plan?.name || '—' }, status(), date('startsAt', 'Starts'), date('endsAt', 'Ends')] },
  'sales-leads': {
    title: 'Sales Leads',
    path: '/leads',
    columns: [two('name', 'Lead', (r) => r.fullName, (r) => r.workEmail), { key: 'company', header: 'Company', render: (r) => r.companyName }, { key: 'mobile', header: 'Mobile' }, status(), date()],
    filters: [{ key: 'status', label: 'Status', options: opt(['new', 'contacted', 'qualified', 'converted', 'lost']) }],
    exportPath: '/leads/export',
    editFields: [{ key: 'status', label: 'Status', type: 'select', options: opt(['new', 'contacted', 'qualified', 'converted', 'lost']) }, { key: 'note', label: 'Note', type: 'textarea' }],
  },
  cms: { title: 'Pages', path: '/cms/pages', columns: [{ key: 'title', header: 'Title' }, { key: 'slug', header: 'Slug' }, status(), date('updatedAt', 'Updated')], createLink: '/admin/cms/new', rowLink: (r) => `/admin/cms/${r._id}/edit`, remove: true },
  'career-advice': { title: 'Blogs', path: '/cms/blogs', columns: [{ key: 'title', header: 'Title' }, { key: 'category', header: 'Category', render: (r) => r.category || '—' }, status(), date('publishedAt', 'Published')], createLink: '/admin/career-advice/new', rowLink: (r) => `/admin/career-advice/${r._id}/edit`, remove: true },
  faqs: { title: 'FAQs', path: '/cms/faqs', columns: [{ key: 'question', header: 'Question' }, { key: 'audience', header: 'Audience', render: (r) => titleCase(r.audience || 'all') }], createFields: faqFields, editFields: faqFields, remove: true },
  ads: { title: 'Ads', path: '/cms/ads', columns: [{ key: 'name', header: 'Name' }, { key: 'placement', header: 'Placement' }, { key: 'type', header: 'Type' }, { key: 'active', header: 'State', render: (r) => <Badge tone={r.isActive ? 'green' : 'gray'}>{r.isActive ? 'Active' : 'Inactive'}</Badge> }], createFields: adFields, editFields: adFields, remove: true },
  contacts: {
    title: 'Contact Forms',
    path: '/cms/contacts',
    columns: [two('name', 'From', (r) => r.name, (r) => r.email), { key: 'subject', header: 'Subject', render: (r) => r.subject || '—' }, { key: 'message', header: 'Message', render: (r) => <span className="line-clamp-2 max-w-sm">{r.message}</span> }, status(), date()],
    filters: [{ key: 'type', label: 'Type', options: opt(['contact_us', 'employer_contact']) }],
    search: false,
    editFields: [{ key: 'status', label: 'Status', type: 'select', options: opt(['new', 'open', 'resolved', 'closed']) }],
  },
  'email-center': { title: 'Email Templates', path: '/cms/email-templates', columns: [{ key: 'name', header: 'Name' }, { key: 'subject', header: 'Subject' }, date('updatedAt', 'Updated')], createFields: templateFields, editFields: templateFields, remove: true, rowActions: (r) => <WithModal label="Send" render={(close) => <SendTemplate template={r} onClose={close} />} /> },
  locations: { title: 'Locations', path: '/locations', timespan: false, columns: [{ key: 'city', header: 'City' }, { key: 'locality', header: 'Locality', render: (r) => r.locality || '—' }, { key: 'state', header: 'State' }, { key: 'popular', header: 'Popular', render: (r) => (r.isPopular ? 'Yes' : 'No') }], createFields: locationFields, editFields: locationFields, remove: true, exportPath: '/locations/export', importPath: '/locations/import' },
  users: {
    title: 'Users',
    path: '/users',
    columns: [person, { key: 'role', header: 'Role', render: (r) => titleCase(r.role) }, { key: 'org', header: 'Organization', render: (r) => r.employer?.organization?.name || '—' }, status(), date('lastLoginAt', 'Last login')],
    filters: [{ key: 'role', label: 'Role', options: opt(['candidate', 'employer', 'admin', 'super_admin']) }, { key: 'status', label: 'Status', options: USER_STATUS }],
    bulk: { path: '/users/bulk', actions: USER_BULK },
    rowActions: (r) => <LoginAs id={r._id} name={r.fullName} />,
  },
  roles: { title: 'Admins', path: '/admins', search: false, timespan: false, columns: [person, { key: 'role', header: 'Role', render: (r) => titleCase(r.role) }, status(), date('lastLoginAt', 'Last login')], createFields: adminFields, editFields: [{ key: 'fullName', label: 'Full name' }, { key: 'role', label: 'Role', type: 'select', options: opt(['admin', 'super_admin']) }, { key: 'status', label: 'Status', type: 'select', options: opt(['active', 'suspended', 'blocked']) }, { key: 'permissions', from: 'admin.permissions', label: 'Permissions (none selected = full access)', type: 'multi', options: ADMIN_PERMISSION_OPTIONS }, { key: 'password', label: 'New password', inputType: 'password', hint: 'Leave empty to keep the current password' }] },
  'login-audit': { title: 'Login Audit', path: '/login-attempts', columns: [{ key: 'identifier', header: 'Identifier', render: (r) => r.identifier || '—' }, { key: 'role', header: 'Role', render: (r) => titleCase(r.role || 'unknown') }, { key: 'success', header: 'Result', render: (r) => <Badge tone={r.success ? 'green' : 'red'}>{r.success ? 'Success' : 'Failed'}</Badge> }, { key: 'ip', header: 'IP', render: (r) => r.ip || '—' }, stamp()], filters: [{ key: 'success', label: 'Result', options: [{ value: 'true', label: 'Success' }, { value: 'false', label: 'Failed' }] }] },
  'message-logs': { title: 'E-mail Logs', path: '/email-logs', columns: [{ key: 'to', header: 'To', render: (r) => (Array.isArray(r.to) ? r.to.join(', ') : r.to) }, { key: 'subject', header: 'Subject', render: (r) => r.subject || r.template }, { key: 'category', header: 'Category', render: (r) => titleCase(r.category || '') }, status(), stamp()], filters: [{ key: 'status', label: 'Status', options: opt(['queued', 'sent', 'delivered', 'opened', 'bounced', 'failed']) }] },
  'sms-logs': { title: 'SMS & WhatsApp Logs', path: '/message-logs', columns: [{ key: 'channel', header: 'Channel', render: (r) => titleCase(r.channel) }, { key: 'to', header: 'To' }, { key: 'template', header: 'Template', render: (r) => r.template || '—' }, status(), { key: 'error', header: 'Details', render: (r) => <span className="line-clamp-2 max-w-xs text-xs text-brand-gray" title={r.error || ''}>{r.error || (r.route === 'otp_api' ? 'Unified OTP API' : r.providerId ? `Request ${r.providerId}` : '—')}</span> }, stamp()], filters: [{ key: 'channel', label: 'Channel', options: opt(['sms', 'whatsapp', 'push', 'arattai']) }, { key: 'status', label: 'Status', options: opt(['queued', 'sent', 'failed', 'skipped']) }] },
  security: { title: 'Audit Trail', path: '/audit-logs', search: false, columns: [{ key: 'action', header: 'Action' }, { key: 'entity', header: 'Entity', render: (r) => r.entity || '—' }, { key: 'actor', header: 'Actor', render: (r) => r.actor?.fullName || '—' }, { key: 'ip', header: 'IP', render: (r) => r.ip || '—' }, stamp()] },
};
