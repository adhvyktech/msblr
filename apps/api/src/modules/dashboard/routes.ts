import type { FastifyPluginAsync } from 'fastify';
import { prisma } from '../../lib/prisma';
import { requirePerm, hasPerm } from '../../lib/auth';
import { getSetting } from '../../lib/settings';
import { pendingCounts, waitingList } from '../approvals/service';
import { dayKey, lastDays, platformOf, DAY } from './util';

const routes: FastifyPluginAsync = async (app) => {
  app.get('/', { preHandler: requirePerm('dashboard.view') }, async (req) => {
    const u = req.user;
    const any = (...p: string[]) => p.some((x) => hasPerm(u, x));
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const weekAgo = new Date(now.getTime() - 7 * DAY);
    const in7 = new Date(now.getTime() + 7 * DAY);

    const showPayments = any('payments.verify', 'receipts.view');
    const showAds = any('ads.manage', 'ads.approve');
    const showSubs = any('payments.verify', 'receipts.view', 'members.edit', 'reports.view');
    const showUsage = any('reports.view', 'audit.view');
    const showContent = any('events.post', 'highlights.post');

    const [activeFamilies, newThisMonth, counts, waiting] = await Promise.all([
      prisma.family.count({ where: { status: 'ACTIVE' } }),
      prisma.family.count({ where: { status: 'ACTIVE', createdAt: { gte: monthStart } } }),
      pendingCounts(u),
      waitingList(u, 10),
    ]);

    const pendingApprovals = {
      registrations: counts.registrations ?? null,
      logins: counts.logins ?? null,
      businesses: counts.businesses ?? null,
      ads: counts.ads ?? null,
    };

    const paymentsToVerify = showPayments
      ? await prisma.payment.aggregate({ where: { status: 'PENDING' }, _count: true, _sum: { amount: true } }).then((a) => ({ count: a._count, amount: Number(a._sum.amount ?? 0) }))
      : null;

    const liveAds = showAds
      ? await Promise.all([
          prisma.ad.count({
            where: { paused: false, request: { status: 'LIVE' }, AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gte: now } }] }] },
          }),
          prisma.ad.count({ where: { paused: false, request: { status: 'LIVE' }, endsAt: { gte: now, lte: in7 } } }),
        ]).then(([count, expiringIn7d]) => ({ count, expiringIn7d }))
      : null;

    let appUsersThisWeek: { count: number; percent: number; totalUsers: number } | null = null;
    let loginsByDay: { date: string; web: number; app: number; total: number }[] | null = null;
    if (showUsage) {
      const [byLogin, bySession, totalUsers] = await Promise.all([
        prisma.user.findMany({ where: { lastLoginAt: { gte: weekAgo } }, select: { id: true } }),
        prisma.session.findMany({ where: { lastUsedAt: { gte: weekAgo } }, select: { userId: true }, distinct: ['userId'] }),
        prisma.user.count({ where: { status: 'ACTIVE' } }),
      ]);
      const ids = new Set([...byLogin.map((x) => x.id), ...bySession.map((x) => x.userId)]);
      appUsersThisWeek = { count: ids.size, totalUsers, percent: totalUsers ? Math.round((ids.size / totalUsers) * 100) : 0 };

      const days = lastDays(30);
      const logs = await prisma.auditLog.findMany({
        where: { action: 'auth.login', at: { gte: new Date(now.getTime() - 31 * DAY) } },
        select: { at: true, summary: true },
      });
      const map = new Map(days.map((d) => [d, { date: d, web: 0, app: 0, total: 0 }]));
      for (const l of logs) {
        const row = map.get(dayKey(l.at));
        if (!row) continue;
        row.total++;
        if (platformOf(l.summary) === 'app') row.app++;
        else row.web++;
      }
      loginsByDay = [...map.values()];
    }

    const subscriptions = showSubs
      ? await prisma.family.groupBy({ by: ['subscriptionStatus'], where: { status: 'ACTIVE' }, _count: true }).then((g) => {
          const o = { active: 0, due: 0, expired: 0 };
          for (const r of g) o[r.subscriptionStatus.toLowerCase() as 'active' | 'due' | 'expired'] = r._count;
          return o;
        })
      : null;

    let contentAlert: { daysSince: number | null; staleDays: number; stale: boolean; lastHighlightAt: Date | null } | null = null;
    if (showContent) {
      const staleDays = Number(await getSetting<number>('contentStaleDays', 10)) || 10;
      const last = await prisma.highlight.findFirst({ where: { status: 'PUBLISHED' }, orderBy: { publishedAt: 'desc' }, select: { publishedAt: true } });
      const daysSince = last ? Math.floor((now.getTime() - last.publishedAt.getTime()) / DAY) : null;
      contentAlert = { daysSince, staleDays, stale: daysSince === null || daysSince >= staleDays, lastHighlightAt: last?.publishedAt ?? null };
    }

    return {
      data: {
        kpis: {
          activeFamilies: { count: activeFamilies, newThisMonth },
          pendingApprovals,
          paymentsToVerify,
          liveAds,
          appUsersThisWeek,
        },
        subscriptions,
        loginsByDay,
        waiting,
        contentAlert,
      },
    };
  });
};
export default routes;
