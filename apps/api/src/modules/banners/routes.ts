import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { httpError } from '../../lib/errors';
import { parse } from '../../lib/parse';
import { audit } from '../../lib/audit';
import { requirePerm } from '../../lib/auth';
import { applyOrder, claimFiles, idParam, invalidateHomeCache, optStr, orderBody } from '../home/shared';
import { activeBanners, allBanners, oneBanner } from './service';

const linkUrl = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
  z.string().trim().max(500).regex(/^(https?:\/\/\S+|\/[\w\-./?=&%#]*)$/i, 'Enter a link starting with https:// or an in-app path like /events/3').nullable().optional(),
);
const dateOrNull = z.preprocess((v) => (v === '' || v === null ? null : v), z.coerce.date().nullable().optional());
const bannerBody = z.object({
  kind: z.enum(['BANNER', 'AD', 'VIDEO']).default('BANNER'),
  title: optStr(120),
  subtitle: optStr(200),
  fileId: z.number().int().positive().nullable().optional(),
  linkUrl,
  adId: z.number().int().positive().nullable().optional(),
  durationMs: z.number().int().min(2000, 'Show each slide for at least 2 seconds').max(120_000).optional(),
  activeFrom: dateOrNull,
  activeTo: dateOrNull,
  active: z.boolean().optional(),
});

function validate(b: { kind?: string; adId?: number | null; activeFrom?: Date | null; activeTo?: Date | null; title?: string | null; fileId?: number | null }) {
  if (b.kind === 'AD' && !b.adId) throw httpError(400, 'VALIDATION_ERROR', 'Choose the advertisement to show in this slot.');
  if (b.activeFrom && b.activeTo && b.activeTo < b.activeFrom) throw httpError(400, 'VALIDATION_ERROR', 'The end date must be after the start date.');
}

const routes: FastifyPluginAsync = async (app) => {
  const staff = requirePerm('banners.edit');

  // Public: the carousel feed (also used by the home aggregate).
  app.get('/active', async () => ({ data: await activeBanners() }));

  app.get('/admin', { preHandler: staff }, async () => ({ data: await allBanners() }));

  /** Live ads that can be placed in the carousel as an "AD" slide. */
  app.get('/admin/ads', { preHandler: staff }, async () => {
    const ads = await prisma.ad.findMany({
      where: { paused: false, request: { status: 'LIVE' } },
      include: { request: { select: { advertiser: { select: { name: true } } } } },
      orderBy: { id: 'desc' },
    });
    return { data: ads.map((a) => ({ id: a.id, title: a.title ?? a.textLine ?? `Ad #${a.id}`, advertiser: a.request.advertiser.name })) };
  });

  app.post('/', { preHandler: staff }, async (req, reply) => {
    const body = parse(bannerBody, req.body);
    validate(body);
    if (body.adId && !(await prisma.ad.findUnique({ where: { id: body.adId } }))) throw httpError(400, 'AD_NOT_FOUND', 'The selected advertisement does not exist.');
    await claimFiles(req.user, [body.fileId], 'PUBLIC', ['image', 'video']);
    const max = await prisma.banner.aggregate({ _max: { sort: true } });
    const b = await prisma.$transaction(async (tx) => {
      const row = await tx.banner.create({
        data: {
          kind: body.kind, title: body.title ?? null, subtitle: body.subtitle ?? null, fileId: body.fileId ?? null, linkUrl: body.linkUrl ?? null,
          adId: body.kind === 'AD' ? body.adId ?? null : null, durationMs: body.durationMs ?? (body.kind === 'VIDEO' ? 15000 : 6000),
          activeFrom: body.activeFrom ?? null, activeTo: body.activeTo ?? null, active: body.active ?? true, sort: (max._max.sort ?? 0) + 1,
        },
      });
      await audit(req, { action: 'banner.create', entity: 'banner', entityId: row.id, summary: `Banner "${row.title ?? row.kind}" created`, after: row }, tx);
      return row;
    });
    invalidateHomeCache();
    return reply.status(201).send({ data: await oneBanner(b.id) });
  });

  app.put('/order', { preHandler: staff }, async (req) => {
    const { ids } = parse(orderBody, req.body);
    await applyOrder('banner', ids);
    await audit(req, { action: 'banner.reorder', entity: 'banner', summary: 'Banners reordered', after: { ids } });
    invalidateHomeCache();
    return { data: await allBanners() };
  });

  app.patch('/:id', { preHandler: staff }, async (req) => {
    const id = idParam(req);
    const before = await prisma.banner.findUnique({ where: { id } });
    if (!before) throw httpError(404, 'NOT_FOUND', 'Banner not found');
    const body = parse(bannerBody.partial(), req.body);
    if (Object.keys(body).length === 0) throw httpError(400, 'VALIDATION_ERROR', 'Nothing to update');
    validate({
      kind: body.kind ?? before.kind,
      adId: body.adId === undefined ? before.adId : body.adId,
      activeFrom: body.activeFrom === undefined ? before.activeFrom : body.activeFrom,
      activeTo: body.activeTo === undefined ? before.activeTo : body.activeTo,
    });
    if (body.adId && !(await prisma.ad.findUnique({ where: { id: body.adId } }))) throw httpError(400, 'AD_NOT_FOUND', 'The selected advertisement does not exist.');
    await claimFiles(req.user, [body.fileId], 'PUBLIC', ['image', 'video']);
    const row = await prisma.$transaction(async (tx) => {
      const u = await tx.banner.update({ where: { id }, data: { ...body, ...(body.kind && body.kind !== 'AD' ? { adId: null } : {}) } });
      await audit(req, { action: 'banner.update', entity: 'banner', entityId: id, summary: `Banner "${u.title ?? u.kind}" updated`, before, after: u }, tx);
      return u;
    });
    invalidateHomeCache();
    return { data: await oneBanner(row.id) };
  });

  app.delete('/:id', { preHandler: staff }, async (req) => {
    const id = idParam(req);
    const before = await prisma.banner.findUnique({ where: { id } });
    if (!before) throw httpError(404, 'NOT_FOUND', 'Banner not found');
    await prisma.$transaction(async (tx) => {
      await tx.banner.delete({ where: { id } });
      await audit(req, { action: 'banner.delete', entity: 'banner', entityId: id, summary: `Banner "${before.title ?? before.kind}" deleted`, before }, tx);
    });
    invalidateHomeCache();
    return { data: { ok: true } };
  });
};
export default routes;
