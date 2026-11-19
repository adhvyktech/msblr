import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { httpError } from '../../lib/errors';
import { parse } from '../../lib/parse';
import { audit } from '../../lib/audit';
import { authenticate, requirePerm } from '../../lib/auth';
import { fileUrl } from '../../lib/files';
import { applyOrder, claimFiles, httpUrl, idParam, invalidateHomeCache, optStr, orderBody } from '../home/shared';

const trustBody = z.object({
  name: z.string().trim().min(2, 'Enter the trust name').max(120),
  description: optStr(3000),
});
const attachmentBody = z
  .object({
    label: z.string().trim().min(1, 'Enter a label').max(120),
    fileId: z.number().int().positive().optional(),
    url: httpUrl,
  })
  .refine((v) => !!v.fileId !== !!v.url, { message: 'Provide either a file or a link', path: ['url'] });

const include = { attachments: { orderBy: { id: 'asc' as const } } };
type TrustRow = Awaited<ReturnType<typeof loadAll>>[number];
const loadAll = () => prisma.trust.findMany({ include, orderBy: [{ sort: 'asc' }, { id: 'asc' }] });

export function serializeTrust(t: TrustRow) {
  return {
    id: t.id,
    name: t.name,
    description: t.description,
    sort: t.sort,
    attachments: t.attachments.map((a) => ({
      id: a.id,
      label: a.label,
      fileId: a.fileId,
      isLink: !a.fileId,
      // a stored file wins; otherwise the external link
      href: a.fileId ? fileUrl(a.fileId) : a.url,
      url: a.url,
    })),
  };
}

const routes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', authenticate);
  const staff = requirePerm('trusts.edit');

  app.get('/', async () => ({ data: (await loadAll()).map(serializeTrust) }));

  app.post('/', { preHandler: staff }, async (req, reply) => {
    const body = parse(trustBody, req.body);
    const max = await prisma.trust.aggregate({ _max: { sort: true } });
    const t = await prisma.$transaction(async (tx) => {
      const row = await tx.trust.create({ data: { name: body.name, description: body.description ?? null, sort: (max._max.sort ?? 0) + 1 }, include });
      await audit(req, { action: 'trust.create', entity: 'trust', entityId: row.id, summary: `Trust "${row.name}" added`, after: { name: row.name } }, tx);
      return row;
    });
    invalidateHomeCache();
    return reply.status(201).send({ data: serializeTrust(t) });
  });

  app.put('/order', { preHandler: staff }, async (req) => {
    const { ids } = parse(orderBody, req.body);
    await applyOrder('trust', ids);
    await audit(req, { action: 'trust.reorder', entity: 'trust', summary: 'Trusts reordered', after: { ids } });
    invalidateHomeCache();
    return { data: (await loadAll()).map(serializeTrust) };
  });

  app.patch('/:id', { preHandler: staff }, async (req) => {
    const id = idParam(req);
    const body = parse(trustBody.partial(), req.body);
    const before = await prisma.trust.findUnique({ where: { id } });
    if (!before) throw httpError(404, 'NOT_FOUND', 'Trust not found');
    const t = await prisma.$transaction(async (tx) => {
      const row = await tx.trust.update({ where: { id }, data: body, include });
      await audit(req, { action: 'trust.update', entity: 'trust', entityId: id, summary: `Trust "${row.name}" updated`, before: { name: before.name, description: before.description }, after: { name: row.name, description: row.description } }, tx);
      return row;
    });
    invalidateHomeCache();
    return { data: serializeTrust(t) };
  });

  app.delete('/:id', { preHandler: staff }, async (req) => {
    const id = idParam(req);
    const before = await prisma.trust.findUnique({ where: { id } });
    if (!before) throw httpError(404, 'NOT_FOUND', 'Trust not found');
    await prisma.$transaction(async (tx) => {
      await tx.trust.delete({ where: { id } });
      await audit(req, { action: 'trust.delete', entity: 'trust', entityId: id, summary: `Trust "${before.name}" deleted`, before: { name: before.name } }, tx);
    });
    invalidateHomeCache();
    return { data: { ok: true } };
  });

  app.post('/:id/attachments', { preHandler: staff }, async (req, reply) => {
    const id = idParam(req);
    const body = parse(attachmentBody, req.body);
    const trust = await prisma.trust.findUnique({ where: { id } });
    if (!trust) throw httpError(404, 'NOT_FOUND', 'Trust not found');
    await claimFiles(req.user, [body.fileId], 'MEMBERS');
    const t = await prisma.$transaction(async (tx) => {
      await tx.trustAttachment.create({ data: { trustId: id, label: body.label, fileId: body.fileId ?? null, url: body.fileId ? null : body.url ?? null } });
      await audit(req, { action: 'trust.attachment_add', entity: 'trust', entityId: id, summary: `Attachment "${body.label}" added to "${trust.name}"`, after: { label: body.label, fileId: body.fileId, url: body.url } }, tx);
      return tx.trust.findUniqueOrThrow({ where: { id }, include });
    });
    invalidateHomeCache();
    return reply.status(201).send({ data: serializeTrust(t) });
  });

  app.delete('/:id/attachments/:attId', { preHandler: staff }, async (req) => {
    const id = idParam(req);
    const attId = idParam(req, 'attId');
    const att = await prisma.trustAttachment.findFirst({ where: { id: attId, trustId: id } });
    if (!att) throw httpError(404, 'NOT_FOUND', 'Attachment not found');
    const t = await prisma.$transaction(async (tx) => {
      await tx.trustAttachment.delete({ where: { id: attId } });
      await audit(req, { action: 'trust.attachment_remove', entity: 'trust', entityId: id, summary: `Attachment "${att.label}" removed`, before: { label: att.label, fileId: att.fileId, url: att.url } }, tx);
      return tx.trust.findUniqueOrThrow({ where: { id }, include });
    });
    invalidateHomeCache();
    return { data: serializeTrust(t) };
  });
};
export default routes;
