import fs from 'node:fs';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { FILE_KINDS, FILE_VISIBILITIES } from '@msblr/shared';
import { prisma } from '../../lib/prisma';
import { httpError } from '../../lib/errors';
import { parse } from '../../lib/parse';
import { audit } from '../../lib/audit';
import { authenticate, optionalAuth } from '../../lib/auth';
import { absPath, canAccessFile, fileUrl, storeFile } from '../../lib/files';

const fieldsSchema = z.object({
  kind: z.enum(FILE_KINDS),
  visibility: z.enum(FILE_VISIBILITIES).default('PRIVATE'),
});

/** POST /api/files — multipart: file, kind, visibility. Anonymous uploads (registration form) are limited to photo/document, PRIVATE. */
const routes: FastifyPluginAsync = async (app) => {
  app.post('/', { config: { rateLimit: { max: 40, timeWindow: '1 hour' } } }, async (req) => {
    const user = await optionalAuth(req);
    if (!req.isMultipart()) throw httpError(400, 'NOT_MULTIPART', 'Send the file as multipart/form-data.');
    const fields: Record<string, string> = {};
    let file: { buffer: Buffer; filename: string; mime: string } | null = null;
    for await (const part of req.parts()) {
      if (part.type === 'file') {
        if (file) { await part.toBuffer(); continue; }
        file = { buffer: await part.toBuffer(), filename: part.filename, mime: part.mimetype };
        if (part.file.truncated) throw httpError(413, 'FILE_TOO_LARGE', 'This file is too large.');
      } else if (typeof part.value === 'string') {
        fields[part.fieldname] = part.value;
      }
    }
    if (!file) throw httpError(400, 'NO_FILE', 'Please choose a file to upload.');
    const f = parse(fieldsSchema, fields);
    if (!user) {
      if (f.kind !== 'photo' && f.kind !== 'document') throw httpError(401, 'UNAUTHENTICATED', 'Please sign in to upload this file.');
      f.visibility = 'PRIVATE';
    } else if (f.visibility === 'PUBLIC' && !user.isStaff) {
      throw httpError(403, 'FORBIDDEN', 'Only staff can publish public files.');
    }
    const row = await storeFile({ ...file, kind: f.kind, visibility: f.visibility, ownerUserId: user?.id ?? null });
    await audit(req, { action: 'file.upload', entity: 'file', entityId: row.id, summary: `${f.kind} uploaded (${row.mime}, ${row.size} bytes)` });
    return { data: { id: row.id, url: fileUrl(row.id), mime: row.mime, size: row.size, kind: row.kind, visibility: row.visibility } };
  });

  app.delete('/:id', { preHandler: authenticate }, async (req) => {
    const id = Number((req.params as { id: string }).id);
    const row = Number.isInteger(id) ? await prisma.file.findUnique({ where: { id } }) : null;
    if (!row) throw httpError(404, 'NOT_FOUND', 'File not found');
    if (row.ownerUserId !== req.user.id) throw httpError(403, 'FORBIDDEN', 'You can only delete your own uploads.');
    const used = (await prisma.person.count({ where: { photoFileId: id } })) + (await prisma.registrationDocument.count({ where: { fileId: id } }));
    if (used) throw httpError(409, 'IN_USE', 'This file is in use and cannot be deleted.');
    await prisma.file.delete({ where: { id } });
    await fs.promises.rm(absPath(row), { force: true });
    await audit(req, { action: 'file.delete', entity: 'file', entityId: id, summary: 'File deleted' });
    return { data: { ok: true } };
  });
};
export default routes;

/** GET /files/:id (mounted at the server root, not under /api) */
export const rootRoutes: FastifyPluginAsync = async (app) => {
  app.get('/files/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const row = Number.isInteger(id) && id > 0 ? await prisma.file.findUnique({ where: { id } }) : null;
    if (!row) throw httpError(404, 'NOT_FOUND', 'File not found');
    const user = await optionalAuth(req);
    if (!(await canAccessFile(row, user))) {
      if (!user) throw httpError(401, 'UNAUTHENTICATED', 'Please sign in to view this file.');
      throw httpError(403, 'FORBIDDEN', 'You do not have access to this file.');
    }
    const p = absPath(row);
    let stat: fs.Stats;
    try { stat = await fs.promises.stat(p); } catch { throw httpError(404, 'NOT_FOUND', 'File not found'); }
    const dl = (req.query as Record<string, unknown>).download !== undefined;
    reply
      .header('Content-Type', row.mime)
      .header('Content-Length', stat.size)
      .header('X-Content-Type-Options', 'nosniff')
      .header('Cache-Control', row.visibility === 'PUBLIC' ? 'public, max-age=86400' : 'private, max-age=600')
      .header('Content-Disposition', `${dl ? 'attachment' : 'inline'}; filename="${(row.originalName ?? `file-${row.id}`).replace(/"/g, '')}"`);
    return reply.send(fs.createReadStream(p));
  });
};
