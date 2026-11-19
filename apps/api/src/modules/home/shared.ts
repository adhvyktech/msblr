import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { httpError } from '../../lib/errors';
import { parse } from '../../lib/parse';
import type { AuthUser } from '../../lib/auth';

// ---------- home cache (shared parts only; user-specific parts are never cached) ----------
const CACHE_MS = 60_000;
const cache = new Map<string, { at: number; value: unknown }>();
export async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value as T;
  const value = await load();
  cache.set(key, { at: Date.now(), value });
  return value;
}
/** Call after any change to banners, highlights, trusts, events, announcements or businesses. */
export function invalidateHomeCache() {
  cache.clear();
}

// ---------- request helpers ----------
export function idParam(req: FastifyRequest, name = 'id'): number {
  const v = Number((req.params as Record<string, string>)[name]);
  if (!Number.isInteger(v) || v < 1) throw httpError(404, 'NOT_FOUND', 'Not found');
  return v;
}
export const orderBody = z.object({ ids: z.array(z.number().int().positive()).min(1).max(500) });
export const isoDate = z.preprocess((v) => (v === '' || v === null ? undefined : v), z.coerce.date().optional());
export const optStr = (max = 500) => z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? null : v), z.string().trim().max(max).nullable().optional());
export const httpUrl = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
  z.string().trim().max(500).regex(/^https?:\/\/\S+$/i, 'Enter a valid link starting with http:// or https://').nullable().optional(),
);

/** Items listed by ids in `ids` get sort = position (in one transaction). Unknown ids are ignored. */
export async function applyOrder(model: 'trust' | 'staticContact' | 'banner', ids: number[]) {
  const delegate = prisma[model] as unknown as {
    findMany: (a: unknown) => Promise<{ id: number }[]>;
    update: (a: unknown) => unknown;
  };
  const existing = new Set((await delegate.findMany({ select: { id: true } })).map((r) => r.id));
  const valid = ids.filter((id) => existing.has(id));
  await prisma.$transaction(valid.map((id, i) => delegate.update({ where: { id }, data: { sort: i + 1 } }) as never));
}

// ---------- files ----------
const RANK = { PRIVATE: 0, MEMBERS: 1, PUBLIC: 2 } as const;
/**
 * Validates that every file id exists and may be attached by `user` (own upload, or already shared),
 * then widens the visibility of the user's own uploads to `visibility` so the intended audience can open them.
 */
export async function claimFiles(user: AuthUser, ids: (number | null | undefined)[], visibility: 'MEMBERS' | 'PUBLIC', kinds?: string[]) {
  const uniq = [...new Set(ids.filter((x): x is number => typeof x === 'number'))];
  if (!uniq.length) return;
  const files = await prisma.file.findMany({ where: { id: { in: uniq } } });
  if (files.length !== uniq.length) throw httpError(400, 'FILE_NOT_FOUND', 'An uploaded file could not be found. Please upload it again.');
  for (const f of files) {
    if (f.visibility === 'PRIVATE' && f.ownerUserId !== user.id) throw httpError(403, 'FORBIDDEN', 'You can only attach files you uploaded yourself.');
    if (kinds && !kinds.some((k) => f.mime === k || f.mime.startsWith(`${k}/`))) throw httpError(400, 'FILE_TYPE', 'This file type is not allowed here.');
  }
  const widen = files.filter((f) => f.ownerUserId === user.id && RANK[f.visibility] < RANK[visibility]).map((f) => f.id);
  if (widen.length) await prisma.file.updateMany({ where: { id: { in: widen } }, data: { visibility } });
}

// ---------- time ----------
const IST_MS = 5.5 * 3600_000;
/** Month (1-12) and day-of-month for `now` in India Standard Time. */
export function istMonthDay(now = new Date()) {
  const d = new Date(now.getTime() + IST_MS);
  return { month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}
/** UTC instant of 00:00 IST for the day containing `now`. */
export function istStartOfDay(now = new Date()) {
  const d = new Date(now.getTime() + IST_MS);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - IST_MS);
}

export { parse };
export const pageish = z.object({ q: z.string().trim().max(100).optional() });
