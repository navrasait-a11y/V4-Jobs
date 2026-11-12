import User from './user.model.js';
import Candidate from '../candidates/candidate.model.js';
import { Application, Interview } from '../applications/application.model.js';
import { JobAlert } from '../alerts/alert.model.js';
import { Follow, SavedJob, SavedSearch, JobInvite } from '../engagement/engagement.models.js';
import { Order, WalletTransaction, Wallet } from '../billing/billing.models.js';
import { LoginAttempt } from '../auth/auth.models.js';
import { Report, Comment } from '../moderation/moderation.models.js';
import { ROLES } from '../../shared/constants/index.js';

const LIMIT = 5000;
const strip = (doc, keys) => {
  for (const key of keys) delete doc[key];
  return doc;
};

/**
 * "Download my data" (privacy / GDPR style access request): everything the user gave us or that
 * was recorded about their own account. Recruiter-side notes about a candidate (screening status,
 * internal comments) belong to the employer and are left out, as are storage keys and secrets.
 */
export async function exportMyData(userId) {
  const user = await User.findById(userId);
  const account = strip(user.toSafeJSON(), ['twoFactor', 'deviceTokens', 'labels', 'situationTag', 'admin']);
  if (account.avatar) delete account.avatar.key;

  const isCandidate = user.role === ROLES.CANDIDATE;
  const wallet = await Wallet.findOne(isCandidate ? { user: userId } : { organization: user.employer?.organization || null })
    .select('_id balance')
    .lean();

  const [profile, applications, interviews, alerts, savedJobs, savedSearches, following, invites, orders, walletTransactions, logins, reports, comments] = await Promise.all([
    isCandidate ? Candidate.findOne({ user: userId }).select('-boostUntil -__v').lean() : null,
    isCandidate
      ? Application.find({ candidate: userId })
          .select('job organization stage source snapshot answers coverLetter createdAt updatedAt')
          .populate('job', 'title slug')
          .sort({ createdAt: -1 })
          .limit(LIMIT)
          .lean()
      : [],
    isCandidate ? Interview.find({ candidate: userId }).select('-interviewers -scheduledBy -__v').sort({ createdAt: -1 }).limit(LIMIT).lean() : [],
    JobAlert.find({ user: userId }).select('-createdBy -__v').limit(LIMIT).lean(),
    SavedJob.find({ user: userId }).populate('job', 'title slug').limit(LIMIT).lean(),
    SavedSearch.find({ owner: userId }).select('name scope filters createdAt').limit(LIMIT).lean(),
    Follow.find({ follower: userId }).populate('organization', 'name slug').limit(LIMIT).lean(),
    isCandidate ? JobInvite.find({ candidate: userId }).select('job status message createdAt').populate('job', 'title slug').limit(LIMIT).lean() : [],
    Order.find({ buyer: userId }).select('orderNumber kind planName amount discount gst walletUsed total status paymentMethod paidAt createdAt billing').sort({ createdAt: -1 }).limit(LIMIT).lean(),
    wallet ? WalletTransaction.find({ wallet: wallet._id }).select('type amount balanceAfter reason note createdAt').sort({ createdAt: -1 }).limit(LIMIT).lean() : [],
    LoginAttempt.find({ user: userId }).select('method success ip userAgent createdAt').sort({ createdAt: -1 }).limit(1000).lean(),
    Report.find({ reporter: userId }).select('targetType reason details status createdAt').limit(LIMIT).lean(),
    Comment.find({ author: userId }).select('targetType body rating status createdAt').limit(LIMIT).lean(),
  ]);

  if (profile?.resume?.key) delete profile.resume.key;
  for (const a of applications) if (a.snapshot?.resume?.key) delete a.snapshot.resume.key;

  return {
    exportedAt: new Date().toISOString(),
    account,
    profile,
    applications,
    interviews,
    jobAlerts: alerts,
    savedJobs,
    savedSearches,
    following,
    jobInvites: invites,
    orders,
    wallet: wallet ? { balance: wallet.balance, transactions: walletTransactions } : null,
    loginHistory: logins,
    reportsFiled: reports,
    commentsWritten: comments,
  };
}
