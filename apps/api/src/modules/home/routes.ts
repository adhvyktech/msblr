import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { httpError } from '../../lib/errors';
import { parse } from '../../lib/parse';
import { audit } from '../../lib/audit';
import { authenticate, requirePerm } from '../../lib/auth';
import { fileUrl } from '../../lib/files';
import { effectivePrivacy } from '../../lib/privacy';
import { activeBanners } from '../banners/service';
import { eventInclude, serializeEvent, upcomingWhere } from '../events/service';
import { highlightInclude, serializeHighlights } from '../highlights/service';
import { serializeTrust } from '../trusts/routes';
import { cached, idParam, invalidateHomeCache, istMonthDay, optStr } from './shared';

const announcementBody = z.object({
  title: z.string().trim().min(3, 'Enter a title').max(160),
  body: optStr(2000),
  pinned: z.boolean().default(false),
  expiresAt: z.preprocess((v) => (v === '' || v === null ? null : v), z.coerce.date().nullable().optional()),
});

const liveAnnouncements = (now: Date) => ({ OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] });
const serializeAnnouncement = (a: { id: number; title: string; body: string | null; pinned: boolean; expiresAt: Date | null; createdAt: Date }) => ({
  id: a.id, title: a.title, body: a.body, pinned: a.pinned, expiresAt: a.expiresAt, createdAt: a.createdAt,
});

/** Parts of the home payload that are identical for every member (cached for 60 s). */
async function sharedHome() {
  return cached('home:shared', async () => {
    const now = new Date();
    const [banners, highlights, trusts, announcements, events, activeFamilies, members, businesses] = await Promise.all([
      activeBanners(now),
      prisma.highlight.findMany({ where: { status: 'PUBLISHED' }, include: highlightInclude, orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }], take: 6 }),
      prisma.trust.findMany({ include: { attachments: true }, orderBy: [{ sort: 'asc' }, { id: 'asc' }] }),
      prisma.announcement.findMany({ where: liveAnnouncements(now), orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }], take: 5 }),
      prisma.event.findMany({ where: { AND: [{ status: 'PUBLISHED' }, upcomingWhere(now)] }, include: eventInclude, orderBy: { startsAt: 'asc' }, take: 4 }),
      prisma.family.count({ where: { status: 'ACTIVE' } }),
      prisma.person.count({ where: { deletedAt: null, family: { status: 'ACTIVE' } } }),
      prisma.business.count({ where: { status: 'APPROVED', deletedAt: null } }),
    ]);
    const upcomingTotal = await prisma.event.count({ where: { AND: [{ status: 'PUBLISHED' }, upcomingWhere(now)] } });
    return {
      banners,
      highlights: await serializeHighlights(highlights),
      trusts: trusts.map((t) => ({ ...serializeTrust(t), attachmentCount: t.attachments.length })),
      announcements: announcements.map(serializeAnnouncement),
      upcomingEvents: events.map((e) => serializeEvent(e)),
      upcomingEventCount: upcomingTotal,
      stats: { activeFamilies, members, businesses },
    };
  });
}

/** People whose birthday is today (IST). Only those who made their date of birth visible, or members of the viewer's own family. Name + avatar only. */
export async function todaysBirthdays(viewerFamilyId: number | null, now = new Date()) {
  const { month, day } = istMonthDay(now);
  const ids = await prisma.$queryRaw<{ id: number }[]>`
    SELECT p.id FROM "Person" p JOIN "Family" f ON f.id = p."familyId"
    WHERE p."deletedAt" IS NULL AND f.status = 'ACTIVE' AND p.dob IS NOT NULL
      AND EXTRACT(MONTH FROM p.dob)::int = ${month}::int AND EXTRACT(DAY FROM p.dob)::int = ${day}::int
    LIMIT 200`;
  if (!ids.length) return [];
  const people = await prisma.person.findMany({
    where: { id: { in: ids.map((r) => r.id) } },
    select: { id: true, familyId: true, name: true, photoFileId: true, privacy: true },
    orderBy: { name: 'asc' },
  });
  return people
    .filter((p) => p.familyId === viewerFamilyId || effectivePrivacy(p.privacy).dob)
    .map((p) => {
      const own = p.familyId === viewerFamilyId;
      return { id: p.id, name: p.name, photoUrl: p.photoFileId && (own || effectivePrivacy(p.privacy).photo) ? fileUrl(p.photoFileId) : null };
    });
}

const routes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', authenticate);
  const staff = requirePerm('events.post');

  app.get('/', async (req) => {
    const [shared, birthdays] = await Promise.all([sharedHome(), todaysBirthdays(req.user.familyId)]);
    return {
      data: {
        greetingName: req.user.name.trim().split(/\s+/)[0] ?? req.user.name,
        ...shared,
        todaysBirthdays: birthdays,
      },
    };
  });

  // ---------- announcements (staff) ----------
  app.get('/announcements', { preHandler: staff }, async () => {
    const now = new Date();
    const rows = await prisma.announcement.findMany({ orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }], take: 200 });
    return { data: rows.map((a) => ({ ...serializeAnnouncement(a), expired: !!a.expiresAt && a.expiresAt <= now })) };
  });

  app.post('/announcements', { preHandler: staff }, async (req, reply) => {
    const body = parse(announcementBody, req.body);
    const a = await prisma.$transaction(async (tx) => {
      const row = await tx.announcement.create({ data: { title: body.title, body: body.body ?? null, pinned: body.pinned, expiresAt: body.expiresAt ?? null } });
      await audit(req, { action: 'announcement.create', entity: 'announcement', entityId: row.id, summary: `Announcement "${row.title}" posted`, after: row }, tx);
      return row;
    });
    invalidateHomeCache();
    return reply.status(201).send({ data: serializeAnnouncement(a) });
  });

  app.patch('/announcements/:id', { preHandler: staff }, async (req) => {
    const id = idParam(req);
    const body = parse(announcementBody.partial(), req.body);
    const before = await prisma.announcement.findUnique({ where: { id } });
    if (!before) throw httpError(404, 'NOT_FOUND', 'Announcement not found');
    const a = await prisma.$transaction(async (tx) => {
      const row = await tx.announcement.update({ where: { id }, data: body });
      await audit(req, { action: 'announcement.update', entity: 'announcement', entityId: id, summary: `Announcement "${row.title}" updated`, before, after: row }, tx);
      return row;
    });
    invalidateHomeCache();
    return { data: serializeAnnouncement(a) };
  });

  app.delete('/announcements/:id', { preHandler: staff }, async (req) => {
    const id = idParam(req);
    const before = await prisma.announcement.findUnique({ where: { id } });
    if (!before) throw httpError(404, 'NOT_FOUND', 'Announcement not found');
    await prisma.$transaction(async (tx) => {
      await tx.announcement.delete({ where: { id } });
      await audit(req, { action: 'announcement.delete', entity: 'announcement', entityId: id, summary: `Announcement "${before.title}" deleted`, before }, tx);
    });
    invalidateHomeCache();
    return { data: { ok: true } };
  });
};
export default routes;
