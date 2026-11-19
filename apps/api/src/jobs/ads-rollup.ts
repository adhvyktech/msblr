import cron from 'node-cron';
import type { FastifyInstance } from 'fastify';
import { pruneAdViews } from '../modules/ads/service';

export { pruneAdViews };

/**
 * Daily at 02:30 IST: delete per-viewer AdView rows older than 90 days. AdStatDaily (impressions,
 * unique viewers, clicks) is the permanent rollup and is never pruned.
 */
export default function adsRollupJob(_app?: FastifyInstance) {
  cron.schedule('30 2 * * *', () => {
    pruneAdViews().catch((e) => console.error('[ads-rollup] failed', e));
  }, { timezone: 'Asia/Kolkata' });
}
