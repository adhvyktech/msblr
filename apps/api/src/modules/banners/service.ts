import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { fileUrl } from '../../lib/files';

const adInclude = { ad: { include: { request: { select: { status: true } } } } } satisfies Prisma.BannerInclude;
type BannerRow = Prisma.BannerGetPayload<{ include: typeof adInclude }>;

/** An ad may appear in the carousel only while its request is LIVE, unpaused and inside its own schedule. */
export function adIsLive(ad: BannerRow['ad'], now = new Date()) {
  if (!ad) return false;
  return ad.request.status === 'LIVE' && !ad.paused && (!ad.startsAt || ad.startsAt <= now) && (!ad.endsAt || ad.endsAt >= now);
}

async function mimes(ids: number[]) {
  if (!ids.length) return new Map<number, string>();
  const files = await prisma.file.findMany({ where: { id: { in: ids } }, select: { id: true, mime: true } });
  return new Map(files.map((f) => [f.id, f.mime]));
}

function shape(b: BannerRow, mime: Map<number, string>, now: Date) {
  const fileId = b.kind === 'AD' ? b.ad?.creativeFileId ?? b.fileId : b.fileId;
  return {
    id: b.id,
    kind: b.kind,
    title: b.title ?? (b.kind === 'AD' ? b.ad?.title ?? null : null),
    subtitle: b.subtitle,
    fileId,
    url: fileId ? fileUrl(fileId) : null,
    mime: fileId ? mime.get(fileId) ?? null : null,
    linkUrl: b.linkUrl,
    adId: b.adId,
    ad: b.ad ? { id: b.ad.id, clickType: b.ad.clickType, clickValue: b.ad.clickValue, live: adIsLive(b.ad, now) } : null,
    sort: b.sort,
    durationMs: b.durationMs,
    activeFrom: b.activeFrom,
    activeTo: b.activeTo,
    active: b.active,
  };
}

/** Banners that should be on screen right now, in admin order. */
export async function activeBanners(now = new Date()) {
  const rows = await prisma.banner.findMany({
    where: {
      active: true,
      AND: [{ OR: [{ activeFrom: null }, { activeFrom: { lte: now } }] }, { OR: [{ activeTo: null }, { activeTo: { gte: now } }] }],
    },
    include: adInclude,
    orderBy: [{ sort: 'asc' }, { id: 'asc' }],
  });
  const visible = rows.filter((b) => b.kind !== 'AD' || adIsLive(b.ad, now));
  const m = await mimes(visible.map((b) => (b.kind === 'AD' ? b.ad?.creativeFileId ?? b.fileId : b.fileId)).filter((x): x is number => !!x));
  return visible.map((b) => shape(b, m, now));
}

export async function allBanners(now = new Date()) {
  const rows = await prisma.banner.findMany({ include: adInclude, orderBy: [{ sort: 'asc' }, { id: 'asc' }] });
  const m = await mimes(rows.map((b) => (b.kind === 'AD' ? b.ad?.creativeFileId ?? b.fileId : b.fileId)).filter((x): x is number => !!x));
  return rows.map((b) => {
    const s = shape(b, m, now);
    const inWindow = (!b.activeFrom || b.activeFrom <= now) && (!b.activeTo || b.activeTo >= now);
    return { ...s, showing: b.active && inWindow && (b.kind !== 'AD' || adIsLive(b.ad, now)) };
  });
}

export async function oneBanner(id: number) {
  const rows = await allBanners();
  return rows.find((r) => r.id === id) ?? null;
}
