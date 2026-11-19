import cron from 'node-cron';
import type { FastifyInstance } from 'fastify';
import type { WishKind } from '@prisma/client';
import { prisma, Prisma } from '../lib/prisma';
import { notify } from '../lib/push';
import { getSetting } from '../lib/settings';
import { audit } from '../lib/audit';
import { processScheduledNotifications } from '../modules/notifications/service';

const IST_MS = 5.5 * 3600_000;
const DEFAULT_TEMPLATES = {
  birthday: { en: 'Happy Birthday, {name}! Maheshwari Sabha Bengaluru wishes you good health and joy.', hi: 'जन्मदिन की हार्दिक शुभकामनाएं, {name}! माहेश्वरी सभा बेंगलुरु की ओर से स्वस्थ और सुखी जीवन की कामना।' },
  anniversary: { en: 'Happy Anniversary, {name}! Maheshwari Sabha Bengaluru wishes you a lifetime of togetherness.', hi: 'विवाह की वर्षगांठ की हार्दिक शुभकामनाएं, {name}! माहेश्वरी सभा बेंगलुरु की ओर से सुखी दांपत्य की कामना।' },
};
type Templates = typeof DEFAULT_TEMPLATES;

/** Month/day of a stored date in IST. */
function mdIST(d: Date) {
  const s = new Date(d.getTime() + IST_MS);
  return { m: s.getUTCMonth() + 1, d: s.getUTCDate() };
}
const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

export interface WishResult { year: number; birthdays: number; anniversaries: number; notifications: number }

/**
 * Sends today's (IST) birthday / anniversary wishes. Each person+kind+year is claimed in WishLog first,
 * so re-running the job the same day (or a restart) never sends twice.
 */
export async function runWishes(now: Date = new Date()): Promise<WishResult> {
  const ist = new Date(now.getTime() + IST_MS);
  const year = ist.getUTCFullYear();
  const today = { m: ist.getUTCMonth() + 1, d: ist.getUTCDate() };
  const matches = (date: Date | null) => {
    if (!date) return false;
    const x = mdIST(date);
    if (x.m === today.m && x.d === today.d) return true;
    // 29 Feb celebrates on 28 Feb in non-leap years
    return x.m === 2 && x.d === 29 && !isLeap(year) && today.m === 2 && today.d === 28;
  };
  const tpl = { ...DEFAULT_TEMPLATES, ...(await getSetting<Partial<Templates>>('wishTemplates', {})) } as Templates;
  const res: WishResult = { year, birthdays: 0, anniversaries: 0, notifications: 0 };

  const people = await prisma.person.findMany({
    where: { deletedAt: null, wishesOptOut: false, family: { status: 'ACTIVE' }, OR: [{ dob: { not: null } }, { anniversary: { not: null } }] },
    include: { user: { select: { id: true, status: true } }, family: { include: { persons: { where: { isHead: true, deletedAt: null }, include: { user: { select: { id: true, status: true } } } } } } },
  });

  for (const p of people) {
    const kinds: { kind: WishKind; date: Date | null }[] = [{ kind: 'BIRTHDAY', date: p.dob }, { kind: 'ANNIVERSARY', date: p.anniversary }];
    for (const { kind, date } of kinds) {
      if (!matches(date)) continue;
      const own = p.user?.status === 'ACTIVE' ? p.user.id : null;
      const head = p.family.persons[0];
      const headUser = head && head.id !== p.id && head.user?.status === 'ACTIVE' ? head.user.id : null;
      if (!own && !headUser) continue;
      try {
        await prisma.wishLog.create({ data: { personId: p.id, kind, year } });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') continue; // already sent this year
        throw e;
      }
      const t = tpl[kind === 'BIRTHDAY' ? 'birthday' : 'anniversary'];
      const text = (s: string) => s.replace(/\{name\}/g, p.name);
      const isBd = kind === 'BIRTHDAY';
      if (own) {
        await notify([own], {
          title: isBd ? 'Happy Birthday!' : 'Happy Anniversary!', titleHi: isBd ? 'जन्मदिन मुबारक!' : 'वर्षगांठ मुबारक!',
          body: text(t.en), bodyHi: text(t.hi), kind: 'wish', data: { personId: String(p.id), wish: kind },
        });
        res.notifications++;
      }
      if (headUser) {
        await notify([headUser], {
          title: isBd ? `Birthday today: ${p.name}` : `Anniversary today: ${p.name}`, titleHi: isBd ? `आज जन्मदिन: ${p.name}` : `आज वर्षगांठ: ${p.name}`,
          body: text(t.en), bodyHi: text(t.hi), kind: 'wish', data: { personId: String(p.id), wish: kind },
        });
        res.notifications++;
      }
      if (isBd) res.birthdays++; else res.anniversaries++;
    }
  }
  if (res.birthdays + res.anniversaries > 0) {
    await audit(null, { action: 'wishes.run', entity: 'wish', summary: `Sent ${res.birthdays} birthday and ${res.anniversaries} anniversary wishes`, after: res, actor: { name: 'System', role: 'job' } });
  }
  return res;
}

export default function wishesJob(_app?: FastifyInstance) {
  // 08:00 IST daily
  cron.schedule('0 8 * * *', () => {
    runWishes().catch((e) => console.error('[wishes] failed', e));
  }, { timezone: 'Asia/Kolkata' });
  // scheduled admin notifications, every 5 minutes
  cron.schedule('*/5 * * * *', () => {
    processScheduledNotifications().catch((e) => console.error('[notifications] scheduled run failed', e));
  });
}
