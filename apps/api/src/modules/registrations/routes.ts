import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { mobileSchema } from '@msblr/shared';
import { prisma } from '../../lib/prisma';
import { httpError } from '../../lib/errors';
import { parse } from '../../lib/parse';
import { paginate } from '../../lib/pagination';
import { audit } from '../../lib/audit';
import { notify } from '../../lib/push';
import { fileUrl } from '../../lib/files';
import { requirePerm } from '../../lib/auth';
import {
  addressSchema, assertAttachable, familySummary, memberCreateSchema, nextMembershipNo, personFieldShape, personInclude, personName, publishPhoto,
  rawPerson, roleId, usersWithPerm,
} from '../members/service';
import { confirmMobileOtp, duplicateMessage, findDuplicateMobile, requestMobileOtp, verifyOtpToken } from './otp';

const otpRequestBody = z.object({ mobile: mobileSchema });
const otpConfirmBody = z.object({ mobile: mobileSchema, code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'), purpose: z.enum(['register', 'status']).default('register') });

const submitBody = z.object({
  head: z.object({
    name: personName,
    ...personFieldShape,
    dob: z.coerce.date({ invalid_type_error: 'Enter the date of birth', required_error: 'Enter the date of birth' }).refine((d) => d.getTime() < Date.now(), 'Date of birth must be in the past'),
    mobile: mobileSchema,
  }),
  address: addressSchema,
  members: z.array(memberCreateSchema).max(30).default([]),
  documentFileIds: z.array(z.coerce.number().int().positive()).max(10).default([]),
  otpToken: z.string().min(10, 'Please verify your mobile number'),
});
const statusQuery = z.object({ mobile: mobileSchema, otpToken: z.string().min(10, 'Please verify your mobile number') });
const listQuery = z.object({ status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional() });
const rejectBody = z.object({ remarks: z.string().trim().min(2, 'Please enter the reason').max(500) });

const regInclude = {
  family: { include: { zone: true, persons: { where: { deletedAt: null }, orderBy: [{ isHead: 'desc' }, { id: 'asc' }], include: personInclude } } },
  documents: { include: { file: { select: { id: true, mime: true, originalName: true, size: true } } } },
} satisfies Prisma.RegistrationInclude;
type RegFull = Prisma.RegistrationGetPayload<{ include: typeof regInclude }>;

const serialize = (r: RegFull) => ({
  id: r.id,
  status: r.status,
  submittedAt: r.submittedAt,
  decidedAt: r.decidedAt,
  remarks: r.remarks,
  headName: r.family.persons.find((p) => p.isHead)?.name ?? null,
  family: { ...familySummary(r.family), persons: r.family.persons.map(rawPerson) },
  documents: r.documents.map((d) => ({ fileId: d.fileId, url: fileUrl(d.fileId), label: d.label, mime: d.file.mime, originalName: d.file.originalName, size: d.file.size })),
});
const idOf = (params: unknown) => {
  const n = Number((params as { id: string }).id);
  if (!Number.isInteger(n) || n <= 0) throw httpError(400, 'VALIDATION_ERROR', 'Invalid id');
  return n;
};

const routes: FastifyPluginAsync = async (app) => {
  // ---------- public ----------
  app.post('/verify-mobile/request', { config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } }, async (req) => {
    const { mobile } = parse(otpRequestBody, req.body);
    return { data: await requestMobileOtp(mobile, req.ip) };
  });

  app.post('/verify-mobile/confirm', { config: { rateLimit: { max: 20, timeWindow: '15 minutes' } } }, async (req) => {
    const { mobile, code, purpose } = parse(otpConfirmBody, req.body);
    if (purpose === 'register') {
      const dup = await findDuplicateMobile(mobile);
      if (dup) throw httpError(409, 'DUPLICATE_MOBILE', duplicateMessage(dup), { reason: dup });
    }
    const otpToken = await confirmMobileOtp(mobile, code);
    return { data: { otpToken, mobile, expiresInSec: 30 * 60 } };
  });

  app.post('/', { config: { rateLimit: { max: 10, timeWindow: '1 hour' } } }, async (req, reply) => {
    const b = parse(submitBody, req.body);
    const mobile = b.head.mobile;
    verifyOtpToken(b.otpToken, mobile);
    const dup = await findDuplicateMobile(mobile);
    if (dup) throw httpError(409, 'DUPLICATE_MOBILE', duplicateMessage(dup), { reason: dup });
    if (!(await prisma.zone.findUnique({ where: { id: b.address.zoneId } }))) throw httpError(400, 'VALIDATION_ERROR', 'Please choose a valid zone');
    const photoIds = [b.head.photoFileId, ...b.members.map((m) => m.photoFileId)].filter((x): x is number => !!x);
    const docIds = [...new Set(b.documentFileIds)];
    if (new Set(photoIds).size !== photoIds.length) throw httpError(400, 'INVALID_FILE', 'The same photo cannot be used twice.');
    for (const id of photoIds) await assertAttachable(id, ['photo'], null);
    for (const id of docIds) await assertAttachable(id, ['document', 'photo'], null);
    const used = await prisma.file.findMany({
      where: { id: { in: [...photoIds, ...docIds] }, OR: [{ personPhotos: { some: {} } }, { regDocs: { some: {} } }] },
      select: { id: true },
    });
    if (used.length) throw httpError(400, 'INVALID_FILE', 'One of the uploaded files is already in use. Please upload it again.');

    const { head: hd, members } = b;
    const result = await prisma.$transaction(async (tx) => {
      const family = await tx.family.create({
        data: {
          status: 'PENDING',
          zoneId: b.address.zoneId,
          addressLine: b.address.addressLine,
          area: b.address.area,
          pincode: b.address.pincode,
          ...(b.address.city ? { city: b.address.city } : {}),
        },
      });
      const { name, ...headRest } = hd;
      await tx.person.create({ data: { familyId: family.id, isHead: true, relation: 'SELF', name, ...headRest } });
      for (const m of members) await tx.person.create({ data: { familyId: family.id, isHead: false, ...m } });
      const reg = await tx.registration.create({
        data: { familyId: family.id, status: 'PENDING', documents: { create: docIds.map((fileId) => ({ fileId })) } },
      });
      await audit(
        req,
        {
          action: 'registration.submit',
          entity: 'registration',
          entityId: reg.id,
          summary: `New registration from ${name} (${members.length + 1} members)`,
          after: { head: name, mobile, zoneId: b.address.zoneId, members: members.length, documents: docIds.length },
          actor: { userId: null, name, role: 'applicant' },
        },
        tx,
      );
      return reg;
    });
    const staff = await usersWithPerm('registrations.approve');
    await notify(staff, {
      title: 'New registration',
      body: `${hd.name} submitted a family registration for approval.`,
      titleHi: 'नया पंजीकरण',
      bodyHi: `${hd.name} ने परिवार पंजीकरण स्वीकृति के लिए जमा किया है।`,
      kind: 'registration',
      data: { type: 'registration', registrationId: String(result.id) },
    }).catch(() => null);
    return reply.status(201).send({ data: { id: result.id, status: 'PENDING', submittedAt: result.submittedAt } });
  });

  app.get('/status', { config: { rateLimit: { max: 30, timeWindow: '15 minutes' } } }, async (req) => {
    const { mobile, otpToken } = parse(statusQuery, req.query);
    verifyOtpToken(otpToken, mobile);
    const reg = await prisma.registration.findFirst({
      where: { family: { persons: { some: { mobile, isHead: true, deletedAt: null } } } },
      orderBy: { id: 'desc' },
      include: { family: { include: { persons: { where: { deletedAt: null }, select: { name: true, isHead: true } } } } },
    });
    if (!reg) throw httpError(404, 'NOT_FOUND', 'No registration found for this mobile number.');
    return {
      data: {
        id: reg.id,
        status: reg.status,
        submittedAt: reg.submittedAt,
        decidedAt: reg.decidedAt,
        remarks: reg.status === 'REJECTED' ? reg.remarks : null,
        headName: reg.family.persons.find((p) => p.isHead)?.name ?? null,
        memberCount: reg.family.persons.length,
        membershipNo: reg.status === 'APPROVED' ? reg.family.membershipNo : null,
      },
    };
  });

  // ---------- staff ----------
  const staff = requirePerm('registrations.approve');

  app.get('/', { preHandler: staff }, async (req) => {
    const { status } = parse(listQuery, req.query);
    const pg = paginate(req.query);
    const where: Prisma.RegistrationWhereInput = status ? { status } : {};
    const [rows, total, grouped] = await Promise.all([
      prisma.registration.findMany({ where, orderBy: { id: 'desc' }, skip: pg.skip, take: pg.take, include: regInclude }),
      prisma.registration.count({ where }),
      prisma.registration.groupBy({ by: ['status'], _count: { _all: true } }),
    ]);
    const counts = { PENDING: 0, APPROVED: 0, REJECTED: 0 } as Record<string, number>;
    for (const g of grouped) counts[g.status] = g._count._all;
    return { ...pg.result(rows.map(serialize), total), counts };
  });

  app.get('/:id', { preHandler: staff }, async (req) => {
    const r = await prisma.registration.findUnique({ where: { id: idOf(req.params) }, include: regInclude });
    if (!r) throw httpError(404, 'NOT_FOUND', 'Registration not found');
    return { data: serialize(r) };
  });

  app.post('/:id/approve', { preHandler: staff }, async (req) => {
    const id = idOf(req.params);
    const out = await prisma.$transaction(async (tx) => {
      const r = await tx.registration.findUnique({ where: { id }, include: { family: { include: { persons: { where: { deletedAt: null } } } } } });
      if (!r) throw httpError(404, 'NOT_FOUND', 'Registration not found');
      if (r.status !== 'PENDING') throw httpError(409, 'ALREADY_DECIDED', 'This registration has already been decided.');
      const head = r.family.persons.find((p) => p.isHead);
      if (!head?.mobile) throw httpError(400, 'NO_HEAD', 'This registration has no head mobile number.');
      if (await tx.user.findUnique({ where: { mobile: head.mobile } })) {
        throw httpError(409, 'DUPLICATE_MOBILE', 'This mobile number already has a login. Reject this registration as a duplicate.');
      }
      const membershipNo = await nextMembershipNo(tx);
      await tx.family.update({ where: { id: r.familyId }, data: { status: 'ACTIVE', membershipNo, subscriptionStatus: 'DUE' } });
      const user = await tx.user.create({
        data: { mobile: head.mobile, personId: head.id, displayName: head.name, roles: { create: { roleId: await roleId('head') } } },
      });
      for (const p of r.family.persons) await publishPhoto(tx, p.photoFileId);
      await tx.registration.update({ where: { id }, data: { status: 'APPROVED', decidedBy: req.user.id, decidedAt: new Date() } });
      await audit(
        req,
        { action: 'registration.approve', entity: 'registration', entityId: id, summary: `Approved registration of ${head.name} as ${membershipNo}`, before: { status: 'PENDING' }, after: { status: 'APPROVED', membershipNo, userId: user.id } },
        tx,
      );
      return { membershipNo, userId: user.id };
    });
    await notify([out.userId], {
      title: `Welcome! Membership ${out.membershipNo}`,
      body: `Your family registration is approved. Your membership number is ${out.membershipNo}.`,
      titleHi: `स्वागत है! सदस्यता ${out.membershipNo}`,
      bodyHi: `आपका पंजीकरण स्वीकृत हो गया है। आपकी सदस्यता संख्या ${out.membershipNo} है।`,
      kind: 'registration',
    }).catch(() => null);
    return { data: { id, status: 'APPROVED', membershipNo: out.membershipNo } };
  });

  app.post('/:id/reject', { preHandler: staff }, async (req) => {
    const id = idOf(req.params);
    const { remarks } = parse(rejectBody, req.body);
    await prisma.$transaction(async (tx) => {
      const r = await tx.registration.findUnique({ where: { id }, include: { family: { include: { persons: { where: { isHead: true } } } } } });
      if (!r) throw httpError(404, 'NOT_FOUND', 'Registration not found');
      if (r.status !== 'PENDING') throw httpError(409, 'ALREADY_DECIDED', 'This registration has already been decided.');
      await tx.family.update({ where: { id: r.familyId }, data: { status: 'REJECTED' } });
      await tx.registration.update({ where: { id }, data: { status: 'REJECTED', remarks, decidedBy: req.user.id, decidedAt: new Date() } });
      await audit(
        req,
        { action: 'registration.reject', entity: 'registration', entityId: id, summary: `Rejected registration of ${r.family.persons[0]?.name ?? id}`, before: { status: 'PENDING' }, after: { status: 'REJECTED', remarks } },
        tx,
      );
    });
    return { data: { id, status: 'REJECTED' } };
  });
};
export default routes;
