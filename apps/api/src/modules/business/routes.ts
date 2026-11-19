import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { httpError } from '../../lib/errors';
import { parse } from '../../lib/parse';
import { paginate } from '../../lib/pagination';
import { audit } from '../../lib/audit';
import { authenticate, hasPerm, requireHead, requirePerm } from '../../lib/auth';
import { getSetting } from '../../lib/settings';
import { notify } from '../../lib/push';
import { claimFiles, idParam, invalidateHomeCache, optStr, httpUrl } from '../home/shared';
import { businessInclude, serializeBusiness, type BusinessRow } from './service';

const phone = z.preprocess(
  (v) => (typeof v === 'string' ? (v.trim() === '' ? null : v.replace(/[\s-]/g, '')) : v),
  z.string().regex(/^\+?\d{6,15}$/, 'Enter a valid phone number').nullable().optional(),
);
const mapsUrl = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
  z.string().trim().max(1000).regex(/^https?:\/\/\S+$/i, 'Enter a valid map link starting with https://').nullable().optional(),
);
const businessBody = z.object({
  name: z.string().trim().min(2, 'Enter the business name').max(120),
  categoryId: z.number().int().positive().nullable().optional(),
  description: optStr(2000),
  addressLine: optStr(300),
  area: optStr(80),
  phone,
  whatsapp: phone,
  website: httpUrl,
  mapsUrl,
  logoFileId: z.number().int().positive().nullable().optional(),
  photoFileIds: z.array(z.number().int().positive()).max(6, 'You can add up to 6 photos').optional(),
});
const categoryBody = z.object({
  nameEn: z.string().trim().min(2, 'Enter the category name').max(60),
  nameHi: optStr(60),
  sort: z.number().int().min(0).max(9999).optional(),
});
const adminQuery = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'HIDDEN', 'REJECTED']).optional(),
  q: z.string().trim().max(100).optional(),
});
const reasonBody = z.object({ remarks: z.string().trim().min(3, 'Please give a reason').max(500) });

const MAX_PER_FAMILY = 20;

async function requireCategory(id?: number | null) {
  if (id && !(await prisma.businessCategory.findUnique({ where: { id } }))) throw httpError(400, 'CATEGORY_NOT_FOUND', 'Please choose a valid category.');
}
async function loadOwned(familyId: number, id: number): Promise<BusinessRow> {
  const b = await prisma.business.findFirst({ where: { id, familyId, deletedAt: null }, include: businessInclude });
  if (!b) throw httpError(404, 'NOT_FOUND', 'Business not found');
  return b;
}
async function headUserId(b: BusinessRow) {
  const personId = b.personId ?? b.family.persons[0]?.id;
  if (!personId) return null;
  return (await prisma.user.findUnique({ where: { personId }, select: { id: true } }))?.id ?? null;
}
const snap = (b: { name: string; status: string; categoryId: number | null }) => ({ name: b.name, status: b.status, categoryId: b.categoryId });

const routes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', authenticate);

  // ---------- member directory ----------
  app.get('/', async (req) => {
    const q = parse(
      z.object({
        q: z.string().trim().max(100).optional(),
        categoryId: z.coerce.number().int().positive().optional(),
        area: z.string().trim().max(80).optional(),
      }),
      req.query,
    );
    const pg = paginate(req.query);
    const where: Prisma.BusinessWhereInput = { status: 'APPROVED', deletedAt: null };
    const and: Prisma.BusinessWhereInput[] = [];
    if (q.categoryId) and.push({ categoryId: q.categoryId });
    if (q.area) and.push({ area: { equals: q.area, mode: 'insensitive' } });
    if (q.q) {
      const c = { contains: q.q, mode: 'insensitive' as const };
      and.push({
        OR: [
          { name: c }, { description: c }, { area: c },
          { category: { OR: [{ nameEn: c }, { nameHi: c }] } },
          { person: { name: c } },
          { family: { membershipNo: c } },
          { family: { persons: { some: { isHead: true, deletedAt: null, name: c } } } },
        ],
      });
    }
    if (and.length) where.AND = and;
    const [rows, total] = await Promise.all([
      prisma.business.findMany({ where, include: businessInclude, orderBy: [{ name: 'asc' }], skip: pg.skip, take: pg.take }),
      prisma.business.count({ where }),
    ]);
    return pg.result(rows.map((b) => serializeBusiness(b, req.user)), total);
  });

  app.get('/categories', async () => {
    const cats = await prisma.businessCategory.findMany({ orderBy: [{ sort: 'asc' }, { nameEn: 'asc' }] });
    const counts = await prisma.business.groupBy({ by: ['categoryId'], where: { status: 'APPROVED', deletedAt: null }, _count: { _all: true } });
    const m = new Map(counts.map((c) => [c.categoryId, c._count._all]));
    return { data: cats.map((c) => ({ id: c.id, nameEn: c.nameEn, nameHi: c.nameHi, sort: c.sort, count: m.get(c.id) ?? 0 })) };
  });

  app.get('/areas', async () => {
    const rows = await prisma.business.findMany({ where: { status: 'APPROVED', deletedAt: null, area: { not: null } }, distinct: ['area'], select: { area: true }, orderBy: { area: 'asc' } });
    return { data: rows.map((r) => r.area).filter((a): a is string => !!a) };
  });

  // ---------- head of family: own businesses ----------
  app.get('/mine', { preHandler: requireHead }, async (req) => {
    const rows = await prisma.business.findMany({ where: { familyId: req.user.familyId!, deletedAt: null }, include: businessInclude, orderBy: { createdAt: 'desc' } });
    const rejectedIds = rows.filter((b) => b.status === 'REJECTED').map((b) => String(b.id));
    const logs = rejectedIds.length
      ? await prisma.auditLog.findMany({ where: { action: 'business.reject', entity: 'business', entityId: { in: rejectedIds } }, orderBy: { at: 'desc' } })
      : [];
    const remarks = new Map<string, string>();
    for (const l of logs) if (!remarks.has(l.entityId!)) remarks.set(l.entityId!, (l.after as { remarks?: string } | null)?.remarks ?? '');
    return { data: rows.map((b) => serializeBusiness(b, req.user, { remarks: remarks.get(String(b.id)) ?? null })) };
  });

  app.post('/', { preHandler: requireHead }, async (req, reply) => {
    const body = parse(businessBody, req.body);
    await requireCategory(body.categoryId);
    const count = await prisma.business.count({ where: { familyId: req.user.familyId!, deletedAt: null } });
    if (count >= MAX_PER_FAMILY) throw httpError(409, 'LIMIT', `You can list up to ${MAX_PER_FAMILY} businesses.`);
    await claimFiles(req.user, [body.logoFileId, ...(body.photoFileIds ?? [])], 'MEMBERS', ['image']);
    const approval = await getSetting<boolean>('businessApprovalRequired', true);
    const b = await prisma.$transaction(async (tx) => {
      const row = await tx.business.create({
        data: {
          familyId: req.user.familyId!, personId: req.user.personId, name: body.name, categoryId: body.categoryId ?? null,
          description: body.description ?? null, addressLine: body.addressLine ?? null, area: body.area ?? null,
          phone: body.phone ?? null, whatsapp: body.whatsapp ?? null, website: body.website ?? null, mapsUrl: body.mapsUrl ?? null,
          logoFileId: body.logoFileId ?? null, photoFileIds: body.photoFileIds ?? [], status: approval ? 'PENDING' : 'APPROVED',
        },
        include: businessInclude,
      });
      await audit(req, { action: 'business.create', entity: 'business', entityId: row.id, summary: `Business "${row.name}" listed (${row.status})`, after: snap(row) }, tx);
      return row;
    });
    invalidateHomeCache();
    return reply.status(201).send({ data: serializeBusiness(b, req.user) });
  });

  app.patch('/:id', { preHandler: requireHead }, async (req) => {
    const id = idParam(req);
    const before = await loadOwned(req.user.familyId!, id); // ownership comes from the session, never from the client
    const body = parse(businessBody.partial(), req.body);
    if (Object.keys(body).length === 0) throw httpError(400, 'VALIDATION_ERROR', 'Nothing to update');
    if (body.categoryId !== undefined) await requireCategory(body.categoryId);
    await claimFiles(req.user, [body.logoFileId, ...(body.photoFileIds ?? [])], 'MEMBERS', ['image']);
    const approval = await getSetting<boolean>('businessApprovalRequired', true);
    // APPROVED stays APPROVED; HIDDEN stays hidden; REJECTED/PENDING go (back) to the queue, or straight live when approval is off.
    let status = before.status;
    if (before.status === 'REJECTED') status = approval ? 'PENDING' : 'APPROVED';
    if (before.status === 'PENDING' && !approval) status = 'APPROVED';
    const b = await prisma.$transaction(async (tx) => {
      const row = await tx.business.update({
        where: { id },
        data: {
          ...(body.name !== undefined && { name: body.name }),
          ...(body.categoryId !== undefined && { categoryId: body.categoryId }),
          ...(body.description !== undefined && { description: body.description }),
          ...(body.addressLine !== undefined && { addressLine: body.addressLine }),
          ...(body.area !== undefined && { area: body.area }),
          ...(body.phone !== undefined && { phone: body.phone }),
          ...(body.whatsapp !== undefined && { whatsapp: body.whatsapp }),
          ...(body.website !== undefined && { website: body.website }),
          ...(body.mapsUrl !== undefined && { mapsUrl: body.mapsUrl }),
          ...(body.logoFileId !== undefined && { logoFileId: body.logoFileId }),
          ...(body.photoFileIds !== undefined && { photoFileIds: body.photoFileIds }),
          status,
        },
        include: businessInclude,
      });
      await audit(req, { action: 'business.update', entity: 'business', entityId: id, summary: `Business "${row.name}" updated`, before: snap(before), after: snap(row) }, tx);
      return row;
    });
    invalidateHomeCache();
    return { data: serializeBusiness(b, req.user) };
  });

  app.delete('/:id', { preHandler: requireHead }, async (req) => {
    const id = idParam(req);
    const before = await loadOwned(req.user.familyId!, id);
    await prisma.$transaction(async (tx) => {
      await tx.business.update({ where: { id }, data: { deletedAt: new Date() } });
      await audit(req, { action: 'business.delete', entity: 'business', entityId: id, summary: `Business "${before.name}" removed`, before: snap(before) }, tx);
    });
    invalidateHomeCache();
    return { data: { ok: true } };
  });

  // ---------- staff: approvals + categories ----------
  const staff = requirePerm('businesses.approve');

  app.get('/admin', { preHandler: staff }, async (req) => {
    const q = parse(adminQuery, req.query);
    const pg = paginate(req.query);
    const where: Prisma.BusinessWhereInput = { deletedAt: null };
    if (q.status) where.status = q.status;
    if (q.q) {
      const c = { contains: q.q, mode: 'insensitive' as const };
      where.OR = [{ name: c }, { area: c }, { category: { nameEn: c } }, { family: { membershipNo: c } }, { person: { name: c } }];
    }
    const [rows, total, pending] = await Promise.all([
      prisma.business.findMany({
        where, include: businessInclude, skip: pg.skip, take: pg.take,
        orderBy: q.status === 'PENDING' ? [{ createdAt: 'asc' }] : [{ createdAt: 'desc' }],
      }),
      prisma.business.count({ where }),
      prisma.business.count({ where: { deletedAt: null, status: 'PENDING' } }),
    ]);
    return { ...pg.result(rows.map((b) => serializeBusiness(b, req.user)), total), pending };
  });

  async function decide(req: FastifyRequest, status: 'APPROVED' | 'REJECTED' | 'HIDDEN', remarks?: string) {
    const id = idParam(req);
    const before = await prisma.business.findFirst({ where: { id, deletedAt: null }, include: businessInclude });
    if (!before) throw httpError(404, 'NOT_FOUND', 'Business not found');
    const verb = status === 'APPROVED' ? 'approve' : status === 'REJECTED' ? 'reject' : 'hide';
    const row = await prisma.$transaction(async (tx) => {
      const u = await tx.business.update({ where: { id }, data: { status }, include: businessInclude });
      await audit(req, {
        action: `business.${verb}`, entity: 'business', entityId: id,
        summary: `Business "${u.name}" ${status.toLowerCase()}${remarks ? `: ${remarks}` : ''}`,
        before: snap(before), after: { ...snap(u), ...(remarks ? { remarks } : {}) },
      }, tx);
      return u;
    });
    invalidateHomeCache();
    if (status !== 'HIDDEN') {
      const uid = await headUserId(row);
      if (uid) {
        void notify([uid], {
          title: status === 'APPROVED' ? 'Your business is live' : 'Your business listing needs changes',
          body: status === 'APPROVED' ? `"${row.name}" is now visible in the Business directory.` : `"${row.name}" was not approved: ${remarks}`,
          titleHi: status === 'APPROVED' ? 'आपका व्यवसाय अब लाइव है' : 'आपकी व्यवसाय सूची में बदलाव ज़रूरी हैं',
          bodyHi: status === 'APPROVED' ? `"${row.name}" अब बिज़नेस डायरेक्टरी में दिख रहा है।` : `"${row.name}" स्वीकृत नहीं हुआ: ${remarks}`,
          kind: 'general', data: { url: '/me/business' }, sentBy: req.user.id,
        }).catch(() => undefined);
      }
    }
    return { data: serializeBusiness(row, req.user) };
  }
  app.post('/admin/:id/approve', { preHandler: staff }, (req) => decide(req, 'APPROVED'));
  app.post('/admin/:id/reject', { preHandler: staff }, (req) => decide(req, 'REJECTED', parse(reasonBody, req.body).remarks));
  app.post('/admin/:id/hide', { preHandler: staff }, (req) => decide(req, 'HIDDEN'));

  app.post('/admin/categories', { preHandler: staff }, async (req, reply) => {
    const body = parse(categoryBody, req.body);
    if (await prisma.businessCategory.findUnique({ where: { nameEn: body.nameEn } })) throw httpError(409, 'DUPLICATE', 'A category with this name already exists.');
    const max = await prisma.businessCategory.aggregate({ _max: { sort: true } });
    const c = await prisma.$transaction(async (tx) => {
      const row = await tx.businessCategory.create({ data: { nameEn: body.nameEn, nameHi: body.nameHi ?? null, sort: body.sort ?? (max._max.sort ?? 0) + 1 } });
      await audit(req, { action: 'business_category.create', entity: 'business_category', entityId: row.id, summary: `Category "${row.nameEn}" added`, after: row }, tx);
      return row;
    });
    return reply.status(201).send({ data: { ...c, count: 0 } });
  });
  app.patch('/admin/categories/:id', { preHandler: staff }, async (req) => {
    const id = idParam(req);
    const body = parse(categoryBody.partial(), req.body);
    const before = await prisma.businessCategory.findUnique({ where: { id } });
    if (!before) throw httpError(404, 'NOT_FOUND', 'Category not found');
    if (body.nameEn && body.nameEn !== before.nameEn && (await prisma.businessCategory.findUnique({ where: { nameEn: body.nameEn } }))) {
      throw httpError(409, 'DUPLICATE', 'A category with this name already exists.');
    }
    const c = await prisma.$transaction(async (tx) => {
      const row = await tx.businessCategory.update({ where: { id }, data: body });
      await audit(req, { action: 'business_category.update', entity: 'business_category', entityId: id, summary: `Category "${row.nameEn}" updated`, before, after: row }, tx);
      return row;
    });
    invalidateHomeCache();
    return { data: c };
  });
  app.delete('/admin/categories/:id', { preHandler: staff }, async (req) => {
    const id = idParam(req);
    const before = await prisma.businessCategory.findUnique({ where: { id } });
    if (!before) throw httpError(404, 'NOT_FOUND', 'Category not found');
    const used = await prisma.business.count({ where: { categoryId: id, deletedAt: null } });
    if (used) throw httpError(409, 'IN_USE', `${used} business(es) use this category. Move them to another category first.`);
    await prisma.$transaction(async (tx) => {
      await tx.businessCategory.delete({ where: { id } });
      await audit(req, { action: 'business_category.delete', entity: 'business_category', entityId: id, summary: `Category "${before.nameEn}" deleted`, before }, tx);
    });
    return { data: { ok: true } };
  });

  // ---------- single business ----------
  app.get('/:id', async (req) => {
    const id = idParam(req);
    const b = await prisma.business.findFirst({ where: { id, deletedAt: null }, include: businessInclude });
    const mine = !!b && b.familyId === req.user.familyId;
    if (!b || (b.status !== 'APPROVED' && !mine && !hasPerm(req.user, 'businesses.approve'))) throw httpError(404, 'NOT_FOUND', 'Business not found');
    return { data: serializeBusiness(b, req.user) };
  });
};
export default routes;
