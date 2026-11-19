import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import sharp from 'sharp';
import { makeApp, login, bearer, multipart, freshIp } from './helpers';
import { prisma } from '../src/lib/prisma';
import { runSubscriptionStatus } from '../src/jobs/subscriptions';
import { amountInWords } from '../src/modules/receipts/service';

let app: FastifyInstance;
let finance: string, admin: string, viewer: string, advertiser: string;
interface Head { token: string; familyId: number; mobile: string; userId: number }
let h1: Head, h2: Head, h3: Head;

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
let utrSeq = 0;
const utr = () => `TESTUTR${String(Date.now()).slice(-8)}${String(++utrSeq).padStart(3, '0')}`;

const png = () => sharp({ create: { width: 40, height: 40, channels: 3, background: '#B4532A' } }).png().toBuffer();
async function proof(token: string, kind = 'payment_proof'): Promise<number> {
  const m = multipart({ kind, visibility: 'PRIVATE' }, { name: 'file', filename: 'proof.png', mime: 'image/png', data: await png() });
  const r = await app.inject({ method: 'POST', url: '/api/files', payload: m.payload, headers: { ...m.headers, ...bearer(token) }, remoteAddress: freshIp() });
  expect(r.statusCode).toBe(200);
  return r.json().data.id;
}
async function submit(token: string, over: Record<string, unknown> = {}, fileOf?: string) {
  const body = { kind: 'SUBSCRIPTION', amount: 1100, utr: utr(), paidOn: todayStr(), screenshotFileId: await proof(fileOf ?? token), ...over };
  return app.inject({ method: 'POST', url: '/api/payments', headers: bearer(token), payload: body });
}
const approve = (id: number, token = finance) => app.inject({ method: 'POST', url: `/api/payments/${id}/approve`, headers: bearer(token), payload: {} });
const serialNum = (s: string) => Number(s.split('/')[2]);

async function headFor(familyId: number): Promise<Head> {
  const p = await prisma.person.findFirstOrThrow({ where: { familyId, isHead: true }, include: { user: true } });
  const l = await login(app, p.user!.mobile);
  return { token: l.token, familyId, mobile: p.user!.mobile, userId: p.user!.id };
}

beforeAll(async () => {
  app = await makeApp();
  finance = (await login(app, '9000000002')).token;
  admin = (await login(app, '9000000001')).token;
  viewer = (await login(app, '9900045678')).token;
  advertiser = (await login(app, '9000000005')).token;
  // three ACTIVE families that never subscribed (validUntil null), each with a head login
  const fams = await prisma.family.findMany({
    where: { status: 'ACTIVE', subscriptionValidUntil: null, persons: { some: { isHead: true, user: { isNot: null } } } },
    orderBy: { id: 'asc' },
    take: 3,
  });
  expect(fams.length).toBe(3);
  [h1, h2, h3] = await Promise.all(fams.map((f) => headFor(f.id))) as [Head, Head, Head];
});
afterAll(async () => {
  await app.close();
});

describe('amount in words', () => {
  it('uses the Indian numbering system', () => {
    expect(amountInWords(1100)).toBe('Rupees One Thousand One Hundred Only');
    expect(amountInWords(250000)).toBe('Rupees Two Lakh Fifty Thousand Only');
    expect(amountInWords(12345678)).toBe('Rupees One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight Only');
    expect(amountInWords(5100.5)).toBe('Rupees Five Thousand One Hundred and Fifty Paise Only');
  });
});

describe('submitting payments', () => {
  it('requires login (401)', async () => {
    const r = await app.inject({ method: 'POST', url: '/api/payments', payload: {} });
    expect(r.statusCode).toBe(401);
  });

  it('validates utr, amount, date and screenshot (400)', async () => {
    expect((await submit(h1.token, { utr: 'SHORT1' })).statusCode).toBe(400);
    expect((await submit(h1.token, { utr: 'ABC DEF 123 456 789' })).statusCode).toBe(400);
    expect((await submit(h1.token, { amount: 0 })).statusCode).toBe(400);
    expect((await submit(h1.token, { amount: -5 })).statusCode).toBe(400);
    const future = new Date(Date.now() + 3 * 86400_000).toISOString().slice(0, 10);
    const r = await submit(h1.token, { paidOn: future });
    expect(r.statusCode).toBe(400);
    expect(r.json().error.message).toMatch(/future/i);
    const noShot = await app.inject({ method: 'POST', url: '/api/payments', headers: bearer(h1.token), payload: { kind: 'SUBSCRIPTION', amount: 1100, utr: utr(), paidOn: todayStr() } });
    expect(noShot.statusCode).toBe(400);
  });

  it('creates a pending payment and keeps UTR unique (409, friendly message)', async () => {
    const u = utr();
    const ok = await submit(h1.token, { utr: ` ${u.toLowerCase()} ` });
    expect(ok.statusCode, ok.body).toBe(201);
    const d = ok.json().data;
    expect(d.status).toBe('PENDING');
    expect(d.utr).toBe(u);
    expect(d.purpose).toMatch(/^Subscription 20\d\d–\d\d$/);
    const dup = await submit(h2.token, { utr: u });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error.code).toBe('UTR_EXISTS');
    expect(dup.json().error.message).toMatch(/already been submitted/);
    const mine = await app.inject({ method: 'GET', url: '/api/payments/mine', headers: bearer(h1.token) });
    expect(mine.json().data.some((p: { utr: string }) => p.utr === u)).toBe(true);
    await prisma.payment.deleteMany({ where: { utr: u } });
  });

  it('only accepts a screenshot the caller uploaded, of kind payment_proof', async () => {
    const foreign = await proof(h2.token);
    const r = await submit(h1.token, { screenshotFileId: foreign });
    expect(r.statusCode).toBe(403);
    const wrongKind = await proof(h1.token, 'photo');
    const r2 = await submit(h1.token, { screenshotFileId: wrongKind });
    expect(r2.statusCode).toBe(400);
    const r3 = await submit(h1.token, { screenshotFileId: 999999 });
    expect(r3.statusCode).toBe(400);
  });

  it('is limited to heads (family viewer 403) and AD needs an own ad request', async () => {
    expect((await submit(viewer)).statusCode).toBe(403);
    expect((await submit(h1.token, { kind: 'AD', adRequestId: 1 })).statusCode).toBe(403);
    expect((await submit(advertiser, { kind: 'SUBSCRIPTION' })).statusCode).toBe(403);
    const adv = await prisma.user.findUniqueOrThrow({ where: { mobile: '9000000005' } });
    const own = await prisma.adRequest.findFirstOrThrow({ where: { advertiserId: adv.advertiserId! } });
    const other = await prisma.adRequest.findFirstOrThrow({ where: { advertiserId: { not: adv.advertiserId! } } });
    expect((await submit(advertiser, { kind: 'AD', adRequestId: other.id, amount: 5000 })).statusCode).toBe(403);
    expect((await submit(advertiser, { kind: 'AD', amount: 5000 })).statusCode).toBe(400);
    const ok = await submit(advertiser, { kind: 'AD', adRequestId: own.id, amount: 5000 });
    expect(ok.statusCode).toBe(201);
    expect(ok.json().data.ad.requestId).toBe(own.id);
  });
});

describe('staff verification', () => {
  it('finance can list and view payments; heads cannot (403); anonymous gets 401', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/payments' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/api/payments', headers: bearer(h1.token) })).statusCode).toBe(403);
    const r = await app.inject({ method: 'GET', url: '/api/payments?status=PENDING', headers: bearer(finance) });
    expect(r.statusCode).toBe(200);
    const b = r.json();
    expect(b.data.length).toBeGreaterThan(0);
    expect(b.data.every((p: { status: string }) => p.status === 'PENDING')).toBe(true);
    expect(b.counts.PENDING).toBe(b.total);
    const withShot = b.data.find((p: { screenshotUrl: string | null }) => p.screenshotUrl);
    expect(withShot.screenshotUrl).toMatch(/^\/files\/\d+$/);
    const one = await app.inject({ method: 'GET', url: `/api/payments/${b.data[0].id}`, headers: bearer(finance) });
    expect(one.statusCode).toBe(200);
    expect(one.json().data.utrUnique).toBe(true);
    const q = await app.inject({ method: 'GET', url: `/api/payments?q=${b.data[0].utr.slice(0, 10)}`, headers: bearer(finance) });
    expect(q.json().data.length).toBeGreaterThan(0);
  });

  it('head cannot approve or reject (403)', async () => {
    const p = (await submit(h3.token)).json().data;
    expect((await approve(p.id, h3.token)).statusCode).toBe(403);
    const rj = await app.inject({ method: 'POST', url: `/api/payments/${p.id}/reject`, headers: bearer(h3.token), payload: { remarks: 'no' } });
    expect(rj.statusCode).toBe(403);
    await prisma.payment.delete({ where: { id: p.id } });
  });

  it('reject requires remarks, then notifies the payer and shows remarks', async () => {
    const p = (await submit(h3.token)).json().data;
    const bad = await app.inject({ method: 'POST', url: `/api/payments/${p.id}/reject`, headers: bearer(finance), payload: {} });
    expect(bad.statusCode).toBe(400);
    const blank = await app.inject({ method: 'POST', url: `/api/payments/${p.id}/reject`, headers: bearer(finance), payload: { remarks: '   ' } });
    expect(blank.statusCode).toBe(400);
    const ok = await app.inject({ method: 'POST', url: `/api/payments/${p.id}/reject`, headers: bearer(finance), payload: { remarks: 'UTR not found in the bank statement.' } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().data.status).toBe('REJECTED');
    const mine = await app.inject({ method: 'GET', url: '/api/payments/mine', headers: bearer(h3.token) });
    const row = mine.json().data.find((x: { id: number }) => x.id === p.id);
    expect(row.status).toBe('REJECTED');
    expect(row.remarks).toMatch(/not found/);
    const n = await prisma.notificationDelivery.count({ where: { userId: h3.userId, notification: { title: 'Payment not approved' } } });
    expect(n).toBe(1);
    // cannot decide twice
    expect((await approve(p.id)).statusCode).toBe(409);
    const al = await prisma.auditLog.count({ where: { action: 'payment.reject', entityId: String(p.id) } });
    expect(al).toBe(1);
  });

  it('approving two payments in parallel gives distinct, consecutive, gap-free serials and activates subscriptions', async () => {
    const before = await prisma.receiptCounter.findUnique({ where: { fy: '26-27' } });
    const a = (await submit(h1.token)).json().data;
    const b = (await submit(h2.token)).json().data;
    const [ra, rb] = await Promise.all([approve(a.id), approve(b.id)]);
    expect(ra.statusCode).toBe(200);
    expect(rb.statusCode).toBe(200);
    const ids = [ra.json().data.receiptId, rb.json().data.receiptId];
    const receipts = await prisma.receipt.findMany({ where: { id: { in: ids } }, orderBy: { serialNo: 'asc' } });
    const nums = receipts.map((r) => serialNum(r.serialNo));
    expect(nums[1]! - nums[0]!).toBe(1);
    expect(nums[0]).toBe((before?.lastNo ?? 0) + 1);
    expect(receipts[0]!.serialNo).toMatch(/^R\/\d{2}-\d{2}\/\d{4}$/);
    const counter = await prisma.receiptCounter.findUniqueOrThrow({ where: { fy: receipts[0]!.fy } });
    expect(counter.lastNo).toBe(nums[1]);

    for (const h of [h1, h2]) {
      const fam = await prisma.family.findUniqueOrThrow({ where: { id: h.familyId } });
      expect(fam.subscriptionStatus).toBe('ACTIVE');
      expect(fam.subscriptionValidUntil!.getTime()).toBeGreaterThan(Date.now());
      expect(fam.subscriptionValidUntil!.getMonth()).toBe(2); // March
      expect(fam.subscriptionValidUntil!.getDate()).toBe(31);
    }
    // notification with receipt id
    const nn = await prisma.notification.findFirst({ where: { title: 'Payment approved', deliveries: { some: { userId: h1.userId } } } });
    expect(nn?.body).toContain(receipts.find((r) => r.paymentId === a.id)!.serialNo);
    // PDF generated + linked
    expect(receipts.every((r) => r.pdfFileId)).toBe(true);
    // second approval is refused
    expect((await approve(a.id)).statusCode).toBe(409);
  });
});

describe('receipts', () => {
  it('owner family can download the PDF, another family cannot, staff can', async () => {
    const mine = await app.inject({ method: 'GET', url: '/api/receipts/mine', headers: bearer(h1.token) });
    expect(mine.statusCode).toBe(200);
    const rc = mine.json().data.find((r: { legacy: boolean }) => !r.legacy);
    expect(rc).toBeTruthy();
    const pdf = await app.inject({ method: 'GET', url: `/api/receipts/${rc.id}/pdf`, headers: bearer(h1.token) });
    expect(pdf.statusCode).toBe(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect(pdf.rawPayload.subarray(0, 5).toString()).toBe('%PDF-');
    expect((await app.inject({ method: 'GET', url: `/api/receipts/${rc.id}/pdf`, headers: bearer(h2.token) })).statusCode).toBe(403);
    expect((await app.inject({ method: 'GET', url: `/api/receipts/${rc.id}/pdf`, headers: bearer(finance) })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: `/api/receipts/${rc.id}/pdf` })).statusCode).toBe(401);
    // raw file link follows the same rule
    const row = await prisma.receipt.findUniqueOrThrow({ where: { id: rc.id } });
    expect((await app.inject({ method: 'GET', url: `/files/${row.pdfFileId}`, headers: bearer(h1.token) })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: `/files/${row.pdfFileId}`, headers: bearer(h2.token) })).statusCode).toBe(403);
    expect((await app.inject({ method: 'GET', url: `/api/receipts/${rc.id}`, headers: bearer(h2.token) })).statusCode).toBe(403);
  });

  it('regenerates a missing PDF', async () => {
    const mine = (await app.inject({ method: 'GET', url: '/api/receipts/mine', headers: bearer(h2.token) })).json().data.find((r: { legacy: boolean }) => !r.legacy);
    await prisma.receipt.update({ where: { id: mine.id }, data: { pdfFileId: null } });
    const pdf = await app.inject({ method: 'GET', url: `/api/receipts/${mine.id}/pdf`, headers: bearer(h2.token) });
    expect(pdf.statusCode).toBe(200);
    expect((await prisma.receipt.findUniqueOrThrow({ where: { id: mine.id } })).pdfFileId).not.toBeNull();
  });

  it('register is staff only, filters, and exports xlsx / csv', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/receipts', headers: bearer(h1.token) })).statusCode).toBe(403);
    const all = await app.inject({ method: 'GET', url: '/api/receipts?pageSize=5', headers: bearer(finance) });
    expect(all.statusCode).toBe(200);
    expect(all.json().total).toBeGreaterThan(10);
    const legacy = await app.inject({ method: 'GET', url: '/api/receipts?legacy=true', headers: bearer(finance) });
    expect(legacy.json().data.every((r: { legacy: boolean }) => r.legacy)).toBe(true);
    const fy = await app.inject({ method: 'GET', url: '/api/receipts?fy=25-26&min=900&max=1100', headers: bearer(finance) });
    expect(fy.json().total).toBeGreaterThanOrEqual(3);
    const x = await app.inject({ method: 'GET', url: '/api/receipts/export?format=xlsx&fy=25-26', headers: bearer(finance) });
    expect(x.statusCode).toBe(200);
    expect(x.headers['content-type']).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(x.rawPayload.subarray(0, 2).toString()).toBe('PK');
    const c = await app.inject({ method: 'GET', url: '/api/receipts/export?format=csv&fy=25-26', headers: bearer(finance) });
    expect(c.headers['content-type']).toMatch(/^text\/csv/);
    expect(c.body).toContain('Receipt No');
    expect((await app.inject({ method: 'GET', url: '/api/receipts/export?format=xlsx', headers: bearer(h1.token) })).statusCode).toBe(403);
  });

  it('legacy CSV import skips duplicates, reports per row and numbering continues after the highest serial', async () => {
    const csv = [
      'serialNo,date,memberName,membershipNo,amount,purpose,utr',
      'R/26-27/0050,2026-05-10,Old Member One,MSB-0412,1100,Subscription 2026–27,OLDUTR000000001',
      'R/25-26/0099,12/06/2025,"Old, Member Two",,"1,000",Subscription 2025–26,',
      'R/10-11/0007,2010-08-01,Very Old Member,,500,Donation,',
      'R/26-27/0010,2026-05-10,Duplicate of seeded,,1100,Subscription,',
      ',2026-05-10,No serial,,1100,Subscription,',
      'R/26-27/0051,not-a-date,Bad date,,1100,Subscription,',
    ].join('\r\n');
    expect((await app.inject({ method: 'POST', url: '/api/receipts/import', headers: bearer(h1.token), payload: { csv } })).statusCode).toBe(403);
    const r = await app.inject({ method: 'POST', url: '/api/receipts/import', headers: bearer(finance), payload: { csv } });
    expect(r.statusCode).toBe(200);
    const d = r.json().data;
    expect(d.imported).toBe(3);
    expect(d.skipped).toBe(1);
    expect(d.errors).toBe(2);
    expect(d.results).toHaveLength(6);
    const again = await app.inject({ method: 'POST', url: '/api/receipts/import', headers: bearer(finance), payload: { csv } });
    expect(again.json().data.imported).toBe(0);
    expect(again.json().data.skipped).toBe(4);
    expect((await app.inject({ method: 'POST', url: '/api/receipts/import', headers: bearer(finance), payload: { csv: 'a,b\n1,2' } })).statusCode).toBe(400);

    const imported = await prisma.receipt.findUniqueOrThrow({ where: { serialNo: 'R/26-27/0050' } });
    expect(imported.legacy).toBe(true);
    expect(imported.familyId).not.toBeNull();
    expect((await prisma.receiptCounter.findUniqueOrThrow({ where: { fy: '26-27' } })).lastNo).toBeGreaterThanOrEqual(50);

    const p = (await submit(h3.token)).json().data;
    const ok = await approve(p.id);
    expect(ok.statusCode).toBe(200);
    const rc = await prisma.receipt.findUniqueOrThrow({ where: { id: ok.json().data.receiptId } });
    expect(rc.serialNo).toBe('R/26-27/0051');
    expect(rc.legacy).toBe(false);
  });

  it('approving an AD payment flags the request and the advertiser can download the receipt', async () => {
    const adv = await prisma.user.findUniqueOrThrow({ where: { mobile: '9000000005' } });
    const pay = await prisma.payment.findFirstOrThrow({ where: { kind: 'AD', status: 'PENDING', payerUserId: adv.id } });
    const ok = await approve(pay.id);
    expect(ok.statusCode).toBe(200);
    const ar = await prisma.adRequest.findUniqueOrThrow({ where: { id: pay.adRequestId! } });
    expect(ar.notes).toMatch(/\[PAID R\/26-27\/\d{4}/);
    const pdf = await app.inject({ method: 'GET', url: `/api/receipts/${ok.json().data.receiptId}/pdf`, headers: bearer(advertiser) });
    expect(pdf.statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: `/api/receipts/${ok.json().data.receiptId}/pdf`, headers: bearer(h1.token) })).statusCode).toBe(403);
  });
});

describe('subscriptions', () => {
  it('GET /mine shows status, amount, period and history; /upi has QR and deep link', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/subscriptions/mine', headers: bearer(h1.token) });
    expect(r.statusCode).toBe(200);
    const d = r.json().data;
    expect(d.status).toBe('ACTIVE');
    expect(d.amount).toBe(1100);
    expect(d.periodLabel).toMatch(/^Subscription 20\d\d–\d\d$/);
    expect(d.history.length).toBeGreaterThan(0);
    expect(d.history[0].serialNo).toMatch(/^R\//);
    expect((await app.inject({ method: 'GET', url: '/api/subscriptions/mine' })).statusCode).toBe(401);
    const u = await app.inject({ method: 'GET', url: '/api/subscriptions/upi', headers: bearer(h1.token) });
    expect(u.statusCode).toBe(200);
    const link = u.json().data.deepLink as string;
    expect(link).toMatch(/^upi:\/\/pay\?pa=msblr%40upi&pn=Maheshwari%20Sabha%20Bengaluru&am=1100\.00&cu=INR&tn=MSB-\d{4}$/);
  });

  it('staff summary and manual override with audit (head gets 403)', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/subscriptions/admin/summary', headers: bearer(h1.token) })).statusCode).toBe(403);
    const s = await app.inject({ method: 'GET', url: '/api/subscriptions/admin/summary', headers: bearer(finance) });
    expect(s.statusCode).toBe(200);
    expect(s.json().data.ACTIVE).toBeGreaterThan(0);
    const list = await app.inject({ method: 'GET', url: '/api/subscriptions/admin/families?status=ACTIVE', headers: bearer(finance) });
    expect(list.json().data.every((f: { status: string }) => f.status === 'ACTIVE')).toBe(true);
    const noReason = await app.inject({ method: 'PATCH', url: `/api/subscriptions/admin/${h1.familyId}`, headers: bearer(finance), payload: { status: 'DUE' } });
    expect(noReason.statusCode).toBe(400);
    const ok = await app.inject({ method: 'PATCH', url: `/api/subscriptions/admin/${h1.familyId}`, headers: bearer(admin), payload: { status: 'ACTIVE', validUntil: '2028-03-31', reason: 'Cash paid at office' } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().data.status).toBe('ACTIVE');
    const al = await prisma.auditLog.findFirst({ where: { action: 'subscription.override', entityId: String(h1.familyId) } });
    expect(al?.summary).toMatch(/Cash paid/);
    expect((await app.inject({ method: 'PATCH', url: '/api/subscriptions/admin/999999', headers: bearer(admin), payload: { status: 'DUE', reason: 'test' } })).statusCode).toBe(404);
  });
});

describe('subscription status job', () => {
  it('expires, marks due, and sends each reminder once', async () => {
    const day = 86400_000;
    const now = new Date();
    const fams = await prisma.family.findMany({
      where: { status: 'ACTIVE', id: { notIn: [h1.familyId, h2.familyId, h3.familyId] }, persons: { some: { isHead: true, user: { isNot: null } } } },
      orderBy: { id: 'desc' },
      take: 3,
    });
    const [past, soon, week] = fams as [typeof fams[0], typeof fams[0], typeof fams[0]];
    await prisma.family.update({ where: { id: past.id }, data: { subscriptionStatus: 'ACTIVE', subscriptionValidUntil: new Date(now.getTime() - 3 * day) } });
    await prisma.family.update({ where: { id: soon.id }, data: { subscriptionStatus: 'ACTIVE', subscriptionValidUntil: new Date(now.getTime() + 20 * day) } });
    await prisma.family.update({ where: { id: week.id }, data: { subscriptionStatus: 'ACTIVE', subscriptionValidUntil: new Date(now.getTime() + 5 * day) } });
    const headUser = async (fid: number) => (await prisma.user.findFirstOrThrow({ where: { person: { familyId: fid, isHead: true } } })).id;
    const remindersFor = async (fid: number) =>
      prisma.notificationDelivery.count({ where: { userId: await headUser(fid), notification: { kind: 'reminder', title: { contains: 'ubscription' } } } });
    const base = { soon: await remindersFor(soon.id), week: await remindersFor(week.id), past: await remindersFor(past.id) };

    const r1 = await runSubscriptionStatus(now);
    expect(r1.expired).toBeGreaterThanOrEqual(1);
    expect(r1.due).toBeGreaterThanOrEqual(2);
    expect((await prisma.family.findUniqueOrThrow({ where: { id: past.id } })).subscriptionStatus).toBe('EXPIRED');
    expect((await prisma.family.findUniqueOrThrow({ where: { id: soon.id } })).subscriptionStatus).toBe('DUE');
    expect((await prisma.family.findUniqueOrThrow({ where: { id: week.id } })).subscriptionStatus).toBe('DUE');
    expect(await remindersFor(soon.id)).toBe(base.soon + 1);
    expect(await remindersFor(week.id)).toBe(base.week + 1);
    expect(await remindersFor(past.id)).toBe(base.past);

    const r2 = await runSubscriptionStatus(now);
    expect(r2.reminders).toBe(0);
    expect(await remindersFor(soon.id)).toBe(base.soon + 1);

    // 14 days later the T-7 window opens for "soon": exactly one more reminder
    const later = new Date(now.getTime() + 14 * day);
    await runSubscriptionStatus(later);
    expect(await remindersFor(soon.id)).toBe(base.soon + 2);
    await runSubscriptionStatus(later);
    expect(await remindersFor(soon.id)).toBe(base.soon + 2);
  });
});
