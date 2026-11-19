import cron from 'node-cron';
import type { FastifyInstance } from 'fastify';
import { runAdsLifecycle } from '../modules/ads/service';

export { runAdsLifecycle };

/** Hourly: APPROVED -> LIVE, LIVE -> EXPIRED, 7-day renewal reminders, home-carousel banner sync. */
export default function adsLifecycleJob(_app?: FastifyInstance) {
  cron.schedule('5 * * * *', () => {
    runAdsLifecycle().catch((e) => console.error('[ads-lifecycle] failed', e));
  }, { timezone: 'Asia/Kolkata' });
  // also once at startup so a restart never leaves stale states
  runAdsLifecycle().catch((e) => console.error('[ads-lifecycle] startup run failed', e));
}
