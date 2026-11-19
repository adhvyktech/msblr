import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { httpError } from '../../lib/errors';
import { parse } from '../../lib/parse';
import { audit } from '../../lib/audit';
import { authenticate, requirePerm } from '../../lib/auth';
import { applyOrder, idParam, optStr, orderBody } from '../home/shared';

const contactBody = z.object({
  section: z.string().trim().min(2, 'Choose a section').max(40).transform((s) => s.toUpperCase()),
  name: z.string().trim().min(2, 'Enter a name').max(120),
  phone: z.string().trim().min(3, 'Enter a phone number').max(40).regex(/^[+\d][\d\s()-]*$/, 'Enter a valid phone number'),
  details: optStr(300),
});
const SECTION_ORDER = ['EMERGENCY', 'SABHA'];

const loadAll = () => prisma.staticContact.findMany({ orderBy: [{ sort: 'asc' }, { id: 'asc' }] });
function group(rows: Awaited<ReturnType<typeof loadAll>>) {
  const m = new Map<string, typeof rows>();
  for (const r of rows) m.set(r.section, [...(m.get(r.section) ?? []), r]);
  const rank = (s: string) => (SECTION_ORDER.includes(s) ? SECTION_ORDER.indexOf(s) : SECTION_ORDER.length);
  return [...m.entries()]
    .sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0]))
    .map(([section, items]) => ({ section, items }));
}

const routes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', authenticate);
  const staff = requirePerm('contacts.edit');

  app.get('/', async () => ({ data: group(await loadAll()) }));

  app.post('/', { preHandler: staff }, async (req, reply) => {
    const body = parse(contactBody, req.body);
    const max = await prisma.staticContact.aggregate({ _max: { sort: true } });
    const c = await prisma.$transaction(async (tx) => {
      const row = await tx.staticContact.create({ data: { ...body, details: body.details ?? null, sort: (max._max.sort ?? 0) + 1 } });
      await audit(req, { action: 'contact.create', entity: 'contact', entityId: row.id, summary: `Contact "${row.name}" added`, after: row }, tx);
      return row;
    });
    return reply.status(201).send({ data: c });
  });

  app.put('/order', { preHandler: staff }, async (req) => {
    const { ids } = parse(orderBody, req.body);
    await applyOrder('staticContact', ids);
    await audit(req, { action: 'contact.reorder', entity: 'contact', summary: 'Contacts reordered', after: { ids } });
    return { data: group(await loadAll()) };
  });

  app.patch('/:id', { preHandler: staff }, async (req) => {
    const id = idParam(req);
    const body = parse(contactBody.partial(), req.body);
    const before = await prisma.staticContact.findUnique({ where: { id } });
    if (!before) throw httpError(404, 'NOT_FOUND', 'Contact not found');
    const c = await prisma.$transaction(async (tx) => {
      const row = await tx.staticContact.update({ where: { id }, data: body });
      await audit(req, { action: 'contact.update', entity: 'contact', entityId: id, summary: `Contact "${row.name}" updated`, before, after: row }, tx);
      return row;
    });
    return { data: c };
  });

  app.delete('/:id', { preHandler: staff }, async (req) => {
    const id = idParam(req);
    const before = await prisma.staticContact.findUnique({ where: { id } });
    if (!before) throw httpError(404, 'NOT_FOUND', 'Contact not found');
    await prisma.$transaction(async (tx) => {
      await tx.staticContact.delete({ where: { id } });
      await audit(req, { action: 'contact.delete', entity: 'contact', entityId: id, summary: `Contact "${before.name}" deleted`, before }, tx);
    });
    return { data: { ok: true } };
  });
};
export default routes;
