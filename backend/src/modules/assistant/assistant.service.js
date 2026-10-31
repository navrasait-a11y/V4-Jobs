import { ROLES } from '../../shared/constants/index.js';
import Candidate from '../candidates/candidate.model.js';
import { myApplications } from '../applications/application.service.js';
import { Faq } from '../cms/cms.models.js';
import { recommendedJobs, searchJobs } from '../jobs/job.service.js';

/**
 * Help assistant. Rule based on purpose: answers come from live data (matching, job search,
 * the viewer's applications, admin-managed FAQs), so nothing is invented and no paid AI key is
 * needed. Anything it cannot answer is handed to the human support queue.
 */
const JOB_LIMIT = 4;
const START = ['Recommend jobs for me', 'Show remote jobs', 'Check my applications', 'Talk to support team'];

const STOP = new Set(
  'a an and any are at best can do find for get give hai i is job jobs ka ke ki koi kuch latest list looking me mere mujhe my naukri naukriyan need new of on open opening openings please plz position positions show some the to vacancies vacancy want with batao dikhao chahiye liye hiring work'.split(' '),
);
const FILTER_WORDS = /\b(remote|work from home|wfh|fresher|freshers|internships?)\b/g;
const QUESTION = /^(how|what|why|when|where|can|could|should|is|are|do|does|will|kaise|kya|kyu|kyun|kab)\b/;

const TOPICS = [
  [/\bapply\b/, 'Open any job and press Apply. You can apply with your profile and resume, then track it in your applications.', (role) => [['Find jobs', '/jobs'], ...(role === ROLES.CANDIDATE ? [['My applications', '/candidate/applications']] : [])]],
  [/resume|\bcv\b/, 'You can upload your resume from your profile, or create one with the resume builder.', () => [['Open profile', '/candidate/profile'], ['Resume builder', '/candidate/resume-builder']]],
  [/password|log ?in|sign ?in|otp/, 'If you cannot log in, reset your password. Mobile OTP login is also available on the login page.', () => [['Reset password', '/forgot-password'], ['Log in', '/login']]],
  [/alert/, 'Job alerts send you new jobs that match your search.', (role) => [['Job alerts', role === ROLES.CANDIDATE ? '/candidate/job-alerts' : '/job-alerts']]],
  [/plan|price|pricing|payment|invoice|refund|subscription|billing|booster/, 'Your plans, orders and invoices are in Billing.', (role) => [['Open billing', role === ROLES.EMPLOYER ? '/employer/billing' : '/candidate/billing']]],
  [/interview/, 'Your scheduled interviews are listed in one place.', (role) => [['View interviews', role === ROLES.EMPLOYER ? '/employer/interviews' : '/candidate/interviews']]],
  [/profile/, 'A complete profile gets better job matches.', (role) => [['Update profile', role === ROLES.EMPLOYER ? '/employer/dashboard' : '/candidate/profile']]],
  [/post.*job|hire|hiring|candidate/, 'Employers can post jobs and search candidates from the employer area.', (role) => [[role === ROLES.EMPLOYER ? 'Post a job' : 'For employers', role === ROLES.EMPLOYER ? '/employer/jobs' : '/for-employers']]],
  [/contact|email|phone|complaint/, 'You can reach us through the help centre, or ask for the support team here.', () => [['Help centre', '/help-center']]],
];

const toLinks = (pairs) => pairs.map(([label, to]) => ({ label, to }));
const words = (s) => s.toLowerCase().match(/[a-z0-9]+/g) || [];

export function detectIntent(message) {
  const text = message.toLowerCase().trim();
  if (/\b(agent|human|real person|customer (care|support)|support team|talk to|speak to|connect me)\b/.test(text)) return 'handoff';
  if (/^(hi+|hello|hey|namaste|namaskar|good (morning|afternoon|evening))\b[\s!.]*$/.test(text)) return 'greeting';
  if (/\b(recommend|recommendation|best fit|suit|suited|suitable|match|matches|matching)\b|for me\b|mere liye/.test(text)) return 'recommend';
  if (/\b(my application|my applications|applied|application status|mera application|meri application)\b/.test(text)) return 'applications';
  if (QUESTION.test(text)) return 'help';
  if (/\b(jobs?|naukri|naukriyan|vacanc(y|ies)|openings?|internships?|wfh|work from home|remote)\b/.test(text)) return 'search';
  return 'help';
}

/** Turns "remote sales jobs in jaipur" into job search filters. */
export function parseJobQuery(message) {
  let text = message.toLowerCase().replace(/[^\w\s-]/g, ' ');
  const query = {};
  if (/\b(remote|work from home|wfh)\b/.test(text)) query.remoteOnly = true;
  if (/\bfreshers?\b/.test(text)) query.experience = 0;
  if (/\binternships?\b/.test(text)) query.kind = 'internship';
  text = text.replace(FILTER_WORDS, ' ');
  const place = text.match(/\b(?:in|at|near)\s+([a-z][a-z ]{2,30})$/);
  if (place) {
    query.location = place[1].trim();
    text = text.slice(0, place.index);
  }
  const q = words(text).filter((w) => !STOP.has(w)).join(' ');
  if (q) query.q = q;
  return query;
}

async function recommend(user) {
  if (!user) return { text: 'Log in so I can match jobs to your profile.', links: toLinks([['Log in', '/login'], ['Browse jobs', '/jobs']]) };
  if (user.role !== ROLES.CANDIDATE) return { text: 'Job matching is for candidates. You can search candidates for your open roles here.', links: toLinks([['Search candidates', '/employer/candidates']]) };
  const profile = await Candidate.findOne({ user: user._id }).select('keySkills itSkills roles').lean();
  const { items } = await recommendedJobs(user._id, { limit: JOB_LIMIT });
  const thin = !profile?.keySkills?.length && !profile?.itSkills?.length && !profile?.roles?.length;
  const links = toLinks(thin ? [['Add skills to profile', '/candidate/profile']] : [['See all jobs', '/jobs']]);
  if (!items.length) return { text: 'I could not find a matching open job right now. Adding more skills to your profile can help.', links: toLinks([['Update profile', '/candidate/profile'], ['Browse jobs', '/jobs']]) };
  const text = thin ? 'Your profile has no skills yet, so these are general picks. Add skills for better matches.' : 'These open jobs match your profile best.';
  return { text, jobs: items, links };
}

async function applications(user) {
  if (!user) return { text: 'Log in to see your applications.', links: toLinks([['Log in', '/login']]) };
  if (user.role !== ROLES.CANDIDATE) return { text: 'You can review responses to your jobs here.', links: toLinks([['View responses', '/employer/applications']]) };
  const { items, total } = await myApplications(user._id, { page: 1, limit: 3, skip: 0 });
  if (!total) return { text: 'You have not applied to any job yet.', links: toLinks([['Find jobs', '/jobs']]) };
  const latest = items.map((a) => `${a.job?.title || 'Job'}: ${String(a.stage).replaceAll('_', ' ')}`).join('\n');
  return { text: `You have ${total} application${total === 1 ? '' : 's'}. Latest:\n${latest}`, links: toLinks([['View applications', '/candidate/applications']]) };
}

async function search(user, message) {
  const query = parseJobQuery(message);
  const { items, total } = await searchJobs(query, user, { page: 1, limit: JOB_LIMIT, skip: 0 });
  const params = new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)]));
  if (!items.length) return { text: 'I could not find an open job for that search. Try a different skill or city.', links: toLinks([['Browse all jobs', '/jobs']]) };
  return { text: `Found ${total} open job${total === 1 ? '' : 's'}.`, jobs: items, links: toLinks([['See all results', `/jobs?${params}`]]) };
}

/** Best FAQ by shared words. Short questions need a stronger overlap to count. */
async function findFaq(user, message) {
  const asked = new Set(words(message).filter((w) => w.length > 2 && !STOP.has(w)));
  if (!asked.size) return null;
  const audience = user?.role === ROLES.EMPLOYER ? 'employer' : 'candidate';
  const faqs = await Faq.find({ isActive: true, audience: { $in: ['all', audience] } }).select('question answer').lean();
  const scored = faqs.map((faq) => ({ faq, hits: new Set(words(faq.question)).intersection(asked).size })).sort((a, b) => b.hits - a.hits);
  const best = scored[0];
  return best && best.hits >= Math.min(2, asked.size) ? best.faq : null;
}

async function help(user, message) {
  const faq = await findFaq(user, message);
  if (faq) return { text: faq.answer.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(), links: toLinks([['Help centre', '/help-center']]) };
  const text = message.toLowerCase();
  const topic = TOPICS.find(([pattern]) => pattern.test(text));
  if (topic) return { text: topic[1], links: toLinks(topic[2](user?.role)) };
  return { text: 'I am not sure about that. Our support team can help you with it.', handoff: true, suggestions: START.slice(0, 3) };
}

export async function reply(user, message) {
  const intent = detectIntent(message);
  if (intent === 'handoff') return { text: 'Sure, our support team can take this from here.', handoff: true };
  if (intent === 'greeting') return { text: `Hi${user?.fullName ? ` ${user.fullName.split(' ')[0]}` : ''}, how can I help you today?`, suggestions: START };
  if (intent === 'recommend') return recommend(user);
  if (intent === 'applications') return applications(user);
  if (intent === 'search') return search(user, message);
  return help(user, message);
}
