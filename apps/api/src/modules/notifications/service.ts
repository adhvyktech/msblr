import { prisma } from '../../lib/prisma';
import { httpError } from '../../lib/errors';
import { sendPush } from '../../lib/push';

export type AudienceKind = 'ALL' | 'ZONE' | 'LIST' | 'SINGLE';

/** Active users belonging to member families (those with a person record). */
const memberUsers = { status: 'ACTIVE' as const, personId: { not: null } };

/** Resolves a token to user ids: "MSB-0412" (whole family), 10-digit mobile, or a numeric user id. */
async function resolveToken(token: string): Promise<number[]> {
  const t = token.trim();
  if (!t) return [];
  if (/^MSB-\d+$/i.test(t)) {
    const users = await prisma.user.findMany({ where: { status: 'ACTIVE', person: { family: { membershipNo: t.toUpperCase() } } }, select: { id: true } });
    return users.map((u) => u.id);
  }
  if (/^\d{10}$/.test(t)) {
    const u = await prisma.user.findFirst({ where: { mobile: t, status: 'ACTIVE' }, select: { id: true } });
    return u ? [u.id] : [];
  }
  if (/^\d{1,9}$/.test(t)) {
    const u = await prisma.user.findFirst({ where: { id: Number(t), status: 'ACTIVE' }, select: { id: true } });
    return u ? [u.id] : [];
  }
  return [];
}

/** ALL -> every active member login; ZONE -> logins of families in zone `ref`; LIST -> comma ids / membership numbers / mobiles; SINGLE -> one of those. */
export async function resolveAudience(audience: AudienceKind, ref?: string | null): Promise<number[]> {
  if (audience === 'ALL') {
    return (await prisma.user.findMany({ where: memberUsers, select: { id: true } })).map((u) => u.id);
  }
  if (audience === 'ZONE') {
    const zoneId = Number(ref);
    if (!Number.isInteger(zoneId) || zoneId <= 0) throw httpError(400, 'VALIDATION_ERROR', 'Choose a zone.');
    return (await prisma.user.findMany({ where: { ...memberUsers, person: { family: { zoneId } } }, select: { id: true } })).map((u) => u.id);
  }
  const tokens = audience === 'SINGLE' ? [String(ref ?? '')] : String(ref ?? '').split(/[,\s]+/);
  const out = new Set<number>();
  for (const tk of tokens) for (const id of await resolveToken(tk)) out.add(id);
  return [...out];
}

/** Creates deliveries for an already-created (scheduled) notification, pushes, and stamps sentAt. */
export async function dispatchNotification(id: number): Promise<number> {
  const claim = await prisma.notification.updateMany({ where: { id, sentAt: null }, data: { sentAt: new Date() } });
  if (claim.count !== 1) return 0;
  const n = await prisma.notification.findUniqueOrThrow({ where: { id } });
  const ids = await resolveAudience(n.audience, n.audienceRef);
  if (!ids.length) return 0;
  await prisma.notificationDelivery.createMany({ data: ids.map((userId) => ({ notificationId: id, userId })), skipDuplicates: true });
  const status = await sendPush(ids, { title: n.title, body: n.body, data: { notificationId: String(id) } });
  for (const st of ['sent', 'failed', 'no_token'] as const) {
    const us = ids.filter((u) => status.get(u) === st);
    if (us.length) await prisma.notificationDelivery.updateMany({ where: { notificationId: id, userId: { in: us } }, data: { pushStatus: st } });
  }
  return ids.length;
}

/** Sends every scheduled notification whose time has come. Returns how many were dispatched. */
export async function processScheduledNotifications(now: Date = new Date()): Promise<number> {
  const due = await prisma.notification.findMany({ where: { sentAt: null, scheduledAt: { lte: now } }, select: { id: true }, orderBy: { id: 'asc' } });
  let n = 0;
  for (const d of due) {
    try {
      if ((await dispatchNotification(d.id)) > 0) n++;
    } catch (e) {
      console.error('[notifications] scheduled dispatch failed', d.id, e);
    }
  }
  return n;
}
