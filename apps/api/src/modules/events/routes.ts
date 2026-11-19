import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { httpError } from '../../lib/errors';
import { parse } from '../../lib/parse';
import { paginate } from '../../lib/pagination';
import { audit } from '../../lib/audit';
import { authenticate, hasPerm, requirePerm } from '../../lib/auth';
import { claimFiles, httpUrl, idParam, invalidateHomeCache, optStr } from '../home/shared';
import { serializeHighlights, highlightInclude } from '../highlights/service';
import { assertZoneAllowed, eventInclude, pastWhere, serializeEvent, upcomingWhere } from './service';

const KINDS = ['AGM', 'EC', 'SOCIAL', 'RELIGIOUS', 'CULTURAL', 'SPORTS', 'OTHER'] as const;
const eventBody = z.object({
  title: z.string().trim().min(3, 'Enter the event title').max(160),
  body: optStr(5000),
  kind: z.enum(KINDS).default('OTHER'),
  zoneId: z.number().int().positive().nullable().optional(),
  startsAt: z.coerce.date({ invalid_type_error: 'Choose the start date and time', required_error: 'Choose the start date and time' }),
  endsAt: z.preprocess((v) => (v === '' || v === null ? null : v), z.coerce.date().nullable().optional()),
  venue: optStr(200),
  registrationUrl: httpUrl,
  noticeFileId: z.number().int().positive().nullable().optional(),
  status: z.enum(['DRAFT', 'PUBLISHED']).default('PUBLISHED'),
});
const listQuery = z.object({
  when: z.enum(['upcoming', 'past']).optional(),
  zoneId: z.coerce.number().int().positive().optional(),
  kind: z.enum(KINDS).optional(),
  admin: z.enum(['0', '1', 'true', 'false']).optional(),
});

async function checkZone(zoneId: number | null | undefined) {
  if (zoneId && !(await prisma.zone.findUnique({ where: { id: zoneId } }))) throw httpError(400, 'ZONE_NOT_FOUND', 'Please choose a valid zone.');
}
const snap = (e: { title: string; kind: string; zoneId: number | null; startsAt: Date; status: string; venue?: string | null }) =>
  ({ title: e.title, kind: e.kind, zoneId: e.zoneId, startsAt: e.startsAt, status: e.status, venue: e.venue ?? null });

const routes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', authenticate);
  const staff = requirePerm('events.post');

  app.get('/', async (req) => {
    const q = parse(listQuery, req.query);
    const pg = paginate(req.query);
    const adminView = (q.admin === '1' || q.admin === 'true') && hasPerm(req.user, 'events.post');
    const and: Prisma.EventWhereInput[] = [];
    if (!adminView) and.push({ status: 'PUBLISHED' });
    if (q.when === 'upcoming') and.push(upcomingWhere());
    if (q.when === 'past') and.push(pastWhere());
    if (q.zoneId) and.push({ zoneId: q.zoneId });
    if (q.kind) and.push({ kind: q.kind });
    const where: Prisma.EventWhereInput = and.length ? { AND: and } : {};
    const [rows, total] = await Promise.all([
      prisma.event.findMany({
        where, include: eventInclude, skip: pg.skip, take: pg.take,
        orderBy: q.when === 'upcoming' ? [{ startsAt: 'asc' }] : [{ startsAt: 'desc' }],
      }),
      prisma.event.count({ where }),
    ]);
    return pg.result(rows.map((e) => serializeEvent(e, req.user)), total);
  });

  app.get('/zones', async () => ({ data: await prisma.zone.findMany({ orderBy: [{ sort: 'asc' }, { id: 'asc' }], select: { id: true, name: true } }) }));

  app.get('/:id', async (req) => {
    const id = idParam(req);
    const e = await prisma.event.findUnique({ where: { id }, include: eventInclude });
    if (!e || (e.status !== 'PUBLISHED' && !hasPerm(req.user, 'events.post'))) throw httpError(404, 'NOT_FOUND', 'Event not found');
    const hl = await prisma.highlight.findMany({ where: { eventId: id, status: 'PUBLISHED' }, include: highlightInclude, orderBy: { publishedAt: 'desc' } });
    return { data: { ...serializeEvent(e, req.user), highlights: await serializeHighlights(hl) } };
  });

  app.post('/', { preHandler: staff }, async (req, reply) => {
    const body = parse(eventBody, req.body);
    const zoneId = body.zoneId ?? null;
    assertZoneAllowed(req.user, zoneId);
    await checkZone(zoneId);
    if (body.endsAt && body.endsAt < body.startsAt) throw httpError(400, 'VALIDATION_ERROR', 'The end time must be after the start time.');
    await claimFiles(req.user, [body.noticeFileId], 'MEMBERS', ['application/pdf', 'image']);
    const e = await prisma.$transaction(async (tx) => {
      const row = await tx.event.create({
        data: {
          title: body.title, body: body.body ?? null, kind: body.kind, zoneId, startsAt: body.startsAt, endsAt: body.endsAt ?? null,
          venue: body.venue ?? null, registrationUrl: body.registrationUrl ?? null, noticeFileId: body.noticeFileId ?? null,
          status: body.status, createdBy: req.user.id,
        },
        include: eventInclude,
      });
      await audit(req, { action: 'event.create', entity: 'event', entityId: row.id, summary: `Event "${row.title}" created`, after: snap(row) }, tx);
      return row;
    });
    invalidateHomeCache();
    return reply.status(201).send({ data: serializeEvent(e, req.user) });
  });

  app.patch('/:id', { preHandler: staff }, async (req) => {
    const id = idParam(req);
    const before = await prisma.event.findUnique({ where: { id }, include: eventInclude });
    if (!before) throw httpError(404, 'NOT_FOUND', 'Event not found');
    assertZoneAllowed(req.user, before.zoneId); // cannot touch other zones' events
    const body = parse(eventBody.partial(), req.body);
    if (Object.keys(body).length === 0) throw httpError(400, 'VALIDATION_ERROR', 'Nothing to update');
    if (body.zoneId !== undefined) { assertZoneAllowed(req.user, body.zoneId); await checkZone(body.zoneId); }
    const startsAt = body.startsAt ?? before.startsAt;
    const endsAt = body.endsAt === undefined ? before.endsAt : body.endsAt;
    if (endsAt && endsAt < startsAt) throw httpError(400, 'VALIDATION_ERROR', 'The end time must be after the start time.');
    await claimFiles(req.user, [body.noticeFileId], 'MEMBERS', ['application/pdf', 'image']);
    const e = await prisma.$transaction(async (tx) => {
      const row = await tx.event.update({ where: { id }, data: body, include: eventInclude });
      await audit(req, { action: 'event.update', entity: 'event', entityId: id, summary: `Event "${row.title}" updated`, before: snap(before), after: snap(row) }, tx);
      return row;
    });
    invalidateHomeCache();
    return { data: serializeEvent(e, req.user) };
  });

  app.delete('/:id', { preHandler: staff }, async (req) => {
    const id = idParam(req);
    const before = await prisma.event.findUnique({ where: { id } });
    if (!before) throw httpError(404, 'NOT_FOUND', 'Event not found');
    assertZoneAllowed(req.user, before.zoneId);
    await prisma.$transaction(async (tx) => {
      await tx.highlight.updateMany({ where: { eventId: id }, data: { eventId: null } });
      await tx.event.delete({ where: { id } });
      await audit(req, { action: 'event.delete', entity: 'event', entityId: id, summary: `Event "${before.title}" deleted`, before: snap(before) }, tx);
    });
    invalidateHomeCache();
    return { data: { ok: true } };
  });
};
export default routes;
