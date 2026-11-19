import cron from 'node-cron';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma';
import { getSetting } from '../lib/settings';
import { notify } from '../lib/push';
import { istStartOfDay } from '../modules/home/shared';

const DAY = 86_400_000;
export const STALE_TITLE = 'Time to post a highlight';

/**
 * Reminds everyone who can post highlights when no highlight has been published for `contentStaleDays` days.
 * Sends at most once per (IST) day. Returns what happened so tests and logs can see it.
 */
export async function runContentStaleness(now = new Date()) {
  const rawDays = Number(await getSetting<number>('contentStaleDays', 10));
  const days = Number.isFinite(rawDays) && rawDays > 0 ? rawDays : 10;
  const last = await prisma.highlight.aggregate({ where: { status: 'PUBLISHED', publishedAt: { lte: now } }, _max: { publishedAt: true } });
  const lastAt = last._max.publishedAt;
  const daysSince = lastAt ? Math.floor((now.getTime() - lastAt.getTime()) / DAY) : null;
  const stale = lastAt === null || now.getTime() - lastAt.getTime() > days * DAY;
  if (!stale) return { stale: false as const, notified: 0, daysSince };

  const already = await prisma.notification.findFirst({ where: { kind: 'reminder', title: STALE_TITLE, createdAt: { gte: istStartOfDay(now) } }, select: { id: true } });
  if (already) return { stale: true as const, notified: 0, daysSince, skipped: 'already-sent-today' as const };

  const users = await prisma.user.findMany({
    where: { status: 'ACTIVE', roles: { some: { role: { permissions: { some: { perm: 'highlights.post' } } } } } },
    select: { id: true },
  });
  if (!users.length) return { stale: true as const, notified: 0, daysSince };
  const ago = daysSince === null ? 'a long time' : `${daysSince} days`;
  await notify(users.map((u) => u.id), {
    title: STALE_TITLE,
    titleHi: 'हाइलाइट पोस्ट करने का समय',
    body: `No highlight has been posted for ${ago}. Share photos from a recent event so members see fresh news on the home page.`,
    bodyHi: `पिछले ${daysSince ?? 'कई'} दिनों से कोई हाइलाइट पोस्ट नहीं हुआ। हाल के कार्यक्रम की फ़ोटो साझा करें ताकि सदस्यों को होम पेज पर ताज़ा खबर दिखे।`,
    kind: 'reminder',
    data: { url: '/admin/highlights' },
  });
  return { stale: true as const, notified: users.length, daysSince };
}

/** Daily at 09:00 IST. */
export default function scheduleContentStaleness(app: FastifyInstance) {
  cron.schedule(
    '0 9 * * *',
    () => {
      runContentStaleness().catch((err) => app.log.error({ err }, 'content staleness job failed'));
    },
    { timezone: 'Asia/Kolkata' },
  );
}
