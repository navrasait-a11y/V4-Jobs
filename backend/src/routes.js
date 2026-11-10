import { Router } from 'express';
import { authenticate, authorize, requireEmployer } from './shared/middleware/auth.js';
import { ROLES } from './shared/constants/index.js';

import authRoutes from './modules/auth/auth.routes.js';
import commonRoutes from './modules/common/common.routes.js';
import { publicRouter as masterDataPublic, adminRouter as masterDataAdmin } from './modules/masterdata/masterdata.routes.js';
import searchRoutes from './modules/search/search.routes.js';
import candidateRoutes from './modules/candidates/candidate.routes.js';
import { employerMeRouter, employerPublicRouter } from './modules/employers/employer.routes.js';
import { publicJobs, employerJobs } from './modules/jobs/job.routes.js';
import { candidateApplications, employerResponses, interviewRouter } from './modules/applications/application.routes.js';
import talentRoutes, { candidateInvites } from './modules/talent/talent.routes.js';
import { router as alertRoutes, adminRouter as alertAdmin } from './modules/alerts/alert.routes.js';
import { employerEvents, publicEvents } from './modules/events/event.routes.js';
import { router as chatRoutes, adminRouter as chatAdmin } from './modules/chat/chat.routes.js';
import assistantRoutes from './modules/assistant/assistant.routes.js';
import notificationRoutes from './modules/notifications/notification.routes.js';
import { router as moderationRoutes, adminRouter as moderationAdmin } from './modules/moderation/moderation.routes.js';
import { publicRouter as cmsPublic, adminRouter as cmsAdmin, leadsAdmin, employerEnquiries } from './modules/cms/cms.routes.js';
import { router as mailboxRoutes } from './modules/mailbox/mailbox.js';
import { router as billingRoutes, adminRouter as billingAdmin } from './modules/billing/billing.routes.js';
import analyticsRoutes from './modules/analytics/analytics.routes.js';
import adminRoutes from './modules/admin/admin.routes.js';
import webhookRoutes from './modules/notifications/webhook.routes.js';
import seoRoutes from './modules/seo/seo.routes.js';

/**
 * API surface (all under API_PREFIX, default /api/v1):
 *   public / shared ...... /auth /settings /enums /master-data /locations /jobs /employers /events /cms /moderation
 *   candidate ............ /candidates/me /applications /job-alerts /invites /interviews
 *   employer ............. /employer/* (organization, jobs, responses, talent, events)
 *   everyone logged-in ... /chat /notifications /mailbox /billing /analytics
 *   admin panel .......... /admin/*
 */
const api = Router();

api.use('/auth', authRoutes);
api.use('/webhooks', webhookRoutes); // provider callbacks (Brevo)
api.use('/', commonRoutes);
api.use('/', masterDataPublic);
api.use('/search', searchRoutes);
api.use('/candidates', candidateRoutes);
api.use('/jobs', publicJobs);
api.use('/', candidateApplications); // /jobs/:id/apply, /jobs/:id/guest-apply, /applications
api.use('/employers', employerPublicRouter);
api.use('/events', publicEvents);
api.use('/job-alerts', alertRoutes);
api.use('/invites', candidateInvites);
api.use('/interviews', interviewRouter);
api.use('/cms', cmsPublic);
api.use('/seo', seoRoutes);
api.use('/moderation', moderationRoutes);
api.use('/chat', chatRoutes);
api.use('/assistant', assistantRoutes);
api.use('/notifications', notificationRoutes);
api.use('/mailbox', mailboxRoutes);
api.use('/billing', billingRoutes);
api.use('/analytics', analyticsRoutes);

/* employer workspace */
const employer = Router();
employer.use('/organization', employerMeRouter);
employer.use('/jobs', employerJobs);
employer.use('/responses', employerResponses);
employer.use('/talent', talentRoutes);
employer.use('/events', employerEvents);
employer.get('/enquiries', authenticate, authorize(ROLES.EMPLOYER), requireEmployer(), employerEnquiries);
api.use('/employer', employer);

/* admin panel */
const admin = Router();
admin.use(authenticate, authorize(ROLES.ADMIN));
admin.use('/', masterDataAdmin);
admin.use('/billing', billingAdmin);
admin.use('/job-alerts', alertAdmin);
admin.use('/chat', chatAdmin);
admin.use('/moderation', moderationAdmin);
admin.use('/cms', cmsAdmin);
admin.use('/leads', leadsAdmin);
admin.use('/', adminRoutes);
api.use('/admin', admin);

export default api;
