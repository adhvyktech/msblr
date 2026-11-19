import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import fs from 'node:fs';
import path from 'node:path';
import { bearer, freshIp, login, makeApp } from './helpers';
import { prisma } from '../src/lib/prisma';
import { setSetting } from '../src/lib/settings';
import { invalidatePublicSite } from '../src/modules/public/site';

let app: FastifyInstance;
let admin = '';
let publicFileId = 0;
let highlightFileId = 0;
let strayFileId = 0;
let privateNoticeId = 0;
const created: { events: number[]; highlights: number[]; trusts: number[]; files: number[] } = { events: [], highlights: [], trusts: [], files: [] };

const get = (url: string) => app.inject({ method: 'GET', url, remoteAddress: freshIp() });
const putSetting = (key: string, value: unknown, token = admin) =>
  app.inject({ method: 'PUT', url: `/api/settings/${key}`, headers: bearer(token), payload: { value }, remoteAddress: freshIp() });
const site = (over: Record<string, unknown> = {}) => ({ about: { en: '', hi: '' }, committee: [], showHighlightPhotos: false, ...over });

async function mkFile(kind: string, visibility: 'PUBLIC' | 'MEMBERS' | 'PRIVATE', mime = 'image/png') {
  const rel = `public-site-test-${Math.random().toString(16).slice(2)}.png`;
  const root = path.resolve(process.env.UPLOAD_DIR ?? './uploads-test');
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, rel), Buffer.from('89504e470d0a1a0a', 'hex'));
  const f = await prisma.file.create({ data: { kind, path: rel, mime, size: 8, visibility } });
  created.files.push(f.id);
  return f.id;
}

beforeAll(async () => {
  app = await makeApp();
  admin = (await login(app, '9000000001')).token;
  publicFileId = await mkFile('trust_doc', 'PUBLIC');
  highlightFileId = await mkFile('highlight', 'MEMBERS');
  strayFileId = await mkFile('highlight', 'MEMBERS');
  privateNoticeId = await mkFile('document', 'PRIVATE', 'application/pdf');
  const ev = await prisma.event.create({ data: { title: 'PS Test Event', kind: 'SOCIAL', startsAt: new Date(Date.now() + 5 * 86400_000), venue: 'Hall', noticeFileId: privateNoticeId, status: 'PUBLISHED' } });
  const draft = await prisma.event.create({ data: { title: 'PS Draft Event', kind: 'SOCIAL', startsAt: new Date(Date.now() + 6 * 86400_000), status: 'DRAFT' } });
  created.events.push(ev.id, draft.id);
  const h = await prisma.highlight.create({ data: { title: 'PS Test Highlight', summary: 'Nice day', mediaFileIds: [highlightFileId], status: 'PUBLISHED' } });
  created.highlights.push(h.id);
  const t = await prisma.trust.create({
    data: { name: 'PS Test Trust', description: 'Aid', attachments: { create: [{ label: 'Public PDF', fileId: publicFileId }, { label: 'Private doc', fileId: privateNoticeId }, { label: 'Website', url: 'https://example.org/x' }] } },
  });
  created.trusts.push(t.id);
  await setSetting('publicSite', site({ about: { en: 'About EN', hi: 'About HI' }, committee: [{ name: 'A. Person', role: 'President' }] }));
  invalidatePublicSite();
});

afterAll(async () => {
  await setSetting('publicSite', site());
  invalidatePublicSite();
  await prisma.highlight.deleteMany({ where: { id: { in: created.highlights } } });
  await prisma.event.deleteMany({ where: { id: { in: created.events } } });
  await prisma.trust.deleteMany({ where: { id: { in: created.trusts } } });
  await prisma.file.deleteMany({ where: { id: { in: created.files } } });
  await app.close();
});

describe('GET /api/public/site', () => {
  it('works without authentication and returns the expected shape', async () => {
    const res = await get('/api/public/site');
    expect(res.statusCode).toBe(200);
    const d = res.json().data;
    expect(d.sabha.name).toBeTruthy();
    expect(d.about).toEqual({ en: 'About EN', hi: 'About HI' });
    expect(d.committee).toEqual([{ name: 'A. Person', role: 'President', roleHi: '', photoUrl: null }]);
    expect(d.stats.activeFamilies).toBeGreaterThan(0);
    const titles = d.upcomingEvents.map((e: { title: string }) => e.title);
    expect(titles).toContain('PS Test Event');
    expect(titles).not.toContain('PS Draft Event');
    expect(d.upcomingEvents.length).toBeLessThanOrEqual(6);
  });

  it('leaks no member data (mobiles, emails, names of members)', async () => {
    const body = (await get('/api/public/site')).body;
    expect(body).not.toMatch(/\b[6-9]\d{9}\b/);
    const people = await prisma.person.findMany({ select: { name: true }, take: 50 });
    for (const p of people) expect(body).not.toContain(p.name);
    const emails = await prisma.person.findMany({ where: { email: { not: null } }, select: { email: true } });
    for (const e of emails) expect(body).not.toContain(e.email!);
  });

  it('only exposes public notice files and public/URL trust attachments', async () => {
    const d = (await get('/api/public/site')).json().data;
    expect(d.upcomingEvents.find((e: { title: string }) => e.title === 'PS Test Event').noticeUrl).toBeNull();
    const trust = d.trusts.find((x: { name: string }) => x.name === 'PS Test Trust');
    expect(trust.attachments.map((a: { label: string }) => a.label).sort()).toEqual(['Public PDF', 'Website']);
  });

  it('hides highlight media by default and shows it when the setting is on', async () => {
    let d = (await get('/api/public/site')).json().data;
    expect(d.highlights.find((h: { title: string }) => h.title === 'PS Test Highlight').media).toEqual([]);
    expect((await putSetting('publicSite', site({ showHighlightPhotos: true }))).statusCode).toBe(200);
    d = (await get('/api/public/site')).json().data;
    expect(d.highlights.find((h: { title: string }) => h.title === 'PS Test Highlight').media).toEqual([`/files/${highlightFileId}`]);
  });

  it('serves highlight files anonymously only when enabled, and only those files', async () => {
    await putSetting('publicSite', site());
    expect((await get(`/files/${highlightFileId}`)).statusCode).toBe(401);
    await putSetting('publicSite', site({ showHighlightPhotos: true }));
    expect((await get(`/files/${highlightFileId}`)).statusCode).toBe(200);
    expect((await get(`/files/${strayFileId}`)).statusCode).toBe(401); // not in any highlight
    expect((await get(`/files/${privateNoticeId}`)).statusCode).toBe(401);
  });
});

describe('publicSite setting validation', () => {
  it('is returned with defaults by GET /api/settings', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/settings', headers: bearer(admin), remoteAddress: freshIp() });
    expect(res.json().data.publicSite).toHaveProperty('committee');
    expect(res.json().data.publicSite).toHaveProperty('showHighlightPhotos');
  });
  it('rejects bad input', async () => {
    expect((await putSetting('publicSite', site({ committee: [{ name: '', role: 'x' }] }))).statusCode).toBe(400);
    expect((await putSetting('publicSite', site({ showHighlightPhotos: 'yes' }))).statusCode).toBe(400);
    expect((await putSetting('publicSite', site({ mapsUrl: 'javascript:alert(1)' }))).statusCode).toBe(400);
    expect((await putSetting('publicSite', site({ committee: [{ name: 'X', role: 'Y', photoFileId: 99999999 }] }))).statusCode).toBe(400);
  });
  it('requires settings.edit and makes committee photos PUBLIC', async () => {
    const finance = (await login(app, '9000000002')).token;
    expect((await putSetting('publicSite', site(), finance)).statusCode).toBe(403);
    const photo = await mkFile('photo', 'PRIVATE');
    const ok = await putSetting('publicSite', site({ committee: [{ name: 'B', role: 'Secretary', photoFileId: photo }], mapsUrl: 'https://maps.google.com/?q=x' }));
    expect(ok.statusCode).toBe(200);
    expect((await prisma.file.findUniqueOrThrow({ where: { id: photo } })).visibility).toBe('PUBLIC');
    expect((await get(`/files/${photo}`)).statusCode).toBe(200);
  });
});
