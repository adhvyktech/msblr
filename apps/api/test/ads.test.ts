import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import sharp from 'sharp';
import { login, bearer, freshIp, multipart } from './helpers';
import { prisma } from '../src/lib/prisma';
import { buildApp } from '../src/server';
import { resetImpressionLimiter } from '../src/modules/ads/routes';
import { istDay, pruneAdViews, runAdsLifecycle } from '../src/modules/ads/service';
import { runWishes } from '../src/jobs/wishes';
import { processScheduledNotifications } from '../src/modules/notifications/service';

let app: FastifyInstance;
let admin: string; // ad manager
let superAdmin: string;
let advertiser: string; // 9000000005 (Mundra Steel)
let head: string; // Ramesh Rathi
let viewer: string; // activated family member (family_viewer)
let content: string;

const call = (method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, token?: string, payload?: unknown) =>
  app.inject({ method, url, payload: payload as object, headers: token ? bearer(token) : {}, remoteAddress: freshIp() });

async function png(w: number, h: number, fmt: 'png' | 'webp' = 'png') {
  const img = sharp({ create: { width: w, height: h, channels: 3, background: { r: 194, g: 80, b: 30 } } });
  return fmt === 'png' ? img.png().toBuffer() : img.webp().toBuffer();
}
async function upload(token: string, data: Buffer, mime = 'image/png', kind = 'ad_creative'): Promise<number> {
  const m = multipart({ kind, visibility: 'PRIVATE' }, { name: 'file', filename: mime === 'image/png' ? 'ad.png' : 'ad.webp', mime, data });
  const res = await app.inject({ method: 'POST', url: '/api/files', payload: m.payload, headers: { ...m.headers, ...bearer(token) }, remoteAddress: freshIp() });
  expect(res.statusCode).toBe(200);
  return res.json().data.id;
}
const placementId = async (code: string) => (await prisma.adPlacement.findUniqueOrThrow({ where: { code } })).id;
const planId = async (code: string, period = 'MONTHLY') => (await prisma.adPlan.findFirstOrThrow({ where: { placement: { code }, period: period as 'MONTHLY' } })).id;

async function newRequest(code: string): Promise<number> {
  const res = await call('POST', '/api/ads/requests', advertiser, { placementId: await placementId(code), planId: await planId(code), notes: 'test' });
  expect(res.statusCode).toBe(200);
  return res.json().data.id;
}
const submit = (id: number, fileId: number, extra: Record<string, unknown> = {}) =>
  call('POST', `/api/ads/requests/${id}/creative`, advertiser, { creativeFileId: fileId, title: 'Test ad', clickType: 'CALL', clickValue: '9886600022', ...extra });

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
  admin = (await login(app, '9000000004')).token;
  superAdmin = (await login(app, '9000000001')).token;
  content = (await login(app, '9000000003')).token;
  advertiser = (await login(app, '9000000005')).token;
  head = (await login(app, '9845012345')).token;
  viewer = (await login(app, '9900045678')).token;
});
afterAll(async () => {
  await app.close();
});

describe('serving & tracking', () => {
  it('serves only live ads for the placement, in the contract shape', async () => {
    const side = await call('GET', '/api/ads/serve?placement=WEB_SIDE');
    expect(side.statusCode).toBe(200);
    const ad = side.json().data;
    expect(ad).toMatchObject({ clickType: 'CALL' });
    expect(Object.keys(ad).sort()).toEqual(['clickType', 'clickValue', 'creativeUrl', 'id', 'mime', 'textLine', 'title']);
    // APP_CARD only has a CONTENT_SUBMITTED request, APP_LOADING only REQUESTED -> nothing live
    expect((await call('GET', '/api/ads/serve?placement=APP_CARD')).json().data).toBeNull();
    expect((await call('GET', '/api/ads/serve?placement=APP_LOADING')).json().data).toBeNull();
    expect((await call('GET', '/api/ads/serve?placement=NOPE')).json().data).toBeNull();
    // paused ads are not served
    await call('POST', `/api/ads/admin/ads/${ad.id}/pause`, admin);
    expect((await call('GET', '/api/ads/serve?placement=WEB_SIDE')).json().data).toBeNull();
    await call('POST', `/api/ads/admin/ads/${ad.id}/resume`, admin);
    expect((await call('GET', '/api/ads/serve?placement=WEB_SIDE')).json().data?.id).toBe(ad.id);
  });

  it('counts impressions and unique viewers, rate-limits repeats, counts clicks by type', async () => {
    const ad = (await call('GET', '/api/ads/serve?placement=WEB_SIDE')).json().data;
    const date = istDay();
    const read = async () => prisma.adStatDaily.findUnique({ where: { adId_date: { adId: ad.id, date } } });
    const before = (await read())?.impressions ?? 0;
    const beforeU = (await read())?.uniqueViewers ?? 0;
    resetImpressionLimiter();
    expect((await call('POST', `/api/ads/${ad.id}/impression`, head)).json().data.counted).toBe(true);
    expect((await call('POST', `/api/ads/${ad.id}/impression`, head)).json().data.counted).toBe(false); // same viewer within a minute
    expect((await call('POST', `/api/ads/${ad.id}/impression`, viewer)).json().data.counted).toBe(true);
    expect((await call('POST', `/api/ads/${ad.id}/impression`)).json().data.counted).toBe(true); // anonymous viewer (ip+ua hash)
    let row = await read();
    expect(row!.impressions - before).toBe(3);
    expect(row!.uniqueViewers - beforeU).toBe(3);
    resetImpressionLimiter();
    await call('POST', `/api/ads/${ad.id}/impression`, head); // same person again later
    row = await read();
    expect(row!.impressions - before).toBe(4);
    expect(row!.uniqueViewers - beforeU).toBe(3);
    const c0 = row!.clicksWhatsapp;
    expect((await call('POST', `/api/ads/${ad.id}/click`, head, { type: 'WHATSAPP' })).statusCode).toBe(200);
    expect((await read())!.clicksWhatsapp).toBe(c0 + 1);
    expect((await call('POST', `/api/ads/${ad.id}/click`, head, { type: 'BOGUS' })).statusCode).toBe(400);
  });

  it('ignores impressions for ads that are paused', async () => {
    const ad = (await call('GET', '/api/ads/serve?placement=WEB_SIDE')).json().data;
    await prisma.ad.update({ where: { id: ad.id }, data: { paused: true } });
    resetImpressionLimiter();
    expect((await call('POST', `/api/ads/${ad.id}/impression`, head)).json().data.counted).toBe(false);
    await prisma.ad.update({ where: { id: ad.id }, data: { paused: false } });
  });
});

describe('advertiser access', () => {
  it('shows an advertiser their own stats only', async () => {
    const mine = await prisma.adRequest.findFirstOrThrow({ where: { advertiser: { mobile: '9000000005' }, status: 'LIVE' } });
    const other = await prisma.adRequest.findFirstOrThrow({ where: { advertiser: { mobile: '9886600011' }, status: 'LIVE' } });
    const ok = await call('GET', `/api/ads/requests/${mine.id}/stats`, advertiser);
    expect(ok.statusCode).toBe(200);
    expect(ok.json().data.totals.impressions).toBeGreaterThan(0);
    expect((await call('GET', `/api/ads/requests/${other.id}/stats`, advertiser)).statusCode).toBe(403);
    expect((await call('GET', `/api/ads/requests/${other.id}`, advertiser)).statusCode).toBe(403);
    expect((await call('GET', `/api/ads/requests/${mine.id}/stats`)).statusCode).toBe(401);
    const list = await call('GET', '/api/ads/requests/mine', advertiser);
    expect(list.json().data.every((r: { id: number }) => r.id !== other.id)).toBe(true);
    expect(list.json().data[0]).toHaveProperty('stats');
    // a member who is not an advertiser has no portal until they enable it
    expect((await call('GET', '/api/ads/requests/mine', head)).statusCode).toBe(403);
  });

  it('lets a head of family enable advertising, and non-members sign up with OTP', async () => {
    const en = await call('POST', '/api/advertisers/me/enable', head, { name: 'Rathi Textiles' });
    expect(en.statusCode).toBe(200);
    expect((await call('POST', '/api/advertisers/me/enable', head, {})).statusCode).toBe(409);
    expect((await call('POST', '/api/advertisers/me/enable', viewer, {})).statusCode).toBe(403);
    const fresh = (await login(app, '9845012345')).token;
    expect((await call('GET', '/api/advertisers/me', fresh)).json().data.name).toBe('Rathi Textiles');

    const mobile = '9876500123';
    expect((await call('POST', '/api/advertisers/signup/request', undefined, { mobile })).statusCode).toBe(200);
    const body = { name: 'New Sweets', contactPerson: 'Ravi Agarwal', mobile, email: 'ravi@example.com', code: '123456' };
    const s = await app.inject({ method: 'POST', url: '/api/advertisers/signup', payload: body, remoteAddress: freshIp() });
    expect(s.statusCode).toBe(200);
    const tok = s.json().data.accessToken as string;
    expect(s.json().data.user.roles).toContain('advertiser');
    expect((await call('GET', '/api/advertisers/me', tok)).json().data.name).toBe('New Sweets');
    const dup = await app.inject({ method: 'POST', url: '/api/advertisers/signup', payload: body, remoteAddress: freshIp() });
    expect(dup.statusCode).toBe(409);
    expect((await call('POST', '/api/advertisers/signup', undefined, { ...body, mobile: '9876500124', code: '12' })).statusCode).toBe(400);
  });
});

describe('creative, review, approval', () => {
  it('validates creative dimensions and format against the placement', async () => {
    const id = await newRequest('WEB_FOOTER'); // 1200 x 120, jpg/png, 250 KB
    const bad = await submit(id, await upload(advertiser, await png(300, 300)));
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.code).toBe('CREATIVE_DIMENSIONS');
    const webp = await submit(id, await upload(advertiser, await png(1200, 120, 'webp'), 'image/webp'));
    expect(webp.statusCode).toBe(400);
    expect(webp.json().error.code).toBe('CREATIVE_FORMAT');
    expect((await submit(id, await upload(advertiser, await png(1200, 120)), { clickValue: '123' })).statusCode).toBe(400);
    expect((await submit(id, await upload(advertiser, await png(1200, 120)), { title: '' })).statusCode).toBe(400);
    const ok = await submit(id, await upload(advertiser, await png(1200, 120)));
    expect(ok.statusCode).toBe(200);
    expect(ok.json().data.status).toBe('CONTENT_SUBMITTED');
    // someone else's file cannot be used
    const headFile = await upload(head, await png(1200, 120));
    expect((await submit(id, headFile)).statusCode).toBe(403);
  });

  it('requires remarks to return a request, then lets the advertiser resubmit', async () => {
    const id = await newRequest('WEB_FOOTER');
    await submit(id, await upload(advertiser, await png(1200, 120)));
    expect((await call('POST', `/api/ads/admin/requests/${id}/return`, admin, {})).statusCode).toBe(400);
    expect((await call('POST', `/api/ads/admin/requests/${id}/return`, admin, { remarks: '  ' })).statusCode).toBe(400);
    expect((await call('POST', `/api/ads/admin/requests/${id}/return`, advertiser, { remarks: 'Blurry image' })).statusCode).toBe(403);
    expect((await call('POST', `/api/ads/admin/requests/${id}/return`, viewer, { remarks: 'Blurry image' })).statusCode).toBe(403);
    const ret = await call('POST', `/api/ads/admin/requests/${id}/return`, admin, { remarks: 'Image is blurry. Please upload a sharper one.' });
    expect(ret.statusCode).toBe(200);
    expect(ret.json().data.status).toBe('RETURNED');
    const mine = (await call('GET', `/api/ads/requests/${id}`, advertiser)).json().data;
    expect(mine.remarks).toContain('blurry');
    const again = await submit(id, await upload(advertiser, await png(1200, 120)));
    expect(again.json().data.status).toBe('CONTENT_SUBMITTED');
    expect(again.json().data.remarks).toBeNull();
  });

  it('approves, goes live, appears in the carousel as a banner, pauses/resumes, renews and expires', async () => {
    const id = await newRequest('HOME_CAROUSEL');
    expect((await call('POST', `/api/ads/admin/requests/${id}/approve`, admin, { startsAt: '2026-01-01' })).statusCode).toBe(409); // no content yet
    await submit(id, await upload(advertiser, await png(1600, 600)));
    expect((await call('POST', `/api/ads/admin/requests/${id}/approve`, advertiser, { startsAt: '2026-01-01' })).statusCode).toBe(403);
    expect((await call('POST', `/api/ads/admin/requests/${id}/approve`, admin, { startsAt: '2026-01-10', endsAt: '2026-01-01' })).statusCode).toBe(400);

    const start = new Date(Date.now() - 86400_000).toISOString().slice(0, 10);
    const end = new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10);
    const ap = await call('POST', `/api/ads/admin/requests/${id}/approve`, admin, { startsAt: start, endsAt: end, priority: 3, shuffle: false, markPaid: true });
    expect(ap.statusCode).toBe(200);
    expect(ap.json().data.status).toBe('LIVE');
    const adId = ap.json().data.ad.id as number;

    const banner = await prisma.banner.findFirst({ where: { adId } });
    expect(banner).toMatchObject({ kind: 'AD', active: true });
    const served = (await call('GET', '/api/ads/serve?placement=HOME_CAROUSEL')).json().data;
    expect(served.id).toBe(adId); // fixed (non-shuffle) top-priority ad wins
    expect(served.creativeUrl).toMatch(/^\/files\//);
    expect(served.mime).toBe('image/png');
    // creative is public once approved
    const f = await app.inject({ method: 'GET', url: served.creativeUrl });
    expect(f.statusCode).toBe(200);

    await call('POST', `/api/ads/admin/ads/${adId}/pause`, admin);
    expect((await prisma.banner.findFirst({ where: { adId } }))!.active).toBe(false);
    expect((await prisma.adRequest.findUniqueOrThrow({ where: { id } })).status).toBe('PAUSED');
    await call('POST', `/api/ads/admin/ads/${adId}/resume`, admin);
    expect((await prisma.adRequest.findUniqueOrThrow({ where: { id } })).status).toBe('LIVE');
    expect((await prisma.banner.findFirst({ where: { adId } }))!.active).toBe(true);

    const newEnd = new Date(Date.now() + 60 * 86400_000).toISOString().slice(0, 10);
    expect((await call('POST', `/api/ads/admin/requests/${id}/renew`, admin, { endsAt: start })).statusCode).toBe(400);
    expect((await call('POST', `/api/ads/admin/requests/${id}/renew`, admin, { endsAt: newEnd })).statusCode).toBe(200);

    // lifecycle: 61 days later it has ended and the banner is switched off
    const res = await runAdsLifecycle(new Date(Date.now() + 61 * 86400_000));
    expect(res.expired).toBeGreaterThan(0);
    expect((await prisma.adRequest.findUniqueOrThrow({ where: { id } })).status).toBe('EXPIRED');
    expect((await prisma.banner.findFirst({ where: { adId } }))!.active).toBe(false);
  });

  it('keeps an approved-but-unpaid ad off air until payment, and sends a renewal reminder 7 days out', async () => {
    const id = await newRequest('WEB_INLINE');
    await submit(id, await upload(advertiser, await png(1200, 200)));
    const start = new Date(Date.now() - 86400_000).toISOString().slice(0, 10);
    const end = new Date(Date.now() + 5 * 86400_000).toISOString().slice(0, 10);
    const ap = await call('POST', `/api/ads/admin/requests/${id}/approve`, admin, { startsAt: start, endsAt: end });
    expect(ap.json().data.status).toBe('APPROVED');
    expect((await call('GET', '/api/ads/serve?placement=WEB_INLINE')).json().data).toBeNull();
    await runAdsLifecycle();
    expect((await prisma.adRequest.findUniqueOrThrow({ where: { id } })).status).toBe('APPROVED');
    const adv = await prisma.advertiser.findFirstOrThrow({ where: { mobile: '9000000005' } });
    await prisma.payment.create({ data: { kind: 'AD', adRequestId: id, amount: 2000, utr: `UTRADS${Date.now()}`, paidOn: new Date(), status: 'APPROVED' } });
    const r = await runAdsLifecycle();
    expect(r.wentLive).toBeGreaterThanOrEqual(1);
    expect(r.reminded).toBeGreaterThanOrEqual(1);
    expect((await call('GET', '/api/ads/serve?placement=WEB_INLINE')).json().data).not.toBeNull();
    const u = await prisma.user.findFirstOrThrow({ where: { advertiserId: adv.id } });
    expect(await prisma.notificationDelivery.count({ where: { userId: u.id, notification: { title: 'Your ad ends soon' } } })).toBeGreaterThanOrEqual(1);
    // reminder is only sent once
    expect((await runAdsLifecycle()).reminded).toBe(0);
  });

  it('exposes plans, placements and analytics to ad managers only', async () => {
    const pl = await call('GET', '/api/ads/placements');
    expect(pl.statusCode).toBe(200);
    expect(pl.json().data.length).toBeGreaterThanOrEqual(8);
    expect(pl.json().data[0].plans.length).toBe(4);
    const pid = await placementId('WEB_SIDE');
    const put = await call('PUT', '/api/ads/admin/plans', admin, { placementId: pid, period: 'MONTHLY', price: 2600, active: true });
    expect(put.json().data.price).toBe(2600);
    expect((await call('PUT', '/api/ads/admin/plans', advertiser, { placementId: pid, period: 'MONTHLY', price: 1, active: true })).statusCode).toBe(403);
    expect((await call('PUT', '/api/ads/admin/plans', admin, { placementId: pid, period: 'MONTHLY', price: -5, active: true })).statusCode).toBe(400);
    const an = await call('GET', '/api/ads/admin/analytics', admin);
    expect(an.statusCode).toBe(200);
    expect(an.json().data.rows.length).toBeGreaterThan(0);
    expect(an.json().data.totals.impressions).toBeGreaterThan(0);
    expect((await call('GET', '/api/ads/admin/analytics', advertiser)).statusCode).toBe(403);
    const q = await call('GET', '/api/ads/admin/requests?status=CONTENT_SUBMITTED', admin);
    expect(q.statusCode).toBe(200);
    expect(q.json().counts).toBeTruthy();
    expect((await call('GET', '/api/ads/admin/requests', content)).statusCode).toBe(403);
  });

  it('prunes AdView rows older than 90 days only', async () => {
    const ad = await prisma.ad.findFirstOrThrow();
    const old = new Date(Date.now() - 100 * 86400_000);
    await prisma.adView.createMany({ data: [{ adId: ad.id, date: istDay(old), viewerKey: 'old-1' }, { adId: ad.id, date: istDay(), viewerKey: 'new-1' }], skipDuplicates: true });
    const n = await pruneAdViews();
    expect(n).toBeGreaterThanOrEqual(1);
    expect(await prisma.adView.count({ where: { viewerKey: 'old-1' } })).toBe(0);
    expect(await prisma.adView.count({ where: { viewerKey: 'new-1' } })).toBe(1);
  });
});

describe('notifications', () => {
  it('resolves a zone audience, delivers to the inbox, tracks unread and read', async () => {
    const headUser = await prisma.user.findFirstOrThrow({ where: { mobile: '9845012345' }, include: { person: { include: { family: true } } } });
    const zoneId = headUser.person!.family.zoneId!;
    const expected = await prisma.user.count({ where: { status: 'ACTIVE', personId: { not: null }, person: { family: { zoneId } } } });
    const prev = await call('POST', '/api/notifications/preview-count', superAdmin, { audience: 'ZONE', audienceRef: String(zoneId) });
    expect(prev.json().data.count).toBe(expected);
    const other = await prisma.user.count({ where: { status: 'ACTIVE', personId: { not: null }, person: { family: { zoneId: { not: zoneId } } } } });
    expect(other).toBeGreaterThan(0);

    const before = (await call('GET', '/api/notifications/unread-count', head)).json().data.count;
    const sent = await call('POST', '/api/notifications/send', superAdmin, { audience: 'ZONE', audienceRef: String(zoneId), title: 'Zone meet', body: 'Zone gathering on Sunday', titleHi: 'ज़ोन बैठक', bodyHi: 'रविवार को ज़ोन बैठक' });
    expect(sent.statusCode).toBe(200);
    expect(sent.json().data.recipients).toBe(expected);
    const after = (await call('GET', '/api/notifications/unread-count', head)).json().data.count;
    expect(after).toBe(before + 1);
    const inbox = (await call('GET', '/api/notifications', head)).json();
    expect(inbox.data[0]).toMatchObject({ title: 'Zone meet', readAt: null, titleHi: 'ज़ोन बैठक' });
    const nid = inbox.data[0].id;
    expect((await call('POST', `/api/notifications/${nid}/read`, head)).statusCode).toBe(200);
    expect((await call('GET', '/api/notifications/unread-count', head)).json().data.count).toBe(before);
    expect((await call('POST', `/api/notifications/${nid}/read`, advertiser)).statusCode).toBe(404); // not their notification
    await call('POST', '/api/notifications/read-all', head);
    expect((await call('GET', '/api/notifications/unread-count', head)).json().data.count).toBe(0);
    const hist = await call('GET', '/api/notifications/sent', superAdmin);
    expect(hist.json().data[0]).toMatchObject({ title: 'Zone meet', audience: 'ZONE', recipients: expected, status: 'SENT' });
  });

  it('supports single/list audiences, validation, templates, whatsapp list and scheduled sends', async () => {
    const one = await call('POST', '/api/notifications/send', superAdmin, { audience: 'SINGLE', audienceRef: 'MSB-0412', title: 'Hello family', body: 'Hi' });
    expect(one.statusCode).toBe(200);
    expect(one.json().data.recipients).toBeGreaterThanOrEqual(1);
    expect((await call('POST', '/api/notifications/send', superAdmin, { audience: 'SINGLE', audienceRef: 'MSB-9999', title: 'x', body: 'y' })).statusCode).toBe(400);
    expect((await call('POST', '/api/notifications/send', superAdmin, { audience: 'ALL', title: '', body: 'y' })).statusCode).toBe(400);
    expect((await call('POST', '/api/notifications/send', superAdmin, { audience: 'ZONE', title: 'x', body: 'y' })).statusCode).toBe(400);

    const wa = await call('GET', '/api/notifications/whatsapp-list?audience=SINGLE&audienceRef=MSB-0412', superAdmin);
    expect(wa.json().data[0].mobile).toMatch(/^\d{10}$/);

    const t = await call('POST', '/api/notifications/templates', superAdmin, { name: 'AGM reminder', title: 'AGM on Sunday', body: 'Please attend.' });
    expect(t.statusCode).toBe(200);
    expect((await call('POST', '/api/notifications/templates', superAdmin, { name: 'AGM reminder', title: 'a', body: 'b' })).statusCode).toBe(409);
    expect((await call('PUT', `/api/notifications/templates/${t.json().data.id}`, superAdmin, { name: 'AGM reminder', title: 'AGM', body: 'Be there.' })).json().data.title).toBe('AGM');
    expect((await call('GET', '/api/notifications/templates', superAdmin)).json().data.length).toBeGreaterThan(0);
    expect((await call('DELETE', `/api/notifications/templates/${t.json().data.id}`, superAdmin)).statusCode).toBe(200);

    const when = new Date(Date.now() + 3600_000).toISOString();
    const sch = await call('POST', '/api/notifications/send', superAdmin, { audience: 'SINGLE', audienceRef: 'MSB-0412', title: 'Later', body: 'Scheduled', scheduledAt: when });
    expect(sch.json().data.scheduled).toBe(true);
    expect(await processScheduledNotifications(new Date())).toBe(0);
    expect(await processScheduledNotifications(new Date(Date.now() + 2 * 3600_000))).toBeGreaterThanOrEqual(1);
    expect(await processScheduledNotifications(new Date(Date.now() + 2 * 3600_000))).toBe(0);
    expect((await call('GET', '/api/notifications?unread=1', head)).json().data.some((n: { title: string }) => n.title === 'Later')).toBe(true);
  });

  it('blocks family viewers, content editors and anonymous users from sending', async () => {
    const payload = { audience: 'ALL', title: 'Spam', body: 'Spam' };
    expect((await call('POST', '/api/notifications/send', viewer, payload)).statusCode).toBe(403);
    expect((await call('POST', '/api/notifications/send', head, payload)).statusCode).toBe(403);
    expect((await call('POST', '/api/notifications/send', content, payload)).statusCode).toBe(403);
    expect((await call('POST', '/api/notifications/send', undefined, payload)).statusCode).toBe(401);
    expect((await call('GET', '/api/notifications/templates', viewer)).statusCode).toBe(403);
    expect((await call('GET', '/api/notifications/unread-count')).statusCode).toBe(401);
  });
});

describe('wishes job', () => {
  it('sends each birthday wish once per year', async () => {
    const wishes = () => prisma.notification.count({ where: { kind: 'wish' } });
    const logs = () => prisma.wishLog.count();
    const w0 = await wishes();
    const first = await runWishes();
    expect(first.birthdays).toBeGreaterThan(0);
    const w1 = await wishes();
    expect(w1).toBeGreaterThan(w0);
    expect(await logs()).toBeGreaterThanOrEqual(first.birthdays);
    const again = await runWishes();
    expect(again.birthdays + again.anniversaries).toBe(0);
    expect(await wishes()).toBe(w1);
    // a year later the same birthdays are wished again
    const ny = new Date();
    ny.setFullYear(ny.getFullYear() + 1);
    const y2 = await runWishes(ny);
    expect(y2.year).toBe(first.year + 1);
    expect(y2.birthdays).toBeGreaterThan(0);
  });

  it('skips people who opted out', async () => {
    const p = await prisma.person.findFirstOrThrow({ where: { name: { startsWith: 'Kamla' }, deletedAt: null } });
    await prisma.wishLog.deleteMany({ where: { personId: p.id } });
    await prisma.person.update({ where: { id: p.id }, data: { wishesOptOut: true } });
    const before = await prisma.wishLog.count({ where: { personId: p.id } });
    await runWishes();
    expect(await prisma.wishLog.count({ where: { personId: p.id } })).toBe(before);
  });
});
