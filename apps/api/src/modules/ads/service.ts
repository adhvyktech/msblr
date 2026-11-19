import crypto from 'node:crypto';
import sharp from 'sharp';
import type { Ad, AdPeriod, AdPlacement, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { httpError } from '../../lib/errors';
import { absPath, fileUrl, registerFileAccessRule } from '../../lib/files';
import { getSetting, setSetting } from '../../lib/settings';
import { notify } from '../../lib/push';

// ---------- dates ----------
const IST_MS = 5.5 * 3600_000;
/** The IST calendar day of an instant, as a UTC-midnight Date (what a @db.Date column stores). */
export function istDay(d: Date = new Date()): Date {
  const s = new Date(d.getTime() + IST_MS);
  return new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate()));
}
export const PERIOD_MONTHS: Record<AdPeriod, number> = { MONTHLY: 1, QUARTERLY: 3, HALF_YEARLY: 6, YEARLY: 12 };
export function addMonths(d: Date, n: number): Date {
  const r = new Date(d);
  r.setMonth(r.getMonth() + n);
  return r;
}

// ---------- click target ----------
export const normalizePhone = (v: string) => {
  let d = v.replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return d;
};
export function normalizeClick(type: 'CALL' | 'WHATSAPP' | 'WEB' | 'NONE', value?: string | null): string | null {
  if (type === 'NONE') return null;
  const v = (value ?? '').trim();
  if (!v) throw httpError(400, 'CLICK_VALUE_REQUIRED', type === 'WEB' ? 'Enter the website link.' : 'Enter the mobile number.');
  if (type === 'WEB') {
    const url = /^https?:\/\//i.test(v) ? v : `https://${v}`;
    try {
      const u = new URL(url);
      if (!u.hostname.includes('.')) throw new Error('host');
    } catch {
      throw httpError(400, 'CLICK_VALUE_INVALID', 'Enter a valid website link.');
    }
    return url.slice(0, 500);
  }
  const p = normalizePhone(v);
  if (!/^[6-9]\d{9}$/.test(p)) throw httpError(400, 'CLICK_VALUE_INVALID', 'Enter a valid 10-digit mobile number.');
  return p;
}

// ---------- creative validation ----------
export interface CreativeInfo { width: number | null; height: number | null; sizeKb: number; mime: string; formatOk: boolean; sizeOk: boolean; dimsOk: boolean }
const EXT_OF_MIME: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'video/mp4': 'mp4' };

/** Dimension rule: same aspect ratio (within 3%) and at least half the placement width. Images are capped at 2000px on upload. */
export function dimsFit(p: Pick<AdPlacement, 'width' | 'height'>, w: number, h: number): boolean {
  const ratio = w / h;
  const want = p.width / p.height;
  return Math.abs(ratio - want) / want <= 0.03 && w >= p.width * 0.5;
}

export async function inspectCreative(placement: AdPlacement, fileId: number): Promise<CreativeInfo & { file: { id: number; ownerUserId: number | null; kind: string } }> {
  const file = await prisma.file.findUnique({ where: { id: fileId } });
  if (!file) throw httpError(404, 'FILE_NOT_FOUND', 'The uploaded file was not found. Please upload it again.');
  const ext = EXT_OF_MIME[file.mime] ?? '';
  const allowed = placement.formats.split(',').map((s) => s.trim().toLowerCase());
  const formatOk = allowed.includes(ext) || (ext === 'jpg' && allowed.includes('jpeg'));
  const sizeKb = Math.ceil(file.size / 1024);
  const sizeOk = sizeKb <= placement.maxKb;
  let width: number | null = null;
  let height: number | null = null;
  let dimsOk = true;
  if (file.mime.startsWith('image/')) {
    try {
      const meta = await sharp(absPath(file)).metadata();
      width = meta.width ?? null;
      height = meta.height ?? null;
    } catch {
      throw httpError(400, 'INVALID_IMAGE', 'This image could not be read. Please upload a different file.');
    }
    dimsOk = width !== null && height !== null && dimsFit(placement, width, height);
  }
  return { width, height, sizeKb, mime: file.mime, formatOk, sizeOk, dimsOk, file: { id: file.id, ownerUserId: file.ownerUserId, kind: file.kind } };
}

/** Throws a friendly 400 unless the file fits the placement's sizing guide. */
export async function assertCreative(placement: AdPlacement, fileId: number, opts: { ownerUserId?: number } = {}) {
  const c = await inspectCreative(placement, fileId);
  if (opts.ownerUserId !== undefined && c.file.ownerUserId !== opts.ownerUserId) throw httpError(403, 'FORBIDDEN', 'You can only use files you uploaded.');
  if (!c.formatOk) throw httpError(400, 'CREATIVE_FORMAT', `This placement accepts ${placement.formats.toUpperCase().replace(/,/g, ', ')} files only.`);
  if (!c.sizeOk) throw httpError(400, 'CREATIVE_TOO_LARGE', `The file is ${c.sizeKb} KB. Maximum for this placement is ${placement.maxKb} KB.`, { sizeKb: c.sizeKb, maxKb: placement.maxKb });
  if (!c.dimsOk) {
    throw httpError(400, 'CREATIVE_DIMENSIONS', `The image is ${c.width} x ${c.height} px. This placement needs ${placement.width} x ${placement.height} px (same proportions).`, {
      width: c.width, height: c.height, expectedWidth: placement.width, expectedHeight: placement.height,
    });
  }
  return c;
}

// ---------- payment helpers ----------
const OVERRIDE_KEY = 'ads.paidOverride';
export async function markPaidOverride(requestId: number) {
  const list = await getSetting<number[]>(OVERRIDE_KEY, []);
  if (!list.includes(requestId)) await setSetting(OVERRIDE_KEY, [...list, requestId]);
}
export async function isPaid(requestId: number): Promise<boolean> {
  const n = await prisma.payment.count({ where: { adRequestId: requestId, kind: 'AD', status: 'APPROVED' } });
  if (n > 0) return true;
  return (await getSetting<number[]>(OVERRIDE_KEY, [])).includes(requestId);
}

// ---------- ad <-> response shape ----------
export interface ServedAd { id: number; creativeUrl: string | null; mime: string | null; textLine: string | null; title: string | null; clickType: string; clickValue: string | null }

export async function toServed(ad: Ad): Promise<ServedAd> {
  let mime: string | null = null;
  if (ad.creativeFileId) mime = (await prisma.file.findUnique({ where: { id: ad.creativeFileId }, select: { mime: true } }))?.mime ?? null;
  return {
    id: ad.id,
    creativeUrl: ad.creativeFileId ? fileUrl(ad.creativeFileId) : null,
    mime,
    textLine: ad.textLine,
    title: ad.title,
    clickType: ad.clickType,
    clickValue: ad.clickValue,
  };
}

// ---------- serving ----------
export function liveWhere(now: Date, placementCode: string): Prisma.AdWhereInput {
  return {
    paused: false,
    startsAt: { lte: now },
    endsAt: { gte: now },
    request: { status: 'LIVE', placement: { code: placementCode, active: true } },
  };
}

function seededRandom(seed: string): () => number {
  const h = crypto.createHash('sha256').update(seed).digest();
  let a = h.readUInt32LE(0);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Picks one live ad. Ads with shuffle=false are "fixed": the highest-priority fixed ad always wins.
 * Otherwise a weighted pick (weight = priority) seeded by viewer + 5-minute bucket, so a viewer sees
 * a stable ad for a few minutes while different viewers get different ones.
 */
export async function pickAd(placementCode: string, viewerKey: string, now: Date = new Date()): Promise<Ad | null> {
  const ads = await prisma.ad.findMany({ where: liveWhere(now, placementCode), orderBy: { id: 'asc' } });
  if (!ads.length) return null;
  const fixed = ads.filter((a) => !a.shuffle).sort((a, b) => b.priority - a.priority || a.id - b.id);
  if (fixed.length) return fixed[0]!;
  const rnd = seededRandom(`${viewerKey}|${placementCode}|${Math.floor(now.getTime() / 300_000)}`);
  const total = ads.reduce((s, a) => s + Math.max(1, a.priority), 0);
  let r = rnd() * total;
  for (const a of ads) {
    r -= Math.max(1, a.priority);
    if (r < 0) return a;
  }
  return ads[ads.length - 1]!;
}

// ---------- banners (home carousel) ----------
/** Keeps a Banner(kind AD) in sync with a HOME_CAROUSEL ad: active only while the ad is live. */
export async function syncBanner(adId: number, now: Date = new Date()) {
  const ad = await prisma.ad.findUnique({ where: { id: adId }, include: { request: { include: { placement: true } } } });
  if (!ad) return;
  const existing = await prisma.banner.findMany({ where: { adId } });
  if (ad.request.placement.code !== 'HOME_CAROUSEL') {
    if (existing.length) await prisma.banner.updateMany({ where: { adId }, data: { active: false } });
    return;
  }
  const live = ad.request.status === 'LIVE' && !ad.paused && !!ad.startsAt && !!ad.endsAt && ad.startsAt <= now && ad.endsAt >= now;
  const data = { title: ad.title, fileId: ad.creativeFileId, activeFrom: ad.startsAt, activeTo: ad.endsAt, active: live };
  if (existing.length) {
    await prisma.banner.update({ where: { id: existing[0]!.id }, data });
  } else if (live) {
    const max = await prisma.banner.aggregate({ _max: { sort: true } });
    await prisma.banner.create({ data: { kind: 'AD', adId, sort: (max._max.sort ?? 0) + 1, durationMs: 5000, ...data } });
  }
}

// ---------- recipients ----------
export async function adManagerUserIds(): Promise<number[]> {
  const users = await prisma.user.findMany({
    where: { status: 'ACTIVE', roles: { some: { role: { permissions: { some: { perm: { in: ['ads.manage', 'ads.approve'] } } } } } } },
    select: { id: true },
  });
  return users.map((u) => u.id);
}
export async function advertiserUserId(advertiserId: number): Promise<number | null> {
  return (await prisma.user.findFirst({ where: { advertiserId }, select: { id: true } }))?.id ?? null;
}
export async function notifyAdvertiser(advertiserId: number, title: string, body: string, titleHi: string, bodyHi: string, sentBy?: number) {
  const uid = await advertiserUserId(advertiserId);
  if (uid) await notify([uid], { title, body, titleHi, bodyHi, kind: 'ad', sentBy });
}

// ---------- lifecycle ----------
export interface LifecycleResult { wentLive: number; expired: number; reminded: number; bannersSynced: number }

/** Hourly: APPROVED -> LIVE inside the window (when paid), LIVE/APPROVED -> EXPIRED after endsAt, renewal reminders, banner sync. */
export async function runAdsLifecycle(now: Date = new Date()): Promise<LifecycleResult> {
  const res: LifecycleResult = { wentLive: 0, expired: 0, reminded: 0, bannersSynced: 0 };
  const touched = new Set<number>();

  const approved = await prisma.adRequest.findMany({ where: { status: 'APPROVED' }, include: { ads: true } });
  for (const r of approved) {
    const ad = r.ads[0];
    if (!ad?.startsAt || !ad.endsAt || ad.paused) continue;
    if (ad.endsAt < now) {
      await prisma.adRequest.update({ where: { id: r.id }, data: { status: 'EXPIRED' } });
      res.expired++; touched.add(ad.id);
    } else if (ad.startsAt <= now && (await isPaid(r.id))) {
      await prisma.adRequest.update({ where: { id: r.id }, data: { status: 'LIVE' } });
      res.wentLive++; touched.add(ad.id);
      await notifyAdvertiser(r.advertiserId, 'Your ad is live', 'Your advertisement is now live in the MSBLR E-Directory.', 'आपका विज्ञापन लाइव है', 'आपका विज्ञापन अब MSBLR ई-डायरेक्टरी में दिख रहा है।');
    }
  }

  const live = await prisma.adRequest.findMany({ where: { status: { in: ['LIVE', 'PAUSED'] } }, include: { ads: true, placement: true } });
  const reminded = await getSetting<Record<string, string>>('ads.renewalReminded', {});
  let remindedDirty = false;
  for (const r of live) {
    const ad = r.ads[0];
    if (!ad?.endsAt) continue;
    if (ad.endsAt < now) {
      await prisma.adRequest.update({ where: { id: r.id }, data: { status: 'EXPIRED' } });
      res.expired++; touched.add(ad.id);
      await notifyAdvertiser(r.advertiserId, 'Your ad has ended', 'Your advertisement period is over. Renew to keep it running.', 'आपका विज्ञापन समाप्त हो गया', 'आपके विज्ञापन की अवधि पूरी हो गई है। जारी रखने के लिए नवीनीकरण करें।');
      continue;
    }
    const days = (ad.endsAt.getTime() - now.getTime()) / 86400_000;
    if (r.status === 'LIVE' && days <= 7 && reminded[String(ad.id)] !== ad.endsAt.toISOString()) {
      const who = (await prisma.advertiser.findUnique({ where: { id: r.advertiserId }, select: { name: true } }))?.name ?? 'Advertiser';
      const left = Math.max(1, Math.ceil(days));
      const uid = await advertiserUserId(r.advertiserId);
      if (uid) {
        await notify([uid], {
          title: 'Your ad ends soon', body: `Your ${r.placement.name} ad ends in ${left} day${left > 1 ? 's' : ''}. Renew to keep it running.`,
          titleHi: 'आपका विज्ञापन जल्द समाप्त होगा', bodyHi: `आपका ${r.placement.name} विज्ञापन ${left} दिन में समाप्त होगा। जारी रखने के लिए नवीनीकरण करें।`, kind: 'ad',
        });
      }
      const mgrs = (await adManagerUserIds()).filter((m) => m !== uid);
      if (mgrs.length) {
        await notify(mgrs, {
          title: 'Ad renewal due', body: `${who}: ${r.placement.name} ad ends in ${left} day${left > 1 ? 's' : ''}.`,
          titleHi: 'विज्ञापन नवीनीकरण देय', bodyHi: `${who}: ${r.placement.name} विज्ञापन ${left} दिन में समाप्त होगा।`, kind: 'reminder',
        });
      }
      reminded[String(ad.id)] = ad.endsAt.toISOString();
      remindedDirty = true;
      res.reminded++;
    }
  }
  if (remindedDirty) await setSetting('ads.renewalReminded', reminded);

  // banner sync: every HOME_CAROUSEL ad that has (or had) a banner or is currently live
  const carousel = await prisma.ad.findMany({
    where: { request: { placement: { code: 'HOME_CAROUSEL' } }, OR: [{ banners: { some: {} } }, { request: { status: 'LIVE' } }] },
    select: { id: true },
  });
  for (const a of carousel) touched.add(a.id);
  for (const id of touched) { await syncBanner(id, now); res.bannersSynced++; }
  return res;
}

/** Removes AdView rows older than `days` (default 90). Daily stats are kept. */
export async function pruneAdViews(now: Date = new Date(), days = 90): Promise<number> {
  const cutoff = istDay(new Date(now.getTime() - days * 86400_000));
  const r = await prisma.adView.deleteMany({ where: { date: { lt: cutoff } } });
  return r.count;
}

// Ad managers may open the payment proof attached to an advertisement payment (finance owns the rest).
let ruleRegistered = false;
export function registerAdFileRules() {
  if (ruleRegistered) return;
  ruleRegistered = true;
  registerFileAccessRule(async (file, user) => {
    if (!user || file.kind !== 'payment_proof' || !(user.perms.includes('ads.manage') || user.perms.includes('ads.approve'))) return false;
    return (await prisma.payment.count({ where: { screenshotFileId: file.id, kind: 'AD' } })) > 0;
  });
}
