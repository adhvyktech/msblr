import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { authenticate, requirePerm } from '../../lib/auth';
import { parse } from '../../lib/parse';
import { paginate } from '../../lib/pagination';
import { httpError } from '../../lib/errors';
import { audit } from '../../lib/audit';
import { notify } from '../../lib/push';
import { resolveAudience } from './service';

const audienceSchema = z.object({
  audience: z.enum(['ALL', 'ZONE', 'LIST', 'SINGLE']),
  audienceRef: z.union([z.string(), z.number()]).transform((v) => String(v)).optional(),
});
const sendSchema = audienceSchema.extend({
  title: z.string().trim().min(1, 'Enter a title').max(120),
  body: z.string().trim().min(1, 'Enter the message').max(1000),
  titleHi: z.string().trim().max(120).optional(),
  bodyHi: z.string().trim().max(1000).optional(),
  scheduledAt: z.string().datetime({ offset: true }).optional(),
});
const templateSchema = z.object({ name: z.string().trim().min(1).max(60), title: z.string().trim().min(1).max(120), body: z.string().trim().min(1).max(1000) });
const idParam = z.object({ id: z.coerce.number().int().positive() });

const routes: FastifyPluginAsync = async (app) => {
  const send = requirePerm('notifications.send');

  // ================= staff: composer =================
  app.post('/send', { preHandler: send }, async (req) => {
    const b = parse(sendSchema, req.body);
    const ids = await resolveAudience(b.audience, b.audienceRef);
    if (!ids.length) throw httpError(400, 'NO_RECIPIENTS', 'No members match this audience.');
    const when = b.scheduledAt ? new Date(b.scheduledAt) : null;
    if (when && when.getTime() > Date.now() + 60_000) {
      const n = await prisma.notification.create({
        data: { title: b.title, body: b.body, titleHi: b.titleHi || null, bodyHi: b.bodyHi || null, audience: b.audience, audienceRef: b.audienceRef ?? null, kind: 'general', sentBy: req.user.id, scheduledAt: when },
      });
      await audit(req, { action: 'notification.schedule', entity: 'notification', entityId: n.id, summary: `Scheduled "${b.title}" for ${when.toISOString()} (${ids.length} recipients)`, after: { audience: b.audience, audienceRef: b.audienceRef, scheduledAt: when } });
      return { data: { id: n.id, scheduled: true, scheduledAt: when, recipients: ids.length } };
    }
    const id = await notify(ids, { title: b.title, body: b.body, titleHi: b.titleHi || undefined, bodyHi: b.bodyHi || undefined, kind: 'general', sentBy: req.user.id });
    await prisma.notification.update({ where: { id: id! }, data: { audience: b.audience, audienceRef: b.audienceRef ?? null } });
    await audit(req, { action: 'notification.send', entity: 'notification', entityId: id!, summary: `Sent "${b.title}" to ${ids.length} recipients (${b.audience})`, after: { audience: b.audience, audienceRef: b.audienceRef, recipients: ids.length } });
    return { data: { id, scheduled: false, recipients: ids.length } };
  });

  app.post('/preview-count', { preHandler: send }, async (req) => {
    const b = parse(audienceSchema, req.body);
    const ids = await resolveAudience(b.audience, b.audienceRef);
    return { data: { count: ids.length } };
  });

  app.get('/recipients', { preHandler: send }, async (req) => {
    const { q } = parse(z.object({ q: z.string().trim().min(1).max(60) }), req.query);
    const users = await prisma.user.findMany({
      where: {
        status: 'ACTIVE', personId: { not: null },
        OR: [
          { displayName: { contains: q, mode: 'insensitive' } }, { mobile: { contains: q } },
          { person: { name: { contains: q, mode: 'insensitive' } } }, { person: { family: { membershipNo: { contains: q, mode: 'insensitive' } } } },
        ],
      },
      select: { id: true, mobile: true, displayName: true, person: { select: { name: true, family: { select: { membershipNo: true, zone: { select: { name: true } } } } } } },
      take: 20, orderBy: { id: 'asc' },
    });
    return { data: users.map((u) => ({ userId: u.id, name: u.person?.name ?? u.displayName ?? u.mobile, mobile: u.mobile, membershipNo: u.person?.family.membershipNo ?? null, zone: u.person?.family.zone?.name ?? null })) };
  });

  app.get('/zones', { preHandler: send }, async () => ({ data: await prisma.zone.findMany({ orderBy: [{ sort: 'asc' }, { id: 'asc' }], select: { id: true, name: true } }) }));

  app.get('/sent', { preHandler: send }, async (req) => {
    const pg = paginate(req.query);
    const where: Prisma.NotificationWhereInput = { sentBy: { not: null }, kind: 'general' };
    const [rows, total] = await Promise.all([
      prisma.notification.findMany({ where, orderBy: { id: 'desc' }, skip: pg.skip, take: pg.take }),
      prisma.notification.count({ where }),
    ]);
    const ids = rows.map((r) => r.id);
    const g = ids.length ? await prisma.notificationDelivery.groupBy({ by: ['notificationId', 'pushStatus'], where: { notificationId: { in: ids } }, _count: { _all: true } }) : [];
    const reads = ids.length ? await prisma.notificationDelivery.groupBy({ by: ['notificationId'], where: { notificationId: { in: ids }, readAt: { not: null } }, _count: { _all: true } }) : [];
    const readBy = new Map(reads.map((r) => [r.notificationId, r._count._all]));
    return pg.result(rows.map((n) => {
      const mine = g.filter((x) => x.notificationId === n.id);
      const count = (s: string) => mine.find((x) => x.pushStatus === s)?._count._all ?? 0;
      const recipients = mine.reduce((s, x) => s + x._count._all, 0);
      return {
        id: n.id, title: n.title, body: n.body, titleHi: n.titleHi, bodyHi: n.bodyHi, audience: n.audience, audienceRef: n.audienceRef,
        scheduledAt: n.scheduledAt, sentAt: n.sentAt, createdAt: n.createdAt, status: n.sentAt ? 'SENT' : 'SCHEDULED',
        recipients, read: readBy.get(n.id) ?? 0, pushSent: count('sent'), pushFailed: count('failed'), noToken: count('no_token'),
      };
    }), total);
  });

  app.delete('/sent/:id', { preHandler: send }, async (req) => {
    const { id } = parse(idParam, req.params);
    const n = await prisma.notification.findUnique({ where: { id } });
    if (!n || n.sentAt) throw httpError(404, 'NOT_FOUND', 'Only scheduled messages that have not been sent can be cancelled.');
    await prisma.notification.delete({ where: { id } });
    await audit(req, { action: 'notification.cancel', entity: 'notification', entityId: id, summary: `Cancelled scheduled "${n.title}"`, before: { title: n.title, scheduledAt: n.scheduledAt } });
    return { data: { ok: true } };
  });

  app.get('/whatsapp-list', { preHandler: send }, async (req) => {
    const q = parse(audienceSchema, req.query);
    const ids = await resolveAudience(q.audience, q.audienceRef);
    const users = await prisma.user.findMany({
      where: { id: { in: ids.slice(0, 500) } },
      select: { id: true, mobile: true, displayName: true, person: { select: { name: true, mobile: true, family: { select: { membershipNo: true } } } } },
      orderBy: { id: 'asc' },
    });
    return {
      data: users.map((u) => ({ userId: u.id, name: u.person?.name ?? u.displayName ?? u.mobile, mobile: u.person?.mobile ?? u.mobile, membershipNo: u.person?.family.membershipNo ?? null })),
      total: ids.length,
    };
  });

  // ---------- templates ----------
  app.get('/templates', { preHandler: send }, async () => ({ data: await prisma.messageTemplate.findMany({ orderBy: { name: 'asc' } }) }));
  app.post('/templates', { preHandler: send }, async (req) => {
    const b = parse(templateSchema, req.body);
    if (await prisma.messageTemplate.findUnique({ where: { name: b.name } })) throw httpError(409, 'DUPLICATE', 'A template with this name already exists.');
    const t = await prisma.messageTemplate.create({ data: b });
    await audit(req, { action: 'notification_template.create', entity: 'message_template', entityId: t.id, summary: `Template "${t.name}"`, after: b });
    return { data: t };
  });
  app.put('/templates/:id', { preHandler: send }, async (req) => {
    const { id } = parse(idParam, req.params);
    const b = parse(templateSchema, req.body);
    const before = await prisma.messageTemplate.findUnique({ where: { id } });
    if (!before) throw httpError(404, 'NOT_FOUND', 'Template not found.');
    const clash = await prisma.messageTemplate.findFirst({ where: { name: b.name, id: { not: id } } });
    if (clash) throw httpError(409, 'DUPLICATE', 'A template with this name already exists.');
    const t = await prisma.messageTemplate.update({ where: { id }, data: b });
    await audit(req, { action: 'notification_template.update', entity: 'message_template', entityId: id, summary: `Template "${t.name}"`, before, after: t });
    return { data: t };
  });
  app.delete('/templates/:id', { preHandler: send }, async (req) => {
    const { id } = parse(idParam, req.params);
    const before = await prisma.messageTemplate.findUnique({ where: { id } });
    if (!before) throw httpError(404, 'NOT_FOUND', 'Template not found.');
    await prisma.messageTemplate.delete({ where: { id } });
    await audit(req, { action: 'notification_template.delete', entity: 'message_template', entityId: id, summary: `Deleted template "${before.name}"`, before });
    return { data: { ok: true } };
  });

  // ================= member inbox =================
  app.get('/', { preHandler: authenticate }, async (req) => {
    const pg = paginate(req.query);
    const { unread } = parse(z.object({ unread: z.enum(['1', 'true']).optional() }), req.query);
    const where: Prisma.NotificationDeliveryWhereInput = { userId: req.user.id, notification: { sentAt: { not: null } }, ...(unread ? { readAt: null } : {}) };
    const [rows, total] = await Promise.all([
      prisma.notificationDelivery.findMany({ where, include: { notification: true }, orderBy: { notificationId: 'desc' }, skip: pg.skip, take: pg.take }),
      prisma.notificationDelivery.count({ where }),
    ]);
    return pg.result(rows.map((d) => ({
      id: d.notificationId, title: d.notification.title, body: d.notification.body, titleHi: d.notification.titleHi, bodyHi: d.notification.bodyHi,
      kind: d.notification.kind, createdAt: d.notification.sentAt ?? d.notification.createdAt, readAt: d.readAt,
    })), total);
  });

  app.get('/unread-count', { preHandler: authenticate }, async (req) => {
    const count = await prisma.notificationDelivery.count({ where: { userId: req.user.id, readAt: null, notification: { sentAt: { not: null } } } });
    return { data: { count } };
  });

  app.post('/read-all', { preHandler: authenticate }, async (req) => {
    const r = await prisma.notificationDelivery.updateMany({ where: { userId: req.user.id, readAt: null }, data: { readAt: new Date() } });
    return { data: { updated: r.count } };
  });

  app.post('/:id/read', { preHandler: authenticate }, async (req) => {
    const { id } = parse(idParam, req.params);
    const r = await prisma.notificationDelivery.updateMany({ where: { notificationId: id, userId: req.user.id, readAt: null }, data: { readAt: new Date() } });
    if (r.count === 0) {
      const exists = await prisma.notificationDelivery.findUnique({ where: { notificationId_userId: { notificationId: id, userId: req.user.id } } });
      if (!exists) throw httpError(404, 'NOT_FOUND', 'Notification not found.');
    }
    return { data: { ok: true } };
  });
};
export default routes;
