import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { fileUrl } from '../../lib/files';

export const highlightInclude = { event: { select: { id: true, title: true } } } satisfies Prisma.HighlightInclude;
export type HighlightRow = Prisma.HighlightGetPayload<{ include: typeof highlightInclude }>;

/** Adds media (url + mime) and author names to a batch of highlights with two queries. */
export async function serializeHighlights(rows: HighlightRow[]) {
  const fileIds = [...new Set(rows.flatMap((r) => r.mediaFileIds))];
  const authorIds = [...new Set(rows.map((r) => r.authorId).filter((x): x is number => x !== null))];
  const [files, users] = await Promise.all([
    fileIds.length ? prisma.file.findMany({ where: { id: { in: fileIds } }, select: { id: true, mime: true } }) : [],
    authorIds.length ? prisma.user.findMany({ where: { id: { in: authorIds } }, select: { id: true, displayName: true, person: { select: { name: true } } } }) : [],
  ]);
  const mime = new Map(files.map((f) => [f.id, f.mime]));
  const author = new Map(users.map((u) => [u.id, u.displayName ?? u.person?.name ?? null]));
  return rows.map((h) => {
    const media = h.mediaFileIds.map((id) => ({ id, url: fileUrl(id), mime: mime.get(id) ?? 'image/jpeg' }));
    return {
      id: h.id,
      title: h.title,
      summary: h.summary,
      event: h.event,
      eventId: h.eventId,
      media,
      coverUrl: media[0]?.url ?? null,
      status: h.status,
      authorId: h.authorId,
      authorName: h.authorId ? author.get(h.authorId) ?? null : null,
      publishedAt: h.publishedAt,
    };
  });
}
