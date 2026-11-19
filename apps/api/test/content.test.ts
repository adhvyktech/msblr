import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { bearer, freshIp, login, makeApp } from './helpers';
import { prisma } from '../src/lib/prisma';
import { setSetting } from '../src/lib/settings';
import { invalidateHomeCache, istMonthDay } from '../src/modules/home/shared';
import { runContentStaleness } from '../src/jobs/content-staleness';

let app: FastifyInstance;
const tokens: Record<string, string> = {};
let zones: { id: number; name: string }[] = [];
let headBMobile = '';
let headBFamilyId = 0;
let rameshFamilyId = 0;

const call = (method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, who?: string, payload?: unknown) =>
  app.inject({ method, url, headers: who ? bearer(tokens[who]!) : {}, payload: payload as object | undefined, remoteAddress: freshIp() });

beforeAll(async () => {
  app = await makeApp();
  tokens.super = (await login(app, '9000000001')).token;
  tokens.finance = (await login(app, '9000000002')).token;
  tokens.content = (await login(app, '9000000003')).token; // Zone 1 only
  tokens.ramesh = (await login(app, '9845012345')).token; // head, MSB-0412
  tokens.member = (await login(app, '9900045678')).token; // activated family member (not a head)
  zones = await prisma.zone.findMany({ orderBy: { sort: 'asc' } });
  const ramesh = await prisma.person.findFirstOrThrow({ where: { name: 'Ramesh Rathi' } });
  rameshFamilyId = ramesh.familyId;
  const headB = await prisma.person.findFirstOrThrow({
    where: { isHead: true, familyId: { not: rameshFamilyId }, family: { status: 'ACTIVE' }, user: { isNot: null } },
    include: { user: true },
  });
  headBMobile = headB.user!.mobile;
  headBFamilyId = headB.familyId;
  tokens.headB = (await login(app, headBMobile)).token;
});
afterAll(async () => {
  await setSetting('businessApprovalRequired', true);
  await app.close();
});

describe('auth and permissions', () => {
  it('requires login for member content but not for the banner feed', async () => {
    for (const url of ['/api/business', '/api/trusts', '/api/contacts', '/api/events', '/api/highlights', '/api/home']) {
      expect((await call('GET', url)).statusCode).toBe(401);
    }
    expect((await call('GET', '/api/banners/active')).statusCode).toBe(200);
  });

  it('forbids staff-only endpoints for ordinary members and other staff roles', async () => {
    expect((await call('POST', '/api/trusts', 'ramesh', { name: 'Sneaky trust' })).statusCode).toBe(403);
    expect((await call('POST', '/api/contacts', 'ramesh', { section: 'SABHA', name: 'X Y', phone: '112' })).statusCode).toBe(403);
    expect((await call('POST', '/api/banners', 'finance', { kind: 'BANNER', title: 'Nope' })).statusCode).toBe(403);
    expect((await call('GET', '/api/business/admin', 'content')).statusCode).toBe(403);
    expect((await call('POST', '/api/highlights', 'finance', { title: 'Nope nope' })).statusCode).toBe(403);
    expect((await call('POST', '/api/home/announcements', 'ramesh', { title: 'Nope nope' })).statusCode).toBe(403);
  });
});

describe('business: approval flow, ownership, search', () => {
  let bizId = 0;
  let categoryId = 0;
  const body = (extra: Record<string, unknown> = {}) => ({ name: 'Rathi Test Traders', categoryId, area: 'Chickpet', description: 'Wholesale cotton fabrics', phone: '080 2222 3333', whatsapp: '9845012345', ...extra });

  beforeAll(async () => {
    categoryId = (await prisma.businessCategory.findFirstOrThrow({ orderBy: { id: 'asc' } })).id;
  });

  it('goes PENDING when approval is required, is hidden from the directory, then goes live on approval', async () => {
    await setSetting('businessApprovalRequired', true);
    const r = await call('POST', '/api/business', 'ramesh', body());
    expect(r.statusCode).toBe(201);
    bizId = r.json().data.id;
    expect(r.json().data.status).toBe('PENDING');
    expect(r.json().data.owner.name).toBe('Ramesh Rathi');
    expect(r.json().data.owner.membershipNo).toBe('MSB-0412');

    const dir = await call('GET', '/api/business?q=Rathi Test Traders', 'headB');
    expect(dir.json().total).toBe(0);
    expect((await call('GET', `/api/business/${bizId}`, 'headB')).statusCode).toBe(404); // not visible to others while pending

    const queue = await call('GET', '/api/business/admin?status=PENDING', 'super');
    expect(queue.statusCode).toBe(200);
    expect(queue.json().data.map((b: { id: number }) => b.id)).toContain(bizId);

    const ok = await call('POST', `/api/business/admin/${bizId}/approve`, 'super');
    expect(ok.statusCode).toBe(200);
    expect(ok.json().data.status).toBe('APPROVED');

    const found = await call('GET', '/api/business?q=ramesh', 'headB'); // owner name search
    expect(found.json().data.map((b: { id: number }) => b.id)).toContain(bizId);
    expect((await call('GET', `/api/business?categoryId=${categoryId}&area=chickpet`, 'headB')).json().data.length).toBeGreaterThan(0);
    expect((await call('GET', `/api/business/${bizId}`, 'headB')).statusCode).toBe(200);
  });

  it('keeps an APPROVED business APPROVED when the owner edits it', async () => {
    const r = await call('PATCH', `/api/business/${bizId}`, 'ramesh', { description: 'Now with silk too' });
    expect(r.statusCode).toBe(200);
    expect(r.json().data.status).toBe('APPROVED');
    expect(r.json().data.description).toBe('Now with silk too');
  });

  it('lets only the owning family edit or delete (head B cannot touch head A)', async () => {
    expect((await call('PATCH', `/api/business/${bizId}`, 'headB', { name: 'Hijacked' })).statusCode).toBe(404);
    expect((await call('DELETE', `/api/business/${bizId}`, 'headB')).statusCode).toBe(404);
    expect((await call('PATCH', `/api/business/${bizId}`, 'member', { name: 'Hijacked' })).statusCode).toBe(403); // not a head
    expect((await prisma.business.findUniqueOrThrow({ where: { id: bizId } })).name).toBe('Rathi Test Traders');
    const mineB = await call('GET', '/api/business/mine', 'headB');
    expect(mineB.json().data.map((b: { id: number }) => b.id)).not.toContain(bizId);
  });

  it('supports reject with remarks, resubmission, hide, and soft delete', async () => {
    const r = await call('POST', '/api/business', 'ramesh', body({ name: 'Second Shop' }));
    const id = r.json().data.id;
    expect((await call('POST', `/api/business/admin/${id}/reject`, 'super', {})).statusCode).toBe(400); // remarks required
    expect((await call('POST', `/api/business/admin/${id}/reject`, 'super', { remarks: 'Please add a phone number' })).json().data.status).toBe('REJECTED');
    const mine = await call('GET', '/api/business/mine', 'ramesh');
    const row = mine.json().data.find((b: { id: number }) => b.id === id);
    expect(row.status).toBe('REJECTED');
    expect(row.remarks).toBe('Please add a phone number');
    const fixed = await call('PATCH', `/api/business/${id}`, 'ramesh', { phone: '9845012345' });
    expect(fixed.json().data.status).toBe('PENDING'); // back in the queue
    await call('POST', `/api/business/admin/${id}/approve`, 'super');
    expect((await call('POST', `/api/business/admin/${id}/hide`, 'super')).json().data.status).toBe('HIDDEN');
    expect((await call('GET', `/api/business/${id}`, 'headB')).statusCode).toBe(404);
    const del = await call('DELETE', `/api/business/${id}`, 'ramesh');
    expect(del.statusCode).toBe(200);
    expect((await prisma.business.findUniqueOrThrow({ where: { id } })).deletedAt).not.toBeNull();
    expect((await call('GET', '/api/business/mine', 'ramesh')).json().data.map((b: { id: number }) => b.id)).not.toContain(id);
  });

  it('publishes immediately when the approval setting is off', async () => {
    await setSetting('businessApprovalRequired', false);
    const r = await call('POST', '/api/business', 'headB', body({ name: 'Instant Store' }));
    expect(r.statusCode).toBe(201);
    expect(r.json().data.status).toBe('APPROVED');
    expect((await call('GET', '/api/business?q=Instant Store', 'ramesh')).json().total).toBe(1);
    await setSetting('businessApprovalRequired', true);
  });

  it('validates input and file ownership', async () => {
    expect((await call('POST', '/api/business', 'ramesh', { name: 'A' })).statusCode).toBe(400);
    expect((await call('POST', '/api/business', 'ramesh', body({ website: 'not a url' }))).statusCode).toBe(400);
    expect((await call('POST', '/api/business', 'ramesh', body({ categoryId: 999999 }))).statusCode).toBe(400);
    const other = await prisma.user.findFirstOrThrow({ where: { mobile: headBMobile } });
    const priv = await prisma.file.create({ data: { kind: 'business_photo', path: 'x/y.jpg', mime: 'image/jpeg', size: 10, visibility: 'PRIVATE', ownerUserId: other.id } });
    const bad = await call('POST', '/api/business', 'ramesh', body({ logoFileId: priv.id }));
    expect(bad.statusCode).toBe(403); // cannot attach someone else's private file
    const mine = await prisma.file.create({ data: { kind: 'business_photo', path: 'x/z.jpg', mime: 'image/jpeg', size: 10, visibility: 'PRIVATE', ownerUserId: (await prisma.user.findFirstOrThrow({ where: { mobile: '9845012345' } })).id } });
    const good = await call('POST', '/api/business', 'ramesh', body({ name: 'With Logo', logoFileId: mine.id }));
    expect(good.statusCode).toBe(201);
    expect(good.json().data.logoUrl).toBe(`/files/${mine.id}`);
    expect((await prisma.file.findUniqueOrThrow({ where: { id: mine.id } })).visibility).toBe('MEMBERS'); // widened so members can see it
  });

  it('manages categories (staff) and refuses to delete one in use', async () => {
    const c = await call('POST', '/api/business/admin/categories', 'super', { nameEn: 'Test Category', nameHi: 'परीक्षण श्रेणी' });
    expect(c.statusCode).toBe(201);
    expect((await call('POST', '/api/business/admin/categories', 'super', { nameEn: 'Test Category' })).statusCode).toBe(409);
    expect((await call('PATCH', `/api/business/admin/categories/${c.json().data.id}`, 'super', { nameEn: 'Test Category 2' })).json().data.nameEn).toBe('Test Category 2');
    expect((await call('POST', '/api/business/admin/categories', 'ramesh', { nameEn: 'Nope' })).statusCode).toBe(403);
    expect((await call('DELETE', `/api/business/admin/categories/${categoryId}`, 'super')).statusCode).toBe(409);
    expect((await call('DELETE', `/api/business/admin/categories/${c.json().data.id}`, 'super')).statusCode).toBe(200);
    const list = await call('GET', '/api/business/categories', 'ramesh');
    expect(list.json().data.length).toBeGreaterThan(5);
    expect(list.json().data[0]).toHaveProperty('count');
  });
});

describe('trusts and contacts', () => {
  it('lists trusts with attachments and lets staff manage them', async () => {
    const list = await call('GET', '/api/trusts', 'ramesh');
    expect(list.json().data.length).toBeGreaterThanOrEqual(3);
    expect(list.json().data[0].attachments[0]).toHaveProperty('href');

    const t = await call('POST', '/api/trusts', 'super', { name: 'Test Trust', description: 'For tests' });
    expect(t.statusCode).toBe(201);
    const id = t.json().data.id;
    expect((await call('POST', '/api/trusts', 'super', { name: '' })).statusCode).toBe(400);
    const link = await call('POST', `/api/trusts/${id}/attachments`, 'super', { label: 'Apply', url: 'https://example.org/apply' });
    expect(link.json().data.attachments[0].href).toBe('https://example.org/apply');
    expect((await call('POST', `/api/trusts/${id}/attachments`, 'super', { label: 'Bad', url: 'ftp://x' })).statusCode).toBe(400);
    expect((await call('POST', `/api/trusts/${id}/attachments`, 'super', { label: 'Both' })).statusCode).toBe(400);
    const all = (await call('GET', '/api/trusts', 'ramesh')).json().data as { id: number }[];
    const reordered = await call('PUT', '/api/trusts/order', 'super', { ids: [id, ...all.filter((x) => x.id !== id).map((x) => x.id)] });
    expect(reordered.json().data[0].id).toBe(id);
    const attId = link.json().data.attachments[0].id;
    expect((await call('DELETE', `/api/trusts/${id}/attachments/${attId}`, 'super')).json().data.attachments).toHaveLength(0);
    expect((await call('DELETE', `/api/trusts/${id}`, 'super')).statusCode).toBe(200);
  });

  it('groups contacts by section with emergency first, and lets staff edit', async () => {
    const g = await call('GET', '/api/contacts', 'ramesh');
    expect(g.json().data[0].section).toBe('EMERGENCY');
    expect(g.json().data[0].items.map((i: { phone: string }) => i.phone)).toContain('112');
    const c = await call('POST', '/api/contacts', 'super', { section: 'sabha', name: 'Test Person', phone: '98450 12345', details: 'Evenings' });
    expect(c.statusCode).toBe(201);
    expect(c.json().data.section).toBe('SABHA');
    expect((await call('POST', '/api/contacts', 'super', { section: 'SABHA', name: 'Bad', phone: 'abc' })).statusCode).toBe(400);
    expect((await call('PATCH', `/api/contacts/${c.json().data.id}`, 'super', { name: 'Renamed Person' })).json().data.name).toBe('Renamed Person');
    expect((await call('DELETE', `/api/contacts/${c.json().data.id}`, 'super')).statusCode).toBe(200);
  });
});

describe('events and highlights (zone-scoped content role)', () => {
  const ev = (extra: Record<string, unknown> = {}) => ({ title: 'Zone meet', kind: 'SOCIAL', startsAt: new Date(Date.now() + 5 * 86400_000).toISOString(), venue: 'Hall', ...extra });

  it('lets a Zone 1 content manager post only for Zone 1', async () => {
    const z1 = zones[0]!.id;
    const z2 = zones[1]!.id;
    const ok = await call('POST', '/api/events', 'content', ev({ zoneId: z1 }));
    expect(ok.statusCode).toBe(201);
    expect(ok.json().data.canEdit).toBe(true);
    expect((await call('POST', '/api/events', 'content', ev({ zoneId: z2 }))).statusCode).toBe(403);
    expect((await call('POST', '/api/events', 'content', ev())).statusCode).toBe(403); // Sabha-wide is for admins
    const other = await prisma.event.findFirstOrThrow({ where: { zoneId: z2 } });
    expect((await call('PATCH', `/api/events/${other.id}`, 'content', { title: 'Hacked title' })).statusCode).toBe(403);
    expect((await call('DELETE', `/api/events/${other.id}`, 'content')).statusCode).toBe(403);
    expect((await call('PATCH', `/api/events/${ok.json().data.id}`, 'content', { zoneId: z2 })).statusCode).toBe(403); // cannot move it out
    expect((await call('PATCH', `/api/events/${ok.json().data.id}`, 'content', { title: 'Zone 1 meet' })).json().data.title).toBe('Zone 1 meet');
    expect((await call('POST', '/api/events', 'ramesh', ev())).statusCode).toBe(403);
  });

  it('lets super admin post Sabha-wide events and validates dates', async () => {
    const r = await call('POST', '/api/events', 'super', ev({ title: 'Sabha-wide gathering', kind: 'AGM' }));
    expect(r.statusCode).toBe(201);
    expect(r.json().data.zone).toBeNull();
    expect((await call('POST', '/api/events', 'super', ev({ endsAt: new Date(Date.now() - 86400_000).toISOString() }))).statusCode).toBe(400);
    expect((await call('POST', '/api/events', 'super', { title: 'No date' })).statusCode).toBe(400);
    expect((await call('POST', '/api/events', 'super', ev({ registrationUrl: 'javascript:alert(1)' }))).statusCode).toBe(400);
  });

  it('filters upcoming and past events and hides drafts from members', async () => {
    const up = await call('GET', '/api/events?when=upcoming', 'ramesh');
    expect(up.statusCode).toBe(200);
    const now = Date.now();
    for (const e of up.json().data) expect(new Date(e.startsAt).getTime() > now - 86400_000).toBe(true);
    expect(up.json().data.every((e: { status: string }) => e.status === 'PUBLISHED')).toBe(true);
    const past = await call('GET', '/api/events?when=past', 'ramesh');
    expect(past.json().data.length).toBeGreaterThan(0);
    for (const e of past.json().data) expect(new Date(e.startsAt).getTime() < now).toBe(true);
    const byZone = await call('GET', `/api/events?zoneId=${zones[0]!.id}`, 'ramesh');
    expect(byZone.json().data.every((e: { zoneId: number }) => e.zoneId === zones[0]!.id)).toBe(true);
    const draft = await prisma.event.findFirstOrThrow({ where: { status: 'DRAFT' } });
    expect((await call('GET', `/api/events/${draft.id}`, 'ramesh')).statusCode).toBe(404);
    expect((await call('GET', `/api/events/${draft.id}`, 'super')).statusCode).toBe(200);
    expect((await call('GET', '/api/events?admin=1', 'super')).json().data.some((e: { status: string }) => e.status === 'DRAFT')).toBe(true);
  });

  it('posts, lists and edits highlights with the author recorded', async () => {
    const z1Event = await prisma.event.findFirstOrThrow({ where: { zoneId: zones[0]!.id } });
    const r = await call('POST', '/api/highlights', 'content', { title: 'Sneh Milan photos', summary: 'A lovely evening', eventId: z1Event.id });
    expect(r.statusCode).toBe(201);
    expect(r.json().data.authorName).toContain('Zone 1 Content Manager');
    const id = r.json().data.id;
    const content = await prisma.user.findFirstOrThrow({ where: { mobile: '9000000003' } });
    expect((await prisma.highlight.findUniqueOrThrow({ where: { id } })).authorId).toBe(content.id);

    const zone2Event = await prisma.event.findFirstOrThrow({ where: { zoneId: zones[1]!.id } });
    expect((await call('POST', '/api/highlights', 'content', { title: 'Wrong zone', eventId: zone2Event.id })).statusCode).toBe(403);
    expect((await call('POST', '/api/highlights', 'content', { title: 'Too many', mediaFileIds: Array.from({ length: 13 }, (_, i) => i + 1) })).statusCode).toBe(400);
    expect((await call('POST', '/api/highlights', 'content', { title: 'No' })).statusCode).toBe(400);

    const list = await call('GET', '/api/highlights?pageSize=5', 'ramesh');
    expect(list.json().data[0].id).toBe(id); // newest first
    expect(list.json()).toHaveProperty('total');
    expect((await call('GET', `/api/highlights/${id}`, 'ramesh')).json().data.event.id).toBe(z1Event.id);
    expect((await call('GET', `/api/events/${z1Event.id}`, 'ramesh')).json().data.highlights.map((h: { id: number }) => h.id)).toContain(id);
    expect((await call('PATCH', `/api/highlights/${id}`, 'content', { summary: 'Updated' })).json().data.summary).toBe('Updated');
    expect((await call('DELETE', `/api/highlights/${id}`, 'content')).statusCode).toBe(200);
  });
});

describe('banners: schedule window, ads and ordering', () => {
  const ids: number[] = [];
  const mk = async (extra: Record<string, unknown>) => {
    const r = await call('POST', '/api/banners', 'super', { kind: 'BANNER', ...extra });
    expect(r.statusCode).toBe(201);
    ids.push(r.json().data.id);
    return r.json().data.id as number;
  };
  const active = async () => ((await call('GET', '/api/banners/active')).json().data as { id: number; title: string }[]);

  it('shows only banners that are active and inside their date window', async () => {
    const day = 86400_000;
    const inWindow = await mk({ title: 'T-in-window', activeFrom: new Date(Date.now() - day).toISOString(), activeTo: new Date(Date.now() + day).toISOString() });
    const future = await mk({ title: 'T-future', activeFrom: new Date(Date.now() + day).toISOString() });
    const expired = await mk({ title: 'T-expired', activeTo: new Date(Date.now() - 1000).toISOString() });
    const off = await mk({ title: 'T-off', active: false });
    const open = await mk({ title: 'T-open', durationMs: 4000 });
    const got = (await active()).map((b) => b.id);
    expect(got).toContain(inWindow);
    expect(got).toContain(open);
    for (const id of [future, expired, off]) expect(got).not.toContain(id);
    const first = (await call('GET', '/api/banners/active')).json().data[0];
    expect(first).toHaveProperty('durationMs');
    expect(first).toHaveProperty('kind');
    expect((await call('POST', '/api/banners', 'super', { kind: 'BANNER', title: 'Bad window', activeFrom: new Date(Date.now() + day).toISOString(), activeTo: new Date().toISOString() })).statusCode).toBe(400);
    expect((await call('POST', '/api/banners', 'super', { kind: 'AD', title: 'No ad chosen' })).statusCode).toBe(400);
    expect((await call('POST', '/api/banners', 'super', { kind: 'BANNER', durationMs: 100 })).statusCode).toBe(400);
  });

  it('includes an AD slide only while the linked ad is live', async () => {
    const adBanner = await prisma.banner.findFirstOrThrow({ where: { kind: 'AD' } });
    expect((await active()).map((b) => b.id)).toContain(adBanner.id);
    await prisma.ad.update({ where: { id: adBanner.adId! }, data: { paused: true } });
    expect((await active()).map((b) => b.id)).not.toContain(adBanner.id);
    await prisma.ad.update({ where: { id: adBanner.adId! }, data: { paused: false, endsAt: new Date(Date.now() - 1000) } });
    expect((await active()).map((b) => b.id)).not.toContain(adBanner.id);
    await prisma.ad.update({ where: { id: adBanner.adId! }, data: { endsAt: new Date(Date.now() + 86400_000) } });
    expect((await active()).map((b) => b.id)).toContain(adBanner.id);
  });

  it('reorders banners by sort', async () => {
    const all = ((await call('GET', '/api/banners/admin', 'super')).json().data as { id: number }[]).map((b) => b.id);
    const reversed = [...all].reverse();
    const r = await call('PUT', '/api/banners/order', 'super', { ids: reversed });
    expect(r.statusCode).toBe(200);
    const live = (await active()).map((b) => b.id);
    expect(live).toEqual(reversed.filter((id) => live.includes(id)));
    expect((await call('PUT', '/api/banners/order', 'super', { ids: [] })).statusCode).toBe(400);
    expect((await call('GET', '/api/banners/admin', 'ramesh')).statusCode).toBe(403);
    for (const id of ids) expect((await call('DELETE', `/api/banners/${id}`, 'super')).statusCode).toBe(200);
  });
});

describe('home payload', () => {
  it('returns everything the home page needs in one call', async () => {
    invalidateHomeCache();
    const r = await call('GET', '/api/home', 'ramesh');
    expect(r.statusCode).toBe(200);
    const d = r.json().data;
    expect(Object.keys(d).sort()).toEqual(
      ['announcements', 'banners', 'greetingName', 'highlights', 'stats', 'todaysBirthdays', 'trusts', 'upcomingEventCount', 'upcomingEvents'].sort(),
    );
    expect(d.greetingName).toBe('Ramesh');
    expect(d.stats.activeFamilies).toBeGreaterThan(10);
    expect(d.stats.members).toBeGreaterThanOrEqual(d.stats.activeFamilies);
    expect(d.stats.businesses).toBeGreaterThan(5);
    expect(d.highlights.length).toBeLessThanOrEqual(6);
    expect(d.highlights.length).toBeGreaterThan(0);
    expect(d.upcomingEvents.length).toBeLessThanOrEqual(4);
    expect(d.trusts.length).toBeGreaterThanOrEqual(3);
    expect(d.trusts[0]).toHaveProperty('attachmentCount');
    expect(Array.isArray(d.banners)).toBe(true);
  });

  it('lists non-expired announcements with pinned first, and refreshes after a change', async () => {
    const mk = (p: Record<string, unknown>) => call('POST', '/api/home/announcements', 'super', p);
    const expired = await mk({ title: 'Old news item', expiresAt: new Date(Date.now() - 1000).toISOString() });
    const pinned = await mk({ title: 'Pinned notice here', pinned: true });
    const plain = await mk({ title: 'Plain notice here' });
    expect(pinned.statusCode).toBe(201);
    expect((await mk({ title: 'x' })).statusCode).toBe(400);
    const d = (await call('GET', '/api/home', 'ramesh')).json().data;
    const titles = d.announcements.map((a: { title: string }) => a.title);
    expect(titles).not.toContain('Old news item');
    expect(titles).toContain('Plain notice here');
    expect(d.announcements[0].pinned).toBe(true);
    const admin = await call('GET', '/api/home/announcements', 'super');
    expect(admin.json().data.find((a: { id: number }) => a.id === expired.json().data.id).expired).toBe(true);
    for (const a of [expired, pinned, plain]) expect((await call('DELETE', `/api/home/announcements/${a.json().data.id}`, 'super')).statusCode).toBe(200);
  });
});

describe("home: today's birthdays respect privacy", () => {
  const { month, day } = istMonthDay();
  const dob = new Date(Date.UTC(1990, month - 1, day));
  const made: number[] = [];
  const names = async (who: string) => ((await call('GET', '/api/home', who)).json().data.todaysBirthdays as { name: string }[]).map((b) => b.name);

  afterAll(async () => {
    await prisma.person.deleteMany({ where: { id: { in: made } } });
  });

  it('shows hidden-dob birthdays only to the same family, and visible ones to everyone', async () => {
    const stranger = await prisma.person.create({ data: { familyId: headBFamilyId, name: 'Zzhidden Birthday', relation: 'SON', dob } });
    const open = await prisma.person.create({ data: { familyId: headBFamilyId, name: 'Zzvisible Birthday', relation: 'DAUGHTER', dob, privacy: { create: { field: 'dob', visible: true } } } });
    const own = await prisma.person.create({ data: { familyId: rameshFamilyId, name: 'Zzown Birthday', relation: 'SON', dob } });
    made.push(stranger.id, open.id, own.id);

    const asRamesh = await names('ramesh');
    expect(asRamesh).toContain('Zzvisible Birthday');
    expect(asRamesh).toContain('Zzown Birthday'); // own family: always
    expect(asRamesh).not.toContain('Zzhidden Birthday'); // dob hidden by default

    const asHeadB = await names('headB');
    expect(asHeadB).toContain('Zzhidden Birthday'); // their own family
    expect(asHeadB).toContain('Zzvisible Birthday');
    expect(asHeadB).not.toContain('Zzown Birthday');

    // staff without a family never see hidden dates
    const asSuper = await names('super');
    expect(asSuper).toContain('Zzvisible Birthday');
    expect(asSuper).not.toContain('Zzhidden Birthday');

    const entry = (await call('GET', '/api/home', 'ramesh')).json().data.todaysBirthdays.find((b: { name: string }) => b.name === 'Zzvisible Birthday');
    expect(Object.keys(entry).sort()).toEqual(['id', 'name', 'photoUrl']); // name + avatar only
  });

  it('ignores removed people', async () => {
    const gone = await prisma.person.create({ data: { familyId: rameshFamilyId, name: 'Zzgone Birthday', relation: 'SON', dob, deletedAt: new Date() } });
    made.push(gone.id);
    expect(await names('ramesh')).not.toContain('Zzgone Birthday');
  });
});

describe('content staleness job', () => {
  it('reminds highlight posters once a day when nothing was published recently', async () => {
    await setSetting('contentStaleDays', 1);
    await prisma.highlight.updateMany({ data: { publishedAt: new Date(Date.now() - 5 * 86400_000) } });
    const before = await prisma.notification.count({ where: { kind: 'reminder' } });
    const first = await runContentStaleness(new Date());
    expect(first.stale).toBe(true);
    expect(first.notified).toBeGreaterThanOrEqual(2); // super admin + content manager (+ admin)
    expect(await prisma.notification.count({ where: { kind: 'reminder' } })).toBe(before + 1);
    const content = await prisma.user.findFirstOrThrow({ where: { mobile: '9000000003' } });
    expect(await prisma.notificationDelivery.count({ where: { userId: content.id } })).toBeGreaterThan(0);
    const finance = await prisma.user.findFirstOrThrow({ where: { mobile: '9000000002' } });
    expect(await prisma.notificationDelivery.count({ where: { userId: finance.id, notification: { kind: 'reminder' } } })).toBe(0);

    const second = await runContentStaleness(new Date());
    expect(second.notified).toBe(0); // once per day
    expect(await prisma.notification.count({ where: { kind: 'reminder' } })).toBe(before + 1);
  });

  it('stays quiet when a highlight is recent', async () => {
    await prisma.highlight.create({ data: { title: 'Fresh highlight', publishedAt: new Date() } });
    const r = await runContentStaleness(new Date(Date.now() + 3600_000));
    expect(r.stale).toBe(false);
    expect(r.notified).toBe(0);
    await setSetting('contentStaleDays', 10);
  });
});
