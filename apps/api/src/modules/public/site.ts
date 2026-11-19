import { prisma } from '../../lib/prisma';
import { getSetting } from '../../lib/settings';
import { fileUrl, registerFileAccessRule } from '../../lib/files';

export interface PublicSiteSetting {
  about: { en: string; hi: string };
  committee: { name: string; role: string; roleHi?: string; photoFileId?: number | null }[];
  showHighlightPhotos: boolean;
  mapsUrl?: string;
}
export const PUBLIC_SITE_DEFAULT: PublicSiteSetting = { about: { en: '', hi: '' }, committee: [], showHighlightPhotos: false, mapsUrl: '' };

const loadSite = async (): Promise<PublicSiteSetting> => ({ ...PUBLIC_SITE_DEFAULT, ...(await getSetting<Partial<PublicSiteSetting>>('publicSite', {})) });

const TTL_MS = 60_000;
let cache: { at: number; data: unknown } | null = null;
export const invalidatePublicSite = () => { cache = null; };

/** Anonymous visitors may read highlight media only while the "show highlight photos" setting is on. */
let ruleRegistered = false;
export function registerPublicSiteFileRules() {
  if (ruleRegistered) return;
  ruleRegistered = true;
  registerFileAccessRule(async (file) => {
    if (!file.mime.startsWith('image/')) return false;
    if (!(await loadSite()).showHighlightPhotos) return false;
    return (await prisma.highlight.count({ where: { status: 'PUBLISHED', mediaFileIds: { has: file.id } } })) > 0;
  });
}

export async function buildPublicSite() {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data;
  const now = new Date();
  const [sabha, site, activeFamilies, businesses, upcomingCount, events, highlights, trusts] = await Promise.all([
    getSetting<Record<string, unknown>>('sabha', {}),
    loadSite(),
    prisma.family.count({ where: { status: 'ACTIVE' } }),
    prisma.business.count({ where: { status: 'APPROVED' } }),
    prisma.event.count({ where: { status: 'PUBLISHED', startsAt: { gte: now } } }),
    prisma.event.findMany({ where: { status: 'PUBLISHED', startsAt: { gte: now } }, orderBy: { startsAt: 'asc' }, take: 6 }),
    prisma.highlight.findMany({ where: { status: 'PUBLISHED' }, orderBy: { publishedAt: 'desc' }, take: 6 }),
    prisma.trust.findMany({ orderBy: [{ sort: 'asc' }, { id: 'asc' }], include: { attachments: { orderBy: { id: 'asc' } } } }),
  ]);

  const fileIds = [
    ...events.map((e) => e.noticeFileId),
    ...trusts.flatMap((t) => t.attachments.map((a) => a.fileId)),
    ...(site.showHighlightPhotos ? highlights.flatMap((h) => h.mediaFileIds) : []),
  ].filter((x): x is number => !!x);
  const files = fileIds.length ? await prisma.file.findMany({ where: { id: { in: fileIds } }, select: { id: true, visibility: true, mime: true } }) : [];
  const byId = new Map(files.map((f) => [f.id, f]));
  const isPublic = (id?: number | null) => !!id && byId.get(id)?.visibility === 'PUBLIC';

  const data = {
    sabha: {
      name: String(sabha.name ?? ''), nameHi: String(sabha.nameHi ?? ''), address: String(sabha.address ?? ''),
      phone: String(sabha.phone ?? ''), email: String(sabha.email ?? ''),
    },
    about: site.about,
    mapsUrl: site.mapsUrl || '',
    committee: site.committee.map((c) => ({ name: c.name, role: c.role, roleHi: c.roleHi ?? '', photoUrl: c.photoFileId ? fileUrl(c.photoFileId) : null })),
    stats: { activeFamilies, businesses, upcomingEvents: upcomingCount },
    upcomingEvents: events.map((e) => ({
      id: e.id, title: e.title, kind: e.kind, startsAt: e.startsAt.toISOString(), endsAt: e.endsAt?.toISOString() ?? null,
      venue: e.venue, noticeUrl: isPublic(e.noticeFileId) ? fileUrl(e.noticeFileId!) : null,
    })),
    highlights: highlights.map((h) => ({
      id: h.id, title: h.title, summary: h.summary, publishedAt: h.publishedAt.toISOString(),
      media: site.showHighlightPhotos
        ? h.mediaFileIds.filter((id) => byId.get(id)?.mime.startsWith('image/')).map((id) => fileUrl(id))
        : [],
    })),
    trusts: trusts.map((t) => ({
      id: t.id, name: t.name, description: t.description,
      attachments: t.attachments
        .filter((a) => a.url || isPublic(a.fileId))
        .map((a) => ({ id: a.id, label: a.label, url: a.url || fileUrl(a.fileId!) })),
    })),
  };
  cache = { at: Date.now(), data };
  return data;
}
