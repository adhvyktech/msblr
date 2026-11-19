import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { httpError } from '../../lib/errors';
import { parse } from '../../lib/parse';
import { paginate } from '../../lib/pagination';
import { audit } from '../../lib/audit';
import { authenticate, hasPerm, requirePerm } from '../../lib/auth';
import { claimFiles, idParam, invalidateHomeCache, optStr } from '../home/shared';
import { assertZoneAllowed } from '../events/service';
import { highlightInclude, serializeHighlights } from './service';

const highlightBody = z.object({
  title: z.string().trim().min(3, 'Enter a title').max(160),
  summary: optStr(5000),
  mediaFileIds: z.array(z.number().int().positive()).max(12, 'You can add up to 12 photos').default([]),
  eventId: z.number().int().positive().nullable().optional(),
  status: z.enum(['DRAFT', 'PUBLISHED']).default('PUBLISHED'),
});

/** A zone-scoped content manager may only attach highlights to events of their own zones. */
async function checkEvent(req: Parameters<typeof assertZoneAllowed>[0], eventId?: number | null) {
  if (!eventId) return;
  const e = await prisma.event.findUnique({ where: { id: eventId }, select: { zoneId: true } });
  if (!e) throw httpError(400, 'EVENT_NOT_FOUND', 'The selected event does not exist.');
  assertZoneAllowed(req, e.zoneId);
}

const routes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', authenticate);
  const staff = requirePerm('highlights.post');

  app.get('/', async (req) => {
    const q = parse(z.object({ admin: z.enum(['0', '1', 'true', 'false']).optional() }), req.query);
    const pg = paginate(req.query);
    const adminView = (q.admin === '1' || q.admin === 'true') && hasPerm(req.user, 'highlights.post');
    const where: Prisma.HighlightWhereInput = adminView ? {} : { status: 'PUBLISHED' };
    const [rows, total] = await Promise.all([
      prisma.highlight.findMany({ where, include: highlightInclude, orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }], skip: pg.skip, take: pg.take }),
      prisma.highlight.count({ where }),
    ]);
    return pg.result(await serializeHighlights(rows), total);
  });

  app.get('/:id', async (req) => {
    const id = idParam(req);
    const h = await prisma.highlight.findUnique({ where: { id }, include: highlightInclude });
    if (!h || (h.status !== 'PUBLISHED' && !hasPerm(req.user, 'highlights.post'))) throw httpError(404, 'NOT_FOUND', 'Highlight not found');
    return { data: (await serializeHighlights([h]))[0] };
  });

  app.post('/', { preHandler: staff }, async (req, reply) => {
    const body = parse(highlightBody, req.body);
    await checkEvent(req.user, body.eventId);
    await claimFiles(req.user, body.mediaFileIds, 'MEMBERS', ['image', 'video']);
    const h = await prisma.$transaction(async (tx) => {
      const row = await tx.highlight.create({
        data: { title: body.title, summary: body.summary ?? null, mediaFileIds: body.mediaFileIds, eventId: body.eventId ?? null, status: body.status, authorId: req.user.id },
        include: highlightInclude,
      });
      await audit(req, { action: 'highlight.create', entity: 'highlight', entityId: row.id, summary: `Highlight "${row.title}" posted`, after: { title: row.title, eventId: row.eventId, media: row.mediaFileIds.length } }, tx);
      return row;
    });
    invalidateHomeCache();
    return reply.status(201).send({ data: (await serializeHighlights([h]))[0] });
  });

  app.patch('/:id', { preHandler: staff }, async (req) => {
    const id = idParam(req);
    const before = await prisma.highlight.findUnique({ where: { id } });
    if (!before) throw httpError(404, 'NOT_FOUND', 'Highlight not found');
    const body = parse(highlightBody.partial(), req.body);
    if (Object.keys(body).length === 0) throw httpError(400, 'VALIDATION_ERROR', 'Nothing to update');
    await checkEvent(req.user, body.eventId);
    if (body.mediaFileIds) await claimFiles(req.user, body.mediaFileIds, 'MEMBERS', ['image', 'video']);
    const h = await prisma.$transaction(async (tx) => {
      const row = await tx.highlight.update({ where: { id }, data: body, include: highlightInclude });
      await audit(req, { action: 'highlight.update', entity: 'highlight', entityId: id, summary: `Highlight "${row.title}" updated`, before: { title: before.title, status: before.status }, after: { title: row.title, status: row.status } }, tx);
      return row;
    });
    invalidateHomeCache();
    return { data: (await serializeHighlights([h]))[0] };
  });

  app.delete('/:id', { preHandler: staff }, async (req) => {
    const id = idParam(req);
    const before = await prisma.highlight.findUnique({ where: { id } });
    if (!before) throw httpError(404, 'NOT_FOUND', 'Highlight not found');
    await prisma.$transaction(async (tx) => {
      await tx.highlight.delete({ where: { id } });
      await audit(req, { action: 'highlight.delete', entity: 'highlight', entityId: id, summary: `Highlight "${before.title}" deleted`, before: { title: before.title } }, tx);
    });
    invalidateHomeCache();
    return { data: { ok: true } };
  });
};
export default routes;
