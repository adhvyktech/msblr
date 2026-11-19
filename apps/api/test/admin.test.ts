import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { login, bearer } from './helpers';
import { prisma } from '../src/lib/prisma';
import { audit } from '../src/lib/audit';
import { buildApp } from '../src/server';

let app: FastifyInstance;
let sa: string; // super admin
let fin: string; // finance
let content: string; // content (zone 1)
let head: string; // head of family (non-staff)

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
  sa = (await login(app, '9000000001')).token;
  fin = (await login(app, '9000000002')).token;
  content = (await login(app, '9000000003')).token;
  head = (await login(app, '9845012345')).token;
});
afterAll(async () => {
  await app.close();
});

const call = (method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, token?: string, payload?: unknown) =>
  app.inject({ method, url, headers: token ? bearer(token) : {}, payload: payload as object | undefined });

describe('dashboard', () => {
  it('requires auth and dashboard.view', async () => {
    expect((await call('GET', '/api/dashboard')).statusCode).toBe(401);
    expect((await call('GET', '/api/dashboard', head)).statusCode).toBe(403);
  });

  it('super admin sees every block', async () => {
    const r = await call('GET', '/api/dashboard', sa);
    expect(r.statusCode).toBe(200);
    const d = r.json().data;
    expect(d.kpis.activeFamilies.count).toBeGreaterThan(0);
    expect(d.kpis.pendingApprovals.registrations).not.toBeNull();
    expect(d.kpis.paymentsToVerify).toMatchObject({ count: expect.any(Number), amount: expect.any(Number) });
    expect(d.kpis.liveAds).not.toBeNull();
    expect(d.kpis.appUsersThisWeek.percent).toBeGreaterThanOrEqual(0);
    expect(d.loginsByDay).toHaveLength(30);
    expect(d.loginsByDay.reduce((a: number, x: { total: number }) => a + x.total, 0)).toBeGreaterThan(0); // our own logins above
    expect(d.subscriptions).toHaveProperty('active');
    expect(d.contentAlert).toHaveProperty('staleDays');
    expect(d.waiting.length).toBeLessThanOrEqual(10);
  });

  it('finance sees payments but not ads, content alert or registrations', async () => {
    const d = (await call('GET', '/api/dashboard', fin)).json().data;
    expect(d.kpis.paymentsToVerify).not.toBeNull();
    expect(d.kpis.liveAds).toBeNull();
    expect(d.kpis.pendingApprovals.registrations).toBeNull();
    expect(d.kpis.pendingApprovals.ads).toBeNull();
    expect(d.contentAlert).toBeNull();
    expect(d.waiting.every((w: { type: string }) => w.type === 'payments')).toBe(true);
  });

  it('content role sees the content alert but not payments', async () => {
    const d = (await call('GET', '/api/dashboard', content)).json().data;
    expect(d.contentAlert).not.toBeNull();
    expect(d.kpis.paymentsToVerify).toBeNull();
    expect(d.waiting).toHaveLength(0);
  });
});

describe('approvals counts', () => {
  it('is staff-only and permission filtered', async () => {
    expect((await call('GET', '/api/approvals/counts')).statusCode).toBe(401);
    expect((await call('GET', '/api/approvals/counts', head)).statusCode).toBe(403);
    const all = (await call('GET', '/api/approvals/counts', sa)).json().data;
    expect(all).toMatchObject({ registrations: expect.any(Number), logins: expect.any(Number), businesses: expect.any(Number), ads: expect.any(Number), payments: expect.any(Number) });
    const f = (await call('GET', '/api/approvals/counts', fin)).json().data;
    expect(f).toHaveProperty('payments');
    expect(f).not.toHaveProperty('registrations');
    expect(f.total).toBe(f.payments);
  });
});

describe('audit log', () => {
  it('is gated by audit.view', async () => {
    expect((await call('GET', '/api/audit')).statusCode).toBe(401);
    expect((await call('GET', '/api/audit', fin)).statusCode).toBe(403);
    expect((await call('GET', '/api/audit', head)).statusCode).toBe(403);
  });

  it('lists with filters and pagination', async () => {
    await audit(null, { action: 'zztest.update', entity: 'zztest', entityId: 7, summary: 'unique-needle-123', before: { a: 1 }, after: { a: 2 }, actor: { userId: null, name: 'Tester', role: 'admin' } });
    const all = (await call('GET', '/api/audit?pageSize=5', sa)).json();
    expect(all.data.length).toBeLessThanOrEqual(5);
    expect(all.total).toBeGreaterThan(0);
    const byAction = (await call('GET', '/api/audit?action=zztest.', sa)).json();
    expect(byAction.total).toBe(1);
    expect(byAction.data[0].before).toEqual({ a: 1 });
    expect((await call('GET', '/api/audit?q=unique-needle', sa)).json().total).toBe(1);
    expect((await call('GET', '/api/audit?q=NEEDLE-123&entity=zztest&role=adm', sa)).json().total).toBe(1);
    expect((await call('GET', '/api/audit?entity=nothing-here', sa)).json().total).toBe(0);
    const day = new Date().toISOString().slice(0, 10);
    expect((await call('GET', `/api/audit?from=${day}&to=${day}&action=zztest`, sa)).json().total).toBe(1);
    expect((await call('GET', '/api/audit?from=2001-01-01&to=2001-01-02', sa)).json().total).toBe(0);
    expect((await call('GET', '/api/audit?from=nope', sa)).statusCode).toBe(400);
    const actions = (await call('GET', '/api/audit/actions', sa)).json().data as string[];
    expect(actions).toContain('zztest.update');
    expect(actions).toContain('auth.login');
  });

  it('is read-only: no create/update/delete routes', async () => {
    for (const m of ['POST', 'PUT', 'PATCH', 'DELETE'] as const) {
      const r = await call(m, '/api/audit/1', sa, {});
      expect(r.statusCode).toBe(404);
      const r2 = await call(m, '/api/audit', sa, {});
      expect(r2.statusCode).toBe(404);
    }
  });

  it('exports csv, xlsx and pdf', async () => {
    const csv = await call('GET', '/api/audit/export?format=csv&action=zztest', sa);
    expect(csv.statusCode).toBe(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.body).toContain('a: 1 -> 2');
    const x = await call('GET', '/api/audit/export?format=xlsx', sa);
    expect(x.headers['content-type']).toContain('spreadsheetml');
    const pdf = await call('GET', '/api/audit/export?format=pdf', sa);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect(pdf.rawPayload.subarray(0, 4).toString()).toBe('%PDF');
    expect((await call('GET', '/api/audit/export?format=doc', sa)).statusCode).toBe(400);
  });
});

describe('reports', () => {
  it('requires reports.view', async () => {
    expect((await call('GET', '/api/reports/members')).statusCode).toBe(401);
    expect((await call('GET', '/api/reports/members', content)).statusCode).toBe(403);
    expect((await call('GET', '/api/reports/members', head)).statusCode).toBe(403);
  });

  it('returns {columns, rows, totals} for every type', async () => {
    for (const t of ['members', 'subscriptions', 'receipts', 'registrations', 'businesses', 'events', 'ads', 'usage', 'monthly-changes']) {
      const r = await call('GET', `/api/reports/${t}`, fin);
      expect(r.statusCode, t).toBe(200);
      const d = r.json().data;
      expect(Array.isArray(d.columns), t).toBe(true);
      expect(Array.isArray(d.rows), t).toBe(true);
      expect(d.totals, t).toBeTypeOf('object');
    }
    const subs = (await call('GET', '/api/reports/subscriptions', sa)).json().data;
    expect(subs.totals.total).toBe(subs.rows.reduce((a: number, x: { total: number }) => a + x.total, 0));
    const members = (await call('GET', '/api/reports/members', sa)).json().data;
    expect(members.rows.length).toBeGreaterThan(10);
  });

  it('exports xlsx / csv / pdf with proper content types', async () => {
    const x = await call('GET', '/api/reports/receipts?format=xlsx', fin);
    expect(x.statusCode).toBe(200);
    expect(x.headers['content-type']).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(x.headers['content-disposition']).toContain('.xlsx');
    expect(x.rawPayload.subarray(0, 2).toString()).toBe('PK');
    const c = await call('GET', '/api/reports/members?format=csv', sa);
    expect(c.headers['content-type']).toContain('text/csv');
    const p = await call('GET', '/api/reports/members?format=pdf', sa);
    expect(p.headers['content-type']).toBe('application/pdf');
  });

  it('validates month, format and type', async () => {
    expect((await call('GET', '/api/reports/monthly-changes?month=2026-13', sa)).statusCode).toBe(400);
    expect((await call('GET', '/api/reports/members?format=zip', sa)).statusCode).toBe(400);
    expect((await call('GET', '/api/reports/nonsense', sa)).statusCode).toBe(404);
    const m = (await call('GET', `/api/reports/monthly-changes?month=${new Date().toISOString().slice(0, 7)}`, sa)).json().data;
    expect(m.rows.length).toBeGreaterThan(0);
  });
});

describe('roles', () => {
  it('is super-admin only (roles.manage)', async () => {
    expect((await call('GET', '/api/roles/roles')).statusCode).toBe(401);
    expect((await call('GET', '/api/roles/roles', fin)).statusCode).toBe(403);
    expect((await call('GET', '/api/roles/staff', head)).statusCode).toBe(403);
    expect((await call('POST', '/api/roles/assign', fin, { mobile: '9000000002', roleName: 'admin' })).statusCode).toBe(403);
  });

  it('lists roles with permissions and staff', async () => {
    const roles = (await call('GET', '/api/roles/roles', sa)).json();
    const finance = roles.data.find((r: { name: string }) => r.name === 'finance');
    expect(finance.permissions).toContain('payments.verify');
    expect(roles.allPermissions).toContain('roles.manage');
    const staff = (await call('GET', '/api/roles/staff', sa)).json().data;
    const s = staff.find((x: { mobile: string }) => x.mobile === '9000000003');
    expect(s.roles[0]).toMatchObject({ name: 'content', zoneId: expect.any(Number) });
  });

  it('protects roles.manage on super_admin and validates perms', async () => {
    const roles = (await call('GET', '/api/roles/roles', sa)).json().data;
    const superRole = roles.find((r: { name: string }) => r.name === 'super_admin');
    const all = superRole.permissions as string[];
    const bad = await call('PUT', `/api/roles/roles/${superRole.id}/permissions`, sa, { perms: all.filter((p) => p !== 'roles.manage') });
    expect(bad.statusCode).toBe(409);
    expect((await call('PUT', `/api/roles/roles/${superRole.id}/permissions`, sa, { perms: ['made.up'] })).statusCode).toBe(400);
    const head = roles.find((r: { name: string }) => r.name === 'head');
    expect((await call('PUT', `/api/roles/roles/${head.id}/permissions`, sa, { perms: [] })).statusCode).toBe(400);
    const adRole = roles.find((r: { name: string }) => r.name === 'ad_manager');
    const ok = await call('PUT', `/api/roles/roles/${adRole.id}/permissions`, sa, { perms: [...adRole.permissions, 'audit.view'] });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().data.permissions).toContain('audit.view');
    const log = await prisma.auditLog.findFirst({ where: { action: 'role.permissions_update' }, orderBy: { id: 'desc' } });
    expect(log?.before).toMatchObject({ perms: expect.any(Array) });
    // restore
    await call('PUT', `/api/roles/roles/${adRole.id}/permissions`, sa, { perms: adRole.permissions });
  });

  it('assigns by mobile, rejects unknown mobiles and duplicates, then removes', async () => {
    const unknown = await call('POST', '/api/roles/assign', sa, { mobile: '9111111199', roleName: 'admin' });
    expect(unknown.statusCode).toBe(404);
    expect((await call('POST', '/api/roles/assign', sa, { mobile: '9845012345', roleName: 'head' })).statusCode).toBe(400);
    expect((await call('POST', '/api/roles/assign', sa, { roleName: 'admin' })).statusCode).toBe(400);
    const a = await call('POST', '/api/roles/assign', sa, { mobile: '+91 98450 12345', roleName: 'content', zoneId: 2 });
    expect(a.statusCode).toBe(201);
    expect((await call('POST', '/api/roles/assign', sa, { mobile: '9845012345', roleName: 'content', zoneId: 2 })).statusCode).toBe(409);
    const target = await prisma.user.findUniqueOrThrow({ where: { mobile: '9845012345' } });
    const ur = await prisma.userRole.findFirstOrThrow({ where: { userId: target.id, role: { name: 'content' } } });
    expect(ur.zoneId).toBe(2);
    expect((await call('DELETE', `/api/roles/assign/${ur.id}`, sa)).statusCode).toBe(200);
    expect((await call('DELETE', `/api/roles/assign/${ur.id}`, sa)).statusCode).toBe(404);
    expect(await prisma.auditLog.count({ where: { action: { in: ['role.assign', 'role.remove'] } } })).toBeGreaterThanOrEqual(2);
  });

  it('cannot remove the last super admin', async () => {
    const holders = await prisma.userRole.findMany({ where: { role: { name: 'super_admin' } } });
    expect(holders).toHaveLength(1);
    const r = await call('DELETE', `/api/roles/assign/${holders[0]!.id}`, sa);
    expect(r.statusCode).toBe(409);
    expect(r.json().error.code).toBe('LAST_SUPER_ADMIN');
  });

  it('hands over roles in one step and revokes the old holder sessions', async () => {
    const mk = (mobile: string, name: string) => prisma.user.create({ data: { mobile, displayName: name } });
    const outgoing = await mk('9333333301', 'Old Treasurer');
    await mk('9333333302', 'New Treasurer');
    const finRole = await prisma.role.findUniqueOrThrow({ where: { name: 'finance' } });
    await prisma.userRole.create({ data: { userId: outgoing.id, roleId: finRole.id } });
    await prisma.session.create({ data: { userId: outgoing.id, refreshHash: 'h-handover-test', expiresAt: new Date(Date.now() + 86400_000) } });

    const search = (await call('GET', '/api/roles/users/search?q=New%20Treas', sa)).json().data;
    expect(search[0]).toMatchObject({ mobile: '9333333302' });
    expect((await call('GET', '/api/roles/users/search?q=9333333301', sa)).json().data[0].name).toBe('Old Treasurer');
    expect((await call('GET', '/api/roles/users/search?q=x', sa)).json().data).toEqual([]);

    // errors
    expect((await call('POST', '/api/roles/handover', sa, { fromUserId: outgoing.id, toMobile: '9333333301', roleIds: [finRole.id] })).statusCode).toBe(400);
    expect((await call('POST', '/api/roles/handover', sa, { fromUserId: outgoing.id, toMobile: '9222222222', roleIds: [finRole.id] })).statusCode).toBe(404);
    expect((await call('POST', '/api/roles/handover', sa, { fromUserId: outgoing.id, toMobile: '9333333302', roleIds: [] })).statusCode).toBe(400);
    const notHeld = await prisma.role.findUniqueOrThrow({ where: { name: 'ad_manager' } });
    expect((await call('POST', '/api/roles/handover', sa, { fromUserId: outgoing.id, toMobile: '9333333302', roleIds: [notHeld.id] })).statusCode).toBe(400);

    const ok = await call('POST', '/api/roles/handover', sa, { fromUserId: outgoing.id, toMobile: '9333333302', roleIds: [finRole.id] });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().data).toMatchObject({ moved: 1, sessionsRevoked: 1, fromHasNoStaffRoles: true });
    const incoming = await prisma.user.findUniqueOrThrow({ where: { mobile: '9333333302' }, include: { roles: true } });
    expect(incoming.roles.map((r) => r.roleId)).toEqual([finRole.id]);
    expect(await prisma.userRole.count({ where: { userId: outgoing.id } })).toBe(0);
    expect((await prisma.session.findUniqueOrThrow({ where: { refreshHash: 'h-handover-test' } })).revokedAt).not.toBeNull();
    expect(await prisma.auditLog.count({ where: { action: 'role.handover' } })).toBe(1);
  });
});

describe('settings', () => {
  it('GET returns all keys with defaults; allowed for dashboard.view, 403 for non-staff', async () => {
    expect((await call('GET', '/api/settings')).statusCode).toBe(401);
    expect((await call('GET', '/api/settings', head)).statusCode).toBe(403);
    const r = await call('GET', '/api/settings', fin);
    expect(r.statusCode).toBe(200);
    expect(Object.keys(r.json().data).sort()).toEqual(['businessApprovalRequired', 'contentStaleDays', 'publicSite', 'receiptPrefix', 'sabha', 'subscription', 'theme', 'trustedDeviceDays', 'upi', 'wishTemplates']);
  });

  it('PUT needs settings.edit', async () => {
    expect((await call('PUT', '/api/settings/theme', fin, { value: 'a' })).statusCode).toBe(403);
    expect((await call('PUT', '/api/settings/theme', content, { value: 'a' })).statusCode).toBe(403);
    expect((await call('PUT', '/api/settings/theme', head, { value: 'a' })).statusCode).toBe(403);
  });

  it('validates each key', async () => {
    const bad: [string, unknown][] = [
      ['theme', 'z'],
      ['trustedDeviceDays', 0],
      ['trustedDeviceDays', 400],
      ['trustedDeviceDays', 'ten'],
      ['contentStaleDays', -1],
      ['businessApprovalRequired', 'yes'],
      ['receiptPrefix', 'R/1'],
      ['subscription', { amount: -5 }],
      ['upi', { id: 'not a upi', payeeName: 'X', qrFileId: null }],
      ['sabha', { name: '', email: 'bad' }],
      ['wishTemplates', { birthday: { en: 'x', hi: '' }, anniversary: { en: 'x', hi: 'y' } }],
    ];
    for (const [k, v] of bad) expect((await call('PUT', `/api/settings/${k}`, sa, { value: v })).statusCode, `${k} ${JSON.stringify(v)}`).toBe(400);
    expect((await call('PUT', '/api/settings/unknownKey', sa, { value: 1 })).statusCode).toBe(404);
  });

  it('saves values, audits old/new and the theme is served by /api/public/config immediately', async () => {
    expect((await call('GET', '/api/public/config')).json().data.theme).toBe('c');
    expect((await call('PUT', '/api/settings/theme', sa, { value: 'b' })).statusCode).toBe(200);
    expect((await call('GET', '/api/public/config')).json().data.theme).toBe('b');
    expect((await call('PUT', '/api/settings/theme', sa, { value: 'c' })).statusCode).toBe(200);
    expect((await call('PUT', '/api/settings/trustedDeviceDays', sa, { value: 45 })).statusCode).toBe(200);
    expect((await call('GET', '/api/settings', sa)).json().data.trustedDeviceDays).toBe(45);
    const up = await call('PUT', '/api/settings/upi', sa, { value: { id: 'msblr@okbank', payeeName: 'Maheshwari Sabha', qrFileId: null } });
    expect(up.statusCode).toBe(200);
    expect((await call('GET', '/api/public/config')).json().data.upi.id).toBe('msblr@okbank');
    const log = await prisma.auditLog.findFirst({ where: { action: 'setting.update', entityId: 'trustedDeviceDays' } });
    expect(log).toMatchObject({ before: 30, after: 45 });
  });

  it('manages zones', async () => {
    expect((await call('GET', '/api/settings/zones', head)).statusCode).toBe(403);
    const list = (await call('GET', '/api/settings/zones', content)).json().data;
    expect(list.length).toBeGreaterThanOrEqual(5);
    expect((await call('POST', '/api/settings/zones', fin, { name: 'Zone 9' })).statusCode).toBe(403);
    expect((await call('POST', '/api/settings/zones', sa, { name: '' })).statusCode).toBe(400);
    const created = await call('POST', '/api/settings/zones', sa, { name: 'Zone 9 Yelahanka' });
    expect(created.statusCode).toBe(201);
    const id = created.json().data.id;
    expect((await call('POST', '/api/settings/zones', sa, { name: 'Zone 9 Yelahanka' })).statusCode).toBe(409);
    expect((await call('PATCH', `/api/settings/zones/${id}`, sa, { name: 'Zone 9 Hebbal' })).json().data.name).toBe('Zone 9 Hebbal');
    expect((await call('DELETE', `/api/settings/zones/${list[0].id}`, sa)).statusCode).toBe(409); // in use
    expect((await call('DELETE', `/api/settings/zones/${id}`, sa)).statusCode).toBe(200);
    expect((await call('DELETE', `/api/settings/zones/${id}`, sa)).statusCode).toBe(404);
  });
});
