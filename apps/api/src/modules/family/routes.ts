import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { httpError } from '../../lib/errors';
import { parse } from '../../lib/parse';
import { paginate } from '../../lib/pagination';
import { audit } from '../../lib/audit';
import { notify } from '../../lib/push';
import { authenticate, requireHead, requirePerm } from '../../lib/auth';
import { PRIVACY_FIELDS, effectivePrivacy } from '../../lib/privacy';
import {
  assertAttachable, defined, familySummary, memberCreateSchema, memberPatchSchema, personAudit, personInclude, publishPhoto, rawPerson, roleId,
  usersWithPerm,
} from '../members/service';

const MAX_PERSONS = 30;
const idOf = (params: unknown, key = 'id') => {
  const n = Number((params as Record<string, string>)[key]);
  if (!Number.isInteger(n) || n <= 0) throw httpError(400, 'VALIDATION_ERROR', 'Invalid id');
  return n;
};

function ownFamilyId(req: FastifyRequest): number {
  if (!req.user.familyId) throw httpError(403, 'NO_FAMILY', 'Your account is not linked to a family.');
  return req.user.familyId;
}
async function ownPerson(req: FastifyRequest, id: number) {
  const p = await prisma.person.findFirst({ where: { id, familyId: ownFamilyId(req), deletedAt: null }, include: personInclude });
  if (!p) throw httpError(404, 'NOT_FOUND', 'Family member not found');
  return p;
}
const revokeSessions = (userId: number) => prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });

/** Disables a person's login, revokes sessions, cancels any pending request. Shared by head + staff. */
async function disableLogin(req: FastifyRequest, personId: number, actorLabel: string) {
  const person = await prisma.person.findFirst({ where: { id: personId, deletedAt: null }, include: { user: true, activationReqs: { where: { status: 'PENDING' } } } });
  if (!person) throw httpError(404, 'NOT_FOUND', 'Family member not found');
  if (person.isHead) throw httpError(400, 'HEAD_LOGIN', 'The head of the family login cannot be withdrawn here.');
  const hasUser = person.user?.status === 'ACTIVE';
  if (!hasUser && !person.activationReqs.length) throw httpError(409, 'NO_LOGIN', 'This member has no login or pending request.');
  await prisma.$transaction(async (tx) => {
    if (hasUser) await tx.user.update({ where: { id: person.user!.id }, data: { status: 'DISABLED' } });
    await tx.loginActivationRequest.updateMany({
      where: { personId, status: 'PENDING' },
      data: { status: 'REJECTED', remarks: 'Withdrawn', decidedAt: new Date(), decidedBy: req.user.id },
    });
    await audit(req, { action: 'login.withdraw', entity: 'person', entityId: personId, summary: `${actorLabel} withdrew login of ${person.name}`, before: { loginActive: hasUser }, after: { loginActive: false } }, tx);
  });
  if (person.user) await revokeSessions(person.user.id);
  return person;
}

const privacyBody = z.object({
  fields: z.object(Object.fromEntries(PRIVACY_FIELDS.map((f) => [f, z.boolean().optional()])) as Record<(typeof PRIVACY_FIELDS)[number], z.ZodOptional<z.ZodBoolean>>).strict(),
});
const decideBody = z.object({ remarks: z.string().trim().min(2, 'Please enter remarks').max(500) });

const routes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', authenticate);

  // ---------- own family ----------
  app.get('/mine', async (req) => {
    const id = ownFamilyId(req);
    const fam = await prisma.family.findUnique({
      where: { id },
      include: { zone: true, persons: { where: { deletedAt: null }, orderBy: [{ isHead: 'desc' }, { id: 'asc' }], include: personInclude } },
    });
    if (!fam) throw httpError(404, 'NOT_FOUND', 'Family not found');
    return {
      data: {
        family: { ...familySummary(fam), memberCount: fam.persons.length },
        persons: fam.persons.map(rawPerson),
        canEdit: req.user.isHead,
        myPersonId: req.user.personId,
      },
    };
  });

  app.post('/persons', { preHandler: requireHead }, async (req, reply) => {
    const b = parse(memberCreateSchema, req.body);
    const familyId = ownFamilyId(req);
    if ((await prisma.person.count({ where: { familyId, deletedAt: null } })) >= MAX_PERSONS) throw httpError(400, 'LIMIT', `A family can have at most ${MAX_PERSONS} members.`);
    if (b.photoFileId) await assertAttachable(b.photoFileId, ['photo'], req.user.id);
    const p = await prisma.$transaction(async (tx) => {
      const created = await tx.person.create({ data: { familyId, isHead: false, ...b } });
      await publishPhoto(tx, created.photoFileId);
      await audit(req, { action: 'person.create', entity: 'person', entityId: created.id, summary: `Added ${created.name} (${created.relation})`, after: personAudit(created) }, tx);
      return created;
    });
    return reply.status(201).send({ data: rawPerson(await ownPerson(req, p.id)) });
  });

  app.patch('/persons/:id', { preHandler: requireHead }, async (req) => {
    const id = idOf(req.params);
    const b = parse(memberPatchSchema, req.body);
    const before = await ownPerson(req, id);
    if (before.isHead && b.relation && b.relation !== 'SELF') throw httpError(400, 'VALIDATION_ERROR', 'The head of the family must keep the relation "Self".');
    if (!before.isHead && b.relation === 'SELF') throw httpError(400, 'VALIDATION_ERROR', 'Only the head of the family can have the relation "Self".');
    if (b.mobile !== undefined && b.mobile !== before.mobile && before.user) {
      throw httpError(409, 'LOGIN_ACTIVE', 'This member has a login. Withdraw the login before changing the mobile number.');
    }
    if (b.photoFileId && b.photoFileId !== before.photoFileId) await assertAttachable(b.photoFileId, ['photo'], req.user.id);
    await prisma.$transaction(async (tx) => {
      const p = await tx.person.update({ where: { id }, data: defined(b) });
      await publishPhoto(tx, p.photoFileId);
      await audit(req, { action: 'person.update', entity: 'person', entityId: id, summary: `Updated ${p.name}`, before: personAudit(before), after: personAudit(p) }, tx);
    });
    return { data: rawPerson(await ownPerson(req, id)) };
  });

  app.delete('/persons/:id', { preHandler: requireHead }, async (req) => {
    const id = idOf(req.params);
    const p = await ownPerson(req, id);
    if (p.isHead) throw httpError(400, 'HEAD_DELETE', 'The head of the family cannot be removed.');
    await prisma.$transaction(async (tx) => {
      await tx.person.update({ where: { id }, data: { deletedAt: new Date() } });
      if (p.user) await tx.user.update({ where: { id: p.user.id }, data: { status: 'DISABLED' } });
      await tx.loginActivationRequest.updateMany({ where: { personId: id, status: 'PENDING' }, data: { status: 'REJECTED', remarks: 'Member removed', decidedAt: new Date(), decidedBy: req.user.id } });
      await audit(req, { action: 'person.delete', entity: 'person', entityId: id, summary: `Removed ${p.name} from the family`, before: personAudit(p) }, tx);
    });
    if (p.user) await revokeSessions(p.user.id);
    return { data: { ok: true } };
  });

  // ---------- login activation (head) ----------
  app.post('/persons/:id/activation', { preHandler: requireHead }, async (req, reply) => {
    const id = idOf(req.params);
    const p = await ownPerson(req, id);
    if (p.isHead) throw httpError(400, 'HEAD_LOGIN', 'The head of the family already has a login.');
    if (!p.mobile) throw httpError(400, 'NO_MOBILE', 'Add a mobile number for this member before requesting a login.');
    if (p.user?.status === 'ACTIVE') throw httpError(409, 'ALREADY_ACTIVE', 'This member already has a login.');
    if (p.activationReqs.some((r) => r.status === 'PENDING')) throw httpError(409, 'ALREADY_REQUESTED', 'A login request for this member is already pending.');
    const other = await prisma.user.findUnique({ where: { mobile: p.mobile } });
    if (other && other.personId !== p.id) throw httpError(409, 'MOBILE_IN_USE', 'This mobile number is already used by another login.');
    const r = await prisma.$transaction(async (tx) => {
      const created = await tx.loginActivationRequest.create({ data: { personId: id, requestedBy: req.user.id } });
      await audit(req, { action: 'login.request', entity: 'person', entityId: id, summary: `Requested login for ${p.name}`, after: { requestId: created.id, status: 'PENDING' } }, tx);
      return created;
    });
    const staff = await usersWithPerm('logins.approve');
    await notify(staff, { title: 'Login request', body: `${req.user.name} requested a login for ${p.name}.`, titleHi: 'लॉगिन अनुरोध', bodyHi: `${req.user.name} ने ${p.name} के लिए लॉगिन का अनुरोध किया है।`, kind: 'general', data: { type: 'login_request', requestId: String(r.id) } }).catch(() => null);
    return reply.status(201).send({ data: { id: r.id, status: r.status } });
  });

  app.delete('/persons/:id/login', { preHandler: requireHead }, async (req) => {
    const id = idOf(req.params);
    await ownPerson(req, id);
    await disableLogin(req, id, 'Head');
    return { data: { ok: true } };
  });

  // ---------- privacy ----------
  app.get('/privacy/:personId', async (req) => {
    const p = await ownPerson(req, idOf(req.params, 'personId'));
    return { data: { personId: p.id, name: p.name, fields: effectivePrivacy(p.privacy), editable: req.user.isHead } };
  });

  app.put('/privacy/:personId', { preHandler: requireHead }, async (req) => {
    const p = await ownPerson(req, idOf(req.params, 'personId'));
    const { fields } = parse(privacyBody, req.body);
    const before = effectivePrivacy(p.privacy);
    const entries = Object.entries(fields).filter(([, v]) => typeof v === 'boolean') as [string, boolean][];
    await prisma.$transaction(async (tx) => {
      for (const [field, visible] of entries) {
        await tx.privacySetting.upsert({ where: { personId_field: { personId: p.id, field } }, update: { visible }, create: { personId: p.id, field, visible } });
      }
      await audit(req, { action: 'privacy.update', entity: 'person', entityId: p.id, summary: `Updated privacy of ${p.name}`, before, after: { ...before, ...Object.fromEntries(entries) } }, tx);
    });
    const rows = await prisma.privacySetting.findMany({ where: { personId: p.id } });
    return { data: { personId: p.id, name: p.name, fields: effectivePrivacy(rows), editable: true } };
  });

  // ---------- staff: login requests ----------
  const staff = requirePerm('logins.approve');
  const listQ = z.object({ status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional() });

  app.get('/activations', { preHandler: staff }, async (req) => {
    const { status } = parse(listQ, req.query);
    const pg = paginate(req.query);
    const where: Prisma.LoginActivationRequestWhereInput = status ? { status } : {};
    const [rows, total] = await Promise.all([
      prisma.loginActivationRequest.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: pg.skip,
        take: pg.take,
        include: { person: { include: { family: { include: { zone: true, persons: { where: { isHead: true }, select: { name: true, mobile: true } } } } } } },
      }),
      prisma.loginActivationRequest.count({ where }),
    ]);
    const requesters = await prisma.user.findMany({ where: { id: { in: rows.map((r) => r.requestedBy) } }, select: { id: true, displayName: true, mobile: true } });
    return pg.result(
      rows.map((r) => ({
        id: r.id,
        status: r.status,
        remarks: r.remarks,
        createdAt: r.createdAt,
        decidedAt: r.decidedAt,
        person: { id: r.person.id, name: r.person.name, relation: r.person.relation, mobile: r.person.mobile },
        family: { id: r.person.familyId, membershipNo: r.person.family.membershipNo, zone: r.person.family.zone?.name ?? null, headName: r.person.family.persons[0]?.name ?? null },
        requestedBy: requesters.find((u) => u.id === r.requestedBy)?.displayName ?? null,
      })),
      total,
    );
  });

  app.post('/activations/:id/approve', { preHandler: staff }, async (req) => {
    const id = idOf(req.params);
    const out = await prisma.$transaction(async (tx) => {
      const r = await tx.loginActivationRequest.findUnique({ where: { id }, include: { person: { include: { user: true } } } });
      if (!r) throw httpError(404, 'NOT_FOUND', 'Request not found');
      if (r.status !== 'PENDING') throw httpError(409, 'ALREADY_DECIDED', 'This request has already been decided.');
      const p = r.person;
      if (p.deletedAt) throw httpError(409, 'PERSON_REMOVED', 'This member was removed from the family.');
      if (!p.mobile) throw httpError(400, 'NO_MOBILE', 'This member has no mobile number.');
      const clash = await tx.user.findUnique({ where: { mobile: p.mobile } });
      if (clash && clash.personId !== p.id) throw httpError(409, 'MOBILE_IN_USE', 'This mobile number is already used by another login.');
      let userId: number;
      if (p.user) {
        const u = await tx.user.update({ where: { id: p.user.id }, data: { status: 'ACTIVE', mobile: p.mobile, displayName: p.name } });
        userId = u.id;
      } else {
        const u = await tx.user.create({ data: { mobile: p.mobile, personId: p.id, displayName: p.name, roles: { create: { roleId: await roleId('family_viewer') } } } });
        userId = u.id;
      }
      await tx.loginActivationRequest.update({ where: { id }, data: { status: 'APPROVED', decidedBy: req.user.id, decidedAt: new Date() } });
      await audit(req, { action: 'login.approve', entity: 'person', entityId: p.id, summary: `Approved login for ${p.name}`, before: { status: 'PENDING' }, after: { status: 'APPROVED', userId } }, tx);
      return { userId, person: p, headUserId: r.requestedBy };
    });
    await notify([out.userId], { title: 'Your login is active', body: 'The Sabha approved your login. You can now sign in with your mobile number.', titleHi: 'आपका लॉगिन सक्रिय हो गया', bodyHi: 'सभा ने आपका लॉगिन स्वीकृत कर दिया है। अब आप मोबाइल नंबर से साइन इन कर सकते हैं।' }).catch(() => null);
    await notify([out.headUserId], { title: 'Login approved', body: `Login for ${out.person.name} has been approved.`, titleHi: 'लॉगिन स्वीकृत', bodyHi: `${out.person.name} का लॉगिन स्वीकृत हो गया है।` }).catch(() => null);
    return { data: { id, status: 'APPROVED', userId: out.userId } };
  });

  app.post('/activations/:id/reject', { preHandler: staff }, async (req) => {
    const id = idOf(req.params);
    const { remarks } = parse(decideBody, req.body);
    const r = await prisma.loginActivationRequest.findUnique({ where: { id }, include: { person: true } });
    if (!r) throw httpError(404, 'NOT_FOUND', 'Request not found');
    if (r.status !== 'PENDING') throw httpError(409, 'ALREADY_DECIDED', 'This request has already been decided.');
    await prisma.$transaction(async (tx) => {
      await tx.loginActivationRequest.update({ where: { id }, data: { status: 'REJECTED', remarks, decidedBy: req.user.id, decidedAt: new Date() } });
      await audit(req, { action: 'login.reject', entity: 'person', entityId: r.personId, summary: `Rejected login for ${r.person.name}`, before: { status: 'PENDING' }, after: { status: 'REJECTED', remarks } }, tx);
    });
    await notify([r.requestedBy], { title: 'Login request declined', body: `Login for ${r.person.name} was not approved: ${remarks}`, titleHi: 'लॉगिन अनुरोध अस्वीकृत', bodyHi: `${r.person.name} का लॉगिन स्वीकृत नहीं हुआ: ${remarks}` }).catch(() => null);
    return { data: { id, status: 'REJECTED' } };
  });

  app.delete('/admin/persons/:id/login', { preHandler: staff }, async (req) => {
    const id = idOf(req.params);
    const p = await disableLogin(req, id, 'Staff');
    if (p.user) await notify([p.user.id], { title: 'Login withdrawn', body: 'Your login has been withdrawn by the Sabha.', titleHi: 'लॉगिन वापस लिया गया', bodyHi: 'सभा ने आपका लॉगिन वापस ले लिया है।' }).catch(() => null);
    return { data: { ok: true } };
  });
};
export default routes;
