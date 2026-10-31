/**
 * Domain-wide constants. Values that the business wants to edit at runtime
 * (industries, skills, degrees ...) live in the Lookup collection instead.
 */

export const ROLES = Object.freeze({
  CANDIDATE: 'candidate',
  EMPLOYER: 'employer',
  ADMIN: 'admin',
  SUPER_ADMIN: 'super_admin',
});
export const ADMIN_ROLES = [ROLES.ADMIN, ROLES.SUPER_ADMIN];

export const USER_STATUS = Object.freeze({
  PENDING: 'pending',
  ACTIVE: 'active',
  ADMIN_REVIEW: 'admin_review',
  SUSPENDED: 'suspended',
  BLOCKED: 'blocked',
  DEACTIVATED: 'deactivated',
  TRASHED: 'trashed',
});

export const USER_SOURCE = ['direct', 'excel_import', 'job_apply', 'job_post', 'event_apply', 'job_alert', 'admin', 'google'];

export const EMPLOYER_TYPE = Object.freeze({ COMPANY: 'company', CONSULTANCY: 'consultancy' });

export const ID_PREFIX = Object.freeze({
  company: 'COMP',
  consultancy: 'CONS',
  job: 'JOBS',
  internship: 'INTE',
  candidate: 'CAND',
  invoice: 'INV',
  order: 'ORD',
  event: 'EVNT',
});

export const EMPLOYER_MEMBER_ROLES = ['employer_admin', 'manager', 'team_lead', 'recruiter'];

/** Granular employer team permissions (Excel: "Account Member Permissions"). */
export const EMPLOYER_PERMISSIONS = Object.freeze([
  'job.post',
  'job.manage_all',
  'job.manage_own',
  'job.share_internal',
  'response.manage_all',
  'response.manage_own',
  'response.export_all',
  'response.export_own',
  'resume.bulk_download',
  'data.bulk_excel_download',
  'candidate.search',
  'candidate.invite',
  'email.own_only',
  'saved_candidates.manage_all',
  'saved_candidates.manage_own',
  'saved_candidates.share',
  'saved_search.manage_all',
  'saved_search.manage_own',
  'saved_search.share',
  'folder.manage_all',
  'folder.manage_own',
  'meeting.manage_all',
  'meeting.manage_own',
  'team.manage',
  'quota.manage',
  'billing.manage',
  'company.manage',
  'event.manage',
]);

export const DEFAULT_MEMBER_PERMISSIONS = Object.freeze({
  employer_admin: EMPLOYER_PERMISSIONS,
  manager: EMPLOYER_PERMISSIONS.filter((p) => !['team.manage', 'billing.manage', 'quota.manage'].includes(p)),
  team_lead: [
    'job.post',
    'job.manage_all',
    'job.share_internal',
    'response.manage_all',
    'response.export_own',
    'candidate.search',
    'candidate.invite',
    'saved_candidates.manage_all',
    'saved_candidates.share',
    'saved_search.manage_all',
    'saved_search.share',
    'folder.manage_all',
    'meeting.manage_all',
    'event.manage',
  ],
  recruiter: [
    'job.post',
    'job.manage_own',
    'response.manage_own',
    'response.export_own',
    'candidate.search',
    'candidate.invite',
    'email.own_only',
    'saved_candidates.manage_own',
    'saved_search.manage_own',
    'folder.manage_own',
    'meeting.manage_own',
  ],
});

/** Metered actions for credits (organisation level) and quotas (member level). */
export const USAGE_METRICS = Object.freeze(['job_post', 'resume_view', 'resume_download', 'invite', 'excel_download', 'resume_search', 'hiring']);
export const QUOTA_PERIODS = ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'];
export const MAX_EMPLOYER_MEMBERS = 50;

export const ADMIN_PERMISSIONS = Object.freeze([
  'dashboard.view',
  'users.manage',
  'users.impersonate',
  'employers.manage',
  'candidates.manage',
  'jobs.manage',
  'applications.manage',
  'documents.verify',
  'comments.moderate',
  'reports.manage',
  'chat.manage',
  'payments.manage',
  'plans.manage',
  'cms.manage',
  'ads.manage',
  'masterdata.manage',
  'notifications.send',
  'leads.manage',
  'settings.manage',
  'audit.view',
  'admins.manage',
]);

export const JOB_KIND = Object.freeze({ JOB: 'job', INTERNSHIP: 'internship' });
export const JOB_STATUS = Object.freeze({
  DRAFT: 'draft',
  PENDING: 'pending',
  ADMIN_REVIEW: 'admin_review',
  ACTIVE: 'active',
  CLOSED: 'closed',
  EXPIRED: 'expired',
  REJECTED: 'rejected',
  TRASHED: 'trashed',
});

export const LABELS = Object.freeze({
  employer: ['premium', 'starred', 'featured', 'actively_hiring', 'urgent_hiring', 'verified'],
  job: ['premium', 'starred', 'featured', 'actively_hiring', 'urgent'],
  candidate: ['premium', 'starred', 'featured', 'actively_job_searching', 'urgent', 'profile_booster'],
});

/** ATS pipeline: Applied -> Screened -> Interview Scheduled -> Offered -> Hired (+ terminal states). */
export const PIPELINE_STAGES = ['applied', 'screened', 'interview_scheduled', 'offered', 'hired', 'rejected', 'withdrawn'];
export const SCREENING_STATUS = [
  'shortlisted',
  'maybe_shortlist',
  'rejected',
  'on_hold',
  'consider_other_role',
  'not_interested',
  'future_requirement',
  'maybe_relevant',
];
export const CALLING_STATUS = ['call_done', 'not_picked', 'not_reachable', 'switched_off', 'call_cut'];
export const MESSAGING_STATUS = ['sms_done', 'whatsapp_done', 'email_done', 'whatsapp_not_delivered', 'sms_not_delivered', 'email_not_delivered'];
export const FORWARD_CHANNELS = ['email', 'whatsapp', 'linkedin', 'facebook_messenger', 'sms'];

export const REPORT_REASONS = Object.freeze({
  candidate: ['spam_misleading', 'not_searching_job', 'offensive_inappropriate', 'abusive_language', 'wrong_contact_details', 'other'],
  job: ['spam_misleading', 'job_not_available', 'offensive_inappropriate', 'asking_money', 'abusive_language', 'wrong_contact_details', 'other'],
  organization: ['spam_misleading', 'employer_not_available', 'offensive_inappropriate', 'asking_money', 'abusive_language', 'wrong_contact_details', 'other'],
});

export const DOCUMENT_STATUS = ['not_submitted', 'under_review', 'verified', 'rejected', 'resubmission_required'];

export const BLOCKLIST_TYPES = ['email', 'mobile', 'name', 'gst', 'country', 'url', 'domain', 'ip'];

export const NOTIFICATION_CHANNELS = ['in_app', 'email', 'sms', 'whatsapp', 'push'];

export const PAGE_SIZES = [10, 20, 30, 40, 60, 80, 100, 150, 200];
export const MAX_PAGE_SIZE = 200;

export const BULK_LIMITS = Object.freeze({
  bulkMessage: 500,
  assignApplicants: 500,
  jobAlertCandidates: 1000,
  bulkAction: 1000,
  invite: 500,
});

export const TIMESPANS = ['24h', '7d', '14d', '30d', '90d', '120d', '6m', '9m', '12m', 'custom'];
export const ACTIVE_IN_DAYS = { '1d': 1, '2d': 2, '5d': 5, '7d': 7, '15d': 15, '30d': 30, '45d': 45, '2m': 60, '4m': 120, '6m': 180, '1y': 365, '2y': 730 };

export const USERNAME_REGEX = /^(?!_)[A-Za-z0-9_]{3,30}(?<!_)$/;
export const MOBILE_REGEX = /^[6-9]\d{9}$/;
