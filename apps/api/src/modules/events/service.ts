import type { Prisma } from '@prisma/client';
import type { AuthUser } from '../../lib/auth';
import { hasPerm } from '../../lib/auth';
import { httpError } from '../../lib/errors';
import { fileUrl } from '../../lib/files';
import { istStartOfDay } from '../home/shared';

export const eventInclude = { zone: { select: { id: true, name: true } } } satisfies Prisma.EventInclude;
export type EventRow = Prisma.EventGetPayload<{ include: typeof eventInclude }>;

/** Content managers are limited to the zones on their role; super_admin/admin and unscoped roles are not. */
export const isZoneScoped = (u: AuthUser) => u.zoneIds.length > 0 && !u.roles.some((r) => r === 'super_admin' || r === 'admin');
export const zoneAllowed = (u: AuthUser, zoneId: number | null) => !isZoneScoped(u) || (zoneId !== null && u.zoneIds.includes(zoneId));
export function assertZoneAllowed(u: AuthUser, zoneId: number | null) {
  if (!zoneAllowed(u, zoneId)) {
    throw httpError(403, 'ZONE_FORBIDDEN', zoneId === null ? 'Only the Sabha admin can post Sabha-wide events. Please choose your zone.' : 'You can only post events for your own zone.');
  }
}

/** Events that have not finished yet (or, with no end time, that start today or later in IST). */
export function upcomingWhere(now = new Date()): Prisma.EventWhereInput {
  return { OR: [{ endsAt: { gte: now } }, { endsAt: null, startsAt: { gte: istStartOfDay(now) } }] };
}
export function pastWhere(now = new Date()): Prisma.EventWhereInput {
  return { NOT: upcomingWhere(now) };
}

export function serializeEvent(e: EventRow, viewer?: AuthUser) {
  return {
    id: e.id,
    title: e.title,
    body: e.body,
    kind: e.kind,
    zone: e.zone,
    zoneId: e.zoneId,
    startsAt: e.startsAt,
    endsAt: e.endsAt,
    venue: e.venue,
    registrationUrl: e.registrationUrl,
    noticeFileId: e.noticeFileId,
    noticeUrl: e.noticeFileId ? fileUrl(e.noticeFileId) : null,
    status: e.status,
    canEdit: !!viewer && hasPerm(viewer, 'events.post') && zoneAllowed(viewer, e.zoneId),
  };
}
