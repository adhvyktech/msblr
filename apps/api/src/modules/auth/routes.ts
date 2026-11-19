import crypto from 'node:crypto';
import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { otpRequestSchema, otpVerifySchema, refreshSchema } from '@msblr/shared';
import { prisma } from '../../lib/prisma';
import { env, isProd } from '../../lib/env';
import { parse } from '../../lib/parse';
import { httpError } from '../../lib/errors';
import { audit } from '../../lib/audit';
import { getSmsProvider, DEV_OTP } from '../../lib/sms';
import {
  ACCESS_TTL_SEC, REFRESH_COOKIE, authenticate, createSession, hashToken, loadAuthUser, rotateRefresh, signAccess,
} from '../../lib/auth';

const OTP_TTL_MS = 5 * 60_000;
const MAX_ATTEMPTS = 5;
const MAX_SENDS = 3;
const SEND_WINDOW_MS = 15 * 60_000;
const RESEND_AFTER_SEC = 30;

const hashOtp = (mobile: string, code: string) => crypto.createHmac('sha256', env.JWT_SECRET).update(`${mobile}:${code}`).digest('hex');

/** Resolves the login account for a mobile or throws a friendly, coded error. */
async function resolveUser(mobile: string) {
  const user = await prisma.user.findUnique({ where: { mobile } });
  if (user) {
    if (user.status !== 'ACTIVE') throw httpError(403, 'ACCOUNT_DISABLED', 'This account has been disabled. Please contact the Sabha office.');
    return user;
  }
  const person = await prisma.person.findFirst({
    where: { mobile, deletedAt: null },
    include: { family: { include: { persons: { where: { isHead: true }, select: { name: true } } } } },
  });
  if (person) {
    const head = person.family.persons[0]?.name ?? null;
    if (person.family.status === 'PENDING') {
      throw httpError(403, 'REGISTRATION_PENDING', 'Your family registration is under review. You can sign in once the Sabha approves it.', { headName: head });
    }
    throw httpError(403, 'LOGIN_PENDING', 'Login is not active for this number yet. The head of your family needs to request it, and the Sabha will approve it.', {
      personName: person.name,
      headName: head,
      membershipNo: person.family.membershipNo,
    });
  }
  throw httpError(404, 'NOT_REGISTERED', 'This mobile number is not registered with the Sabha. Please register your family first.');
}

function setRefreshCookie(reply: FastifyReply, token: string, expiresAt: Date, persistent: boolean) {
  reply.setCookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    path: '/api/auth',
    ...(persistent ? { expires: expiresAt } : {}),
  });
}
const clearRefreshCookie = (reply: FastifyReply) => reply.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });

const routes: FastifyPluginAsync = async (app) => {
  app.post('/otp/request', { config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } }, async (req) => {
    const { mobile } = parse(otpRequestSchema, req.body);
    await resolveUser(mobile);
    const since = new Date(Date.now() - SEND_WINDOW_MS);
    const sends = await prisma.otpRequest.findMany({ where: { mobile, createdAt: { gte: since } }, orderBy: { createdAt: 'desc' } });
    if (sends.length >= MAX_SENDS) {
      const wait = Math.max(1, Math.ceil((sends[sends.length - 1]!.createdAt.getTime() + SEND_WINDOW_MS - Date.now()) / 60_000));
      throw httpError(429, 'OTP_SEND_LIMIT', `Too many OTP requests. Please try again in ${wait} minute${wait > 1 ? 's' : ''}.`, { retryAfterMin: wait });
    }
    const last = sends[0];
    if (last && Date.now() - last.createdAt.getTime() < RESEND_AFTER_SEC * 1000 && !env.DEV_OTP_BYPASS) {
      throw httpError(429, 'OTP_TOO_SOON', `Please wait ${RESEND_AFTER_SEC} seconds before requesting another OTP.`);
    }
    const code = env.DEV_OTP_BYPASS ? DEV_OTP : String(crypto.randomInt(100000, 1000000));
    await prisma.otpRequest.create({
      data: { mobile, otpHash: hashOtp(mobile, code), expiresAt: new Date(Date.now() + OTP_TTL_MS), ip: req.ip },
    });
    await getSmsProvider().sendOtp(mobile, code);
    return { data: { sent: true, expiresInSec: OTP_TTL_MS / 1000, resendAfterSec: RESEND_AFTER_SEC, sendsLeft: MAX_SENDS - sends.length - 1 } };
  });

  app.post('/otp/verify', { config: { rateLimit: { max: 20, timeWindow: '15 minutes' } } }, async (req, reply) => {
    const b = parse(otpVerifySchema, req.body);
    const user = await resolveUser(b.mobile);

    const bypass = env.DEV_OTP_BYPASS && !isProd && b.code === DEV_OTP;
    if (!bypass) {
      const otp = await prisma.otpRequest.findFirst({
        where: { mobile: b.mobile, consumed: false, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: 'desc' },
      });
      if (!otp) throw httpError(400, 'OTP_EXPIRED', 'This OTP has expired. Please request a new one.');
      if (otp.attempts >= MAX_ATTEMPTS) throw httpError(429, 'OTP_ATTEMPTS', 'Too many wrong attempts. Please request a new OTP.');
      const ok = crypto.timingSafeEqual(Buffer.from(hashOtp(b.mobile, b.code)), Buffer.from(otp.otpHash));
      if (!ok) {
        const upd = await prisma.otpRequest.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
        const left = MAX_ATTEMPTS - upd.attempts;
        throw httpError(400, 'OTP_INVALID', left > 0 ? `Incorrect OTP. ${left} attempt${left > 1 ? 's' : ''} left.` : 'Too many wrong attempts. Please request a new OTP.', { attemptsLeft: left });
      }
      await prisma.otpRequest.update({ where: { id: otp.id }, data: { consumed: true } });
    } else {
      await prisma.otpRequest.updateMany({ where: { mobile: b.mobile, consumed: false }, data: { consumed: true } });
    }

    const platform = b.platform ?? 'web';
    const s = await createSession(user.id, { trustDevice: b.trustDevice, deviceName: b.deviceName ?? (req.headers['user-agent'] as string | undefined)?.slice(0, 80), platform });
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    const u = (await loadAuthUser(user.id, s.sessionId))!;
    const accessToken = signAccess(u, s.sessionId);
    await audit(req, { action: 'auth.login', entity: 'user', entityId: user.id, summary: `${u.name} signed in (${platform})`, actor: { userId: u.id, name: u.name, role: u.roles.join(',') } });
    setRefreshCookie(reply, s.refreshToken, s.expiresAt, s.persistent);
    return {
      data: {
        accessToken,
        expiresIn: ACCESS_TTL_SEC,
        ...(platform !== 'web' ? { refreshToken: s.refreshToken } : {}),
        user: { id: u.id, name: u.name, mobile: u.mobile, roles: u.roles, isStaff: u.isStaff, isHead: u.isHead, language: u.language },
      },
    };
  });

  app.post('/refresh', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req, reply) => {
    const body = parse(refreshSchema, req.body ?? {});
    const token = req.cookies[REFRESH_COOKIE] ?? body.refreshToken;
    if (!token) throw httpError(401, 'INVALID_REFRESH', 'Please sign in.');
    try {
      const r = await rotateRefresh(token);
      const persistent = r.expiresAt.getTime() - Date.now() > 36 * 3600_000;
      setRefreshCookie(reply, r.refreshToken, r.expiresAt, persistent);
      const fromBody = !req.cookies[REFRESH_COOKIE];
      return { data: { accessToken: r.accessToken, expiresIn: ACCESS_TTL_SEC, ...(fromBody ? { refreshToken: r.refreshToken } : {}) } };
    } catch (e) {
      clearRefreshCookie(reply);
      throw e;
    }
  });

  app.post('/logout', async (req, reply) => {
    const body = parse(refreshSchema, req.body ?? {});
    const token = req.cookies[REFRESH_COOKIE] ?? body.refreshToken;
    if (token) {
      const s = await prisma.session.findUnique({ where: { refreshHash: hashToken(token) } });
      if (s && !s.revokedAt) {
        await prisma.session.update({ where: { id: s.id }, data: { revokedAt: new Date() } });
        await audit(req, { action: 'auth.logout', entity: 'user', entityId: s.userId, summary: 'Signed out', actor: { userId: s.userId } });
      }
    }
    clearRefreshCookie(reply);
    return { data: { ok: true } };
  });

  app.get('/sessions', { preHandler: authenticate }, async (req) => {
    const rows = await prisma.session.findMany({
      where: { userId: req.user.id, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastUsedAt: 'desc' },
    });
    return {
      data: rows.map((s) => ({
        id: s.id, deviceName: s.deviceName, platform: s.platform, createdAt: s.createdAt, lastUsedAt: s.lastUsedAt, expiresAt: s.expiresAt,
        current: s.id === req.user.sessionId,
      })),
    };
  });

  app.delete('/sessions/:id', { preHandler: authenticate }, async (req) => {
    const { id } = req.params as { id: string };
    const s = await prisma.session.findFirst({ where: { id, userId: req.user.id, revokedAt: null } });
    if (!s) throw httpError(404, 'NOT_FOUND', 'Session not found');
    await prisma.session.update({ where: { id }, data: { revokedAt: new Date() } });
    await audit(req, { action: 'auth.session_revoke', entity: 'session', entityId: id, summary: `Revoked session ${s.deviceName ?? id}` });
    return { data: { ok: true } };
  });
};
export default routes;
