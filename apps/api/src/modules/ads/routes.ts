import crypto from 'node:crypto';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Ad, AdPlacement, AdPlan, AdRequest, Advertiser, Payment, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { authenticate, optionalAuth, requirePerm, hasPerm } from '../../lib/auth';
import { parse } from '../../lib/parse';
import { paginate } from '../../lib/pagination';
import { httpError } from '../../lib/errors';
import { audit } from '../../lib/audit';
import { fileUrl } from '../../lib/files';
import {
  PERIOD_MONTHS, addMonths, adManagerUserIds, assertCreative, inspectCreative, isPaid, istDay, markPaidOverride, normalizeClick, notifyAdvertiser,
  pickAd, registerAdFileRules, syncBanner, toServed,
} from './service';
import { notify } from '../../lib/push';

const PERIODS = ['MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'YEARLY'] as const;
const CLICKS = ['CALL', 'WHATSAPP', 'WEB', 'NONE'] as const;
const STATUSES = ['REQUESTED', 'CONTENT_SUBMITTED', 'RETURNED', 'APPROVED', 'LIVE', 'PAUSED', 'EXPIRED', 'REJECTED'] as const;

/** Date-only strings ("2026-12-01") mean start/end of that day in IST; full ISO strings are taken as-is. */
const dateIn = (end: boolean) =>
  z.string().refine((s) => !Number.isNaN(new Date(s).getTime()), 'Enter a valid date').transform((s) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T${end ? '23:59:59' : '00:00:00'}+05:30`) : new Date(s)));

// ---------- impression rate limit (per viewer, per ad, per minute) ----------
const lastSeen = new Map<string, number>();
export function resetImpressionLimiter() { lastSeen.clear(); }
function allowImpression(key: string, now = Date.now()): boolean {
  const prev = lastSeen.get(key);
  if (prev !== undefined && now - prev < 60_000) return false;
  if (lastSeen.size > 20_000) for (const [k, t] of lastSeen) if (now - t >= 60_000) lastSeen.delete(k);
  lastSeen.set(key, now);
  return true;
}
async function viewerKey(req: FastifyRequest): Promise<string> {
  const u = await optionalAuth(req);
  if (u) return `u${u.id}`;
  return 'a' + crypto.createHash('sha256').update(`${req.ip}|${req.headers['user-agent'] ?? ''}`).digest('hex').slice(0, 24);
}

// ---------- shaping ----------
type ReqFull = AdRequest & { advertiser: Advertiser; placement: AdPlacement; plan: AdPlan | null; ads: Ad[]; payments: Payment[] };
const include = { advertiser: true, placement: true, plan: true, ads: { orderBy: { id: 'asc' } }, payments: { orderBy: { id: 'desc' } } } satisfies Prisma.AdRequestInclude;

async function statTotals(adIds: number[]) {
  const m = new Map<number, { impressions: number; uniqueViewers: number; clicks: number }>();
  if (!adIds.length) return m;
  const g = await prisma.adStatDaily.groupBy({
    by: ['adId'], where: { adId: { in: adIds } },
    _sum: { impressions: true, uniqueViewers: true, clicksCall: true, clicksWhatsapp: true, clicksWeb: true },
  });
  for (const x of g) {
    m.set(x.adId, {
      impressions: x._sum.impressions ?? 0, uniqueViewers: x._sum.uniqueViewers ?? 0,
      clicks: (x._sum.clicksCall ?? 0) + (x._sum.clicksWhatsapp ?? 0) + (x._sum.clicksWeb ?? 0),
    });
  }
  return m;
}

function shape(r: ReqFull, stats: Map<number, { impressions: number; uniqueViewers: number; clicks: number }>, mimes: Map<number, string>, withAdvertiser = false) {
  const ad = r.ads[0] ?? null;
  const pay = r.payments.find((p) => p.status === 'APPROVED') ?? r.payments[0] ?? null;
  const sum = ad ? stats.get(ad.id) ?? { impressions: 0, uniqueViewers: 0, clicks: 0 } : { impressions: 0, uniqueViewers: 0, clicks: 0 };
  return {
    id: r.id,
    status: r.status,
    notes: r.notes,
    remarks: r.remarks,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    ...(withAdvertiser ? { advertiser: { id: r.advertiser.id, name: r.advertiser.name, contactPerson: r.advertiser.contactPerson, mobile: r.advertiser.mobile, email: r.advertiser.email } } : {}),
    placement: placementShape(r.placement),
    plan: r.plan ? { id: r.plan.id, period: r.plan.period, price: Number(r.plan.price) } : null,
    ad: ad
      ? {
          id: ad.id, title: ad.title, textLine: ad.textLine, clickType: ad.clickType, clickValue: ad.clickValue,
          creativeFileId: ad.creativeFileId, creativeUrl: ad.creativeFileId ? fileUrl(ad.creativeFileId) : null,
          mime: ad.creativeFileId ? mimes.get(ad.creativeFileId) ?? null : null,
          startsAt: ad.startsAt, endsAt: ad.endsAt, priority: ad.priority, shuffle: ad.shuffle, paused: ad.paused,
        }
      : null,
    payment: pay ? { id: pay.id, status: pay.status, amount: Number(pay.amount), utr: pay.utr, paidOn: pay.paidOn, remarks: pay.remarks } : null,
    paymentStatus: pay ? pay.status : 'NONE',
    payments: r.payments.map((p) => ({ id: p.id, status: p.status, amount: Number(p.amount), utr: p.utr, paidOn: p.paidOn, screenshotFileId: p.screenshotFileId, screenshotUrl: p.screenshotFileId ? fileUrl(p.screenshotFileId) : null })),
    stats: sum,
  };
}
const placementShape = (p: AdPlacement) => ({
  id: p.id, code: p.code, name: p.name, platform: p.platform, width: p.width, height: p.height, maxKb: p.maxKb, formats: p.formats, videoMaxS: p.videoMaxS, active: p.active,
});

async function shapeMany(rows: ReqFull[], withAdvertiser = false) {
  const adIds = rows.flatMap((r) => r.ads.map((a) => a.id));
  const stats = await statTotals(adIds);
  const fileIds = rows.flatMap((r) => r.ads.map((a) => a.creativeFileId).filter((x): x is number => !!x));
  const files = fileIds.length ? await prisma.file.findMany({ where: { id: { in: fileIds } }, select: { id: true, mime: true } }) : [];
  const mimes = new Map(files.map((f) => [f.id, f.mime]));
  return rows.map((r) => shape(r, stats, mimes, withAdvertiser));
}

/** Re-evaluates APPROVED / LIVE / EXPIRED status from the ad's dates and payment (never touches PAUSED). */
async function settleStatus(requestId: number, now = new Date()) {
  const r = await prisma.adRequest.findUnique({ where: { id: requestId }, include: { ads: true } });
  const ad = r?.ads[0];
  if (!r || !ad?.startsAt || !ad.endsAt || ad.paused) return;
  if (!['APPROVED', 'LIVE', 'EXPIRED'].includes(r.status)) return;
  let status: 'APPROVED' | 'LIVE' | 'EXPIRED' = 'APPROVED';
  if (ad.endsAt < now) status = 'EXPIRED';
  else if (ad.startsAt <= now && (await isPaid(r.id))) status = 'LIVE';
  if (status !== r.status) await prisma.adRequest.update({ where: { id: r.id }, data: { status } });
  await syncBanner(ad.id, now);
}

const periodLabel: Record<string, string> = { MONTHLY: 'Monthly', QUARTERLY: 'Quarterly', HALF_YEARLY: 'Half-yearly', YEARLY: 'Yearly' };

const routes: FastifyPluginAsync = async (app) => {
  registerAdFileRules();
  const manage = requirePerm('ads.manage');
  const review = requirePerm('ads.manage', 'ads.approve');
  const needAdvertiser = (req: FastifyRequest) => {
    if (!req.user.advertiserId) throw httpError(403, 'NOT_ADVERTISER', 'Please sign up as an advertiser first.');
    return req.user.advertiserId;
  };
  const idParam = (req: FastifyRequest) => parse(z.object({ id: z.coerce.number().int().positive() }), req.params).id;

  // ================= public: serving & tracking =================
  app.get('/serve', async (req) => {
    const { placement } = parse(z.object({ placement: z.string().min(1).max(40) }), req.query);
    const ad = await pickAd(placement, await viewerKey(req));
    return { data: ad ? await toServed(ad) : null };
  });

  app.post('/:id/impression', async (req) => {
    const adId = idParam(req);
    const ad = await prisma.ad.findFirst({ where: { id: adId, request: { status: 'LIVE' }, paused: false } });
    if (!ad) return { data: { counted: false } };
    const key = await viewerKey(req);
    if (!allowImpression(`${adId}:${key}`)) return { data: { counted: false } };
    const date = istDay();
    const [ins] = await prisma.$transaction([
      prisma.adView.createMany({ data: [{ adId, date, viewerKey: key }], skipDuplicates: true }),
    ]);
    const first = ins.count > 0;
    await prisma.adStatDaily.upsert({
      where: { adId_date: { adId, date } },
      create: { adId, date, impressions: 1, uniqueViewers: first ? 1 : 0 },
      update: { impressions: { increment: 1 }, ...(first ? { uniqueViewers: { increment: 1 } } : {}) },
    });
    return { data: { counted: true, unique: first } };
  });

  app.post('/:id/click', async (req) => {
    const adId = idParam(req);
    const { type } = parse(z.object({ type: z.enum(CLICKS) }), req.body ?? {});
    if (type === 'NONE') return { data: { counted: false } };
    const ad = await prisma.ad.findFirst({ where: { id: adId, request: { status: 'LIVE' } }, select: { id: true } });
    if (!ad) return { data: { counted: false } };
    const date = istDay();
    const col = type === 'CALL' ? 'clicksCall' : type === 'WHATSAPP' ? 'clicksWhatsapp' : 'clicksWeb';
    await prisma.adStatDaily.upsert({
      where: { adId_date: { adId, date } },
      create: { adId, date, [col]: 1 },
      update: { [col]: { increment: 1 } },
    });
    return { data: { counted: true } };
  });

  // ================= placements (public: advertising landing page) =================
  app.get('/placements', async (req) => {
    const u = await optionalAuth(req);
    const all = hasPerm(u, 'ads.manage') && (req.query as { all?: string }).all === '1';
    const rows = await prisma.adPlacement.findMany({
      where: all ? {} : { active: true },
      include: { plans: { where: all ? {} : { active: true } } },
      orderBy: { id: 'asc' },
    });
    const order = Object.keys(periodLabel);
    return {
      data: rows.map((p) => ({
        ...placementShape(p),
        plans: p.plans
          .sort((a, b) => order.indexOf(a.period) - order.indexOf(b.period))
          .map((x) => ({ id: x.id, period: x.period, price: Number(x.price), active: x.active, months: PERIOD_MONTHS[x.period] })),
      })),
    };
  });

  // ================= advertiser =================
  app.post('/requests', { preHandler: authenticate }, async (req) => {
    const advertiserId = needAdvertiser(req);
    const b = parse(z.object({ placementId: z.number().int().positive(), planId: z.number().int().positive(), notes: z.string().trim().max(1000).optional() }), req.body);
    const placement = await prisma.adPlacement.findUnique({ where: { id: b.placementId } });
    if (!placement || !placement.active) throw httpError(404, 'PLACEMENT_NOT_FOUND', 'This ad placement is not available.');
    const plan = await prisma.adPlan.findUnique({ where: { id: b.planId } });
    if (!plan || plan.placementId !== placement.id || !plan.active) throw httpError(400, 'PLAN_INVALID', 'Please choose one of the plans offered for this placement.');
    const r = await prisma.adRequest.create({ data: { advertiserId, placementId: placement.id, planId: plan.id, notes: b.notes || null }, include });
    await audit(req, { action: 'ad_request.create', entity: 'ad_request', entityId: r.id, summary: `Ad request for ${placement.name} (${plan.period})`, after: { placementId: placement.id, planId: plan.id } });
    const mgrs = await adManagerUserIds();
    if (mgrs.length) {
      await notify(mgrs, { title: 'New advertising request', body: `${r.advertiser.name} requested ${placement.name}.`, titleHi: 'नया विज्ञापन अनुरोध', bodyHi: `${r.advertiser.name} ने ${placement.name} के लिए अनुरोध किया।`, kind: 'ad' });
    }
    return { data: (await shapeMany([r as ReqFull]))[0] };
  });

  app.get('/requests/mine', { preHandler: authenticate }, async (req) => {
    const advertiserId = needAdvertiser(req);
    const pg = paginate(req.query);
    const where = { advertiserId };
    const [rows, total] = await Promise.all([
      prisma.adRequest.findMany({ where, include, orderBy: { id: 'desc' }, skip: pg.skip, take: pg.take }),
      prisma.adRequest.count({ where }),
    ]);
    return pg.result(await shapeMany(rows as ReqFull[]), total);
  });

  async function ownRequest(req: FastifyRequest, id: number, allowStaff = false) {
    const r = await prisma.adRequest.findUnique({ where: { id }, include });
    if (!r) throw httpError(404, 'NOT_FOUND', 'Request not found.');
    const mine = !!req.user.advertiserId && r.advertiserId === req.user.advertiserId;
    if (!mine && !(allowStaff && hasPerm(req.user, 'ads.manage'))) throw httpError(403, 'FORBIDDEN', 'This request belongs to another advertiser.');
    return r as ReqFull;
  }

  app.get('/requests/:id', { preHandler: authenticate }, async (req) => {
    const r = await ownRequest(req, idParam(req), true);
    return { data: (await shapeMany([r]))[0] };
  });

  app.post('/requests/:id/creative', { preHandler: authenticate }, async (req) => {
    const r = await ownRequest(req, idParam(req));
    if (!['REQUESTED', 'RETURNED', 'CONTENT_SUBMITTED'].includes(r.status)) throw httpError(409, 'NOT_EDITABLE', 'This request can no longer be changed. Please contact the Sabha office.');
    const b = parse(z.object({
      creativeFileId: z.number().int().positive().optional(),
      textLine: z.string().trim().max(120).optional(),
      title: z.string().trim().min(1, 'Enter a title for your ad').max(100),
      clickType: z.enum(CLICKS),
      clickValue: z.string().trim().max(500).optional(),
    }), req.body);
    const isText = r.placement.code === 'APP_LOADING';
    const textLine = isText ? b.textLine || null : null;
    if (!b.creativeFileId && !textLine) throw httpError(400, 'CREATIVE_REQUIRED', isText ? 'Upload an image or type the text line for the loading screen.' : 'Please upload your ad image.');
    if (b.creativeFileId) {
      const info = await assertCreative(r.placement, b.creativeFileId, { ownerUserId: req.user.id });
      if (info.file.kind !== 'ad_creative') throw httpError(400, 'FILE_KIND', 'Please upload the ad as an advertisement creative.');
    }
    const clickValue = normalizeClick(b.clickType, b.clickValue);
    const data = { creativeFileId: b.creativeFileId ?? null, textLine, title: b.title, clickType: b.clickType, clickValue };
    const existing = r.ads[0];
    const before = existing ? { title: existing.title, creativeFileId: existing.creativeFileId, clickType: existing.clickType } : null;
    await prisma.$transaction(async (tx) => {
      if (existing) await tx.ad.update({ where: { id: existing.id }, data });
      else await tx.ad.create({ data: { requestId: r.id, ...data } });
      await tx.adRequest.update({ where: { id: r.id }, data: { status: 'CONTENT_SUBMITTED', remarks: null } });
      await audit(req, { action: 'ad_request.submit_creative', entity: 'ad_request', entityId: r.id, summary: `Ad content submitted for ${r.placement.name}`, before, after: data }, tx);
    });
    const mgrs = await adManagerUserIds();
    if (mgrs.length) await notify(mgrs, { title: 'Ad ready for review', body: `${r.advertiser.name}: ${r.placement.name}`, titleHi: 'विज्ञापन समीक्षा के लिए तैयार', bodyHi: `${r.advertiser.name}: ${r.placement.name}`, kind: 'ad' });
    const fresh = await prisma.adRequest.findUniqueOrThrow({ where: { id: r.id }, include });
    return { data: (await shapeMany([fresh as ReqFull]))[0] };
  });

  app.get('/requests/:id/stats', { preHandler: authenticate }, async (req) => {
    const r = await ownRequest(req, idParam(req), true);
    const q = parse(z.object({ from: z.string().optional(), to: z.string().optional() }), req.query);
    const to = q.to ? new Date(q.to) : new Date();
    const from = q.from ? new Date(q.from) : new Date(to.getTime() - 29 * 86400_000);
    if (Number.isNaN(to.getTime()) || Number.isNaN(from.getTime())) throw httpError(400, 'VALIDATION_ERROR', 'Enter valid dates.');
    const ad = r.ads[0];
    const rows = ad
      ? await prisma.adStatDaily.findMany({ where: { adId: ad.id, date: { gte: istDay(from), lte: istDay(to) } }, orderBy: { date: 'asc' } })
      : [];
    const days = rows.map((x) => ({
      date: x.date.toISOString().slice(0, 10), impressions: x.impressions, viewers: x.uniqueViewers,
      clicks: x.clicksCall + x.clicksWhatsapp + x.clicksWeb, clicksCall: x.clicksCall, clicksWhatsapp: x.clicksWhatsapp, clicksWeb: x.clicksWeb,
    }));
    const totals = days.reduce((a, d) => ({ impressions: a.impressions + d.impressions, viewers: a.viewers + d.viewers, clicks: a.clicks + d.clicks }), { impressions: 0, viewers: 0, clicks: 0 });
    return { data: { days, totals } };
  });

  // ================= admin: requests =================
  app.get('/admin/requests', { preHandler: review }, async (req) => {
    const q = parse(z.object({ status: z.enum(STATUSES).optional(), placement: z.string().optional(), placementId: z.coerce.number().int().optional(), q: z.string().trim().optional() }), req.query);
    const pg = paginate(req.query);
    const where: Prisma.AdRequestWhereInput = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.placementId ? { placementId: q.placementId } : q.placement ? { placement: { code: q.placement } } : {}),
      ...(q.q ? { advertiser: { name: { contains: q.q, mode: 'insensitive' } } } : {}),
    };
    const [rows, total, grouped] = await Promise.all([
      prisma.adRequest.findMany({ where, include, orderBy: { updatedAt: 'desc' }, skip: pg.skip, take: pg.take }),
      prisma.adRequest.count({ where }),
      prisma.adRequest.groupBy({ by: ['status'], _count: { _all: true } }),
    ]);
    const counts = Object.fromEntries(grouped.map((g) => [g.status, g._count._all]));
    return { ...pg.result(await shapeMany(rows as ReqFull[], true), total), counts };
  });

  app.get('/admin/requests/:id', { preHandler: review }, async (req) => {
    const r = await prisma.adRequest.findUnique({ where: { id: idParam(req) }, include });
    if (!r) throw httpError(404, 'NOT_FOUND', 'Request not found.');
    const [shaped] = await shapeMany([r as ReqFull], true);
    const ad = r.ads[0];
    const check = ad?.creativeFileId ? await inspectCreative(r.placement, ad.creativeFileId) : null;
    const checks = {
      creative: check ? { width: check.width, height: check.height, sizeKb: check.sizeKb, mime: check.mime, formatOk: check.formatOk, sizeOk: check.sizeOk, dimsOk: check.dimsOk } : null,
      hasText: !!ad?.textLine,
      clickOk: !!ad && (ad.clickType === 'NONE' || !!ad.clickValue),
      paid: await isPaid(r.id),
    };
    return { data: { ...shaped, checks } };
  });

  app.post('/admin/requests/:id/approve', { preHandler: review }, async (req) => {
    const id = idParam(req);
    const b = parse(z.object({
      startsAt: dateIn(false), endsAt: dateIn(true).optional(),
      priority: z.number().int().min(1).max(3).default(1), shuffle: z.boolean().default(true), markPaid: z.boolean().default(false),
    }), req.body);
    const r = await prisma.adRequest.findUnique({ where: { id }, include });
    if (!r) throw httpError(404, 'NOT_FOUND', 'Request not found.');
    if (r.status !== 'CONTENT_SUBMITTED') throw httpError(409, 'BAD_STATE', 'Only requests with submitted content can be approved.');
    const ad = r.ads[0];
    if (!ad || (!ad.creativeFileId && !ad.textLine)) throw httpError(400, 'CREATIVE_REQUIRED', 'The advertiser has not uploaded any content yet.');
    const endsAt = b.endsAt ?? addMonths(b.startsAt, r.plan ? PERIOD_MONTHS[r.plan.period] : 1);
    if (endsAt <= b.startsAt) throw httpError(400, 'DATES_INVALID', 'The end date must be after the start date.');
    const now = new Date();
    if (endsAt < now) throw httpError(400, 'DATES_INVALID', 'The end date is already in the past.');
    if (b.markPaid) await markPaidOverride(r.id);
    const paid = (await isPaid(r.id)) || b.markPaid;
    const status = paid && b.startsAt <= now ? 'LIVE' : 'APPROVED';
    await prisma.$transaction(async (tx) => {
      await tx.ad.update({ where: { id: ad.id }, data: { startsAt: b.startsAt, endsAt, priority: b.priority, shuffle: b.shuffle, paused: false } });
      await tx.adRequest.update({ where: { id }, data: { status, remarks: null } });
      if (ad.creativeFileId) await tx.file.update({ where: { id: ad.creativeFileId }, data: { visibility: 'PUBLIC' } });
      await audit(req, {
        action: 'ad_request.approve', entity: 'ad_request', entityId: id, summary: `Approved ${r.advertiser.name} - ${r.placement.name} (${status})`,
        before: { status: r.status }, after: { status, startsAt: b.startsAt, endsAt, priority: b.priority, shuffle: b.shuffle, markPaid: b.markPaid },
      }, tx);
    });
    await syncBanner(ad.id);
    await notifyAdvertiser(r.advertiserId, status === 'LIVE' ? 'Your ad is approved and live' : 'Your ad is approved', status === 'LIVE' ? 'Your advertisement is now live.' : paid ? 'Your advertisement will go live on the start date.' : 'Your advertisement is approved. It goes live once your payment is verified.',
      status === 'LIVE' ? 'आपका विज्ञापन स्वीकृत और लाइव है' : 'आपका विज्ञापन स्वीकृत हुआ', status === 'LIVE' ? 'आपका विज्ञापन अब लाइव है।' : paid ? 'आपका विज्ञापन शुरू होने की तारीख पर लाइव होगा।' : 'आपका विज्ञापन स्वीकृत है। भुगतान सत्यापित होते ही यह लाइव होगा।', req.user.id);
    const fresh = await prisma.adRequest.findUniqueOrThrow({ where: { id }, include });
    return { data: (await shapeMany([fresh as ReqFull], true))[0] };
  });

  const decide = (kind: 'return' | 'reject') => async (req: FastifyRequest) => {
    const id = idParam(req);
    const { remarks } = parse(z.object({ remarks: z.string().trim().min(3, 'Please write the reason so the advertiser can fix it.').max(1000) }), req.body ?? {});
    const r = await prisma.adRequest.findUnique({ where: { id }, include });
    if (!r) throw httpError(404, 'NOT_FOUND', 'Request not found.');
    if (!['REQUESTED', 'CONTENT_SUBMITTED', 'RETURNED'].includes(r.status)) throw httpError(409, 'BAD_STATE', 'This request has already been approved. Use pause instead.');
    const status = kind === 'return' ? 'RETURNED' : 'REJECTED';
    await prisma.$transaction(async (tx) => {
      await tx.adRequest.update({ where: { id }, data: { status, remarks } });
      await audit(req, { action: `ad_request.${kind}`, entity: 'ad_request', entityId: id, summary: `${kind === 'return' ? 'Returned' : 'Rejected'} ${r.advertiser.name} - ${r.placement.name}`, before: { status: r.status }, after: { status, remarks } }, tx);
    });
    await notifyAdvertiser(r.advertiserId, kind === 'return' ? 'Your ad needs changes' : 'Your ad request was declined', remarks, kind === 'return' ? 'आपके विज्ञापन में बदलाव चाहिए' : 'आपका विज्ञापन अनुरोध अस्वीकृत हुआ', remarks, req.user.id);
    const fresh = await prisma.adRequest.findUniqueOrThrow({ where: { id }, include });
    return { data: (await shapeMany([fresh as ReqFull], true))[0] };
  };
  app.post('/admin/requests/:id/return', { preHandler: review }, decide('return'));
  app.post('/admin/requests/:id/reject', { preHandler: review }, decide('reject'));

  app.post('/admin/requests/:id/renew', { preHandler: manage }, async (req) => {
    const id = idParam(req);
    const b = parse(z.object({ endsAt: dateIn(true) }), req.body);
    const r = await prisma.adRequest.findUnique({ where: { id }, include });
    if (!r) throw httpError(404, 'NOT_FOUND', 'Request not found.');
    const ad = r.ads[0];
    if (!ad || !ad.startsAt || !['LIVE', 'APPROVED', 'EXPIRED', 'PAUSED'].includes(r.status)) throw httpError(409, 'BAD_STATE', 'Only approved ads can be renewed.');
    if (b.endsAt <= (ad.endsAt && ad.endsAt > new Date() ? ad.endsAt : new Date())) throw httpError(400, 'DATES_INVALID', 'The new end date must be after the current end date.');
    await prisma.$transaction(async (tx) => {
      await tx.ad.update({ where: { id: ad.id }, data: { endsAt: b.endsAt } });
      await audit(req, { action: 'ad.renew', entity: 'ad', entityId: ad.id, summary: `Renewed ad #${ad.id} until ${b.endsAt.toISOString().slice(0, 10)}`, before: { endsAt: ad.endsAt }, after: { endsAt: b.endsAt } }, tx);
    });
    await settleStatus(id);
    await notifyAdvertiser(r.advertiserId, 'Your ad has been renewed', `Your advertisement now runs until ${b.endsAt.toISOString().slice(0, 10)}.`, 'आपका विज्ञापन नवीनीकृत हुआ', `आपका विज्ञापन अब ${b.endsAt.toISOString().slice(0, 10)} तक चलेगा।`, req.user.id);
    const fresh = await prisma.adRequest.findUniqueOrThrow({ where: { id }, include });
    return { data: (await shapeMany([fresh as ReqFull], true))[0] };
  });

  // ================= admin: ads =================
  const pauseResume = (pause: boolean) => async (req: FastifyRequest) => {
    const adId = idParam(req);
    const ad = await prisma.ad.findUnique({ where: { id: adId }, include: { request: true } });
    if (!ad) throw httpError(404, 'NOT_FOUND', 'Ad not found.');
    if (pause && !['LIVE', 'APPROVED'].includes(ad.request.status)) throw httpError(409, 'BAD_STATE', 'Only live or approved ads can be paused.');
    if (!pause && ad.request.status !== 'PAUSED' && !ad.paused) throw httpError(409, 'BAD_STATE', 'This ad is not paused.');
    await prisma.$transaction(async (tx) => {
      await tx.ad.update({ where: { id: adId }, data: { paused: pause } });
      if (pause) await tx.adRequest.update({ where: { id: ad.requestId }, data: { status: 'PAUSED' } });
      else await tx.adRequest.update({ where: { id: ad.requestId }, data: { status: 'APPROVED' } });
      await audit(req, { action: pause ? 'ad.pause' : 'ad.resume', entity: 'ad', entityId: adId, summary: `${pause ? 'Paused' : 'Resumed'} ad #${adId}`, before: { paused: ad.paused, status: ad.request.status } }, tx);
    });
    if (!pause) await settleStatus(ad.requestId);
    await syncBanner(adId);
    const fresh = await prisma.adRequest.findUniqueOrThrow({ where: { id: ad.requestId }, include });
    return { data: (await shapeMany([fresh as ReqFull], true))[0] };
  };
  app.post('/admin/ads/:id/pause', { preHandler: manage }, pauseResume(true));
  app.post('/admin/ads/:id/resume', { preHandler: manage }, pauseResume(false));

  app.patch('/admin/ads/:id', { preHandler: manage }, async (req) => {
    const adId = idParam(req);
    const b = parse(z.object({
      startsAt: dateIn(false).optional(), endsAt: dateIn(true).optional(),
      priority: z.number().int().min(1).max(3).optional(), shuffle: z.boolean().optional(),
      title: z.string().trim().min(1).max(100).optional(), textLine: z.string().trim().max(120).nullable().optional(),
      clickType: z.enum(CLICKS).optional(), clickValue: z.string().trim().max(500).nullable().optional(),
      creativeFileId: z.number().int().positive().optional(),
    }), req.body);
    const ad = await prisma.ad.findUnique({ where: { id: adId }, include: { request: { include: { placement: true } } } });
    if (!ad) throw httpError(404, 'NOT_FOUND', 'Ad not found.');
    const startsAt = b.startsAt ?? ad.startsAt;
    const endsAt = b.endsAt ?? ad.endsAt;
    if (startsAt && endsAt && endsAt <= startsAt) throw httpError(400, 'DATES_INVALID', 'The end date must be after the start date.');
    if (b.creativeFileId) {
      await assertCreative(ad.request.placement, b.creativeFileId);
      await prisma.file.update({ where: { id: b.creativeFileId }, data: { visibility: 'PUBLIC' } });
    }
    const clickType = b.clickType ?? ad.clickType;
    const data: Prisma.AdUpdateInput = {};
    if (b.startsAt) data.startsAt = b.startsAt;
    if (b.endsAt) data.endsAt = b.endsAt;
    if (b.priority !== undefined) data.priority = b.priority;
    if (b.shuffle !== undefined) data.shuffle = b.shuffle;
    if (b.title !== undefined) data.title = b.title;
    if (b.textLine !== undefined) data.textLine = b.textLine || null;
    if (b.creativeFileId) data.creativeFileId = b.creativeFileId;
    if (b.clickType !== undefined || b.clickValue !== undefined) {
      data.clickType = clickType;
      data.clickValue = normalizeClick(clickType, b.clickValue !== undefined ? b.clickValue : ad.clickValue);
    }
    await prisma.$transaction(async (tx) => {
      await tx.ad.update({ where: { id: adId }, data });
      await audit(req, {
        action: 'ad.update', entity: 'ad', entityId: adId, summary: `Updated ad #${adId}`,
        before: { startsAt: ad.startsAt, endsAt: ad.endsAt, priority: ad.priority, shuffle: ad.shuffle, creativeFileId: ad.creativeFileId, title: ad.title },
        after: data,
      }, tx);
    });
    await settleStatus(ad.requestId);
    await syncBanner(adId);
    const fresh = await prisma.adRequest.findUniqueOrThrow({ where: { id: ad.requestId }, include });
    return { data: (await shapeMany([fresh as ReqFull], true))[0] };
  });

  // ================= admin: plans & placements =================
  app.put('/admin/plans', { preHandler: manage }, async (req) => {
    const b = parse(z.object({ placementId: z.number().int().positive(), period: z.enum(PERIODS), price: z.number().min(0).max(10_000_000), active: z.boolean().default(true) }), req.body);
    const p = await prisma.adPlacement.findUnique({ where: { id: b.placementId } });
    if (!p) throw httpError(404, 'NOT_FOUND', 'Placement not found.');
    const before = await prisma.adPlan.findUnique({ where: { placementId_period: { placementId: b.placementId, period: b.period } } });
    const plan = await prisma.adPlan.upsert({
      where: { placementId_period: { placementId: b.placementId, period: b.period } },
      create: { placementId: b.placementId, period: b.period, price: b.price, active: b.active },
      update: { price: b.price, active: b.active },
    });
    await audit(req, { action: 'ad_plan.update', entity: 'ad_plan', entityId: plan.id, summary: `${p.name} - ${b.period}: Rs ${b.price}`, before: before ? { price: Number(before.price), active: before.active } : null, after: { price: b.price, active: b.active } });
    return { data: { id: plan.id, placementId: plan.placementId, period: plan.period, price: Number(plan.price), active: plan.active } };
  });

  app.patch('/admin/placements/:id', { preHandler: manage }, async (req) => {
    const id = idParam(req);
    const b = parse(z.object({
      active: z.boolean().optional(), name: z.string().trim().min(2).max(80).optional(),
      width: z.number().int().min(50).max(4000).optional(), height: z.number().int().min(50).max(4000).optional(),
      maxKb: z.number().int().min(20).max(5000).optional(), videoMaxS: z.number().int().min(1).max(120).nullable().optional(),
    }), req.body);
    const before = await prisma.adPlacement.findUnique({ where: { id } });
    if (!before) throw httpError(404, 'NOT_FOUND', 'Placement not found.');
    const p = await prisma.adPlacement.update({ where: { id }, data: b });
    await audit(req, { action: 'ad_placement.update', entity: 'ad_placement', entityId: id, summary: `Updated placement ${p.name}`, before: placementShape(before), after: placementShape(p) });
    return { data: placementShape(p) };
  });

  // ================= admin: analytics =================
  app.get('/admin/analytics', { preHandler: manage }, async (req) => {
    const q = parse(z.object({ from: z.string().optional(), to: z.string().optional() }), req.query);
    const to = q.to ? new Date(q.to) : new Date();
    const from = q.from ? new Date(q.from) : new Date(to.getTime() - 29 * 86400_000);
    if (Number.isNaN(to.getTime()) || Number.isNaN(from.getTime())) throw httpError(400, 'VALIDATION_ERROR', 'Enter valid dates.');
    const g = await prisma.adStatDaily.groupBy({
      by: ['adId'], where: { date: { gte: istDay(from), lte: istDay(to) } },
      _sum: { impressions: true, uniqueViewers: true, clicksCall: true, clicksWhatsapp: true, clicksWeb: true },
    });
    const sums = new Map(g.map((x) => [x.adId, x._sum]));
    const ads = await prisma.ad.findMany({
      where: { startsAt: { not: null } },
      include: { request: { include: { advertiser: true, placement: true } } },
      orderBy: { id: 'asc' },
    });
    const spend = await prisma.payment.groupBy({ by: ['adRequestId'], where: { kind: 'AD', status: 'APPROVED', adRequestId: { not: null } }, _sum: { amount: true } });
    const spendBy = new Map(spend.map((s) => [s.adRequestId!, Number(s._sum.amount ?? 0)]));
    const rows = ads.map((a) => {
      const s = sums.get(a.id);
      const impressions = s?.impressions ?? 0;
      const clicksCall = s?.clicksCall ?? 0, clicksWhatsapp = s?.clicksWhatsapp ?? 0, clicksWeb = s?.clicksWeb ?? 0;
      const clicks = clicksCall + clicksWhatsapp + clicksWeb;
      return {
        adId: a.id, requestId: a.requestId, title: a.title, advertiser: a.request.advertiser.name, placement: a.request.placement.name, placementCode: a.request.placement.code,
        status: a.request.status, startsAt: a.startsAt, endsAt: a.endsAt,
        impressions, viewers: s?.uniqueViewers ?? 0, clicksCall, clicksWhatsapp, clicksWeb, clicks,
        ctr: impressions ? Math.round((clicks / impressions) * 10000) / 100 : 0,
        spend: spendBy.get(a.requestId) ?? 0,
      };
    });
    const totals = rows.reduce((t, r) => ({
      impressions: t.impressions + r.impressions, viewers: t.viewers + r.viewers, clicks: t.clicks + r.clicks, spend: t.spend + r.spend,
    }), { impressions: 0, viewers: 0, clicks: 0, spend: 0 });
    return { data: { rows, totals, from: istDay(from).toISOString().slice(0, 10), to: istDay(to).toISOString().slice(0, 10) } };
  });
};
export default routes;
