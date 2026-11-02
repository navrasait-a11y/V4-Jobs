import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import Button from '../../components/ui/Button';
import { Badge, StatusBadge } from '../../components/ui/data';
import { AlertSendJobs, JobCandidates, SendTemplate } from '../../components/admin/AdminActions';
import InvoiceViewer from '../../components/shared/InvoiceViewer';
import { adminApi } from '../../services';
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
const USER_STATUS = opt(['active', 'pending', 'admin_review', 'blocked', 'suspended', 'trashed']);

const impersonate = async (id) => {
  try {
    const data = await adminApi.post(`/users/${id}/impersonate`);
    window.open(`/impersonate#${encodeURIComponent(data.tokens.accessToken)}`, '_blank', 'noopener');
  } catch (e) {
    toast.error(e.message);
  }
};

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

const LoginAs = ({ id }) => (
  <Button size="sm" variant="ghost" onClick={() => impersonate(id)}>
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
  { key: 'tier', label: 'Tier', type: 'select', required: true, options: opt(['free', 'starter', 'professional', 'enterprise', 'booster', 'custom']) },
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
const pageFields = [
  { key: 'slug', label: 'Slug', required: true },
  { key: 'title', label: 'Title', required: true },
  { key: 'content', label: 'Content (HTML)', type: 'html', required: true },
  { key: 'status', label: 'Status', type: 'select', options: opt(['draft', 'published']) },
];
const blogFields = [
  { key: 'title', label: 'Title', required: true },
  { key: 'excerpt', label: 'Excerpt', type: 'textarea' },
  { key: 'content', label: 'Content (HTML)', type: 'html', required: true },
  { key: 'category', label: 'Category' },
  { key: 'tags', label: 'Tags', type: 'list' },
  { key: 'status', label: 'Status', type: 'select', options: opt(['draft', 'published']) },
  { key: 'isFeatured', label: 'Featured', type: 'checkbox' },
];
const faqFields = [
  { key: 'question', label: 'Question', required: true },
  { key: 'answer', label: 'Answer', type: 'textarea', required: true },
  { key: 'category', label: 'Category' },
  { key: 'audience', label: 'Audience', type: 'select', options: opt(['candidate', 'employer']) },
  { key: 'order', label: 'Order', type: 'number' },
  { key: 'isActive', label: 'Active', type: 'checkbox', default: true },
];
const adFields = [
  { key: 'name', label: 'Name', required: true },
  { key: 'placement', label: 'Placement', required: true, hint: 'For example home_top or jobs_list' },
  { key: 'type', label: 'Type', type: 'select', required: true, options: opt(['banner', 'adsense', 'admob', 'html']) },
  { key: 'image.url', label: 'Image URL', inputType: 'url' },
  { key: 'link', label: 'Link', inputType: 'url' },
  { key: 'adUnitId', label: 'Ad unit id' },
  { key: 'priority', label: 'Priority', type: 'number' },
  { key: 'startAt', label: 'Starts', type: 'datetime' },
  { key: 'endAt', label: 'Ends', type: 'datetime' },
  { key: 'isActive', label: 'Active', type: 'checkbox', default: true },
];
const templateFields = [
  { key: 'name', label: 'Name', required: true },
  { key: 'subject', label: 'Subject', required: true },
  { key: 'html', label: 'HTML', type: 'html', required: true },
  { key: 'category', label: 'Category' },
];
const locationFields = [
  { key: 'locality', label: 'Locality' },
  { key: 'district', label: 'District' },
  { key: 'city', label: 'City', required: true },
  { key: 'state', label: 'State', required: true },
  { key: 'country', label: 'Country', default: 'India' },
  { key: 'pincode', label: 'Pincode' },
  { key: 'isPopular', label: 'Popular', type: 'checkbox' },
];
const adminFields = [
  { key: 'fullName', label: 'Full name', required: true },
  { key: 'email', label: 'Email', inputType: 'email', required: true },
  { key: 'password', label: 'Password', inputType: 'password', required: true },
  { key: 'role', label: 'Role', type: 'select', options: opt(['admin', 'super_admin']) },
  { key: 'permissions', label: 'Permissions', type: 'list', hint: 'Comma separated keys. Empty means full access.' },
];

export const MODULES = {
  candidates: {
    title: 'Candidates',
    path: '/candidates',
    columns: [person, two('job', 'Current', (r) => r.profile?.currentJobTitle || r.currentJobTitle, (r) => r.uid), { key: 'source', header: 'Source', render: (r) => titleCase(r.source || '') }, status(), date()],
    filters: [{ key: 'status', label: 'Status', options: USER_STATUS }, { key: 'source', label: 'Source', options: opt(['direct', 'excel_import', 'job_apply', 'event_apply', 'job_alert', 'admin', 'google']) }, { key: 'hasResume', label: 'Resume', options: [{ value: 'true', label: 'Has resume' }] }],
    bulk: { path: '/candidates/bulk', actions: USER_BULK },
    editFields: [
      { key: 'user.fullName', from: 'fullName', label: 'Full name' },
      { key: 'user.email', from: 'email', label: 'Email', inputType: 'email' },
      { key: 'user.mobile', from: 'mobile', label: 'Mobile' },
      { key: 'user.status', from: 'status', label: 'Status', type: 'select', options: USER_STATUS },
    ],
    exportPath: '/candidates/export',
    importPath: '/candidates/import',
    createFields: [{ key: 'fullName', label: 'Full name', required: true }, { key: 'email', label: 'Email', inputType: 'email', required: true }, { key: 'mobile', label: 'Mobile', required: true }],
    rowActions: (r) => (
      <>
        <Open to={`/admin/candidates/${r._id}`}>View</Open>
        <LoginAs id={r._id} />
      </>
    ),
  },
  employers: {
    title: 'Employers',
    path: '/employers',
    columns: [two('name', 'Employer', (r) => r.name, (r) => r.uid), { key: 'type', header: 'Type', render: (r) => titleCase(r.type || '') }, { key: 'kyc', header: 'KYC', render: (r) => <StatusBadge status={r.kycStatus} /> }, status(), date()],
    filters: [{ key: 'type', label: 'Type', options: opt(['company', 'consultancy']) }, { key: 'status', label: 'Status', options: USER_STATUS }, { key: 'kycStatus', label: 'KYC', options: opt(['not_submitted', 'under_review', 'verified', 'rejected', 'resubmission_required']) }],
    bulk: { path: '/employers/bulk', actions: USER_BULK },
    editFields: [
      { key: 'name', label: 'Name' },
      { key: 'website', label: 'Website', inputType: 'url' },
      { key: 'status', label: 'Status', type: 'select', options: USER_STATUS },
      { key: 'maxMembers', label: 'Max team members', type: 'number' },
      { key: 'note', label: 'Admin note', type: 'textarea' },
    ],
    exportPath: '/employers/export',
    importPath: '/employers/import',
    createFields: [{ key: 'employerType', label: 'Type', type: 'select', required: true, options: opt(['company', 'consultancy']) }, { key: 'organizationName', label: 'Organization', required: true }, { key: 'fullName', label: 'Owner name', required: true }, { key: 'email', label: 'Email', inputType: 'email', required: true }, { key: 'mobile', label: 'Mobile', required: true }, { key: 'sendActivation', label: 'Send activation e-mail', type: 'checkbox', default: true }],
    rowActions: (r) => <Open to={`/admin/employers/${r._id}`}>View</Open>,
  },
  jobs: {
    title: 'Jobs',
    path: '/jobs',
    columns: [two('title', 'Job', (r) => r.title, (r) => r.orgSnapshot?.name), { key: 'location', header: 'Location', render: (r) => formatLocations(r) }, { key: 'kind', header: 'Kind', render: (r) => titleCase(r.kind) }, { key: 'apps', header: 'Applications', render: (r) => r.stats?.applications || 0 }, status(), date()],
    filters: [{ key: 'status', label: 'Status', options: opt(['draft', 'pending', 'admin_review', 'active', 'closed', 'expired', 'rejected', 'trashed']) }, { key: 'kind', label: 'Kind', options: opt(['job', 'internship']) }],
    bulk: { path: '/jobs/bulk', actions: JOB_BULK },
    editFields: [
      { key: 'title', label: 'Title' },
      { key: 'status', label: 'Status', type: 'select', options: opt(['draft', 'pending', 'admin_review', 'active', 'closed', 'expired', 'rejected']) },
      { key: 'statusReason', label: 'Status reason' },
      { key: 'deadlineAt', label: 'Deadline', type: 'datetime' },
      { key: 'expiresAt', label: 'Expires', type: 'datetime' },
    ],
    exportPath: '/jobs/export',
    rowActions: (r) => (
      <>
        <Link to={`/jobs/${r.slug}`} target="_blank" className="px-2 text-xs font-semibold text-brand-blue">
          View
        </Link>
        <WithModal label="Candidates" render={(close) => <JobCandidates job={r} onClose={close} />} />
      </>
    ),
  },
  responses: {
    title: 'Applications',
    path: '/responses',
    columns: [two('name', 'Candidate', (r) => r.snapshot?.fullName, (r) => r.snapshot?.email), { key: 'job', header: 'Job', render: (r) => r.job?.title }, { key: 'stage', header: 'Stage', render: (r) => <StatusBadge status={r.stage} /> }, date('createdAt', 'Applied')],
    filters: [{ key: 'stage', label: 'Stage', options: opt(['applied', 'screened', 'interview_scheduled', 'offered', 'hired', 'rejected', 'withdrawn']) }, { key: 'view', label: 'View', options: opt(['new', 'pending', 'viewed']) }],
    search: false,
    exportPath: '/responses/export',
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
    columns: [{ key: 'orderNumber', header: 'Order' }, { key: 'plan', header: 'Plan', render: (r) => r.planSnapshot?.name || '—' }, { key: 'total', header: 'Total', render: (r) => formatCurrency(r.total ?? r.amount) }, status(), date()],
    filters: [{ key: 'status', label: 'Status', options: opt(['created', 'paid', 'failed', 'cancelled', 'refunded']) }],
    exportPath: '/billing/orders/export',
    rowActions: (r, h) => (
      <>
        <OrderInvoice order={r} />
        <OrderStatus order={r} refresh={h.refresh} />
      </>
    ),
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
  cms: { title: 'Pages', path: '/cms/pages', columns: [{ key: 'title', header: 'Title' }, { key: 'slug', header: 'Slug' }, status(), date('updatedAt', 'Updated')], createFields: pageFields, editFields: pageFields, remove: true },
  'career-advice': { title: 'Blogs', path: '/cms/blogs', columns: [{ key: 'title', header: 'Title' }, { key: 'category', header: 'Category', render: (r) => r.category || '—' }, status(), date('publishedAt', 'Published')], createFields: blogFields, editFields: blogFields, remove: true },
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
    rowActions: (r) => <LoginAs id={r._id} />,
  },
  roles: { title: 'Admins', path: '/admins', search: false, timespan: false, columns: [person, { key: 'role', header: 'Role', render: (r) => titleCase(r.role) }, status(), date('lastLoginAt', 'Last login')], createFields: adminFields, editFields: [{ key: 'fullName', label: 'Full name' }, { key: 'role', label: 'Role', type: 'select', options: opt(['admin', 'super_admin']) }, { key: 'status', label: 'Status', type: 'select', options: opt(['active', 'suspended', 'blocked']) }, { key: 'admin.permissions', label: 'Permissions', type: 'list' }] },
  'login-audit': { title: 'Login Audit', path: '/login-attempts', columns: [{ key: 'identifier', header: 'Identifier', render: (r) => r.identifier || '—' }, { key: 'role', header: 'Role', render: (r) => titleCase(r.role || 'unknown') }, { key: 'success', header: 'Result', render: (r) => <Badge tone={r.success ? 'green' : 'red'}>{r.success ? 'Success' : 'Failed'}</Badge> }, { key: 'ip', header: 'IP', render: (r) => r.ip || '—' }, stamp()], filters: [{ key: 'success', label: 'Result', options: [{ value: 'true', label: 'Success' }, { value: 'false', label: 'Failed' }] }] },
  'message-logs': { title: 'E-mail Logs', path: '/email-logs', columns: [{ key: 'to', header: 'To', render: (r) => (Array.isArray(r.to) ? r.to.join(', ') : r.to) }, { key: 'subject', header: 'Subject', render: (r) => r.subject || r.template }, { key: 'category', header: 'Category', render: (r) => titleCase(r.category || '') }, status(), stamp()], filters: [{ key: 'status', label: 'Status', options: opt(['queued', 'sent', 'delivered', 'opened', 'bounced', 'failed']) }] },
  'sms-logs': { title: 'SMS & WhatsApp Logs', path: '/message-logs', columns: [{ key: 'channel', header: 'Channel', render: (r) => titleCase(r.channel) }, { key: 'to', header: 'To' }, { key: 'template', header: 'Template', render: (r) => r.template || '—' }, status(), stamp()], filters: [{ key: 'channel', label: 'Channel', options: opt(['sms', 'whatsapp', 'push', 'arattai']) }, { key: 'status', label: 'Status', options: opt(['queued', 'sent', 'failed']) }] },
  security: { title: 'Audit Trail', path: '/audit-logs', search: false, columns: [{ key: 'action', header: 'Action' }, { key: 'entity', header: 'Entity', render: (r) => r.entity || '—' }, { key: 'actor', header: 'Actor', render: (r) => r.actor?.fullName || '—' }, { key: 'ip', header: 'IP', render: (r) => r.ip || '—' }, stamp()] },
};
