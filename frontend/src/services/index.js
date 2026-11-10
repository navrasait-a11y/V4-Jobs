import http, { downloadFile, fetchHtml, toFormData } from './api';

export { downloadFile, fetchHtml, toFormData };

/** Unwraps `data` from the response envelope. */
const get = (url, params) => http.get(url, { params }).then((r) => r.data);
/** Keeps `{ data, meta }` for paginated lists. */
const list = (url, params) => http.get(url, { params }).then((r) => ({ data: r.data, meta: r.meta }));
const post = (url, body, config) => http.post(url, body, config).then((r) => r.data);
const patch = (url, body) => http.patch(url, body).then((r) => r.data);
const put = (url, body) => http.put(url, body).then((r) => r.data);
const del = (url, body) => http.delete(url, body ? { data: body } : undefined).then((r) => r.data);
const upload = (url, fields, params) => http.post(url, toFormData(fields), { params, timeout: 120000 }).then((r) => r.data);

/** Standard CRUD against a REST resource. */
const crud = (base) => ({
  list: (params) => list(base, params),
  get: (id) => get(`${base}/${id}`),
  create: (body) => post(base, body),
  update: (id, body) => patch(`${base}/${id}`, body),
  remove: (id) => del(`${base}/${id}`),
});

/** Grouped suggestions for search boxes: scope jobs | candidates | companies | locations. */
export const searchApi = {
  suggest: (q, scope = 'jobs', limit = 6) => get('/search/suggest', { q, scope, limit }),
  trending: (scope = 'jobs', limit = 8) => get('/search/trending', { scope, limit }),
  forYou: () => get('/search/for-you'),
  track: (term, scope = 'jobs') => post('/search/track', { term, scope }),
};

export const lookupApi = {
  types: () => get('/master-data/types'),
  search: (type, params) => get(`/master-data/${type}`, params),
  bulk: (types) => get('/master-data/bulk', { types: types.join(',') }),
  suggest: (type, name) => post(`/master-data/${type}/suggest`, { name }),
  locations: (params) => get('/locations', params),
  nearest: (lat, lng) => post('/locations/nearest', { lat, lng }),
  states: () => get('/locations/states'),
  cities: (state) => get('/locations/cities', { state }),
  settings: () => get('/settings/public'),
  enums: () => get('/enums'),
};

export const authApi = {
  registerCandidate: (body) => post('/auth/register/candidate', body),
  registerEmployer: (body) => post('/auth/register/employer', body),
  availability: (params) => get('/auth/availability', params),
  login: (body) => post('/auth/login', body),
  sendOtp: (body) => post('/auth/otp/send', body),
  otpLogin: (body) => post('/auth/otp/login', body),
  google: (body) => post('/auth/google', body),
  verify2fa: (body) => post('/auth/2fa/verify', body),
  forgot: (body) => post('/auth/password/forgot', body),
  reset: (body) => post('/auth/password/reset', body),
  changePassword: (body) => post('/auth/password/change', body),
  verifyEmail: (token) => post('/auth/email/verify', { token }),
  sendEmailVerification: () => post('/auth/email/send-verification'),
  sendMobileOtp: (body) => post('/auth/mobile/send-otp', body),
  verifyMobile: (otp) => post('/auth/mobile/verify', { otp }),
  changeContact: (body) => post('/auth/contact/change', body),
  confirmContact: (body) => post('/auth/contact/confirm', body),
  sessions: () => get('/auth/sessions'),
  revokeSession: (id) => del(`/auth/sessions/${id}`),
  setup2fa: () => post('/auth/2fa/setup'),
  enable2fa: (code) => post('/auth/2fa/enable', { code }),
  disable2fa: (body) => post('/auth/2fa/disable', body),
  updateMe: (body) => patch('/me', body),
  uploadAvatar: (file) => upload('/me/avatar', { avatar: file }),
  activity: (params) => list('/me/activity', params),
  loginHistory: (params) => list('/me/login-history', params),
};

export const candidateApi = {
  me: () => get('/candidates/me'),
  update: (body) => patch('/candidates/me', body),
  dashboard: () => get('/candidates/me/dashboard'),
  profileViews: (params) => get('/candidates/me/profile-views', params),
  addItem: (kind, body) => post(`/candidates/me/${kind}`, body),
  updateItem: (kind, id, body) => patch(`/candidates/me/${kind}/${id}`, body),
  removeItem: (kind, id) => del(`/candidates/me/${kind}/${id}`),
  uploadResume: (file) => upload('/candidates/me/resume', { resume: file }),
  deleteResume: () => del('/candidates/me/resume'),
  resumeLink: () => get('/candidates/me/resume/download'),
  uploadAvatar: (file) => upload('/candidates/me/avatar', { avatar: file }),
  resumeBuilder: () => get('/candidates/me/resume-builder'),
  saveResumeBuilder: (body) => put('/candidates/me/resume-builder', body),
  deactivate: (reason) => post('/candidates/me/deactivate', { reason }),
  remove: (reason) => del('/candidates/me', { reason }),
};

export const seoApi = {
  landing: (slug, params) => get(`/seo/landing/${encodeURIComponent(slug)}`, params),
};

export const jobApi = {
  search: (params) => list('/jobs', params),
  facets: (params) => get('/jobs/facets', params),
  suggest: (q) => get('/jobs/suggest', { q }),
  recommended: (params) => list('/jobs/recommended', params),
  saved: (params) => list('/jobs/saved', params),
  get: (idOrSlug) => get(`/jobs/${idOrSlug}`),
  similar: (id) => get(`/jobs/${id}/similar`),
  share: (id) => get(`/jobs/${id}/share`),
  save: (id) => post(`/jobs/${id}/save`),
  unsave: (id) => del(`/jobs/${id}/save`),
  jsonLd: (slug) => get(`/jobs/${slug}/google-jobs`),
  apply: (id, { resume, ...body }) => (resume ? upload(`/jobs/${id}/apply`, { ...body, resume }) : post(`/jobs/${id}/apply`, body)),
  guestOtp: (id, mobile) => post(`/jobs/${id}/guest-apply/otp`, { mobile }),
  guestApply: (id, fields) => upload(`/jobs/${id}/guest-apply`, fields),
  guestPostOtp: (mobile) => post('/jobs/guest-post/otp', { mobile }),
  guestPost: (body) => post('/jobs/guest-post', body),
  requestCallback: (id) => post(`/jobs/${id}/callback`),
  searches: () => get('/jobs/searches'),
  saveSearch: (body) => post('/jobs/searches', body),
  removeSearch: (id) => del(`/jobs/searches/${id}`),
};

export const applicationApi = {
  list: (params) => list('/applications', params),
  get: (id) => get(`/applications/${id}`),
  withdraw: (id) => post(`/applications/${id}/withdraw`),
};

export const interviewApi = {
  list: (params) => list('/interviews', params),
  respond: (id, response) => post(`/interviews/${id}/respond`, { response }),
  update: (id, body) => patch(`/interviews/${id}`, body),
};

export const inviteApi = {
  list: (params) => list('/invites', params),
  decline: (id) => post(`/invites/${id}/decline`),
};

export const alertApi = {
  ...crud('/job-alerts'),
  prefill: () => get('/job-alerts/prefill'),
  responses: (params) => list('/job-alerts/responses', params),
  guestOtp: (mobile) => post('/job-alerts/guest/otp', { mobile }),
  guestCreate: (fields) => upload('/job-alerts/guest', fields),
};

export const employerPublicApi = {
  list: (params) => list('/employers', params),
  get: (slug) => get(`/employers/${slug}`),
  follow: (id) => post(`/employers/${id}/follow`),
  unfollow: (id) => del(`/employers/${id}/follow`),
  following: (params) => list('/employers/following', params),
  contact: (id, body) => post(`/cms/employers/${id}/contact`, body),
};

export const eventApi = {
  list: (params) => list('/events', params),
  get: (slug) => get(`/events/${slug}`),
  apply: (slug, jobIds) => post(`/events/${slug}/apply`, { jobIds }),
};

export const moderationApi = {
  reasons: () => get('/moderation/report-reasons'),
  report: (body) => post('/moderation/reports', body),
  comment: (body) => post('/moderation/comments', body),
  comments: (type, id, params) => list(`/moderation/comments/${type}/${id}`, params),
  myComments: (params) => list('/moderation/comments/mine', params),
  removeComment: (id) => del(`/moderation/comments/${id}`),
  blocks: (params) => list('/moderation/blocks', params),
  block: (id) => post(`/moderation/blocks/organizations/${id}`),
  unblock: (id) => del(`/moderation/blocks/organizations/${id}`),
};

export const notificationApi = {
  list: (params) => list('/notifications', params),
  read: (ids) => post('/notifications/read', ids ? { ids } : {}),
  remove: (id) => del(`/notifications/${id}`),
};

export const chatApi = {
  conversations: (params) => list('/chat/conversations', params),
  unread: () => get('/chat/unread'),
  start: (body) => post('/chat/conversations', body),
  support: (body) => post('/chat/support', body),
  messages: (id, params) => get(`/chat/conversations/${id}/messages`, params),
  attach: (file) => upload('/chat/attachments', { file }),
  send: (id, body) => post(`/chat/conversations/${id}/messages`, body),
  read: (id) => post(`/chat/conversations/${id}/read`),
  removeMessage: (id) => del(`/chat/messages/${id}`),
};

export const assistantApi = {
  message: (message) => post('/assistant/message', { message }),
};

export const mailboxApi = {
  list: (params) => list('/mailbox', params),
  get: (id) => get(`/mailbox/${id}`),
  send: (body) => post('/mailbox', body),
  reply: (id, body) => post(`/mailbox/${id}/reply`, body),
  remove: (id) => del(`/mailbox/${id}`),
};

export const billingApi = {
  plans: (audience) => get('/billing/plans', { audience }),
  quote: (body) => post('/billing/quote', body),
  checkout: (body) => post('/billing/checkout', body),
  verify: (body) => post('/billing/verify', body),
  subscriptions: () => get('/billing/subscriptions'),
  autoRenew: (id, autoRenew) => patch(`/billing/subscriptions/${id}/auto-renew`, { autoRenew }),
  orders: (params) => list('/billing/orders', params),
  wallet: () => get('/billing/wallet'),
};

/** Invoice preview and PDF. Admins read any invoice through their own route. */
export const invoiceApi = (admin = false) => {
  const base = `${admin ? adminBase : ''}/billing/invoices`;
  return {
    html: (id) => fetchHtml(`${base}/${id}`, { format: 'html' }),
    pdf: (id, number) => downloadFile(`${base}/${id}`, { params: { format: 'pdf' }, fallbackName: `Invoice-${number || id}.pdf` }),
  };
};

export const analyticsApi = {
  candidate: (params) => get('/analytics/candidate', params),
  employer: (params) => get('/analytics/employer', params),
};

export const cmsApi = {
  page: (slug) => get(`/cms/pages/${slug}`),
  blogs: (params) => list('/cms/blogs', params),
  blog: (slug) => get(`/cms/blogs/${slug}`),
  faqs: (params) => get('/cms/faqs', params),
  ads: (placement) => get('/cms/ads', { placement, platform: 'web' }),
  adClick: (id) => post(`/cms/ads/${id}/click`),
  contact: (body) => post('/cms/contact', body),
  salesEnquiry: (body) => post('/cms/sales-enquiry', body),
  share: (url, text) => get('/cms/share', { url, text }),
};

export const orgApi = {
  get: () => get('/employer/organization'),
  update: (body) => patch('/employer/organization', body),
  viewingMode: (isPrivate) => patch('/employer/organization/viewing-mode', { private: isPrivate }),
  logo: (file) => upload('/employer/organization/logo', { logo: file }),
  cover: (file) => upload('/employer/organization/cover', { cover: file }),
  addOffice: (body) => post('/employer/organization/offices', body),
  updateOffice: (id, body) => patch(`/employer/organization/offices/${id}`, body),
  removeOffice: (id) => del(`/employer/organization/offices/${id}`),
  addDocument: (fields) => upload('/employer/organization/documents', fields),
  removeDocument: (id) => del(`/employer/organization/documents/${id}`),
  submitVerification: (body) => post('/employer/organization/verification/submit', body),
  domainStart: (body) => post('/employer/organization/verification/domain/start', body),
  domainCheck: () => post('/employer/organization/verification/domain/check'),
  team: (params) => list('/employer/organization/team', params),
  addMember: (body) => post('/employer/organization/team', body),
  updateMember: (id, body) => patch(`/employer/organization/team/${id}`, body),
  resetMember: (id) => post(`/employer/organization/team/${id}/reset-password`),
  removeMembers: (ids) => post('/employer/organization/team/remove', { ids }),
  usage: (params) => get('/employer/organization/usage', params),
  followers: (params) => list('/employer/organization/followers', params),
  enquiries: (params) => list('/employer/enquiries', params),
};

export const employerJobApi = {
  list: (params) => list('/employer/jobs', params),
  get: (id) => get(`/employer/jobs/${id}`),
  create: (body) => post('/employer/jobs', body),
  update: (id, body) => patch(`/employer/jobs/${id}`, body),
  publish: (id, body = {}) => post(`/employer/jobs/${id}/publish`, body),
  close: (id) => post(`/employer/jobs/${id}/close`),
  refresh: (id) => post(`/employer/jobs/${id}/refresh`),
  boost: (id) => post(`/employer/jobs/${id}/boost`),
  trash: (id) => post(`/employer/jobs/${id}/trash`),
  duplicate: (id) => post(`/employer/jobs/${id}/duplicate`),
  collaborators: (id, memberIds) => put(`/employer/jobs/${id}/collaborators`, { memberIds }),
  callbacks: (id, params) => list(`/employer/jobs/${id}/callbacks`, params),
  share: (id) => get(`/employer/jobs/${id}/share`),
  bulkImport: (file, publish) => upload('/employer/jobs/bulk-import', { file }, { publish }),
};

export const responseApi = {
  list: (params) => list('/employer/responses', params),
  get: (id) => get(`/employer/responses/${id}`),
  update: (id, body) => patch(`/employer/responses/${id}`, body),
  bulk: (ids, update) => post('/employer/responses/bulk', { ids, update }),
  schedule: (id, body) => post(`/employer/responses/${id}/interviews`, body),
  exportExcel: (params) => downloadFile('/employer/responses/export', { params, fallbackName: 'responses.xlsx' }),
  exportResumes: (params) => downloadFile('/employer/responses/export-resumes', { params, fallbackName: 'resumes.zip' }),
  funnel: (jobId) => get(`/employer/responses/funnel/${jobId}`),
};

export const talentApi = {
  search: (filters, params) => http.post('/employer/talent/search', filters, { params }).then((r) => ({ data: r.data, meta: r.meta })),
  fromJob: (jobId) => get(`/employer/talent/search/from-job/${jobId}`),
  candidate: (id) => get(`/employer/talent/candidates/${id}`),
  unlock: (id) => post(`/employer/talent/candidates/${id}/unlock`),
  resume: (id) => get(`/employer/talent/candidates/${id}/resume`),
  track: (id, body) => patch(`/employer/talent/candidates/${id}/tracking`, body),
  block: (id) => post(`/employer/talent/candidates/${id}/block`),
  unblock: (id) => del(`/employer/talent/candidates/${id}/block`),
  recentSearches: () => get('/employer/talent/searches/recent'),
  searches: (params) => list('/employer/talent/searches', params),
  saveSearch: (body) => post('/employer/talent/searches', body),
  updateSearch: (id, body) => patch(`/employer/talent/searches/${id}`, body),
  removeSearch: (id) => del(`/employer/talent/searches/${id}`),
  folders: (params) => get('/employer/talent/folders', params),
  systemFolder: (key, params) => list(`/employer/talent/folders/system/${key}`, params),
  folder: (id, params) => list(`/employer/talent/folders/${id}`, params),
  addFolder: (body) => post('/employer/talent/folders', body),
  updateFolder: (id, body) => patch(`/employer/talent/folders/${id}`, body),
  removeFolder: (id) => del(`/employer/talent/folders/${id}`),
  addToFolder: (id, candidateIds) => post(`/employer/talent/folders/${id}/candidates`, { candidateIds }),
  removeFromFolder: (id, candidateIds) => del(`/employer/talent/folders/${id}/candidates`, { candidateIds }),
  invite: (jobId, body) => post(`/employer/talent/jobs/${jobId}/invites`, body),
  invites: (jobId, params) => list(`/employer/talent/jobs/${jobId}/invites`, params),
};

export const employerEventApi = {
  ...crud('/employer/events'),
  banner: (id, file) => upload(`/employer/events/${id}/banner`, { banner: file }),
  share: (id) => get(`/employer/events/${id}/share`),
  applications: (id, params) => list(`/employer/events/${id}/applications`, params),
};

const adminBase = '/admin';
export const adminApi = {
  get: (path, params) => get(`${adminBase}${path}`, params),
  list: (path, params) => list(`${adminBase}${path}`, params),
  post: (path, body) => post(`${adminBase}${path}`, body),
  patch: (path, body) => patch(`${adminBase}${path}`, body),
  put: (path, body) => put(`${adminBase}${path}`, body),
  del: (path) => del(`${adminBase}${path}`),
  upload: (path, fields, params) => upload(`${adminBase}${path}`, fields, params),
  download: (path, params, fallbackName) => downloadFile(`${adminBase}${path}`, { params, fallbackName }),
  downloadPost: (path, data, fallbackName) => downloadFile(`${adminBase}${path}`, { method: 'post', data, fallbackName }),
};
