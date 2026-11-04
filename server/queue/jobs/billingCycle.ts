import { boss } from '../boss';
import { logger } from '../../config/logger';
import { runBillingCycle } from '../../utils/subscriptions';

// Migration 016: the billing cycle for paid packages — start new periods,
// switch in approved upgrades/downgrades, send the 7/3/1-day reminders and
// suspend accounts whose period ran out unpaid.
//
// pg-boss's scheduler (a cron row in its own schema) fires it every 15
// minutes, and only one worker picks each run up however many API
// processes are running, so reminders are not sent twice. The request-time
// check in utils/subscriptions.ts enforces an expiry the moment it happens,
// so the interval only governs how promptly notifications go out.

const JOB_NAME = 'billing-cycle';
const CRON = '*/15 * * * *';

const handler = async (): Promise<void> => {
  const result = await runBillingCycle();
  if (result.suspended || result.reminders) logger.info(result, 'Billing cycle run');
};

const register = async (): Promise<void> => {
  await boss.createQueue(JOB_NAME, { retryLimit: 1, retryDelay: 60 });
  await boss.work(JOB_NAME, handler);
  await boss.schedule(JOB_NAME, CRON, null, { tz: 'Asia/Colombo' });
  // One run straight away, so a restart never leaves a gap of up to 15 minutes.
  await boss.send(JOB_NAME, null);
};

export { JOB_NAME, register, handler };
