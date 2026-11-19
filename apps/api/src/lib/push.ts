import { env } from './env';
import { prisma } from './prisma';

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}
export type PushStatus = 'sent' | 'failed' | 'no_token';

type Messaging = { sendEachForMulticast(m: unknown): Promise<{ responses: { success: boolean }[] }> };
let messaging: Messaging | null | undefined;

async function getMessaging(): Promise<Messaging | null> {
  if (messaging !== undefined) return messaging;
  if (!env.FCM_SERVICE_ACCOUNT) return (messaging = null);
  try {
    const { initializeApp, cert } = await import('firebase-admin/app');
    const { getMessaging } = await import('firebase-admin/messaging');
    const app = initializeApp({ credential: cert(JSON.parse(env.FCM_SERVICE_ACCOUNT)) });
    messaging = getMessaging(app) as unknown as Messaging;
  } catch (e) {
    console.error('[push] FCM init failed, falling back to log-only', e);
    messaging = null;
  }
  return messaging;
}

/** Sends a device push. Returns status per userId. Without FCM it logs and returns no_token. */
export async function sendPush(userIds: number[], payload: PushPayload): Promise<Map<number, PushStatus>> {
  const result = new Map<number, PushStatus>();
  const m = await getMessaging();
  const tokens = await prisma.deviceToken.findMany({ where: { userId: { in: userIds } } });
  const byUser = new Map<number, string[]>();
  for (const t of tokens) byUser.set(t.userId, [...(byUser.get(t.userId) ?? []), t.token]);
  for (const uid of userIds) {
    const toks = byUser.get(uid) ?? [];
    if (!m) {
      if (env.NODE_ENV !== 'test') console.log(`[push:log] user ${uid}: ${payload.title} — ${payload.body}`);
      result.set(uid, 'no_token');
      continue;
    }
    if (!toks.length) { result.set(uid, 'no_token'); continue; }
    try {
      const r = await m.sendEachForMulticast({ tokens: toks, notification: { title: payload.title, body: payload.body }, data: payload.data });
      result.set(uid, r.responses.some((x) => x.success) ? 'sent' : 'failed');
    } catch {
      result.set(uid, 'failed');
    }
  }
  return result;
}

export interface NotifyInput {
  title: string;
  body: string;
  kind?: string; // general | wish | payment | registration | ad | reminder
  titleHi?: string;
  bodyHi?: string;
  data?: Record<string, string>;
  sentBy?: number | null;
}

/**
 * Creates an in-app Notification (+ NotificationDelivery per user), then tries a device push and
 * records pushStatus. Always works without FCM. Returns the notification id.
 */
export async function notify(userIds: number[], n: NotifyInput): Promise<number | null> {
  const ids = [...new Set(userIds)];
  if (!ids.length) return null;
  const notif = await prisma.notification.create({
    data: {
      title: n.title,
      body: n.body,
      titleHi: n.titleHi,
      bodyHi: n.bodyHi,
      kind: n.kind ?? 'general',
      audience: ids.length === 1 ? 'SINGLE' : 'LIST',
      audienceRef: ids.join(','),
      sentBy: n.sentBy ?? null,
      sentAt: new Date(),
      deliveries: { create: ids.map((userId) => ({ userId })) },
    },
  });
  const status = await sendPush(ids, { title: n.title, body: n.body, data: { ...n.data, notificationId: String(notif.id) } });
  for (const st of ['sent', 'failed', 'no_token'] as const) {
    const us = ids.filter((u) => status.get(u) === st);
    if (us.length) {
      await prisma.notificationDelivery.updateMany({ where: { notificationId: notif.id, userId: { in: us } }, data: { pushStatus: st } });
    }
  }
  return notif.id;
}
