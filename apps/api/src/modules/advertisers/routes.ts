import crypto from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { mobileSchema } from '@msblr/shared';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { env, isProd } from '../../lib/env';
import { parse } from '../../lib/parse';
import { paginate } from '../../lib/pagination';
import { httpError } from '../../lib/errors';
import { audit } from '../../lib/audit';
import { getSmsProvider, DEV_OTP, otpBypassFor, otpCodeFor } from '../../lib/sms';
import { ACCESS_TTL_SEC, REFRESH_COOKIE, authenticate, createSession, loadAuthUser, requireHead, requirePerm, signAccess } from '../../lib/auth';

const OTP_TTL_MS = 5 * 60_000;
const MAX_ATTEMPTS = 5;
const MAX_SENDS = 3;
const SEND_WINDOW_MS = 15 * 60_000;
const hashOtp = (mobile: string, code: string) => crypto.createHmac('sha256', env.JWT_SECRET).update(`${mobile}:${code}`).digest('hex');

const shape = (a: { id: number; name: string; contactPerson: string | null; mobile: string; email: string | null; memberFamilyId: number | null; createdAt: Date }) => ({
  id: a.id, name: a.name, contactPerson: a.contactPerson, mobile: a.mobile, email: a.email, memberFamilyId: a.memberFamilyId, createdAt: a.createdAt,
});

async function assertMobileFree(mobile: string) {
  if (await prisma.user.findUnique({ where: { mobile }, select: { id: true } })) {
    throw httpError(409, 'ALREADY_REGISTERED', 'This mobile number already has an account. Please log in instead.');
  }
  if (await prisma.person.findFirst({ where: { mobile, deletedAt: null }, select: { id: true } })) {
    throw httpError(409, 'MEMBER_NUMBER', 'This number belongs to a Sabha member. Please log in with it, or ask your family head to activate your login, then choose Advertise.');
  }
}

const routes: FastifyPluginAsync = async (app) => {
  const manage = requirePerm('ads.manage');

  // ---------- public sign-up for non-members (OTP verified) ----------
  app.post('/signup/request', { config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } }, async (req) => {
    const { mobile } = parse(z.object({ mobile: mobileSchema }), req.body);
    await assertMobileFree(mobile);
    const since = new Date(Date.now() - SEND_WINDOW_MS);
    const sends = await prisma.otpRequest.count({ where: { mobile, createdAt: { gte: since } } });
    if (sends >= MAX_SENDS) throw httpError(429, 'OTP_SEND_LIMIT', 'Too many OTP requests. Please try again in a few minutes.');
    const code = otpCodeFor(mobile, () => String(crypto.randomInt(100000, 1000000)));
    await prisma.otpRequest.create({ data: { mobile, otpHash: hashOtp(mobile, code), expiresAt: new Date(Date.now() + OTP_TTL_MS), ip: req.ip } });
    await getSmsProvider().sendOtp(mobile, code);
    return { data: { sent: true, expiresInSec: OTP_TTL_MS / 1000, sendsLeft: MAX_SENDS - sends - 1 } };
  });

  app.post('/signup', { config: { rateLimit: { max: 20, timeWindow: '15 minutes' } } }, async (req, reply) => {
    const b = parse(z.object({
      name: z.string().trim().min(2, 'Enter your business name').max(120),
      contactPerson: z.string().trim().min(2, 'Enter the contact person name').max(100),
      mobile: mobileSchema,
      email: z.string().trim().email('Enter a valid email').max(150).optional().or(z.literal('')),
      code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
      trustDevice: z.boolean().optional(),
    }), req.body);
    await assertMobileFree(b.mobile);
    const bypass = otpBypassFor(b.mobile) && b.code === DEV_OTP;
    if (!bypass) {
      const otp = await prisma.otpRequest.findFirst({ where: { mobile: b.mobile, consumed: false, expiresAt: { gt: new Date() } }, orderBy: { createdAt: 'desc' } });
      if (!otp) throw httpError(400, 'OTP_EXPIRED', 'This OTP has expired. Please request a new one.');
      if (otp.attempts >= MAX_ATTEMPTS) throw httpError(429, 'OTP_ATTEMPTS', 'Too many wrong attempts. Please request a new OTP.');
      const ok = crypto.timingSafeEqual(Buffer.from(hashOtp(b.mobile, b.code)), Buffer.from(otp.otpHash));
      if (!ok) {
        await prisma.otpRequest.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
        throw httpError(400, 'OTP_INVALID', 'Incorrect OTP. Please check and try again.');
      }
      await prisma.otpRequest.update({ where: { id: otp.id }, data: { consumed: true } });
    } else {
      await prisma.otpRequest.updateMany({ where: { mobile: b.mobile, consumed: false }, data: { consumed: true } });
    }
    const role = await prisma.role.findUnique({ where: { name: 'advertiser' } });
    const user = await prisma.$transaction(async (tx) => {
      const adv = await tx.advertiser.create({ data: { name: b.name, contactPerson: b.contactPerson, mobile: b.mobile, email: b.email || null } });
      const u = await tx.user.create({
        data: { mobile: b.mobile, advertiserId: adv.id, displayName: b.contactPerson, ...(role ? { roles: { create: { roleId: role.id } } } : {}), lastLoginAt: new Date() },
      });
      await audit(null, { action: 'advertiser.signup', entity: 'advertiser', entityId: adv.id, summary: `${b.name} signed up as advertiser`, after: { name: b.name, mobile: b.mobile }, actor: { userId: u.id, name: b.contactPerson, role: 'advertiser' } }, tx);
      return u;
    });
    const s = await createSession(user.id, { trustDevice: b.trustDevice, deviceName: (req.headers['user-agent'] as string | undefined)?.slice(0, 80), platform: 'web' });
    const u = (await loadAuthUser(user.id, s.sessionId))!;
    reply.setCookie(REFRESH_COOKIE, s.refreshToken, {
      httpOnly: true, sameSite: 'lax', secure: isProd, path: '/api/auth', ...(s.persistent ? { expires: s.expiresAt } : {}),
    });
    return {
      data: {
        accessToken: signAccess(u, s.sessionId), expiresIn: ACCESS_TTL_SEC,
        user: { id: u.id, name: u.name, mobile: u.mobile, roles: u.roles, isStaff: u.isStaff, isHead: u.isHead, language: u.language },
      },
    };
  });

  // ---------- member heads become advertisers ----------
  app.post('/me/enable', { preHandler: requireHead }, async (req) => {
    if (req.user.advertiserId) throw httpError(409, 'ALREADY_ADVERTISER', 'You already have an advertiser account.');
    const b = parse(z.object({ name: z.string().trim().min(2).max(120).optional() }), req.body ?? {});
    const p = await prisma.person.findUniqueOrThrow({ where: { id: req.user.personId! } });
    const biz = await prisma.business.findFirst({ where: { personId: p.id }, select: { name: true }, orderBy: { id: 'asc' } });
    const bizName = biz?.name;
    const role = await prisma.role.findUnique({ where: { name: 'advertiser' } });
    const adv = await prisma.$transaction(async (tx) => {
      const a = await tx.advertiser.create({
        data: { name: b.name ?? bizName ?? p.name, contactPerson: p.name, mobile: req.user.mobile, email: p.email, memberFamilyId: req.user.familyId },
      });
      await tx.user.update({ where: { id: req.user.id }, data: { advertiserId: a.id } });
      if (role) await tx.userRole.create({ data: { userId: req.user.id, roleId: role.id } });
      await audit(req, { action: 'advertiser.enable', entity: 'advertiser', entityId: a.id, summary: `${p.name} enabled advertiser access` }, tx);
      return a;
    });
    return { data: shape(adv) };
  });

  app.get('/me', { preHandler: authenticate }, async (req) => {
    if (!req.user.advertiserId) throw httpError(404, 'NOT_ADVERTISER', 'No advertiser account yet.');
    const a = await prisma.advertiser.findUniqueOrThrow({ where: { id: req.user.advertiserId } });
    return { data: shape(a) };
  });

  // ---------- staff ----------
  app.get('/', { preHandler: manage }, async (req) => {
    const { q } = parse(z.object({ q: z.string().trim().optional() }), req.query);
    const pg = paginate(req.query);
    const where: Prisma.AdvertiserWhereInput = q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { contactPerson: { contains: q, mode: 'insensitive' } }, { mobile: { contains: q } }] } : {};
    const [rows, total] = await Promise.all([
      prisma.advertiser.findMany({ where, orderBy: { id: 'desc' }, skip: pg.skip, take: pg.take, include: { _count: { select: { requests: true } } } }),
      prisma.advertiser.count({ where }),
    ]);
    return pg.result(rows.map((a) => ({ ...shape(a), requestCount: a._count.requests })), total);
  });

  app.get('/:id', { preHandler: manage }, async (req) => {
    const { id } = parse(z.object({ id: z.coerce.number().int().positive() }), req.params);
    const a = await prisma.advertiser.findUnique({ where: { id }, include: { requests: { select: { id: true, status: true, placement: { select: { name: true } } }, orderBy: { id: 'desc' } } } });
    if (!a) throw httpError(404, 'NOT_FOUND', 'Advertiser not found.');
    return { data: { ...shape(a), requests: a.requests.map((r) => ({ id: r.id, status: r.status, placement: r.placement.name })) } };
  });

  app.patch('/:id', { preHandler: manage }, async (req) => {
    const { id } = parse(z.object({ id: z.coerce.number().int().positive() }), req.params);
    const b = parse(z.object({
      name: z.string().trim().min(2).max(120).optional(), contactPerson: z.string().trim().min(2).max(100).optional(),
      email: z.string().trim().email().max(150).nullable().optional(),
    }), req.body);
    const before = await prisma.advertiser.findUnique({ where: { id } });
    if (!before) throw httpError(404, 'NOT_FOUND', 'Advertiser not found.');
    const a = await prisma.advertiser.update({ where: { id }, data: b });
    await audit(req, { action: 'advertiser.update', entity: 'advertiser', entityId: id, summary: `Updated advertiser ${a.name}`, before: shape(before), after: shape(a) });
    return { data: shape(a) };
  });
};
export default routes;
