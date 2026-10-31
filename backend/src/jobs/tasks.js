import Candidate from '../modules/candidates/candidate.model.js';
import { notifyMany } from '../modules/notifications/notification.service.js';
import { daysAgo } from '../shared/utils/timespan.js';

/** Daily nudge for candidates whose profile is below 70% and was not updated in the last week. */
export async function sendProfileReminders() {
  const rows = await Candidate.find({ profileCompletion: { $lt: 70 }, updatedAt: { $lt: daysAgo(7), $gt: daysAgo(90) } })
    .select('user')
    .limit(5000)
    .lean();
  if (!rows.length) return { reminded: 0 };
  await notifyMany(
    rows.map((r) => r.user),
    {
      type: 'profile_reminder',
      title: 'Complete your profile to get noticed',
      body: 'Recruiters prefer complete profiles. Add your resume and skills now.',
      data: { screen: 'profile' },
      channels: ['in_app', 'push'],
    },
  );
  return { reminded: rows.length };
}
