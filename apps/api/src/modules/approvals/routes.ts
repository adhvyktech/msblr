import type { FastifyPluginAsync } from 'fastify';
import { requireStaff } from '../../lib/auth';
import { pendingCounts, waitingList } from './service';

const routes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireStaff);

  /** Pending counts per type, filtered by the caller's permissions (sidebar badges + approvals page). */
  app.get('/counts', async (req) => ({ data: await pendingCounts(req.user) }));

  /** Latest pending items across the visible types. */
  app.get('/latest', async (req) => {
    const n = Number((req.query as { limit?: string }).limit ?? 20);
    return { data: await waitingList(req.user, Math.min(Math.max(Number.isFinite(n) ? n : 20, 1), 50)) };
  });
};
export default routes;
