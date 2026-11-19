import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { Prisma, prisma } from '../../lib/prisma';
import { requirePerm } from '../../lib/auth';
import { paginate } from '../../lib/pagination';
import { parse } from '../../lib/parse';
import { audit } from '../../lib/audit';
import { sendTable, type ReportColumn, type ReportRow } from '../reports/export';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'Use a date like 2026-11-30');
const filterSchema = z.object({
  from: date.optional(),
  to: date.optional(),
  actorUserId: z.coerce.number().int().positive().optional(),
  role: z.string().trim().min(1).max(40).optional(),
  action: z.string().trim().min(1).max(60).optional(),
  entity: z.string().trim().min(1).max(60).optional(),
  q: z.string().trim().min(1).max(100).optional(),
});

function whereFrom(query: unknown): Prisma.AuditLogWhereInput {
  const f = parse(filterSchema, query ?? {});
  const where: Prisma.AuditLogWhereInput = {};
  if (f.from || f.to) {
    where.at = {
      ...(f.from ? { gte: new Date(`${f.from.slice(0, 10)}T00:00:00+05:30`) } : {}),
      ...(f.to ? { lt: new Date(new Date(`${f.to.slice(0, 10)}T00:00:00+05:30`).getTime() + 86400_000) } : {}),
    };
  }
  if (f.actorUserId) where.actorUserId = f.actorUserId;
  if (f.role) where.actorRole = { contains: f.role, mode: 'insensitive' };
  if (f.action) where.action = { startsWith: f.action, mode: 'insensitive' };
  if (f.entity) where.entity = f.entity;
  if (f.q) {
    where.OR = [
      { summary: { contains: f.q, mode: 'insensitive' } },
      { actorName: { contains: f.q, mode: 'insensitive' } },
      { action: { contains: f.q, mode: 'insensitive' } },
      { entityId: { contains: f.q, mode: 'insensitive' } },
    ];
  }
  return where;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const show = (v: unknown) => (v === null || v === undefined ? '-' : typeof v === 'object' ? JSON.stringify(v) : String(v));
/** "field: old -> new; ..." from before/after JSON, for exports. */
export function diffText(before: unknown, after: unknown): string {
  if (isObj(before) || isObj(after)) {
    const b = isObj(before) ? before : {};
    const a = isObj(after) ? after : {};
    const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])];
    return keys
      .filter((k) => JSON.stringify(b[k]) !== JSON.stringify(a[k]))
      .map((k) => `${k}: ${show(b[k])} -> ${show(a[k])}`)
      .join('; ');
  }
  return before == null && after == null ? '' : `${show(before)} -> ${show(after)}`;
}

const exportSchema = z.object({ format: z.enum(['xlsx', 'csv', 'pdf']).default('xlsx') });
const MAX_EXPORT = 20000;

const routes: FastifyPluginAsync = async (app) => {
  // Read-only module: there are deliberately no POST/PUT/PATCH/DELETE routes.
  app.addHook('preHandler', requirePerm('audit.view'));

  app.get('/', async (req) => {
    const where = whereFrom(req.query);
    const p = paginate(req.query);
    const [rows, total] = await Promise.all([
      prisma.auditLog.findMany({ where, orderBy: [{ at: 'desc' }, { id: 'desc' }], skip: p.skip, take: p.take }),
      prisma.auditLog.count({ where }),
    ]);
    return p.result(rows, total);
  });

  app.get('/actions', async () => {
    const rows = await prisma.auditLog.findMany({ distinct: ['action'], select: { action: true }, orderBy: { action: 'asc' } });
    const entities = await prisma.auditLog.findMany({ distinct: ['entity'], where: { entity: { not: null } }, select: { entity: true }, orderBy: { entity: 'asc' } });
    return { data: rows.map((r) => r.action), entities: entities.map((e) => e.entity).filter(Boolean) };
  });

  app.get('/export', async (req, reply) => {
    const { format } = parse(exportSchema, req.query);
    const where = whereFrom(req.query);
    const logs = await prisma.auditLog.findMany({ where, orderBy: [{ at: 'desc' }, { id: 'desc' }], take: MAX_EXPORT });
    const columns: ReportColumn[] = [
      { key: 'at', header: 'When' },
      { key: 'actor', header: 'Who' },
      { key: 'role', header: 'Role' },
      { key: 'action', header: 'Action' },
      { key: 'entity', header: 'Record' },
      { key: 'summary', header: 'Summary' },
      { key: 'changes', header: 'Changes (old -> new)' },
    ];
    const rows: ReportRow[] = logs.map((l) => ({
      at: l.at.toISOString().slice(0, 19).replace('T', ' '),
      actor: l.actorName ?? 'System',
      role: l.actorRole ?? '',
      action: l.action,
      entity: l.entity ? `${l.entity}${l.entityId ? ` #${l.entityId}` : ''}` : '',
      summary: l.summary ?? '',
      changes: diffText(l.before, l.after),
    }));
    await audit(req, { action: 'audit.export', entity: 'audit', summary: `Exported ${rows.length} activity log rows (${format})` });
    return sendTable(reply, format, {
      filename: `activity-log-${new Date().toISOString().slice(0, 10)}`,
      title: 'Activity log',
      subtitle: `${rows.length} entries${logs.length === MAX_EXPORT ? ` (latest ${MAX_EXPORT})` : ''}`,
      columns,
      rows,
    });
  });
};
export default routes;
