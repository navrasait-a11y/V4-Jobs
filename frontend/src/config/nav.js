export const candidateNav = [
  {
    items: [
      { label: 'Dashboard', to: '/candidate/dashboard', icon: 'dashboard' },
      { label: 'My Profile', to: '/candidate/profile', icon: 'account_circle' },
      { label: 'My Applications', to: '/candidate/applications', icon: 'description' },
      { label: 'ATS Tracker', to: '/candidate/ats-tracker', icon: 'timeline' },
      { label: 'Interviews', to: '/candidate/interviews', icon: 'event' },
      { label: 'Job Invites', to: '/candidate/job-invites', icon: 'mail' },
      { label: 'Job Alerts', to: '/candidate/job-alerts', icon: 'notifications_active' },
      { label: 'Saved Jobs', to: '/candidate/saved-jobs', icon: 'bookmark' },
      { label: 'Following', to: '/candidate/following', icon: 'domain' },
      { label: 'Messages', to: '/candidate/messages', icon: 'chat_bubble', badge: 'chat' },
      { label: 'Mailbox', to: '/candidate/mailbox', icon: 'inbox' },
    ],
  },
  {
    title: 'Grow',
    items: [
      { label: 'Resume Builder', to: '/candidate/resume-builder', icon: 'article' },
      { label: 'Analytics', to: '/candidate/analytics', icon: 'bar_chart' },
      { label: 'Profile Booster', to: '/candidate/billing', icon: 'workspace_premium' },
    ],
  },
  { title: 'Account', items: [{ label: 'Settings', to: '/candidate/settings', icon: 'settings' }] },
];

export const employerNav = [
  {
    items: [
      { label: 'Dashboard', to: '/employer/dashboard', icon: 'dashboard' },
      { label: 'Jobs', to: '/employer/jobs', icon: 'work' },
      { label: 'Applications', to: '/employer/applications', icon: 'group' },
      { label: 'ATS Pipeline', to: '/employer/ats', icon: 'view_kanban' },
      { label: 'Search Candidates', to: '/employer/candidates', icon: 'person_search', perm: ['candidate.search'] },
      { label: 'Saved Searches', to: '/employer/saved-searches', icon: 'bookmarks' },
      { label: 'Interviews', to: '/employer/interviews', icon: 'event' },
      { label: 'Job Events', to: '/employer/events', icon: 'celebration', perm: ['event.manage'] },
    ],
  },
  {
    title: 'Communication',
    items: [
      { label: 'Messages', to: '/employer/messages', icon: 'chat_bubble', badge: 'chat' },
      { label: 'Mailbox', to: '/employer/mailbox', icon: 'inbox' },
      { label: 'Enquiries', to: '/employer/enquiries', icon: 'contact_mail' },
    ],
  },
  {
    title: 'Organization',
    items: [
      { label: 'Team', to: '/employer/employees', icon: 'badge', perm: ['team.manage'] },
      { label: 'Analytics', to: '/employer/analytics', icon: 'monitoring' },
      { label: 'Reports', to: '/employer/reports', icon: 'summarize' },
      { label: 'Packages & Billing', to: '/employer/packages-billing', icon: 'credit_card', perm: ['billing.manage'] },
      { label: 'Settings', to: '/employer/settings', icon: 'settings' },
    ],
  },
];

export const adminNav = [
  {
    items: [
      { label: 'Overview', to: '/admin/overview', icon: 'dashboard' },
      { label: 'Analytics', to: '/admin/analytics', icon: 'monitoring' },
      { label: 'Platform Health', to: '/admin/health', icon: 'health_and_safety' },
    ],
  },
  {
    title: 'Marketplace',
    items: [
      { label: 'Candidates', to: '/admin/candidates', icon: 'person' },
      { label: 'Employers', to: '/admin/employers', icon: 'apartment' },
      { label: 'KYC Queue', to: '/admin/kyc', icon: 'verified_user' },
      { label: 'Jobs', to: '/admin/jobs', icon: 'work' },
      { label: 'Applications', to: '/admin/responses', icon: 'description' },
      { label: 'Job Alerts', to: '/admin/job-alerts', icon: 'notifications_active' },
    ],
  },
  {
    title: 'Trust & Safety',
    items: [
      { label: 'Reports', to: '/admin/moderation', icon: 'flag' },
      { label: 'Comments', to: '/admin/comments', icon: 'comment' },
      { label: 'Blocklist', to: '/admin/blocklist', icon: 'block' },
      { label: 'Support Chat', to: '/admin/support-chat', icon: 'support_agent' },
    ],
  },
  {
    title: 'Revenue',
    items: [
      { label: 'Plans', to: '/admin/plans', icon: 'sell' },
      { label: 'Coupons', to: '/admin/coupons', icon: 'confirmation_number' },
      { label: 'Orders', to: '/admin/orders', icon: 'receipt_long' },
      { label: 'Subscriptions', to: '/admin/subscriptions', icon: 'autorenew' },
      { label: 'Sales Leads', to: '/admin/sales-leads', icon: 'trending_up' },
    ],
  },
  {
    title: 'Content',
    items: [
      { label: 'Pages', to: '/admin/cms', icon: 'article' },
      { label: 'Blogs', to: '/admin/career-advice', icon: 'edit_note' },
      { label: 'Media', to: '/admin/media', icon: 'image' },
      { label: 'FAQs', to: '/admin/faqs', icon: 'quiz' },
      { label: 'Ads', to: '/admin/ads', icon: 'ads_click' },
      { label: 'Contact Forms', to: '/admin/contacts', icon: 'contact_mail' },
      { label: 'Email Templates', to: '/admin/email-center', icon: 'mail' },
      { label: 'Bulk Messages', to: '/admin/communications', icon: 'campaign' },
    ],
  },
  {
    title: 'Data',
    items: [
      { label: 'Master Data', to: '/admin/taxonomy', icon: 'category' },
      { label: 'Locations', to: '/admin/locations', icon: 'location_on' },
    ],
  },
  {
    title: 'System',
    items: [
      { label: 'Users', to: '/admin/users', icon: 'group' },
      { label: 'Admins', to: '/admin/roles', icon: 'admin_panel_settings' },
      { label: 'Login Audit', to: '/admin/login-audit', icon: 'login' },
      { label: 'E-mail Logs', to: '/admin/message-logs', icon: 'outgoing_mail' },
      { label: 'SMS Logs', to: '/admin/sms-logs', icon: 'sms' },
      { label: 'Audit Trail', to: '/admin/security', icon: 'policy' },
      { label: 'Settings', to: '/admin/settings', icon: 'settings' },
      { label: 'My Profile', to: '/admin/profile', icon: 'account_circle' },
    ],
  },
];
