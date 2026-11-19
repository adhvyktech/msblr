import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import sharp from 'sharp';
import { login, bearer, freshIp, multipart } from './helpers';
import { prisma } from '../src/lib/prisma';
import { buildApp } from '../src/server';

let app: FastifyInstance;
let head: string; // Ramesh Rathi, head, MSB-0412
let viewer: string; // Sunita Rathi, activated family member
let admin: string; // super admin
let finance: string; // no members.* perms
let headFamilyId: number;
let ramesh: { id: number };
let sunita: { id: number };
let priya: { id: number };

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
  [head, viewer, admin, finance] = await Promise.all(['9845012345', '9900045678', '9000000001', '9000000002'].map(async (m) => (await login(app, m)).token)) as [string, string, string, string];
  const fam = await prisma.family.findUniqueOrThrow({ where: { membershipNo: 'MSB-0412' } });
  headFamilyId = fam.id;
  ramesh = await prisma.person.findFirstOrThrow({ where: { familyId: fam.id, name: 'Ramesh Rathi' } });
  sunita = await prisma.person.findFirstOrThrow({ where: { familyId: fam.id, name: 'Sunita Rathi' } });
  priya = await prisma.person.findFirstOrThrow({ where: { familyId: fam.id, name: 'Priya Rathi' } });
});
afterAll(async () => {
  await app.close();
});

const call = (method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, token?: string, payload?: unknown) =>
  app.inject({ method, url, headers: token ? bearer(token) : {}, payload: payload as object | undefined, remoteAddress: freshIp() });
const png = () => sharp({ create: { width: 20, height: 20, channels: 3, background: '#C2501E' } }).png().toBuffer();
async function uploadAnon(kind: 'photo' | 'document') {
  const m = multipart({ kind }, { name: 'file', filename: 'x.png', mime: 'image/png', data: await png() });
  const r = await app.inject({ method: 'POST', url: '/api/files', payload: m.payload, headers: m.headers, remoteAddress: freshIp() });
  expect(r.statusCode).toBe(200);
  return r.json().data.id as number;
}
const maxNo = async () => {
  const all = await prisma.family.findMany({ where: { membershipNo: { not: null } }, select: { membershipNo: true } });
  return Math.max(...all.map((f) => Number(f.membershipNo!.slice(4))));
};

describe('directory (member-facing)', () => {
  it('requires login', async () => {
    expect((await call('GET', '/api/members')).statusCode).toBe(401);
    expect((await call('GET', `/api/members/${headFamilyId}`)).statusCode).toBe(401);
  });

  it('lists only ACTIVE families, paginated, head + member count', async () => {
    const r = await call('GET', '/api/members?pageSize=10', finance);
    expect(r.statusCode).toBe(200);
    const b = r.json();
    expect(b.data).toHaveLength(10);
    expect(b.total).toBe(await prisma.family.count({ where: { status: 'ACTIVE' } }));
    expect(b.pageSize).toBe(10);
    for (const f of b.data) {
      expect(f.membershipNo).toMatch(/^MSB-\d{4}$/);
      expect(f.head.isHead).toBe(true);
      expect(f.memberCount).toBeGreaterThanOrEqual(1);
    }
    const p2 = (await call('GET', '/api/members?pageSize=10&page=2', finance)).json();
    expect(p2.data[0].id).not.toBe(b.data[0].id);
  });

  it('never leaks hidden fields in list or detail, and lists them in hidden[]', async () => {
    const list = (await call('GET', '/api/members?q=MSB-0412', finance)).json();
    expect(list.total).toBe(1);
    const h = list.data[0].head;
    expect(h.name).toBe('Ramesh Rathi');
    expect(h.email).toBeNull();
    expect(h.dob).toBeNull();
    expect(h.hidden).toEqual(expect.arrayContaining(['email', 'dob', 'address', 'anniversary']));
    expect(h.mobile).toBe('9845012345'); // visible by default
    expect(JSON.stringify(list)).not.toContain('ramesh@example.com');

    // whatsapp is its own privacy field (visible by default): the head hides it too
    expect((await call('PUT', `/api/family/privacy/${sunita.id}`, head, { fields: { whatsapp: false } })).statusCode).toBe(200);
    const det = (await call('GET', `/api/members/${headFamilyId}`, finance)).json().data;
    const s = det.persons.find((p: { name: string }) => p.name === 'Sunita Rathi');
    expect(s.mobile).toBeNull();
    expect(s.whatsapp).toBeNull();
    expect(s.photoUrl).toBeNull();
    expect(s.hidden).toEqual(expect.arrayContaining(['mobile', 'whatsapp', 'photo']));
    expect(JSON.stringify(det)).not.toContain('9900045678');
  });

  it('own family and staff with members.view_private see everything', async () => {
    for (const t of [head, viewer, admin]) {
      const det = (await call('GET', `/api/members/${headFamilyId}`, t)).json().data;
      const s = det.persons.find((p: { name: string }) => p.name === 'Sunita Rathi');
      expect(s.mobile).toBe('9900045678');
      expect(s.hidden).toEqual([]);
      expect(det.persons.find((p: { isHead: boolean }) => p.isHead).dob).toBeTruthy();
    }
  });

  it('search does not match hidden or non-searchable data (mobile, email)', async () => {
    expect((await call('GET', '/api/members?q=9900045678', finance)).json().total).toBe(0); // Sunita's hidden mobile
    expect((await call('GET', '/api/members?q=9845012345', finance)).json().total).toBe(0); // even visible mobiles are not searchable
    expect((await call('GET', '/api/members?q=ramesh@example.com', finance)).json().total).toBe(0);
    expect((await call('GET', '/api/members?q=sunita%20rathi', finance)).json().data.some((f: { id: number }) => f.id === headFamilyId)).toBe(true);
    expect((await call('GET', '/api/members?q=chickpet', finance)).json().total).toBeGreaterThan(0); // zone/area
  });

  it('filters by zone, area and business; business hidden by the owner is not searchable', async () => {
    const zones = (await call('GET', '/api/members/zones')).json().data;
    expect(zones.length).toBe(5);
    const z1 = zones.find((z: { name: string }) => z.name.startsWith('Zone 1')).id;
    const byZone = (await call('GET', `/api/members?zoneId=${z1}&pageSize=100`, finance)).json();
    expect(byZone.data.every((f: { zoneId: number }) => f.zoneId === z1)).toBe(true);
    expect((await call('GET', '/api/members?area=Chickpet', finance)).json().data.some((f: { id: number }) => f.id === headFamilyId)).toBe(true);

    const biz = (await call('GET', '/api/members?hasBusiness=true&pageSize=100', finance)).json();
    expect(biz.data.length).toBeGreaterThan(0);
    expect(biz.data.some((f: { id: number }) => f.id === headFamilyId)).toBe(true);
    expect((await call('GET', '/api/members?q=Rathi%20Textiles', finance)).json().total).toBe(1);

    // owner hides "business" -> disappears from business search and filter
    const bz = await prisma.business.findFirstOrThrow({ where: { name: 'Rathi Textiles' } });
    expect((await call('PUT', `/api/family/privacy/${bz.personId}`, head, { fields: { business: false } })).statusCode).toBe(200);
    expect((await call('GET', '/api/members?q=Textiles', finance)).json().total).toBe(0);
    const hid = (await call('GET', '/api/members?hasBusiness=true&pageSize=100', finance)).json();
    expect(hid.data.some((f: { id: number }) => f.id === headFamilyId)).toBe(false);
    expect((await call('PUT', `/api/family/privacy/${bz.personId}`, head, { fields: { business: true } })).statusCode).toBe(200);
  });

  it('detail: 404 for non-active other families, 400 for bad ids', async () => {
    const pending = await prisma.family.findFirstOrThrow({ where: { status: 'PENDING' } });
    expect((await call('GET', `/api/members/${pending.id}`, finance)).statusCode).toBe(404);
    expect((await call('GET', `/api/members/${pending.id}`, admin)).statusCode).toBe(200); // staff with view_private
    expect((await call('GET', '/api/members/abc', finance)).statusCode).toBe(400);
    expect((await call('GET', '/api/members/9999999', finance)).statusCode).toBe(404);
  });
});

describe('staff member administration', () => {
  it('401 / 403 guards', async () => {
    expect((await call('GET', '/api/members/admin')).statusCode).toBe(401);
    for (const t of [head, viewer, finance]) {
      expect((await call('GET', '/api/members/admin', t)).statusCode).toBe(403);
      expect((await call('GET', `/api/members/admin/${headFamilyId}`, t)).statusCode).toBe(403);
      expect((await call('PATCH', `/api/members/admin/${headFamilyId}`, t, { area: 'X' })).statusCode).toBe(403);
      expect((await call('GET', '/api/members/admin/export', t)).statusCode).toBe(403);
    }
  });

  it('lists all statuses with full data and filters', async () => {
    const all = (await call('GET', '/api/members/admin?pageSize=100', admin)).json();
    expect(all.total).toBe(await prisma.family.count());
    const rathi = all.data.find((f: { id: number }) => f.id === headFamilyId);
    expect(rathi.persons.find((p: { name: string }) => p.name === 'Sunita Rathi').mobile).toBe('9900045678');
    expect(rathi.persons.find((p: { isHead: boolean }) => p.isHead).email).toBeTruthy();
    const pending = (await call('GET', '/api/members/admin?status=PENDING', admin)).json();
    expect(pending.total).toBe(await prisma.family.count({ where: { status: 'PENDING' } }));
    expect(pending.data.every((f: { status: string }) => f.status === 'PENDING')).toBe(true);
    const due = (await call('GET', '/api/members/admin?subscriptionStatus=DUE', admin)).json();
    expect(due.data.every((f: { subscriptionStatus: string }) => f.subscriptionStatus === 'DUE')).toBe(true);
    expect((await call('GET', '/api/members/admin?q=9900045678', admin)).json().total).toBe(1); // staff can search mobile
    expect((await call('GET', '/api/members/admin?status=BOGUS', admin)).statusCode).toBe(400);
    expect((await call('GET', `/api/members/admin/${headFamilyId}`, admin)).json().data.persons.length).toBeGreaterThanOrEqual(4);
    expect((await call('GET', '/api/members/admin/99999', admin)).statusCode).toBe(404);
  });

  it('patches family and person with audit before/after; guards duplicates', async () => {
    const other = await prisma.family.findFirstOrThrow({ where: { status: 'ACTIVE', id: { not: headFamilyId } } });
    const z2 = await prisma.zone.findFirstOrThrow({ where: { name: { startsWith: 'Zone 2' } } });
    const dup = await call('PATCH', `/api/members/admin/${other.id}`, admin, { membershipNo: 'MSB-0412' });
    expect(dup.statusCode).toBe(409);
    expect((await call('PATCH', `/api/members/admin/${other.id}`, admin, { membershipNo: 'bad' })).statusCode).toBe(400);
    expect((await call('PATCH', `/api/members/admin/${other.id}`, admin, { pincode: '12' })).statusCode).toBe(400);
    const r = await call('PATCH', `/api/members/admin/${other.id}`, admin, { area: 'Test Area', zoneId: z2.id, pincode: '560011' });
    expect(r.statusCode).toBe(200);
    expect(r.json().data.area).toBe('Test Area');
    expect(r.json().data.zoneId).toBe(z2.id);
    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: 'family.update', entityId: String(other.id) }, orderBy: { id: 'desc' } });
    expect((log.before as { area: string }).area).toBe(other.area);
    expect((log.after as { area: string }).area).toBe('Test Area');

    const p = await call('PATCH', `/api/members/admin/persons/${priya.id}`, admin, { occupation: 'Designer', education: 'B.Des' });
    expect(p.statusCode).toBe(200);
    expect(p.json().data.occupation).toBe('Designer');
    const plog = await prisma.auditLog.findFirstOrThrow({ where: { action: 'person.update', entityId: String(priya.id) }, orderBy: { id: 'desc' } });
    expect((plog.after as { occupation: string }).occupation).toBe('Designer');
    expect((await call('PATCH', `/api/members/admin/persons/${ramesh.id}`, admin, { relation: 'SON' })).statusCode).toBe(400);
    expect((await call('PATCH', `/api/members/admin/persons/${priya.id}`, admin, { mobile: '9845012345' })).statusCode).toBe(409);
    expect((await call('PATCH', `/api/members/admin/persons/${priya.id}`, admin, { mobile: '12' })).statusCode).toBe(400);
    expect((await call('PATCH', '/api/members/admin/persons/99999', admin, { name: 'Nobody' })).statusCode).toBe(404);
  });

  it('creates a family directly (auto membership no, head login) and validates input', async () => {
    const z = await prisma.zone.findFirstOrThrow();
    const before = await maxNo();
    const body = {
      head: { name: 'Office Entry Head', dob: '1975-04-05', mobile: '8100000011', gender: 'MALE' },
      address: { addressLine: '5 Test Road', area: 'Basavanagudi', pincode: '560004', zoneId: z.id },
      members: [{ name: 'Office Entry Spouse', relation: 'SPOUSE' }],
    };
    const r = await call('POST', '/api/members/admin/families', admin, body);
    expect(r.statusCode).toBe(201);
    const d = r.json().data;
    expect(d.membershipNo).toBe(`MSB-${String(before + 1).padStart(4, '0')}`);
    expect(d.status).toBe('ACTIVE');
    expect(d.persons).toHaveLength(2);
    const u = await prisma.user.findUniqueOrThrow({ where: { mobile: '8100000011' }, include: { roles: { include: { role: true } } } });
    expect(u.roles.map((x) => x.role.name)).toEqual(['head']);
    expect(await prisma.auditLog.count({ where: { action: 'family.create', entityId: String(d.id) } })).toBe(1);
    // duplicate mobile
    expect((await call('POST', '/api/members/admin/families', admin, body)).statusCode).toBe(409);
    expect((await call('POST', '/api/members/admin/families', admin, { ...body, head: { name: 'X' } })).statusCode).toBe(400);
    expect((await call('POST', '/api/members/admin/families', finance, body)).statusCode).toBe(403);
  });

  it('imports a CSV with per-row results; re-import skips existing', async () => {
    const csv = [
      'membershipNo,headName,relation,name,dob,anniversary,mobile,email,zone,address,area',
      'MSB-0901,Imp Head,SELF,Imp Head,1970-01-02,2000-02-03,8100000021,imp@example.com,Zone 2,12 Main Rd,Jayanagar',
      'MSB-0901,Imp Head,SPOUSE,Imp Spouse,15/03/1975,,,,,,',
      'MSB-0901,Imp Head,SON,Imp Son,notadate,,,,,,',
      'MSB-0902,,SELF,,,,,,,,',
      'MSB-0903,Nobody Here,SON,Orphan Son,,,,,,,',
      'bad,Foo,SELF,Foo,,,,,,,',
    ].join('\n');
    const send = async (c: string, t = admin) => {
      const m = multipart({}, { name: 'file', filename: 'import.csv', mime: 'text/csv', data: Buffer.from(c) });
      return app.inject({ method: 'POST', url: '/api/members/admin/import', payload: m.payload, headers: { ...m.headers, ...bearer(t) }, remoteAddress: freshIp() });
    };
    const r = await send(csv);
    expect(r.statusCode).toBe(200);
    const d = r.json().data;
    expect(d.summary.total).toBe(6);
    // MSB-0901 has one bad row (bad date) so the whole family is rejected atomically
    expect(d.results.filter((x: { membershipNo: string; status: string }) => x.membershipNo === 'MSB-0901').every((x: { status: string }) => x.status === 'error')).toBe(true);
    expect(d.summary.errors).toBe(6);
    expect(d.results.find((x: { line: number }) => x.line === 5).message).toMatch(/Name is required/);
    expect(d.results.find((x: { line: number }) => x.line === 6).message).toMatch(/Head of family not found/);

    const good = csv.replace('notadate', '2001-05-06');
    const ok = (await send(good)).json().data;
    expect(ok.results.filter((x: { status: string }) => x.status === 'created')).toHaveLength(3);
    const fam = await prisma.family.findUniqueOrThrow({ where: { membershipNo: 'MSB-0901' }, include: { persons: true, zone: true } });
    expect(fam.persons).toHaveLength(3);
    expect(fam.zone?.name).toMatch(/^Zone 2/);
    expect(fam.persons.find((p) => p.name === 'Imp Spouse')!.dob?.toISOString().slice(0, 10)).toBe('1975-03-15');
    expect(fam.status).toBe('ACTIVE');
    const again = (await send(good)).json().data;
    expect(again.results.filter((x: { status: string }) => x.status === 'skipped').length).toBeGreaterThanOrEqual(2);
    expect((await send('foo,bar\n1,2')).statusCode).toBe(400);
    expect((await send(good, finance)).statusCode).toBe(403);
  });

  it('exports an xlsx workbook', async () => {
    const r = await call('GET', '/api/members/admin/export?status=ACTIVE', admin);
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-type']).toContain('spreadsheetml');
    expect(r.rawPayload.subarray(0, 2).toString()).toBe('PK');
  });
});

describe('family (own family management)', () => {
  it('requires login; own family view for head and viewer with canEdit flag', async () => {
    expect((await call('GET', '/api/family/mine')).statusCode).toBe(401);
    const h = (await call('GET', '/api/family/mine', head)).json().data;
    expect(h.canEdit).toBe(true);
    expect(h.family.membershipNo).toBe('MSB-0412');
    expect(h.persons.length).toBeGreaterThanOrEqual(4);
    const hs = h.persons.find((p: { name: string }) => p.name === 'Sunita Rathi');
    expect(hs.mobile).toBe('9900045678');
    expect(hs.loginStatus).toBe('ACTIVE');
    expect(h.persons.find((p: { name: string }) => p.name === 'Akash Rathi').loginStatus).toBe('REQUESTED');
    expect(h.persons.find((p: { name: string }) => p.name === 'Priya Rathi').loginStatus).toBe('NONE');
    const v = (await call('GET', '/api/family/mine', viewer)).json().data;
    expect(v.canEdit).toBe(false);
    expect(v.persons).toHaveLength(h.persons.length);
    expect((await call('GET', '/api/family/mine', admin)).statusCode).toBe(403); // staff without a family
  });

  it('viewer is read-only', async () => {
    expect((await call('POST', '/api/family/persons', viewer, { name: 'New Person', relation: 'SON' })).statusCode).toBe(403);
    expect((await call('PATCH', `/api/family/persons/${priya.id}`, viewer, { name: 'Priya X' })).statusCode).toBe(403);
    expect((await call('DELETE', `/api/family/persons/${priya.id}`, viewer)).statusCode).toBe(403);
    expect((await call('POST', `/api/family/persons/${priya.id}/activation`, viewer)).statusCode).toBe(403);
    expect((await call('PUT', `/api/family/privacy/${priya.id}`, viewer, { fields: { email: true } })).statusCode).toBe(403);
    expect((await call('GET', `/api/family/privacy/${priya.id}`, viewer)).json().data.editable).toBe(false);
  });

  it('head adds, edits and soft-deletes members; validates; cannot delete head or touch other families', async () => {
    expect((await call('POST', '/api/family/persons', head, { name: 'X', relation: 'SON' })).statusCode).toBe(400);
    expect((await call('POST', '/api/family/persons', head, { name: 'Self Person', relation: 'SELF' })).statusCode).toBe(400);
    expect((await call('POST', '/api/family/persons', head, { name: 'Bad Mobile', relation: 'SON', mobile: '123' })).statusCode).toBe(400);
    expect((await call('POST', '/api/family/persons', finance, { name: 'Not Head', relation: 'SON' })).statusCode).toBe(403);
    const photo = await (async () => {
      const m = multipart({ kind: 'photo' }, { name: 'file', filename: 'p.png', mime: 'image/png', data: await png() });
      const r = await app.inject({ method: 'POST', url: '/api/files', payload: m.payload, headers: { ...m.headers, ...bearer(head) }, remoteAddress: freshIp() });
      return r.json().data.id as number;
    })();
    const c = await call('POST', '/api/family/persons', head, { name: 'Added Grandson', relation: 'GRANDSON', dob: '2015-06-01', photoFileId: photo });
    expect(c.statusCode).toBe(201);
    const pid = c.json().data.id;
    expect(c.json().data.photoUrl).toBe(`/files/${photo}`);
    expect((await prisma.file.findUniqueOrThrow({ where: { id: photo } })).visibility).toBe('MEMBERS');
    expect((await call('PATCH', `/api/family/persons/${pid}`, head, { occupation: 'Student' })).json().data.occupation).toBe('Student');
    expect((await call('PATCH', `/api/family/persons/${ramesh.id}`, head, { relation: 'SON' })).statusCode).toBe(400);
    expect((await call('DELETE', `/api/family/persons/${ramesh.id}`, head)).statusCode).toBe(400);
    const otherPerson = await prisma.person.findFirstOrThrow({ where: { familyId: { not: headFamilyId } } });
    expect((await call('PATCH', `/api/family/persons/${otherPerson.id}`, head, { name: 'Hacked' })).statusCode).toBe(404);
    expect((await call('DELETE', `/api/family/persons/${otherPerson.id}`, head)).statusCode).toBe(404);
    expect(await prisma.auditLog.count({ where: { action: 'person.create', entityId: String(pid) } })).toBe(1);
    expect((await call('DELETE', `/api/family/persons/${pid}`, head)).statusCode).toBe(200);
    expect((await prisma.person.findUniqueOrThrow({ where: { id: pid } })).deletedAt).not.toBeNull();
    const mine = (await call('GET', '/api/family/mine', head)).json().data;
    expect(mine.persons.some((p: { id: number }) => p.id === pid)).toBe(false);
    // another user's file cannot be attached
    const foreign = await (async () => {
      const m = multipart({ kind: 'photo' }, { name: 'file', filename: 'p.png', mime: 'image/png', data: await png() });
      const r = await app.inject({ method: 'POST', url: '/api/files', payload: m.payload, headers: { ...m.headers, ...bearer(admin) }, remoteAddress: freshIp() });
      return r.json().data.id as number;
    })();
    expect((await call('POST', '/api/family/persons', head, { name: 'Steal Photo', relation: 'SON', photoFileId: foreign })).statusCode).toBe(400);
  });

  it('privacy: head edits any family person, results show in the directory', async () => {
    const g = (await call('GET', `/api/family/privacy/${priya.id}`, head)).json().data;
    expect(g.editable).toBe(true);
    expect(g.fields).toMatchObject({ mobile: true, email: false, dob: false });
    const put = await call('PUT', `/api/family/privacy/${priya.id}`, head, { fields: { dob: true, mobile: false } });
    expect(put.statusCode).toBe(200);
    expect(put.json().data.fields).toMatchObject({ dob: true, mobile: false, email: false });
    const det = (await call('GET', `/api/members/${headFamilyId}`, finance)).json().data.persons.find((p: { name: string }) => p.name === 'Priya Rathi');
    expect(det.dob).toBeTruthy();
    expect(det.mobile).toBeNull();
    expect(det.hidden).toContain('mobile');
    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: 'privacy.update', entityId: String(priya.id) }, orderBy: { id: 'desc' } });
    expect((log.before as { dob: boolean }).dob).toBe(false);
    expect((log.after as { dob: boolean }).dob).toBe(true);
    expect((await call('PUT', `/api/family/privacy/${priya.id}`, head, { fields: { password: true } })).statusCode).toBe(400);
    expect((await call('PUT', `/api/family/privacy/${priya.id}`, head, { fields: { dob: 'yes' } })).statusCode).toBe(400);
    const other = await prisma.person.findFirstOrThrow({ where: { familyId: { not: headFamilyId } } });
    expect((await call('PUT', `/api/family/privacy/${other.id}`, head, { fields: { dob: true } })).statusCode).toBe(404);
    expect((await call('GET', `/api/family/privacy/${other.id}`, head)).statusCode).toBe(404);
    await call('PUT', `/api/family/privacy/${priya.id}`, head, { fields: { dob: false, mobile: true } });
  });

  it('activation: validation, duplicate rules, approve creates a working viewer login, withdraw kills it', async () => {
    // no mobile
    await call('PATCH', `/api/family/persons/${priya.id}`, head, { mobile: null });
    expect((await call('POST', `/api/family/persons/${priya.id}/activation`, head)).statusCode).toBe(400);
    // mobile that already belongs to a login
    await call('PATCH', `/api/family/persons/${priya.id}`, head, { mobile: '9845012345' });
    expect((await call('POST', `/api/family/persons/${priya.id}/activation`, head)).statusCode).toBe(409);
    await call('PATCH', `/api/family/persons/${priya.id}`, head, { mobile: '8100000031' });
    // head cannot be activated; already-active member; already-requested member
    expect((await call('POST', `/api/family/persons/${ramesh.id}/activation`, head)).statusCode).toBe(400);
    expect((await call('POST', `/api/family/persons/${sunita.id}/activation`, head)).statusCode).toBe(409);
    const akash = await prisma.person.findFirstOrThrow({ where: { familyId: headFamilyId, name: 'Akash Rathi' } });
    await prisma.person.update({ where: { id: akash.id }, data: { mobile: '8100000032' } });
    expect((await call('POST', `/api/family/persons/${akash.id}/activation`, head)).statusCode).toBe(409);

    const req = await call('POST', `/api/family/persons/${priya.id}/activation`, head);
    expect(req.statusCode).toBe(201);
    const reqId = req.json().data.id;
    expect((await call('POST', `/api/family/persons/${priya.id}/activation`, head)).statusCode).toBe(409); // duplicate
    expect((await call('GET', '/api/family/mine', head)).json().data.persons.find((p: { id: number }) => p.id === priya.id).loginStatus).toBe('REQUESTED');
    // cannot log in yet
    const early = await app.inject({ method: 'POST', url: '/api/auth/otp/verify', payload: { mobile: '8100000031', code: '123456' }, remoteAddress: freshIp() });
    expect(early.statusCode).toBe(403);

    // staff queue
    expect((await call('GET', '/api/family/activations', head)).statusCode).toBe(403);
    expect((await call('GET', '/api/family/activations', finance)).statusCode).toBe(403);
    expect((await call('POST', `/api/family/activations/${reqId}/approve`, head)).statusCode).toBe(403);
    const q = (await call('GET', '/api/family/activations?status=PENDING', admin)).json();
    const row = q.data.find((x: { id: number }) => x.id === reqId);
    expect(row.person.name).toBe('Priya Rathi');
    expect(row.family.membershipNo).toBe('MSB-0412');
    expect((await call('GET', '/api/family/activations?status=NOPE', admin)).statusCode).toBe(400);

    expect((await call('POST', `/api/family/activations/${reqId}/approve`, admin)).statusCode).toBe(200);
    expect((await call('POST', `/api/family/activations/${reqId}/approve`, admin)).statusCode).toBe(409);
    expect((await call('POST', `/api/family/activations/${reqId}/reject`, admin, { remarks: 'late' })).statusCode).toBe(409);
    const user = await prisma.user.findUniqueOrThrow({ where: { mobile: '8100000031' }, include: { roles: { include: { role: true } } } });
    expect(user.personId).toBe(priya.id);
    expect(user.roles.map((r) => r.role.name)).toEqual(['family_viewer']);
    expect(await prisma.notificationDelivery.count({ where: { userId: user.id } })).toBe(1);

    const l = await login(app, '8100000031');
    const me = (await call('GET', '/api/me', l.token)).json().data;
    expect(me.roles).toContain('family_viewer');
    expect(me.family.membershipNo).toBe('MSB-0412');
    expect((await call('POST', '/api/family/persons', l.token, { name: 'Nope Nope', relation: 'SON' })).statusCode).toBe(403);
    expect((await call('GET', '/api/family/mine', l.token)).json().data.canEdit).toBe(false);
    expect((await call('GET', '/api/family/mine', head)).json().data.persons.find((p: { id: number }) => p.id === priya.id).loginStatus).toBe('ACTIVE');
    // cannot change mobile while login active
    expect((await call('PATCH', `/api/family/persons/${priya.id}`, head, { mobile: '8100000033' })).statusCode).toBe(409);

    // withdraw
    expect((await call('DELETE', `/api/family/persons/${priya.id}/login`, viewer)).statusCode).toBe(403);
    expect((await call('DELETE', `/api/family/persons/${priya.id}/login`, head)).statusCode).toBe(200);
    expect((await call('GET', '/api/me', l.token)).statusCode).toBe(401); // session revoked
    const after = await app.inject({ method: 'POST', url: '/api/auth/otp/verify', payload: { mobile: '8100000031', code: '123456' }, remoteAddress: freshIp() });
    expect(after.statusCode).toBe(403);
    expect(after.json().error.code).toBe('ACCOUNT_DISABLED');
    expect((await call('DELETE', `/api/family/persons/${priya.id}/login`, head)).statusCode).toBe(409); // nothing left to withdraw
    expect((await call('DELETE', `/api/family/persons/${ramesh.id}/login`, head)).statusCode).toBe(400);

    // re-request and re-approve re-enables the same user
    const again = await call('POST', `/api/family/persons/${priya.id}/activation`, head);
    expect(again.statusCode).toBe(201);
    expect((await call('POST', `/api/family/activations/${again.json().data.id}/approve`, admin)).statusCode).toBe(200);
    expect((await login(app, '8100000031')).token).toBeTruthy();
    // staff withdraw
    expect((await call('DELETE', `/api/family/admin/persons/${priya.id}/login`, head)).statusCode).toBe(403);
    expect((await call('DELETE', `/api/family/admin/persons/${priya.id}/login`, admin)).statusCode).toBe(200);
  });

  it('staff can reject a login request (remarks required) and the head sees the remark', async () => {
    const akash = await prisma.person.findFirstOrThrow({ where: { familyId: headFamilyId, name: 'Akash Rathi' } });
    const pending = await prisma.loginActivationRequest.findFirstOrThrow({ where: { personId: akash.id, status: 'PENDING' } });
    expect((await call('POST', `/api/family/activations/${pending.id}/reject`, admin, {})).statusCode).toBe(400);
    expect((await call('POST', `/api/family/activations/${pending.id}/reject`, admin, { remarks: 'Not eligible yet' })).statusCode).toBe(200);
    const a = (await call('GET', '/api/family/mine', head)).json().data.persons.find((p: { id: number }) => p.id === akash.id);
    expect(a.loginStatus).toBe('NONE');
    expect(a.activationRemarks).toBe('Not eligible yet');
    expect((await call('POST', '/api/family/activations/99999/reject', admin, { remarks: 'zz' })).statusCode).toBe(404);
  });
});

describe('registrations', () => {
  const mob = { a: '8100000041', b: '8100000042', c: '8100000043' };
  let zoneId: number;
  const verify = async (mobile: string, purpose: 'register' | 'status' = 'register') => {
    // dev OTP bypass accepts 123456 without a prior request (keeps within the 3-sends / 15 min limit)
    return app.inject({ method: 'POST', url: '/api/registrations/verify-mobile/confirm', payload: { mobile, code: '123456', purpose }, remoteAddress: freshIp() });
  };
  const form = (mobile: string, otpToken: string, extra: Record<string, unknown> = {}) => ({
    head: { name: `Applicant ${mobile.slice(-2)}`, dob: '1980-01-15', mobile, gender: 'MALE', email: 'a@example.com' },
    address: { addressLine: '10 New Road', area: 'Malleshwaram', pincode: '560003', zoneId },
    members: [{ name: `Applicant Spouse ${mobile.slice(-2)}`, relation: 'SPOUSE', dob: '1982-03-04' }],
    documentFileIds: [] as number[],
    otpToken,
    ...extra,
  });
  const submit = (payload: unknown) => app.inject({ method: 'POST', url: '/api/registrations', payload: payload as object, remoteAddress: freshIp() });
  beforeAll(async () => {
    zoneId = (await prisma.zone.findFirstOrThrow()).id;
  });

  it('OTP verification validates the mobile and rejects wrong codes / already-registered numbers', async () => {
    const bad = await app.inject({ method: 'POST', url: '/api/registrations/verify-mobile/request', payload: { mobile: '123' }, remoteAddress: freshIp() });
    expect(bad.statusCode).toBe(400);
    const rq = await app.inject({ method: 'POST', url: '/api/registrations/verify-mobile/request', payload: { mobile: mob.a }, remoteAddress: freshIp() });
    expect(rq.statusCode).toBe(200);
    expect(rq.json().data.sent).toBe(true);
    const dupUser = await verify('9845012345');
    expect(dupUser.statusCode).toBe(409);
    expect(dupUser.json().error.code).toBe('DUPLICATE_MOBILE');
    const wrong = await app.inject({ method: 'POST', url: '/api/registrations/verify-mobile/confirm', payload: { mobile: mob.a, code: '000000' }, remoteAddress: freshIp() });
    expect(wrong.statusCode).toBe(400);
    expect(['OTP_INVALID', 'OTP_EXPIRED']).toContain(wrong.json().error.code);
    const ok = await verify(mob.a);
    expect(ok.statusCode).toBe(200);
    expect(ok.json().data.otpToken).toBeTruthy();
  });

  it('submission requires a valid otpToken for the same mobile, and valid data', async () => {
    const token = (await verify(mob.a)).json().data.otpToken as string;
    expect((await submit({ ...form(mob.a, token), otpToken: undefined })).statusCode).toBe(400);
    expect((await submit(form(mob.a, 'x'.repeat(30)))).statusCode).toBe(401);
    expect((await submit(form(mob.b, token))).statusCode).toBe(401); // token belongs to another mobile
    expect((await submit({ ...form(mob.a, token), head: { name: 'A', dob: '1980-01-01', mobile: mob.a } })).statusCode).toBe(400);
    expect((await submit({ ...form(mob.a, token), head: { name: 'No Dob', mobile: mob.a } })).statusCode).toBe(400);
    expect((await submit({ ...form(mob.a, token), address: { addressLine: 'x', area: 'y', pincode: '1', zoneId } })).statusCode).toBe(400);
    expect((await submit({ ...form(mob.a, token), address: { addressLine: '10 Road', area: 'Area', pincode: '560003', zoneId: 99999 } })).statusCode).toBe(400);
    expect((await submit({ ...form(mob.a, token), documentFileIds: [999999] })).statusCode).toBe(400);
    expect((await submit({ ...form(mob.a, token), members: [{ name: 'Weird Self', relation: 'SELF' }] })).statusCode).toBe(400);
  });

  it('registers a family PENDING, notifies staff, blocks duplicates, and lets the applicant check status', async () => {
    const token = (await verify(mob.a)).json().data.otpToken as string;
    const doc = await uploadAnon('document');
    const photo = await uploadAnon('photo');
    const payload = form(mob.a, token, { documentFileIds: [doc], head: { name: 'Applicant One', dob: '1980-01-15', mobile: mob.a, photoFileId: photo } });
    const r = await submit(payload);
    expect(r.statusCode).toBe(201);
    const id = r.json().data.id as number;
    expect(r.json().data.status).toBe('PENDING');
    const reg = await prisma.registration.findUniqueOrThrow({ where: { id }, include: { family: { include: { persons: true } }, documents: true } });
    expect(reg.status).toBe('PENDING');
    expect(reg.family.status).toBe('PENDING');
    expect(reg.family.membershipNo).toBeNull();
    expect(reg.family.persons).toHaveLength(2);
    expect(reg.documents.map((d) => d.fileId)).toEqual([doc]);
    expect(await prisma.user.count({ where: { mobile: mob.a } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { action: 'registration.submit', entityId: String(id) } })).toBe(1);
    const adminUser = await prisma.user.findUniqueOrThrow({ where: { mobile: '9000000001' } });
    expect(await prisma.notificationDelivery.count({ where: { userId: adminUser.id, notification: { kind: 'registration', body: { contains: 'Applicant One' } } } })).toBe(1);
    // same files cannot be reused
    const t2 = (await verify(mob.b)).json().data.otpToken as string;
    expect((await submit(form(mob.b, t2, { documentFileIds: [doc] }))).statusCode).toBe(400);

    // duplicate: pending registration blocks the same head mobile
    const dup = await verify(mob.a);
    expect(dup.statusCode).toBe(409);
    expect((await submit(form(mob.a, token))).statusCode).toBe(409);

    // status check
    const st = (await verify(mob.a, 'status'));
    expect(st.statusCode).toBe(200);
    const s = await app.inject({ method: 'GET', url: `/api/registrations/status?mobile=${mob.a}&otpToken=${st.json().data.otpToken}`, remoteAddress: freshIp() });
    expect(s.statusCode).toBe(200);
    expect(s.json().data).toMatchObject({ id, status: 'PENDING', headName: 'Applicant One', memberCount: 2, membershipNo: null });
    const wrongTok = await app.inject({ method: 'GET', url: `/api/registrations/status?mobile=${mob.b}&otpToken=${st.json().data.otpToken}`, remoteAddress: freshIp() });
    expect(wrongTok.statusCode).toBe(401);
    const noTok = await app.inject({ method: 'GET', url: `/api/registrations/status?mobile=${mob.a}`, remoteAddress: freshIp() });
    expect(noTok.statusCode).toBe(400);
    const none = (await verify('8100000099', 'status')).json().data.otpToken;
    expect((await app.inject({ method: 'GET', url: `/api/registrations/status?mobile=8100000099&otpToken=${none}`, remoteAddress: freshIp() })).statusCode).toBe(404);
  });

  it('staff queue: guards, filters, full details with document urls', async () => {
    expect((await call('GET', '/api/registrations')).statusCode).toBe(401);
    for (const t of [head, viewer, finance]) expect((await call('GET', '/api/registrations', t)).statusCode).toBe(403);
    const pend = (await call('GET', '/api/registrations?status=PENDING', admin)).json();
    expect(pend.total).toBeGreaterThanOrEqual(4); // 3 seeded + ours
    expect(pend.counts.PENDING).toBe(pend.total);
    const mine = pend.data.find((x: { headName: string }) => x.headName === 'Applicant One');
    expect(mine.documents).toHaveLength(1);
    expect(mine.documents[0].url).toMatch(/^\/files\/\d+$/);
    expect(mine.family.persons[0].mobile).toBe(mob.a);
    const docRes = await app.inject({ method: 'GET', url: mine.documents[0].url, headers: bearer(admin) });
    expect(docRes.statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: mine.documents[0].url, headers: bearer(finance) })).statusCode).toBe(403);
    expect((await call('GET', `/api/registrations/${mine.id}`, admin)).json().data.id).toBe(mine.id);
    expect((await call('GET', '/api/registrations/99999', admin)).statusCode).toBe(404);
    expect((await call('GET', '/api/registrations?status=X', admin)).statusCode).toBe(400);
  });

  it('approve assigns sequential MSB numbers, creates the head login; reject needs remarks; no double decisions', async () => {
    const t2 = (await verify(mob.b)).json().data.otpToken as string;
    const r2 = await submit(form(mob.b, t2));
    expect(r2.statusCode).toBe(201);
    const t3 = (await verify(mob.c)).json().data.otpToken as string;
    const r3 = await submit(form(mob.c, t3));
    const first = await prisma.registration.findFirstOrThrow({ where: { family: { persons: { some: { mobile: mob.a } } } } });
    const base = await maxNo();

    expect((await call('POST', `/api/registrations/${first.id}/approve`, head)).statusCode).toBe(403);
    expect((await call('POST', `/api/registrations/${first.id}/approve`)).statusCode).toBe(401);
    const a1 = await call('POST', `/api/registrations/${first.id}/approve`, admin);
    expect(a1.statusCode).toBe(200);
    expect(a1.json().data.membershipNo).toBe(`MSB-${String(base + 1).padStart(4, '0')}`);
    const a2 = await call('POST', `/api/registrations/${r2.json().data.id}/approve`, admin);
    expect(a2.json().data.membershipNo).toBe(`MSB-${String(base + 2).padStart(4, '0')}`);
    expect((await call('POST', `/api/registrations/${first.id}/approve`, admin)).statusCode).toBe(409);
    expect((await call('POST', `/api/registrations/${first.id}/reject`, admin, { remarks: 'too late' })).statusCode).toBe(409);

    const fam = await prisma.family.findFirstOrThrow({ where: { persons: { some: { mobile: mob.a } } }, include: { persons: true } });
    expect(fam.status).toBe('ACTIVE');
    expect(fam.membershipNo).toBe(a1.json().data.membershipNo);
    const user = await prisma.user.findUniqueOrThrow({ where: { mobile: mob.a }, include: { roles: { include: { role: true } } } });
    expect(user.roles.map((x) => x.role.name)).toEqual(['head']);
    const photo = fam.persons.find((p) => p.isHead)!.photoFileId;
    expect(photo).toBeTruthy();
    expect((await prisma.file.findUniqueOrThrow({ where: { id: photo! } })).visibility).toBe('MEMBERS');
    expect(await prisma.auditLog.count({ where: { action: 'registration.approve', entityId: String(first.id) } })).toBe(1);
    expect(await prisma.notificationDelivery.count({ where: { userId: user.id } })).toBe(1);

    // the new head can log in, sees MSB number and appears in the directory
    const l = await login(app, mob.a);
    const me = (await call('GET', '/api/me', l.token)).json().data;
    expect(me.isHead).toBe(true);
    expect(me.family.membershipNo).toBe(fam.membershipNo);
    expect((await call('GET', `/api/members?q=${fam.membershipNo}`, finance)).json().total).toBe(1);

    // reject
    const id3 = r3.json().data.id;
    expect((await call('POST', `/api/registrations/${id3}/reject`, admin, {})).statusCode).toBe(400);
    expect((await call('POST', `/api/registrations/${id3}/reject`, admin, { remarks: '   ' })).statusCode).toBe(400);
    expect((await call('POST', `/api/registrations/${id3}/reject`, head, { remarks: 'No' })).statusCode).toBe(403);
    expect((await call('POST', `/api/registrations/${id3}/reject`, admin, { remarks: 'Address proof unclear' })).statusCode).toBe(200);
    expect((await call('POST', `/api/registrations/${id3}/approve`, admin)).statusCode).toBe(409);
    const rej = await prisma.registration.findUniqueOrThrow({ where: { id: id3 }, include: { family: true } });
    expect(rej.status).toBe('REJECTED');
    expect(rej.family.status).toBe('REJECTED');
    expect(rej.family.membershipNo).toBeNull();
    expect(await prisma.user.count({ where: { mobile: mob.c } })).toBe(0);
    expect((await call('POST', '/api/registrations/99999/approve', admin)).statusCode).toBe(404);

    // a rejected applicant may register again and see the rejection reason via status
    const tok = (await verify(mob.c)).json().data.otpToken as string;
    const stTok = await app.inject({ method: 'GET', url: `/api/registrations/status?mobile=${mob.c}&otpToken=${tok}`, remoteAddress: freshIp() });
    expect(stTok.json().data).toMatchObject({ status: 'REJECTED', remarks: 'Address proof unclear' });
    expect((await submit(form(mob.c, tok))).statusCode).toBe(201);
  });
});
