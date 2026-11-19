import type { FastifyPluginAsync } from 'fastify';
import { z, type ZodTypeAny } from 'zod';
import { prisma } from '../../lib/prisma';
import { requirePerm, requireStaff } from '../../lib/auth';
import { parse } from '../../lib/parse';
import { httpError } from '../../lib/errors';
import { audit } from '../../lib/audit';
import { getSetting, setSetting } from '../../lib/settings';

const text = (max = 300) => z.string().trim().max(max);
const bilingual = z.object({ en: text(500).min(1, 'Message is required'), hi: text(500).min(1, 'Message is required') });

/** Zod schema and default value for each Setting key. */
export const SETTINGS: Record<string, { schema: ZodTypeAny; def: unknown }> = {
  theme: { schema: z.enum(['a', 'b', 'c']), def: 'c' },
  upi: {
    schema: z.object({
      id: text(80).regex(/^[\w.\-]{2,}@[A-Za-z][\w.\-]*$/, 'Enter a valid UPI ID like name@bank'),
      payeeName: text(100).min(1, 'Payee name is required'),
      qrFileId: z.number().int().positive().nullable(),
    }),
    def: { id: '', payeeName: '', qrFileId: null },
  },
  subscription: { schema: z.object({ amount: z.number().positive('Amount must be more than 0').max(1_000_000), yearMode: z.literal('FY').default('FY') }), def: { amount: 0, yearMode: 'FY' } },
  trustedDeviceDays: { schema: z.number().int().min(1, 'Minimum 1 day').max(365, 'Maximum 365 days'), def: 30 },
  businessApprovalRequired: { schema: z.boolean(), def: true },
  contentStaleDays: { schema: z.number().int().min(1, 'Minimum 1 day').max(365), def: 10 },
  wishTemplates: { schema: z.object({ birthday: bilingual, anniversary: bilingual }), def: { birthday: { en: '', hi: '' }, anniversary: { en: '', hi: '' } } },
  receiptPrefix: { schema: z.string().trim().min(1, 'Prefix is required').max(8).regex(/^[A-Za-z0-9]+$/, 'Letters and numbers only'), def: 'R' },
  sabha: {
    schema: z.object({
      name: text(120).min(1, 'Name is required'),
      nameHi: text(120).default(''),
      address: text(300).default(''),
      phone: text(40).default(''),
      email: z.union([z.literal(''), z.string().trim().email('Enter a valid email')]).default(''),
    }),
    def: { name: '', nameHi: '', address: '', phone: '', email: '' },
  },
};

const isPlainObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const merge = (def: unknown, stored: unknown) => (isPlainObject(def) && isPlainObject(stored) ? { ...def, ...stored } : stored ?? def);

const zoneSchema = z.object({ name: text(60).min(1, 'Zone name is required'), sort: z.number().int().min(0).max(999).optional() });

const routes: FastifyPluginAsync = async (app) => {
  app.get('/', { preHandler: requirePerm('settings.edit', 'dashboard.view') }, async () => {
    const rows = await prisma.setting.findMany({ where: { key: { in: Object.keys(SETTINGS) } } });
    const stored = new Map(rows.map((r) => [r.key, r.value]));
    const out: Record<string, unknown> = {};
    for (const [k, s] of Object.entries(SETTINGS)) out[k] = merge(s.def, stored.get(k));
    return { data: out };
  });

  app.put('/:key', { preHandler: requirePerm('settings.edit') }, async (req) => {
    const { key } = req.params as { key: string };
    const s = SETTINGS[key];
    if (!s) throw httpError(404, 'NOT_FOUND', 'Unknown setting');
    const body = req.body as { value?: unknown } | undefined;
    // accept either the raw value or { value }
    const raw = isPlainObject(body) && 'value' in body && Object.keys(body).length === 1 ? body.value : req.body;
    const value = parse(s.schema, raw);
    if (key === 'upi' && (value as { qrFileId: number | null }).qrFileId) {
      const f = await prisma.file.findUnique({ where: { id: (value as { qrFileId: number }).qrFileId } });
      if (!f) throw httpError(400, 'VALIDATION_ERROR', 'QR image not found');
      // The QR is shown to members on the payment page, so it must be publicly readable.
      if (f.visibility === 'PRIVATE') await prisma.file.update({ where: { id: f.id }, data: { visibility: 'MEMBERS' } });
    }
    const before = merge(s.def, await getSetting<unknown>(key, undefined));
    await setSetting(key, value);
    await audit(req, { action: 'setting.update', entity: 'setting', entityId: key, summary: `Changed setting "${key}"`, before, after: value });
    return { data: { key, value } };
  });

  // ---------- zones ----------
  app.get('/zones', { preHandler: requireStaff }, async () => {
    const zones = await prisma.zone.findMany({ orderBy: [{ sort: 'asc' }, { id: 'asc' }], include: { _count: { select: { families: true, events: true, userRoles: true } } } });
    return { data: zones.map((z) => ({ id: z.id, name: z.name, sort: z.sort, families: z._count.families, events: z._count.events, staff: z._count.userRoles })) };
  });

  app.post('/zones', { preHandler: requirePerm('settings.edit') }, async (req, reply) => {
    const b = parse(zoneSchema, req.body);
    if (await prisma.zone.findUnique({ where: { name: b.name } })) throw httpError(409, 'DUPLICATE', 'A zone with this name already exists.');
    const max = await prisma.zone.aggregate({ _max: { sort: true } });
    const zone = await prisma.zone.create({ data: { name: b.name, sort: b.sort ?? (max._max.sort ?? 0) + 1 } });
    await audit(req, { action: 'zone.create', entity: 'zone', entityId: zone.id, summary: `Added zone ${zone.name}`, after: zone });
    reply.status(201);
    return { data: zone };
  });

  app.patch('/zones/:id', { preHandler: requirePerm('settings.edit') }, async (req) => {
    const id = Number((req.params as { id: string }).id);
    const b = parse(zoneSchema.partial(), req.body);
    const before = await prisma.zone.findUnique({ where: { id } });
    if (!before) throw httpError(404, 'NOT_FOUND', 'Zone not found');
    if (b.name && b.name !== before.name && (await prisma.zone.findUnique({ where: { name: b.name } }))) throw httpError(409, 'DUPLICATE', 'A zone with this name already exists.');
    const zone = await prisma.zone.update({ where: { id }, data: b });
    await audit(req, { action: 'zone.update', entity: 'zone', entityId: id, summary: `Updated zone ${zone.name}`, before, after: zone });
    return { data: zone };
  });

  app.delete('/zones/:id', { preHandler: requirePerm('settings.edit') }, async (req) => {
    const id = Number((req.params as { id: string }).id);
    const zone = await prisma.zone.findUnique({ where: { id }, include: { _count: { select: { families: true, events: true, userRoles: true } } } });
    if (!zone) throw httpError(404, 'NOT_FOUND', 'Zone not found');
    const used = zone._count.families + zone._count.events + zone._count.userRoles;
    if (used > 0) throw httpError(409, 'ZONE_IN_USE', `This zone is used by ${zone._count.families} families, ${zone._count.events} events and ${zone._count.userRoles} staff roles, so it cannot be deleted.`);
    await prisma.zone.delete({ where: { id } });
    await audit(req, { action: 'zone.delete', entity: 'zone', entityId: id, summary: `Deleted zone ${zone.name}`, before: { id: zone.id, name: zone.name, sort: zone.sort } });
    return { data: { ok: true } };
  });
};
export default routes;
