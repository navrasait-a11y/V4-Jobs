import React, { Suspense, lazy as reactLazy } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import PublicLayout from '../layouts/PublicLayout';
import EmployerAuthLayout from '../layouts/EmployerAuthLayout';
import ProtectedRoute from './ProtectedRoute';
import { PageLoader } from '../components/ui/feedback';

/** After a deploy, old tabs ask for chunks that no longer exist. Reload once to get the new build. */
const lazy = (loader) =>
  reactLazy(() =>
    loader().catch((error) => {
      const key = 'fjw_chunk_reload';
      if (sessionStorage.getItem(key)) throw error;
      sessionStorage.setItem(key, '1');
      window.location.reload();
      return new Promise(() => {});
    }),
  );

const named = (loader, name) => lazy(() => loader().then((m) => ({ default: m[name] })));

/** Page loaders by area, so the pages a user is likely to open next can be fetched ahead of time. */
const GROUPS = { public: [], shared: [], candidate: [], employer: [], admin: [] };
function group(name, loader) {
  GROUPS[name].push(loader);
  return loader;
}

/**
 * After sign-in, when the browser is idle, download the code of every page of that panel so a click
 * in the sidebar opens instantly. Skipped on "data saver" connections; failures are ignored (the
 * page then simply loads on click as before).
 */
export function preloadPanel(role) {
  if (typeof window === 'undefined') return;
  if (navigator.connection?.saveData || /2g/.test(navigator.connection?.effectiveType || '')) return;
  const area = ['admin', 'super_admin'].includes(role) ? 'admin' : role === 'employer' ? 'employer' : role === 'candidate' ? 'candidate' : null;
  if (!area) return;
  const loaders = [...GROUPS[area], ...(area === 'admin' ? [] : GROUPS.shared)];
  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 1500));
  let i = 0;
  // One file at a time while idle, so preloading never competes with what the user is doing.
  const next = () => {
    if (i >= loaders.length) return;
    loaders[i++]().catch(() => {}).finally(() => idle(next));
  };
  idle(next);
}

const CandidateLayout = lazy(group('candidate', () => import('../layouts/CandidateLayout')));
const EmployerLayout = lazy(group('employer', () => import('../layouts/EmployerLayout')));
const AdminLayout = lazy(group('admin', () => import('../layouts/AdminLayout')));

const Home = lazy(group('public', () => import('../pages/public/Home')));
const Login = lazy(group('public', () => import('../pages/public/Login')));
const Register = lazy(group('public', () => import('../pages/public/Register')));
const recovery = group('public', () => import('../pages/public/AccountRecovery'));
const ForgotPassword = named(recovery, 'ForgotPassword');
const ResetPassword = named(recovery, 'ResetPassword');
const VerifyEmail = named(recovery, 'VerifyEmail');
const JobListing = lazy(group('public', () => import('../pages/public/JobListing')));
const JobDetails = lazy(group('public', () => import('../pages/public/JobDetails')));
const Companies = lazy(group('public', () => import('../pages/public/Companies')));
const CompanyDetails = lazy(group('public', () => import('../pages/public/CompanyDetails')));
const advice = group('public', () => import('../pages/public/CareerAdvice'));
const CareerAdvice = named(advice, 'CareerAdvice');
const CareerAdviceDetail = named(advice, 'CareerAdviceDetail');
const HelpCenter = lazy(group('public', () => import('../pages/public/HelpCenter')));
const CmsPage = lazy(group('public', () => import('../pages/public/CmsPage')));
const events = group('public', () => import('../pages/public/Events'));
const Events = named(events, 'Events');
const EventDetails = named(events, 'EventDetails');
const GuestJobAlert = lazy(group('public', () => import('../pages/public/GuestJobAlert')));
const EmployerLogin = lazy(group('public', () => import('../pages/public/EmployerLogin')));
const EmployerRegister = lazy(group('public', () => import('../pages/public/EmployerRegister')));
const EmployerLanding = lazy(group('public', () => import('../pages/public/EmployerLanding')));
const AdminLogin = lazy(group('public', () => import('../pages/public/AdminLogin')));
const AdminPostJob = lazy(group('admin', () => import('../pages/admin/AdminPostJob')));
const SystemHealth = lazy(group('admin', () => import('../pages/admin/SystemHealth')));
const RiskSignals = lazy(group('admin', () => import('../pages/admin/RiskSignals')));
const SearchInsights = lazy(group('admin', () => import('../pages/admin/SearchInsights')));
const AdminJobEdit = lazy(group('admin', () => import('../pages/admin/AdminJobEdit')));
const ContentEditor = lazy(group('admin', () => import('../pages/admin/ContentEditor')));
const PostJobGuest = lazy(group('public', () => import('../pages/public/PostJobGuest')));
const NotFound = lazy(group('public', () => import('../pages/public/NotFound')));
const SeoLanding = lazy(group('public', () => import('../pages/public/SeoLanding')));

const Notifications = lazy(group('shared', () => import('../pages/shared/Notifications')));
const Messages = lazy(group('shared', () => import('../pages/shared/Messages')));
const Mailbox = lazy(group('shared', () => import('../pages/shared/Mailbox')));

const profile = group('candidate', () => import('../pages/candidate/Profile'));
const apps = group('candidate', () => import('../pages/candidate/Applications'));
const lists = group('candidate', () => import('../pages/candidate/JobLists'));
const grow = group('candidate', () => import('../pages/candidate/Grow'));
const CandidateDashboard = lazy(group('candidate', () => import('../pages/candidate/Dashboard')));
const ProfileViews = lazy(group('candidate', () => import('../pages/candidate/ProfileViews')));
const CandidateProfile = lazy(profile);
const CompleteProfile = named(profile, 'CompleteProfile');
const CandidateApplications = named(apps, 'Applications');
const ATSTracker = named(apps, 'ATSTracker');
const SavedJobs = named(lists, 'SavedJobs');
const Following = named(lists, 'Following');
const JobInvites = named(lists, 'JobInvites');
const CandidateInterviews = named(lists, 'CandidateInterviews');
const JobAlerts = named(lists, 'JobAlerts');
const CandidateSettings = lazy(group('candidate', () => import('../pages/candidate/Settings')));
const CandidateBilling = named(grow, 'CandidateBilling');
const CandidateAnalytics = named(grow, 'CandidateAnalytics');
const ResumeBuilder = lazy(group('candidate', () => import('../pages/candidate/ResumeBuilder')));

const empApps = group('employer', () => import('../pages/employer/Applications'));
const empCandidates = group('employer', () => import('../pages/employer/Candidates'));
const insights = group('employer', () => import('../pages/employer/Insights'));
const EmployerDashboard = lazy(group('employer', () => import('../pages/employer/Dashboard')));
const EmployerJobs = lazy(group('employer', () => import('../pages/employer/Jobs')));
const PostJob = lazy(group('employer', () => import('../pages/employer/PostJob')));
const EmployerApplications = named(empApps, 'Applications');
const ApplicationDetail = named(empApps, 'ApplicationDetail');
const ATS = named(empApps, 'ATS');
const EmployerInterviews = named(empApps, 'Interviews');
const Candidates = lazy(empCandidates);
const CandidateResumeDetail = named(empCandidates, 'CandidateResumeDetail');
const SavedSearches = lazy(group('employer', () => import('../pages/employer/SavedSearches')));
const FolderPage = lazy(group('employer', () => import('../pages/employer/Folders')));
const EmployerEvents = lazy(group('employer', () => import('../pages/employer/Events')));
const Employees = lazy(group('employer', () => import('../pages/employer/Employees')));
const EmployerAnalytics = named(insights, 'Analytics');
const Reports = named(insights, 'Reports');
const PackagesBilling = named(insights, 'PackagesBilling');
const Enquiries = named(insights, 'Enquiries');
const EmployerSettings = lazy(group('employer', () => import('../pages/employer/Settings')));

const adminPages = group('admin', () => import('../pages/admin/AdminPages'));
const Impersonate = lazy(group('public', () => import('../pages/public/Impersonate')));
const Overview = lazy(group('admin', () => import('../pages/admin/AdminOverview')));
const AdminAnalytics = lazy(group('admin', () => import('../pages/admin/AdminAnalytics')));
const AdminCandidateDetail = lazy(group('admin', () => import('../pages/admin/AdminCandidate')));
const AdminEmployerDetail = lazy(group('admin', () => import('../pages/admin/AdminEmployer')));
const KycQueue = named(adminPages, 'KycQueue');
const Taxonomy = named(adminPages, 'Taxonomy');
const SupportChat = named(adminPages, 'SupportChat');
const Communications = named(adminPages, 'Communications');
const AdminSettings = lazy(group('admin', () => import('../pages/admin/AdminSettings')));
const AdminProfile = named(adminPages, 'AdminProfile');
const AdminModule = named(adminPages, 'AdminModule');
const MediaLibrary = named(adminPages, 'MediaLibrary');

const ADMIN_MODULES = ['candidates', 'employers', 'jobs', 'responses', 'job-alerts', 'moderation', 'comments', 'blocklist', 'plans', 'coupons', 'orders', 'wallet', 'subscriptions', 'sales-leads', 'cms', 'career-advice', 'faqs', 'ads', 'contacts', 'email-center', 'locations', 'users', 'roles', 'login-audit', 'message-logs', 'sms-logs', 'security'];

/** Which top-level area a path belongs to; a new area gets a fresh loading boundary. */
const areaOf = (path) => (/^\/(admin|employer|candidate)(?:\/(?!login$|register$)|$)/.exec(path)?.[1] || 'public');

const AppRoutes = () => {
  const { pathname } = useLocation();
  return (
  <Suspense
    key={areaOf(pathname)}
    fallback={
      <>
        <div className="route-progress" />
        <PageLoader className="min-h-dvh" />
      </>
    }
  >
    <Routes>
      <Route element={<PublicLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/set-password" element={<ResetPassword activation />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/jobs" element={<JobListing />} />
        <Route path="/jobs/:id" element={<JobDetails />} />
        <Route path="/job-alerts" element={<GuestJobAlert />} />
        <Route path="/post-job" element={<PostJobGuest />} />
        <Route path="/companies" element={<Companies />} />
        <Route path="/companies/:id" element={<CompanyDetails />} />
        <Route path="/recruiters" element={<Companies type="consultancy" />} />
        <Route path="/recruiters/:id" element={<CompanyDetails />} />
        <Route path="/events" element={<Events />} />
        <Route path="/events/:slug" element={<EventDetails />} />
        <Route path="/career-advice" element={<CareerAdvice />} />
        <Route path="/career-advice/:id" element={<CareerAdviceDetail />} />
        <Route path="/help-center" element={<HelpCenter />} />
        <Route path="/about-us" element={<CmsPage slug="about-us" />} />
        {/* /jobs-in-jaipur, /sales-jobs, /sales-jobs-in-jaipur; anything else renders the 404 page */}
        <Route path="/:landing" element={<SeoLanding />} />
        <Route path="/legal/:slug" element={<CmsPage />} />
      </Route>

      <Route path="/admin/login" element={<AdminLogin />} />

      <Route element={<EmployerAuthLayout />}>
        <Route path="/employer/login" element={<EmployerLogin />} />
        <Route path="/employer/register" element={<EmployerRegister />} />
        <Route path="/for-employers" element={<EmployerLanding />} />
      </Route>

      <Route element={<ProtectedRoute role="candidate" />}>
        <Route element={<CandidateLayout />}>
          <Route path="/candidate" element={<Navigate to="/candidate/dashboard" replace />} />
          <Route path="/candidate/dashboard" element={<CandidateDashboard />} />
          <Route path="/candidate/profile" element={<CandidateProfile />} />
          <Route path="/candidate/complete-profile" element={<CompleteProfile />} />
          <Route path="/candidate/applications" element={<CandidateApplications />} />
          <Route path="/candidate/ats-tracker" element={<ATSTracker />} />
          <Route path="/candidate/interviews" element={<CandidateInterviews />} />
          <Route path="/candidate/saved-jobs" element={<SavedJobs />} />
          <Route path="/candidate/following" element={<Following />} />
          <Route path="/candidate/job-alerts" element={<JobAlerts />} />
          <Route path="/candidate/job-invites" element={<JobInvites />} />
          <Route path="/candidate/messages" element={<Messages />} />
          <Route path="/candidate/mailbox" element={<Mailbox />} />
          <Route path="/candidate/notifications" element={<Notifications />} />
          <Route path="/candidate/resume-builder" element={<ResumeBuilder />} />
          <Route path="/candidate/analytics" element={<CandidateAnalytics />} />
          <Route path="/candidate/profile-views" element={<ProfileViews />} />
          <Route path="/candidate/billing" element={<CandidateBilling />} />
          <Route path="/candidate/settings" element={<CandidateSettings />} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute role="employer" />}>
        <Route element={<EmployerLayout />}>
          <Route path="/employer" element={<Navigate to="/employer/dashboard" replace />} />
          <Route path="/employer/dashboard" element={<EmployerDashboard />} />
          <Route path="/employer/jobs" element={<EmployerJobs />} />
          <Route path="/employer/jobs/post" element={<PostJob />} />
          <Route path="/employer/jobs/:id/edit" element={<PostJob />} />
          <Route path="/employer/applications" element={<EmployerApplications />} />
          <Route path="/employer/applications/:id" element={<ApplicationDetail />} />
          <Route path="/employer/ats" element={<ATS />} />
          <Route path="/employer/candidates" element={<Candidates />} />
          <Route path="/employer/candidates/:id" element={<CandidateResumeDetail />} />
          <Route path="/employer/saved-searches" element={<SavedSearches />} />
          <Route path="/employer/folders/system/:key" element={<FolderPage />} />
          <Route path="/employer/folders/:id" element={<FolderPage />} />
          <Route path="/employer/interviews" element={<EmployerInterviews />} />
          <Route path="/employer/events" element={<EmployerEvents />} />
          <Route path="/employer/messages" element={<Messages />} />
          <Route path="/employer/mailbox" element={<Mailbox />} />
          <Route path="/employer/enquiries" element={<Enquiries />} />
          <Route path="/employer/notifications" element={<Notifications />} />
          <Route path="/employer/employees" element={<Employees />} />
          <Route path="/employer/analytics" element={<EmployerAnalytics />} />
          <Route path="/employer/reports" element={<Reports />} />
          <Route path="/employer/packages-billing" element={<PackagesBilling />} />
          <Route path="/employer/settings" element={<EmployerSettings />} />
        </Route>
      </Route>
      <Route path="/impersonate" element={<Impersonate />} />
      <Route element={<ProtectedRoute role="admin" />}>
        <Route element={<AdminLayout />}>
          <Route path="/admin" element={<Navigate to="/admin/overview" replace />} />
          <Route path="/admin/overview" element={<Overview />} />
          <Route path="/admin/analytics" element={<AdminAnalytics />} />
          <Route path="/admin/candidates/:id" element={<AdminCandidateDetail />} />
          <Route path="/admin/employers/:id" element={<AdminEmployerDetail />} />
          <Route path="/admin/kyc" element={<KycQueue />} />
          <Route path="/admin/taxonomy" element={<Taxonomy />} />
          <Route path="/admin/support-chat" element={<SupportChat />} />
          <Route path="/admin/communications" element={<Communications />} />
          <Route path="/admin/settings" element={<AdminSettings />} />
          <Route path="/admin/profile" element={<AdminProfile />} />
          <Route path="/admin/media" element={<MediaLibrary />} />
          <Route path="/admin/jobs/post" element={<AdminPostJob />} />
          <Route path="/admin/jobs/:id/edit" element={<AdminJobEdit />} />
          <Route path="/admin/cms/new" element={<ContentEditor kind="page" key="page-new" />} />
          <Route path="/admin/cms/:id/edit" element={<ContentEditor kind="page" />} />
          <Route path="/admin/career-advice/new" element={<ContentEditor kind="blog" key="blog-new" />} />
          <Route path="/admin/career-advice/:id/edit" element={<ContentEditor kind="blog" />} />
          <Route path="/admin/health" element={<SystemHealth />} />
          <Route path="/admin/search-insights" element={<SearchInsights />} />
          <Route path="/admin/risk" element={<RiskSignals />} />
          {ADMIN_MODULES.map((name) => (
            <Route key={name} path={`/admin/${name}`} element={<AdminModule name={name} />} />
          ))}
        </Route>
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  </Suspense>
  );
};

export default AppRoutes;
