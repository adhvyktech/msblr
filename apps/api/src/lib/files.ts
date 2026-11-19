import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import type { File as FileRow, FileVisibility } from '@prisma/client';
import { env } from './env';
import { prisma } from './prisma';
import { httpError } from './errors';
import type { AuthUser } from './auth';

const MB = 1024 * 1024;
export const FILE_LIMITS = {
  image: { max: 5 * MB, mimes: { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' } as Record<string, string> },
  pdf: { max: 10 * MB, mimes: { 'application/pdf': 'pdf' } as Record<string, string> },
  video: { max: 20 * MB, mimes: { 'video/mp4': 'mp4' } as Record<string, string> },
};
export const MAX_UPLOAD_BYTES = 20 * MB;
const MAX_IMAGE_DIM = 2000;

export const uploadRoot = () => path.resolve(env.UPLOAD_DIR);

/** Public URL path of a stored file (served by GET /files/:id). */
export const fileUrl = (id: number) => `/files/${id}`;

/** Perms that count as "relevant" for viewing PRIVATE files of a given kind (besides the owner). */
export const KIND_VIEW_PERMS: Record<string, string[]> = {
  photo: ['members.view_private', 'registrations.approve', 'members.edit'],
  document: ['members.view_private', 'registrations.approve', 'members.edit'],
  payment_proof: ['payments.verify', 'receipts.view'],
  receipt_pdf: ['receipts.view', 'payments.verify'],
  ad_creative: ['ads.manage', 'ads.approve'],
  banner: ['banners.edit'],
  highlight: ['highlights.post'],
  trust_doc: ['trusts.edit'],
  logo: ['settings.edit'],
  business_photo: ['businesses.approve'],
};

/**
 * Extra access rules other modules can register (e.g. "members of family X may see receipt PDF Y").
 * Return true to allow. Called only for PRIVATE files when the built-in rules deny.
 */
export type FileAccessRule = (file: FileRow, user: AuthUser) => Promise<boolean> | boolean;
const rules: FileAccessRule[] = [];
export const registerFileAccessRule = (r: FileAccessRule) => { rules.push(r); };

export async function canAccessFile(file: FileRow, user: AuthUser | undefined): Promise<boolean> {
  if (file.visibility === 'PUBLIC') return true;
  if (!user) return false;
  if (file.visibility === 'MEMBERS') return true;
  if (file.ownerUserId === user.id) return true;
  const need = KIND_VIEW_PERMS[file.kind] ?? [];
  if (need.some((p) => user.perms.includes(p))) return true;
  for (const r of rules) if (await r(file, user)) return true;
  return false;
}

function sniff(buf: Buffer, mime: string): boolean {
  if (mime === 'application/pdf') return buf.subarray(0, 5).toString('latin1') === '%PDF-';
  if (mime === 'video/mp4') return buf.subarray(4, 8).toString('latin1') === 'ftyp';
  if (mime === 'image/png') return buf[0] === 0x89 && buf.subarray(1, 4).toString('latin1') === 'PNG';
  if (mime === 'image/jpeg') return buf[0] === 0xff && buf[1] === 0xd8;
  if (mime === 'image/webp') return buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP';
  return false;
}

export interface StoreInput {
  buffer: Buffer;
  filename?: string;
  mime: string;
  kind: string;
  visibility?: FileVisibility;
  ownerUserId?: number | null;
}

/** Validates size/mime, strips EXIF + downsizes images (>2000px), writes to disk, creates File row. */
export async function storeFile(input: StoreInput): Promise<FileRow> {
  const mime = input.mime.toLowerCase();
  const group = (Object.keys(FILE_LIMITS) as (keyof typeof FILE_LIMITS)[]).find((g) => mime in FILE_LIMITS[g].mimes);
  if (!group) throw httpError(415, 'UNSUPPORTED_TYPE', 'Only JPG, PNG, WebP images, PDF documents and MP4 videos are allowed.');
  const lim = FILE_LIMITS[group];
  let buf = input.buffer;
  if (buf.length === 0) throw httpError(400, 'EMPTY_FILE', 'The file is empty.');
  if (buf.length > lim.max) {
    throw httpError(413, 'FILE_TOO_LARGE', `This file is too large. Maximum size is ${lim.max / MB} MB.`);
  }
  if (!sniff(buf, mime)) throw httpError(415, 'UNSUPPORTED_TYPE', 'The file content does not match its type.');
  let outMime = mime;
  if (group === 'image') {
    try {
      // rotate() applies EXIF orientation; sharp drops all metadata on re-encode.
      let pipe = sharp(buf, { failOn: 'error' }).rotate().resize({
        width: MAX_IMAGE_DIM,
        height: MAX_IMAGE_DIM,
        fit: 'inside',
        withoutEnlargement: true,
      });
      pipe = mime === 'image/png' ? pipe.png() : mime === 'image/webp' ? pipe.webp({ quality: 85 }) : pipe.jpeg({ quality: 85, mozjpeg: true });
      buf = await pipe.toBuffer();
    } catch {
      throw httpError(400, 'INVALID_IMAGE', 'This image could not be read. Please upload a different file.');
    }
  }
  const ext = lim.mimes[outMime]!;
  const now = new Date();
  const rel = path.posix.join(String(now.getFullYear()), String(now.getMonth() + 1).padStart(2, '0'), `${crypto.randomUUID()}.${ext}`);
  const abs = path.join(uploadRoot(), rel);
  await fs.promises.mkdir(path.dirname(abs), { recursive: true });
  await fs.promises.writeFile(abs, buf);
  return prisma.file.create({
    data: {
      ownerUserId: input.ownerUserId ?? null,
      kind: input.kind,
      path: rel,
      originalName: input.filename?.replace(/[^\w.\- ()]/g, '_').slice(0, 200) || null,
      mime: outMime,
      size: buf.length,
      visibility: input.visibility ?? 'PRIVATE',
    },
  });
}

export function absPath(file: Pick<FileRow, 'path'>): string {
  const root = uploadRoot();
  const abs = path.resolve(root, file.path);
  if (!abs.startsWith(root)) throw httpError(400, 'BAD_PATH', 'Invalid file path');
  return abs;
}

/** Read a stored file's bytes (e.g. to embed a logo in a PDF). */
export const readStored = (file: Pick<FileRow, 'path'>) => fs.promises.readFile(absPath(file));
