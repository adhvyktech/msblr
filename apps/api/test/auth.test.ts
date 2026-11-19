import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { login, bearer, freshIp } from './helpers';
import { prisma } from '../src/lib/prisma';
import { env } from '../src/lib/env';
import { setSmsProvider, ConsoleSmsProvider } from '../src/lib/sms';
import { requirePerm } from '../src/lib/auth';
import { buildApp } from '../src/server';

let app: FastifyInstance;
beforeAll(async () => {
  const a = await buildApp();
  a.get('/api/_t/needs-settings', { preHandler: requirePerm('settings.edit') }, async () => ({ data: 'ok' }));
  await a.ready();
  app = a;
});
afterAll(async () => {
  await app.close();
});

const post = (url: string, payload: unknown, headers: Record<string, string> = {}) =>
  app.inject({ method: 'POST', url, payload: payload as object, headers, remoteAddress: freshIp() });

describe('OTP flow', () => {
  it('requests and verifies an OTP (dev bypass) and returns a usable session', async () => {
    const r = await post('/api/auth/otp/request', { mobile: '+91 98450 12345' });
    expect(r.statusCode).toBe(200);
    expect(r.json().data.sent).toBe(true);
    const v = await post('/api/auth/otp/verify', { mobile: '9845012345', code: '123456', trustDevice: true });
    expect(v.statusCode).toBe(200);
    const d = v.json().data;
    expect(d.accessToken).toBeTruthy();
    expect(d.user.name).toBe('Ramesh Rathi');
    expect(d.refreshToken).toBeUndefined(); // web: cookie only
    const cookie = v.cookies.find((c) => c.name === 'msblr_rt')!;
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.path).toBe('/api/auth');
    const me = await app.inject({ method: 'GET', url: '/api/me', headers: bearer(d.accessToken) });
    expect(me.statusCode).toBe(200);
    expect(me.json().data.family.membershipNo).toBe('MSB-0412');
    expect(me.json().data.isHead).toBe(true);
    expect(me.json().data.isStaff).toBe(false);
  });

  it('rejects invalid mobile numbers', async () => {
    const r = await post('/api/auth/otp/request', { mobile: '12345' });
    expect(r.statusCode).toBe(400);
    expect(r.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('gives friendly errors for unregistered / login-pending / registration-pending numbers', async () => {
    const nr = await post('/api/auth/otp/request', { mobile: '9111111111' });
    expect(nr.statusCode).toBe(404);
    expect(nr.json().error.code).toBe('NOT_REGISTERED');

    const akash = await prisma.person.findFirstOrThrow({ where: { name: 'Akash Rathi' } });
    await prisma.person.update({ where: { id: akash.id }, data: { mobile: '9812340000' } });
    const lp = await post('/api/auth/otp/request', { mobile: '9812340000' });
    expect(lp.statusCode).toBe(403);
    expect(lp.json().error.code).toBe('LOGIN_PENDING');
    expect(lp.json().error.details.headName).toBe('Ramesh Rathi');

    const pendingFam = await prisma.family.findFirstOrThrow({ where: { status: 'PENDING' } });
    const pp = await prisma.person.findFirstOrThrow({ where: { familyId: pendingFam.id, isHead: true } });
    await prisma.person.update({ where: { id: pp.id }, data: { mobile: '9812340001' } });
    const rp = await post('/api/auth/otp/request', { mobile: '9812340001' });
    expect(rp.json().error.code).toBe('REGISTRATION_PENDING');
  });

  it('enforces the 3 sends / 15 minutes limit per mobile', async () => {
    const codes: number[] = [];
    for (let i = 0; i < 3; i++) codes.push((await post('/api/auth/otp/request', { mobile: '9000000004' })).statusCode);
    expect(codes).toEqual([200, 200, 200]);
    const fourth = await post('/api/auth/otp/request', { mobile: '9000000004' });
    expect(fourth.statusCode).toBe(429);
    expect(fourth.json().error.code).toBe('OTP_SEND_LIMIT');
  });

  it('applies a strict per-IP limit on the OTP request route', async () => {
    const ip = '203.0.113.9';
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) {
      const r = await app.inject({ method: 'POST', url: '/api/auth/otp/request', payload: { mobile: '9222222222' }, remoteAddress: ip });
      statuses.push(r.statusCode);
    }
    expect(statuses).toContain(429);
  });

  describe('real codes (bypass off)', () => {
    const sent: { mobile: string; code: string }[] = [];
    beforeAll(() => {
      env.DEV_OTP_BYPASS = false;
      setSmsProvider({
        async sendOtp(mobile, code) {
          sent.push({ mobile, code });
        },
      });
    });
    afterAll(() => {
      env.DEV_OTP_BYPASS = true;
      setSmsProvider(new ConsoleSmsProvider());
    });

    it('accepts the sent code once, rejects reuse, and 123456 no longer works', async () => {
      await post('/api/auth/otp/request', { mobile: '9000000002' });
      const { code } = sent.at(-1)!;
      expect(code).toMatch(/^\d{6}$/);
      const bypassTry = await post('/api/auth/otp/verify', { mobile: '9000000002', code: code === '123456' ? '654321' : '123456' });
      expect(bypassTry.statusCode).toBe(400);
      const ok = await post('/api/auth/otp/verify', { mobile: '9000000002', code });
      expect(ok.statusCode).toBe(200);
      const again = await post('/api/auth/otp/verify', { mobile: '9000000002', code });
      expect(again.statusCode).toBe(400);
      expect(again.json().error.code).toBe('OTP_EXPIRED');
    });

    it('locks after 5 wrong attempts', async () => {
      await post('/api/auth/otp/request', { mobile: '9000000003' });
      const real = sent.at(-1)!.code;
      const wrong = real === '000000' ? '111111' : '000000';
      let last;
      for (let i = 0; i < 5; i++) last = await post('/api/auth/otp/verify', { mobile: '9000000003', code: wrong });
      expect(last!.json().error.code).toBe('OTP_INVALID');
      const locked = await post('/api/auth/otp/verify', { mobile: '9000000003', code: real });
      expect(locked.statusCode).toBe(429);
      expect(locked.json().error.code).toBe('OTP_ATTEMPTS');
    });

    it('rejects an expired OTP', async () => {
      await post('/api/auth/otp/request', { mobile: '9000000001' });
      const real = sent.at(-1)!.code;
      await prisma.otpRequest.updateMany({ where: { mobile: '9000000001' }, data: { expiresAt: new Date(Date.now() - 1000) } });
      const r = await post('/api/auth/otp/verify', { mobile: '9000000001', code: real });
      expect(r.json().error.code).toBe('OTP_EXPIRED');
    });
  });
});

describe('sessions & refresh rotation', () => {
  it('rotates refresh tokens and rejects the old one', async () => {
    const l = await login(app, '9845012345');
    const r1 = await app.inject({ method: 'POST', url: '/api/auth/refresh', headers: { cookie: l.cookie }, remoteAddress: freshIp() });
    expect(r1.statusCode).toBe(200);
    const newCookie = r1.cookies.find((c) => c.name === 'msblr_rt')!;
    expect(`msblr_rt=${newCookie.value}`).not.toBe(l.cookie);
    expect(r1.json().data.accessToken).toBeTruthy();
    const replay = await app.inject({ method: 'POST', url: '/api/auth/refresh', headers: { cookie: l.cookie }, remoteAddress: freshIp() });
    expect(replay.statusCode).toBe(401);
    const r2 = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      headers: { cookie: `msblr_rt=${newCookie.value}` },
      remoteAddress: freshIp(),
    });
    expect(r2.statusCode).toBe(200);
  });

  it('supports refresh tokens in the body for native apps', async () => {
    const l = await login(app, '9845012345', { platform: 'android' });
    expect(l.refreshToken).toBeTruthy();
    const r = await post('/api/auth/refresh', { refreshToken: l.refreshToken });
    expect(r.statusCode).toBe(200);
    expect(r.json().data.refreshToken).toBeTruthy();
    expect(r.json().data.refreshToken).not.toBe(l.refreshToken);
  });

  it('refresh without a token is 401; trusted device gets the long expiry, otherwise 1 day', async () => {
    expect((await post('/api/auth/refresh', {})).statusCode).toBe(401);
    await login(app, '9845012345', { trustDevice: true });
    await login(app, '9845012345', { trustDevice: false });
    const sessions = await prisma.session.findMany({
      where: { user: { mobile: '9845012345' } },
      orderBy: { createdAt: 'desc' },
      take: 2,
    });
    const days = (s: { expiresAt: Date }) => Math.round((s.expiresAt.getTime() - Date.now()) / 86400_000);
    expect(days(sessions[0]!)).toBeLessThanOrEqual(1);
    expect(days(sessions[1]!)).toBe(30);
  });

  it('logout revokes the session (refresh and access token stop working)', async () => {
    const l = await login(app, '9900045678');
    const out = await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie: l.cookie }, remoteAddress: freshIp() });
    expect(out.statusCode).toBe(200);
    const r = await app.inject({ method: 'POST', url: '/api/auth/refresh', headers: { cookie: l.cookie }, remoteAddress: freshIp() });
    expect(r.statusCode).toBe(401);
    const me = await app.inject({ method: 'GET', url: '/api/me', headers: bearer(l.token) });
    expect(me.statusCode).toBe(401);
    expect(me.json().error.code).toBe('SESSION_REVOKED');
  });

  it('lists sessions and revokes only own sessions', async () => {
    const a = await login(app, '9845012345');
    await login(app, '9900045678');
    const list = await app.inject({ method: 'GET', url: '/api/auth/sessions', headers: bearer(a.token) });
    expect(list.statusCode).toBe(200);
    const rows = list.json().data as { id: string; current: boolean }[];
    expect(rows.some((s) => s.current)).toBe(true);
    const other = rows.find((s) => !s.current)!;
    const del = await app.inject({ method: 'DELETE', url: `/api/auth/sessions/${other.id}`, headers: bearer(a.token) });
    expect(del.statusCode).toBe(200);
    const bSession = await prisma.session.findFirstOrThrow({ where: { user: { mobile: '9900045678' }, revokedAt: null } });
    const cross = await app.inject({ method: 'DELETE', url: `/api/auth/sessions/${bSession.id}`, headers: bearer(a.token) });
    expect(cross.statusCode).toBe(404);
  });
});

describe('authorization', () => {
  it('401 without token, 401 with garbage token', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/me' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/api/me', headers: bearer('nope') })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/api/auth/sessions' })).statusCode).toBe(401);
  });

  it('403 when the role lacks the permission, 200 for super admin', async () => {
    const head = await login(app, '9845012345');
    const fin = await login(app, '9000000002');
    const sa = await login(app, '9000000001');
    expect((await app.inject({ method: 'GET', url: '/api/_t/needs-settings', headers: bearer(head.token) })).statusCode).toBe(403);
    expect((await app.inject({ method: 'GET', url: '/api/_t/needs-settings', headers: bearer(fin.token) })).statusCode).toBe(403);
    expect((await app.inject({ method: 'GET', url: '/api/_t/needs-settings', headers: bearer(sa.token) })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/_t/needs-settings' })).statusCode).toBe(401);
  });

  it('/api/me exposes roles, perms and zone scope for staff', async () => {
    const c = await login(app, '9000000003');
    const me = (await app.inject({ method: 'GET', url: '/api/me', headers: bearer(c.token) })).json().data;
    expect(me.isStaff).toBe(true);
    expect(me.roles).toContain('content');
    expect(me.perms).toContain('events.post');
    expect(me.perms).not.toContain('payments.verify');
    expect(me.zoneIds).toHaveLength(1);
  });

  it('PATCH /me/language validates and persists; device tokens upsert and delete', async () => {
    const l = await login(app, '9845012345');
    const bad = await app.inject({ method: 'PATCH', url: '/api/me/language', headers: bearer(l.token), payload: { language: 'fr' } });
    expect(bad.statusCode).toBe(400);
    const ok = await app.inject({ method: 'PATCH', url: '/api/me/language', headers: bearer(l.token), payload: { language: 'hi' } });
    expect(ok.statusCode).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { mobile: '9845012345' } })).language).toBe('hi');
    const tok = 'fcm-token-abcdefghijklmnop';
    const add = await app.inject({ method: 'POST', url: '/api/me/device-tokens', headers: bearer(l.token), payload: { token: tok, platform: 'web' } });
    expect(add.statusCode).toBe(200);
    expect(await prisma.deviceToken.count({ where: { token: tok } })).toBe(1);
    const del = await app.inject({ method: 'DELETE', url: '/api/me/device-tokens', headers: bearer(l.token), payload: { token: tok } });
    expect(del.statusCode).toBe(200);
    expect(await prisma.deviceToken.count({ where: { token: tok } })).toBe(0);
    await prisma.user.update({ where: { mobile: '9845012345' }, data: { language: 'en' } });
  });

  it('privacy: own record shows everything, others see defaults only', async () => {
    const own = await login(app, '9845012345');
    const meData = (await app.inject({ method: 'GET', url: '/api/me', headers: bearer(own.token) })).json().data;
    expect(meData.person.hidden).toEqual([]);
    expect(meData.person.dob).toBeTruthy();
    const { toPublicPerson } = await import('../src/lib/privacy');
    const p = await prisma.person.findFirstOrThrow({
      where: { name: 'Ramesh Rathi' },
      include: { privacy: true, family: { include: { zone: true } } },
    });
    const stranger = toPublicPerson(p, { familyId: 99999, perms: [] });
    expect(stranger.hidden).toEqual(expect.arrayContaining(['email', 'dob', 'address', 'anniversary']));
    expect(stranger.dob).toBeNull();
    expect(stranger.mobile).toBe('9845012345');
    const staff = toPublicPerson(p, { familyId: null, perms: ['members.view_private'] });
    expect(staff.hidden).toEqual([]);
  });
});

describe('public + health', () => {
  it('health, config and stats need no auth', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/health' })).json().data.ok).toBe(true);
    const cfg = (await app.inject({ method: 'GET', url: '/api/public/config' })).json().data;
    expect(cfg.theme).toBe('c');
    expect(cfg.upi.id).toBe('msblr@upi');
    expect(cfg.sabha.name).toContain('Maheshwari');
    const st = (await app.inject({ method: 'GET', url: '/api/public/stats' })).json().data;
    expect(st.activeFamilies).toBeGreaterThan(20);
  });
  it('unknown route returns the standard error shape', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/nope' });
    expect(r.statusCode).toBe(404);
    expect(r.json().error.code).toBe('NOT_FOUND');
  });
});
