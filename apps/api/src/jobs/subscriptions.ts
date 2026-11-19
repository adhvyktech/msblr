import cron from 'node-cron';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma';
import { audit } from '../lib/audit';
import { getSetting, setSetting } from '../lib/settings';
import { notify } from '../lib/push';

const DAY = 86_400_000;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dmy = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

/** familyId -> the validUntil date (YYYY-MM-DD) each reminder was last sent for. */
type Sent = Record<string, { t30?: string; t7?: string }>;
const SENT_KEY = 'subscriptionReminders';

export interface SubscriptionRunResult { expired: number; due: number; reminders: number }

/**
 * Daily status maintenance (downgrades only, so manual overrides that grant more time are never undone):
 *  - ACTIVE/DUE families whose validUntil is before today -> EXPIRED
 *  - ACTIVE families whose validUntil is within 30 days -> DUE
 *  - reminders to the head of family at T-30 and T-7 (once per validUntil date)
 */
export async function runSubscriptionStatus(now: Date = new Date()): Promise<SubscriptionRunResult> {
  const today = startOfDay(now);
  const in30 = new Date(today.getTime() + 31 * DAY - 1); // validUntil < today+31d  <=> within 30 days
  const base = { status: 'ACTIVE' as const };

  const expiring = await prisma.family.findMany({ where: { ...base, subscriptionValidUntil: { lt: today }, subscriptionStatus: { not: 'EXPIRED' } }, select: { id: true, subscriptionStatus: true } });
  if (expiring.length) {
    await prisma.family.updateMany({ where: { id: { in: expiring.map((f) => f.id) } }, data: { subscriptionStatus: 'EXPIRED' } });
    await audit(null, { action: 'subscription.expire', entity: 'family', summary: `${expiring.length} subscription(s) marked EXPIRED`, after: { familyIds: expiring.map((f) => f.id) }, actor: { name: 'System', role: 'job' } });
  }
  const dueNow = await prisma.family.findMany({ where: { ...base, subscriptionStatus: 'ACTIVE', subscriptionValidUntil: { gte: today, lte: in30 } }, select: { id: true } });
  if (dueNow.length) {
    await prisma.family.updateMany({ where: { id: { in: dueNow.map((f) => f.id) } }, data: { subscriptionStatus: 'DUE' } });
    await audit(null, { action: 'subscription.due', entity: 'family', summary: `${dueNow.length} subscription(s) marked DUE`, after: { familyIds: dueNow.map((f) => f.id) }, actor: { name: 'System', role: 'job' } });
  }

  // Reminders
  const sent = await getSetting<Sent>(SENT_KEY, {});
  const candidates = await prisma.family.findMany({
    where: { ...base, subscriptionValidUntil: { gte: today, lte: in30 } },
    select: { id: true, membershipNo: true, subscriptionValidUntil: true, persons: { where: { isHead: true, deletedAt: null }, select: { user: { select: { id: true } } }, take: 1 } },
  });
  let reminders = 0;
  for (const f of candidates) {
    const until = f.subscriptionValidUntil!;
    const days = Math.ceil((startOfDay(until).getTime() - today.getTime()) / DAY);
    const userId = f.persons[0]?.user?.id;
    if (!userId) continue;
    const mark = ymd(until);
    const rec = sent[String(f.id)] ?? {};
    const kind: 't7' | 't30' | null = days <= 7 ? 't7' : days <= 30 ? 't30' : null;
    if (!kind) continue;
    // a T-7 reminder also satisfies T-30 (don't send both when the job was down for weeks)
    if (rec[kind] === mark || (kind === 't30' && rec.t7 === mark)) continue;
    const dateStr = dmy(until);
    await notify([userId], {
      title: days <= 7 ? 'Subscription expires very soon' : 'Subscription renewal reminder',
      titleHi: days <= 7 ? 'सदस्यता शीघ्र समाप्त हो रही है' : 'सदस्यता नवीनीकरण अनुस्मारक',
      body: `Your Sabha subscription is valid until ${dateStr}. Please pay by UPI and upload the screenshot to renew.`,
      bodyHi: `आपकी सभा सदस्यता ${dateStr} तक वैध है। नवीनीकरण के लिए कृपया UPI से भुगतान कर स्क्रीनशॉट अपलोड करें।`,
      kind: 'reminder',
      data: { route: '/me/subscription' },
    });
    sent[String(f.id)] = { ...rec, [kind]: mark };
    reminders++;
  }
  if (reminders) await setSetting(SENT_KEY, sent);
  return { expired: expiring.length, due: dueNow.length, reminders };
}

/** Daily at 00:30 IST. */
export default function schedule(app: FastifyInstance) {
  cron.schedule(
    '30 0 * * *',
    () => {
      runSubscriptionStatus().then(
        (r) => app.log.info(r, 'subscription status run complete'),
        (e) => app.log.error(e, 'subscription status run failed'),
      );
    },
    { timezone: 'Asia/Kolkata' },
  );
}
