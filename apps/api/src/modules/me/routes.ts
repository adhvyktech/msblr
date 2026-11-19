import type { FastifyPluginAsync } from 'fastify';
import { deviceTokenDeleteSchema, deviceTokenSchema, languageSchema } from '@msblr/shared';
import { prisma } from '../../lib/prisma';
import { authenticate } from '../../lib/auth';
import { parse } from '../../lib/parse';
import { audit } from '../../lib/audit';
import { toPublicPerson } from '../../lib/privacy';

const routes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', authenticate);

  app.get('/', async (req) => {
    const u = req.user;
    const person = u.personId
      ? await prisma.person.findUnique({ where: { id: u.personId }, include: { privacy: true, family: { include: { zone: true } } } })
      : null;
    let family = null;
    if (u.familyId) {
      const f = await prisma.family.findUnique({
        where: { id: u.familyId },
        include: { zone: true, persons: { where: { deletedAt: null }, select: { id: true, name: true, isHead: true } } },
      });
      if (f) {
        family = {
          id: f.id,
          membershipNo: f.membershipNo,
          zone: f.zone?.name ?? null,
          status: f.status,
          subscriptionStatus: f.subscriptionStatus,
          subscriptionValidUntil: f.subscriptionValidUntil,
          memberCount: f.persons.length,
          headName: f.persons.find((p) => p.isHead)?.name ?? null,
        };
      }
    }
    return {
      data: {
        user: { id: u.id, name: u.name, mobile: u.mobile, language: u.language, advertiserId: u.advertiserId },
        roles: u.roles,
        perms: u.perms,
        zoneIds: u.zoneIds,
        person: person ? toPublicPerson(person, u) : null,
        family,
        isHead: u.isHead,
        isStaff: u.isStaff,
      },
    };
  });

  app.patch('/language', async (req) => {
    const { language } = parse(languageSchema, req.body);
    await prisma.user.update({ where: { id: req.user.id }, data: { language } });
    return { data: { language } };
  });

  app.post('/device-tokens', async (req) => {
    const { token, platform } = parse(deviceTokenSchema, req.body);
    await prisma.deviceToken.upsert({
      where: { token },
      update: { userId: req.user.id, platform },
      create: { userId: req.user.id, token, platform },
    });
    return { data: { ok: true } };
  });

  app.delete('/device-tokens', async (req) => {
    const { token } = parse(deviceTokenDeleteSchema, req.body ?? req.query);
    await prisma.deviceToken.deleteMany({ where: { token, userId: req.user.id } });
    await audit(req, { action: 'device_token.remove', entity: 'user', entityId: req.user.id, summary: 'Device token removed' });
    return { data: { ok: true } };
  });
};
export default routes;
