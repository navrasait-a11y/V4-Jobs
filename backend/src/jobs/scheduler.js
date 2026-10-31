import cron from 'node-cron';
import logger from '../config/logger.js';
import { withLock } from './lock.js';
import { expireJobs } from '../modules/jobs/job.service.js';
import { processDueAlerts } from '../modules/alerts/alert.service.js';
import { sendInterviewReminders } from '../modules/applications/application.service.js';
import { processSubscriptionLifecycle } from '../modules/billing/billing.service.js';
import { sendProfileReminders } from './tasks.js';

const tasks = [];

function schedule(name, expression, fn, ttlMs = 10 * 60 * 1000) {
  const task = cron.schedule(
    expression,
    async () => {
      const started = Date.now();
      try {
        const result = await withLock(`cron:${name}`, ttlMs, fn);
        if (!result?.skipped) logger.info({ task: name, ms: Date.now() - started, result }, 'Scheduled task finished');
      } catch (err) {
        logger.error({ err, task: name }, 'Scheduled task failed');
      }
    },
    { timezone: 'Asia/Kolkata' },
  );
  tasks.push(task);
}

export function startScheduler() {
  schedule('expire-jobs', '*/15 * * * *', expireJobs);
  schedule('job-alerts', '*/10 * * * *', () => processDueAlerts({ batch: 1000 }), 9 * 60 * 1000);
  schedule('interview-reminders', '*/15 * * * *', sendInterviewReminders);
  schedule('subscriptions', '0 * * * *', processSubscriptionLifecycle);
  schedule('profile-reminders', '0 11 * * *', sendProfileReminders, 60 * 60 * 1000);
  logger.info({ tasks: tasks.length }, 'Scheduler started');
}

export function stopScheduler() {
  for (const t of tasks) t.stop();
  tasks.length = 0;
}
