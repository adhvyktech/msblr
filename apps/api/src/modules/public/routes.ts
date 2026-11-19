import type { FastifyPluginAsync } from 'fastify';
import { prisma } from '../../lib/prisma';
import { getSetting } from '../../lib/settings';
import { fileUrl } from '../../lib/files';
import { buildPublicSite, registerPublicSiteFileRules } from './site';

registerPublicSiteFileRules();

const routes: FastifyPluginAsync = async (app) => {
  app.get('/config', async () => {
    const [theme, sabha, upi, subscription] = await Promise.all([
      getSetting<string>('theme', 'c'),
      getSetting<Record<string, unknown>>('sabha', {}),
      getSetting<{ id?: string; payeeName?: string; qrFileId?: number | null }>('upi', {}),
      getSetting<{ amount?: number }>('subscription', {}),
    ]);
    return {
      data: {
        appName: 'MSBLR E-Directory',
        tagline: 'Connect • Engage • Prosper',
        theme,
        sabha,
        upi: { id: upi.id ?? null, payeeName: upi.payeeName ?? null, qrUrl: upi.qrFileId ? fileUrl(upi.qrFileId) : null },
        subscription: { amount: subscription.amount ?? null },
        languages: ['en', 'hi'],
      },
    };
  });

  app.get('/site', async (_req, reply) => {
    reply.header('Cache-Control', 'public, max-age=60');
    return { data: await buildPublicSite() };
  });

  app.get('/stats', async () => {
    const activeFamilies = await prisma.family.count({ where: { status: 'ACTIVE' } });
    return { data: { activeFamilies } };
  });
};
export default routes;
