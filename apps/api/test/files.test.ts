import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import sharp from 'sharp';
import { makeApp, login, bearer, multipart, freshIp } from './helpers';
import { prisma } from '../src/lib/prisma';

let app: FastifyInstance;
let head: string, member: string, finance: string, admin: string, adMgr: string;
beforeAll(async () => {
  app = await makeApp();
  head = (await login(app, '9845012345')).token;
  member = (await login(app, '9900045678')).token;
  finance = (await login(app, '9000000002')).token;
  admin = (await login(app, '9000000001')).token;
  adMgr = (await login(app, '9000000004')).token;
});
afterAll(async () => {
  await app.close();
});

const png = (w = 40, h = 40) => sharp({ create: { width: w, height: h, channels: 3, background: '#B4532A' } }).png().toBuffer();
const upload = (token: string | null, fields: Record<string, string>, data: Buffer, mime = 'image/png', filename = 'x.png') => {
  const m = multipart(fields, { name: 'file', filename, mime, data });
  return app.inject({
    method: 'POST',
    url: '/api/files',
    payload: m.payload,
    headers: { ...m.headers, ...(token ? bearer(token) : {}) },
    remoteAddress: freshIp(),
  });
};

describe('uploads', () => {
  it('stores an image and returns id + url', async () => {
    const r = await upload(head, { kind: 'photo', visibility: 'MEMBERS' }, await png());
    expect(r.statusCode).toBe(200);
    const d = r.json().data;
    expect(d.url).toBe(`/files/${d.id}`);
    const row = await prisma.file.findUniqueOrThrow({ where: { id: d.id } });
    expect(row.path).toMatch(/^\d{4}\/\d{2}\/[0-9a-f-]{36}\.png$/);
  });

  it('requires auth except anonymous photo/document uploads (forced PRIVATE)', async () => {
    const proof = await upload(null, { kind: 'payment_proof' }, await png());
    expect(proof.statusCode).toBe(401);
    const anon = await upload(null, { kind: 'photo', visibility: 'PUBLIC' }, await png());
    expect(anon.statusCode).toBe(200);
    expect(anon.json().data.visibility).toBe('PRIVATE');
  });

  it('validates kind/visibility, type, size and content', async () => {
    expect((await upload(head, { kind: 'bogus' }, await png())).statusCode).toBe(400);
    expect((await upload(head, { kind: 'photo' }, Buffer.from('hello'), 'text/plain', 'a.txt')).statusCode).toBe(415);
    expect((await upload(head, { kind: 'photo' }, Buffer.from('not really a png'), 'image/png')).statusCode).toBe(415);
    const big = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(5.5 * 1024 * 1024)]);
    const r = await upload(head, { kind: 'photo' }, big);
    expect(r.statusCode).toBe(413);
    expect(r.json().error.code).toBe('FILE_TOO_LARGE');
    const bigPdf = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(10.5 * 1024 * 1024)]);
    expect((await upload(head, { kind: 'document' }, bigPdf, 'application/pdf', 'a.pdf')).statusCode).toBe(413);
    const pdf = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(1024)]);
    expect((await upload(head, { kind: 'document' }, pdf, 'application/pdf', 'a.pdf')).statusCode).toBe(200);
    const noFile = multipart({ kind: 'photo' });
    const nf = await app.inject({
      method: 'POST',
      url: '/api/files',
      payload: noFile.payload,
      headers: { ...noFile.headers, ...bearer(head) },
      remoteAddress: freshIp(),
    });
    expect(nf.statusCode).toBe(400);
  });

  it('strips EXIF and downsizes images larger than 2000px', async () => {
    const withExif = await sharp({ create: { width: 3000, height: 1200, channels: 3, background: '#2F6B4F' } })
      .withExif({ IFD0: { Copyright: 'secret-owner', Make: 'CamCo' } })
      .jpeg()
      .toBuffer();
    expect((await sharp(withExif).metadata()).exif).toBeTruthy();
    const r = await upload(head, { kind: 'photo', visibility: 'MEMBERS' }, withExif, 'image/jpeg', 'p.jpg');
    expect(r.statusCode).toBe(200);
    const got = await app.inject({ method: 'GET', url: r.json().data.url, headers: bearer(head) });
    const meta = await sharp(got.rawPayload).metadata();
    expect(meta.width).toBe(2000);
    expect(meta.height).toBe(800);
    expect(meta.exif).toBeUndefined();
  });

  it('only staff can create PUBLIC files', async () => {
    expect((await upload(head, { kind: 'photo', visibility: 'PUBLIC' }, await png())).statusCode).toBe(403);
    expect((await upload(admin, { kind: 'banner', visibility: 'PUBLIC' }, await png())).statusCode).toBe(200);
  });
});

describe('visibility checks on GET /files/:id', () => {
  it('PUBLIC: anyone', async () => {
    const id = (await upload(admin, { kind: 'banner', visibility: 'PUBLIC' }, await png())).json().data.id;
    const r = await app.inject({ method: 'GET', url: `/files/${id}` });
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-type']).toBe('image/png');
    expect(r.headers['x-content-type-options']).toBe('nosniff');
  });

  it('MEMBERS: any logged-in user via header or ?t=, not anonymous', async () => {
    const id = (await upload(head, { kind: 'photo', visibility: 'MEMBERS' }, await png())).json().data.id;
    expect((await app.inject({ method: 'GET', url: `/files/${id}` })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: `/files/${id}`, headers: bearer(member) })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: `/files/${id}?t=${member}` })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: `/files/${id}?t=garbage` })).statusCode).toBe(401);
  });

  it('PRIVATE: owner and staff with a relevant perm only', async () => {
    const id = (await upload(head, { kind: 'payment_proof', visibility: 'PRIVATE' }, await png())).json().data.id;
    const get = (t?: string) => app.inject({ method: 'GET', url: `/files/${id}`, headers: t ? bearer(t) : {} });
    expect((await get()).statusCode).toBe(401);
    expect((await get(head)).statusCode).toBe(200); // owner
    expect((await get(member)).statusCode).toBe(403); // other family member
    expect((await get(finance)).statusCode).toBe(200); // payments.verify
    expect((await get(adMgr)).statusCode).toBe(403); // staff, wrong perm
  });

  it('404 for unknown or malformed ids; delete only own uploads', async () => {
    expect((await app.inject({ method: 'GET', url: '/files/999999', headers: bearer(head) })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/files/abc', headers: bearer(head) })).statusCode).toBe(404);
    const id = (await upload(head, { kind: 'photo', visibility: 'MEMBERS' }, await png())).json().data.id;
    expect((await app.inject({ method: 'DELETE', url: `/api/files/${id}`, headers: bearer(member) })).statusCode).toBe(403);
    expect((await app.inject({ method: 'DELETE', url: `/api/files/${id}`, headers: bearer(head) })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: `/files/${id}`, headers: bearer(head) })).statusCode).toBe(404);
  });
});
