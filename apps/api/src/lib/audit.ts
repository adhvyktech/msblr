import type { FastifyRequest } from 'fastify';
import { prisma, Prisma, type Tx } from './prisma';

export interface AuditInput {
  action: string; // entity.verb  e.g. payment.approve
  entity?: string;
  entityId?: string | number;
  summary?: string;
  before?: unknown;
  after?: unknown;
  /** Override the actor (e.g. at login, before req.user exists). */
  actor?: { userId?: number | null; name?: string | null; role?: string | null };
}
const j = (v: unknown) => (v === undefined || v === null ? Prisma.JsonNull : (JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue));

/** audit(req, {...}, tx?) — pass tx when inside prisma.$transaction. req may be null (jobs). */
export async function audit(req: FastifyRequest | null, input: AuditInput, tx?: Tx) {
  const db = tx ?? prisma;
  const u = req?.user;
  await db.auditLog.create({
    data: {
      actorUserId: input.actor?.userId ?? u?.id ?? null,
      actorName: input.actor?.name ?? u?.name ?? null,
      actorRole: input.actor?.role ?? (u ? u.roles.join(',') : null),
      action: input.action,
      entity: input.entity ?? null,
      entityId: input.entityId === undefined ? null : String(input.entityId),
      summary: input.summary ?? null,
      before: j(input.before),
      after: j(input.after),
      ip: req?.ip ?? null,
      userAgent: (req?.headers['user-agent'] as string | undefined)?.slice(0, 300) ?? null,
    },
  });
}
