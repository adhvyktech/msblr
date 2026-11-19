import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { parse as parseCsv } from 'csv-parse/sync';
import { Relation, type Prisma } from '@prisma/client';
import { normalizeMobile } from '@msblr/shared';
import { prisma } from '../../lib/prisma';
import { httpError } from '../../lib/errors';
import { parse } from '../../lib/parse';
import { paginate } from '../../lib/pagination';
import { audit } from '../../lib/audit';
import { authenticate, requirePerm } from '../../lib/auth';
import { toPublicPerson } from '../../lib/privacy';
import { toXlsx } from '../../lib/excel';
import {
  addressSchema, createFamilyTx, defined, familySummary, headCreateSchema, memberCreateSchema, memberPatchSchema, personAudit,
  personInclude, rawPerson, relationSchema, str, dayStr,
} from './service';

const idParam = (v: unknown, label = 'id') => {
  const n = Number((v as Record<string, string>)[label]);
  if (!Number.isInteger(n) || n <= 0) throw httpError(400, 'VALIDATION_ERROR', 'Invalid id');
  return n;
};

const boolQ = z.enum(['true', 'false', '1', '0']).transform((v) => v === 'true' || v === '1');
const listQuery = z.object({
  q: z.string().trim().max(100).optional(),
  zoneId: z.coerce.number().int().positive().optional(),
  area: z.string().trim().max(100).optional(),
  hasBusiness: boolQ.optional(),
});

/** Approved business whose owner has not hidden the "business" field. */
const visibleBusiness: Prisma.BusinessWhereInput = {
  status: 'APPROVED',
  deletedAt: null,
  OR: [{ personId: null }, { person: { privacy: { none: { field: 'business', visible: false } } } }],
};

const adminInclude = {
  zone: true,
  persons: { where: { deletedAt: null }, orderBy: [{ isHead: 'desc' }, { id: 'asc' }], include: personInclude },
} satisfies Prisma.FamilyInclude;

const adminFilter = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(['PENDING', 'ACTIVE', 'REJECTED', 'INACTIVE']).optional(),
  subscriptionStatus: z.enum(['ACTIVE', 'DUE', 'EXPIRED']).optional(),
  zoneId: z.coerce.number().int().positive().optional(),
  zone: z.coerce.number().int().positive().optional(),
});
function adminWhere(query: unknown): Prisma.FamilyWhereInput {
  const f = parse(adminFilter, query ?? {});
  const where: Prisma.FamilyWhereInput = {};
  if (f.status) where.status = f.status;
  if (f.subscriptionStatus) where.subscriptionStatus = f.subscriptionStatus;
  const zone = f.zoneId ?? f.zone;
  if (zone) where.zoneId = zone;
  if (f.q) {
    const digits = f.q.replace(/\D/g, '');
    where.OR = [
      { membershipNo: { contains: f.q, mode: 'insensitive' } },
      { area: { contains: f.q, mode: 'insensitive' } },
      { persons: { some: { deletedAt: null, name: { contains: f.q, mode: 'insensitive' } } } },
      ...(digits.length >= 3 ? [{ persons: { some: { deletedAt: null, mobile: { contains: digits } } } }] : []),
    ];
  }
  return where;
}
const adminFamily = (f: Prisma.FamilyGetPayload<{ include: typeof adminInclude }>) => ({
  ...familySummary(f),
  persons: f.persons.map(rawPerson),
  head: f.persons.find((p) => p.isHead)?.name ?? null,
  headMobile: f.persons.find((p) => p.isHead)?.mobile ?? null,
  memberCount: f.persons.length,
});

const familyPatch = z.object({
  addressLine: str(250),
  area: str(100),
  city: str(60),
  pincode: z.preprocess((v) => (v === '' ? null : v), z.string().trim().regex(/^\d{6}$/, 'Enter a 6-digit pincode').nullable().optional()),
  zoneId: z.coerce.number().int().positive().nullable().optional(),
  status: z.enum(['PENDING', 'ACTIVE', 'REJECTED', 'INACTIVE']).optional(),
  membershipNo: z.preprocess((v) => (v === '' ? null : v), z.string().trim().toUpperCase().regex(/^MSB-\d{4,6}$/, 'Use the format MSB-0001').nullable().optional()),
});
const adminPersonPatch = memberPatchSchema.omit({ photoFileId: true });
const adminCreate = z.object({
  head: headCreateSchema.omit({ photoFileId: true }),
  address: addressSchema,
  members: z.array(memberCreateSchema.omit({ photoFileId: true })).max(30).default([]),
  membershipNo: z.preprocess((v) => (v === '' ? null : v), z.string().trim().toUpperCase().regex(/^MSB-\d{4,6}$/, 'Use the format MSB-0001').nullable().optional()),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
});

async function assertMobileFree(mobile: string | null | undefined, exceptPersonId?: number) {
  if (!mobile) return;
  const u = await prisma.user.findUnique({ where: { mobile } });
  if (u && u.personId !== exceptPersonId) throw httpError(409, 'MOBILE_IN_USE', 'This mobile number already belongs to another login.');
}

// ---------- CSV import ----------
const IMPORT_COLUMNS = ['membershipNo', 'headName', 'relation', 'name', 'dob', 'anniversary', 'mobile', 'email', 'zone', 'address', 'area'] as const;
const MAX_IMPORT_ROWS = 2000;
function parseDate(v: string): Date | null {
  const s = v.trim();
  if (!s) return null;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  let y: number, mo: number, d: number;
  if (m) { y = +m[1]!; mo = +m[2]!; d = +m[3]!; }
  else if ((m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s))) { d = +m[1]!; mo = +m[2]!; y = +m[3]!; }
  else throw new Error(`Invalid date "${s}" (use YYYY-MM-DD or DD/MM/YYYY)`);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) throw new Error(`Invalid date "${s}"`);
  return dt;
}
interface ImportRow { line: number; membershipNo: string; headName: string; relation: string; name: string; dob: string; anniversary: string; mobile: string; email: string; zone: string; address: string; area: string }
interface RowResult { line: number; membershipNo: string; name: string; status: 'created' | 'skipped' | 'error'; message: string }

const routes: FastifyPluginAsync = async (app) => {
  // ---------- member-facing ----------
  app.get('/zones', async () => ({ data: await prisma.zone.findMany({ orderBy: { sort: 'asc' }, select: { id: true, name: true } }) }));

  app.get('/', { preHandler: authenticate }, async (req) => {
    const f = parse(listQuery, req.query);
    const pg = paginate(req.query);
    const and: Prisma.FamilyWhereInput[] = [{ status: 'ACTIVE' }];
    if (f.zoneId) and.push({ zoneId: f.zoneId });
    if (f.area) and.push({ area: { contains: f.area, mode: 'insensitive' } });
    if (f.hasBusiness) and.push({ businesses: { some: visibleBusiness } });
    if (f.q) {
      // Only name, membership number, zone, area and (visible) business name are searchable — never mobile/email/dob.
      and.push({
        OR: [
          { membershipNo: { contains: f.q, mode: 'insensitive' } },
          { area: { contains: f.q, mode: 'insensitive' } },
          { zone: { name: { contains: f.q, mode: 'insensitive' } } },
          { persons: { some: { deletedAt: null, name: { contains: f.q, mode: 'insensitive' } } } },
          { businesses: { some: { AND: [visibleBusiness, { name: { contains: f.q, mode: 'insensitive' } }] } } },
        ],
      });
    }
    const where: Prisma.FamilyWhereInput = { AND: and };
    const [rows, total] = await Promise.all([
      prisma.family.findMany({
        where,
        orderBy: [{ membershipNo: 'asc' }, { id: 'asc' }],
        skip: pg.skip,
        take: pg.take,
        include: {
          zone: true,
          persons: { where: { deletedAt: null }, orderBy: [{ isHead: 'desc' }, { id: 'asc' }], include: { privacy: true } },
          businesses: { where: visibleBusiness, select: { id: true, name: true }, orderBy: { id: 'asc' }, take: 3 },
        },
      }),
      prisma.family.count({ where }),
    ]);
    const data = rows.map((fam) => {
      const head = fam.persons.find((p) => p.isHead) ?? fam.persons[0];
      return {
        id: fam.id,
        membershipNo: fam.membershipNo,
        zoneId: fam.zoneId,
        zone: fam.zone?.name ?? null,
        area: fam.area,
        memberCount: fam.persons.length,
        head: head ? toPublicPerson({ ...head, family: fam }, req.user) : null,
        businesses: fam.businesses,
      };
    });
    return pg.result(data, total);
  });

  // ---------- staff ----------
  const viewStaff = requirePerm('members.view_private', 'members.edit');
  const editStaff = requirePerm('members.edit');

  app.get('/admin', { preHandler: viewStaff }, async (req) => {
    const pg = paginate(req.query);
    const where = adminWhere(req.query);
    const [rows, total] = await Promise.all([
      prisma.family.findMany({ where, orderBy: { id: 'desc' }, skip: pg.skip, take: pg.take, include: adminInclude }),
      prisma.family.count({ where }),
    ]);
    return pg.result(rows.map(adminFamily), total);
  });

  app.get('/admin/export', { preHandler: viewStaff }, async (req, reply) => {
    const where = adminWhere(req.query);
    const fams = await prisma.family.findMany({ where, orderBy: { id: 'asc' }, include: adminInclude });
    const rows = fams.flatMap((f) =>
      f.persons.map((p) => ({
        membershipNo: f.membershipNo ?? '',
        status: f.status,
        subscription: f.subscriptionStatus,
        zone: f.zone?.name ?? '',
        headName: f.persons.find((x) => x.isHead)?.name ?? '',
        name: p.name,
        relation: p.relation,
        gender: p.gender ?? '',
        dob: dayStr(p.dob) ?? '',
        anniversary: dayStr(p.anniversary) ?? '',
        mobile: p.mobile ?? '',
        email: p.email ?? '',
        occupation: p.occupation ?? '',
        address: f.addressLine ?? '',
        area: f.area ?? '',
        pincode: f.pincode ?? '',
      })),
    );
    const buf = await toXlsx(
      rows,
      [
        { header: 'Membership No', key: 'membershipNo', width: 14 }, { header: 'Status', key: 'status' }, { header: 'Subscription', key: 'subscription' },
        { header: 'Zone', key: 'zone', width: 22 }, { header: 'Head', key: 'headName', width: 24 }, { header: 'Name', key: 'name', width: 24 },
        { header: 'Relation', key: 'relation' }, { header: 'Gender', key: 'gender' }, { header: 'DOB', key: 'dob' }, { header: 'Anniversary', key: 'anniversary' },
        { header: 'Mobile', key: 'mobile', width: 14 }, { header: 'Email', key: 'email', width: 26 }, { header: 'Occupation', key: 'occupation', width: 18 },
        { header: 'Address', key: 'address', width: 34 }, { header: 'Area', key: 'area', width: 16 }, { header: 'Pincode', key: 'pincode' },
      ],
      'Members',
    );
    await audit(req, { action: 'members.export', entity: 'family', summary: `Exported ${rows.length} member rows` });
    return reply
      .header('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('content-disposition', 'attachment; filename="msblr-members.xlsx"')
      .send(buf);
  });

  app.get('/admin/:familyId', { preHandler: viewStaff }, async (req) => {
    const id = idParam(req.params, 'familyId');
    const f = await prisma.family.findUnique({ where: { id }, include: adminInclude });
    if (!f) throw httpError(404, 'NOT_FOUND', 'Family not found');
    return { data: adminFamily(f) };
  });

  app.patch('/admin/persons/:id', { preHandler: editStaff }, async (req) => {
    const id = idParam(req.params);
    const b = parse(adminPersonPatch, req.body);
    const before = await prisma.person.findFirst({ where: { id, deletedAt: null }, include: { user: true } });
    if (!before) throw httpError(404, 'NOT_FOUND', 'Person not found');
    if (before.isHead && b.relation && b.relation !== 'SELF') throw httpError(400, 'VALIDATION_ERROR', 'The head of the family must keep the relation "Self".');
    if (!before.isHead && b.relation === 'SELF') throw httpError(400, 'VALIDATION_ERROR', 'Only the head of the family can have the relation "Self".');
    if (b.mobile !== undefined && b.mobile !== before.mobile) {
      await assertMobileFree(b.mobile, id);
    }
    const after = await prisma.$transaction(async (tx) => {
      const p = await tx.person.update({ where: { id }, data: defined(b) });
      if (before.user && b.mobile && b.mobile !== before.mobile) {
        await tx.user.update({ where: { id: before.user.id }, data: { mobile: b.mobile } });
      }
      await audit(req, { action: 'person.update', entity: 'person', entityId: id, summary: `Updated ${p.name}`, before: personAudit(before), after: personAudit(p) }, tx);
      return p;
    });
    return { data: rawPerson({ ...after, user: null, activationReqs: [], privacy: [] }) };
  });

  app.patch('/admin/:familyId', { preHandler: editStaff }, async (req) => {
    const id = idParam(req.params, 'familyId');
    const b = parse(familyPatch, req.body);
    const before = await prisma.family.findUnique({ where: { id } });
    if (!before) throw httpError(404, 'NOT_FOUND', 'Family not found');
    if (b.zoneId && !(await prisma.zone.findUnique({ where: { id: b.zoneId } }))) throw httpError(400, 'VALIDATION_ERROR', 'Unknown zone');
    if (b.membershipNo && b.membershipNo !== before.membershipNo && (await prisma.family.findUnique({ where: { membershipNo: b.membershipNo } }))) {
      throw httpError(409, 'DUPLICATE_MEMBERSHIP', `Membership number ${b.membershipNo} already exists.`);
    }
    const pick = (f: typeof before) => ({ addressLine: f.addressLine, area: f.area, city: f.city, pincode: f.pincode, zoneId: f.zoneId, status: f.status, membershipNo: f.membershipNo });
    const { city, ...rest } = b;
    await prisma.$transaction(async (tx) => {
      const after = await tx.family.update({ where: { id }, data: { ...defined(rest), ...(city ? { city } : {}) } });
      await audit(req, { action: 'family.update', entity: 'family', entityId: id, summary: `Updated family ${after.membershipNo ?? id}`, before: pick(before), after: pick(after) }, tx);
    });
    const f = await prisma.family.findUniqueOrThrow({ where: { id }, include: adminInclude });
    return { data: adminFamily(f) };
  });

  app.post('/admin/families', { preHandler: editStaff }, async (req, reply) => {
    const b = parse(adminCreate, req.body);
    if (!(await prisma.zone.findUnique({ where: { id: b.address.zoneId } }))) throw httpError(400, 'VALIDATION_ERROR', 'Unknown zone');
    await assertMobileFree(b.head.mobile);
    const out = await prisma.$transaction(async (tx) => {
      const { family } = await createFamilyTx(tx, {
        membershipNo: b.membershipNo,
        status: b.status,
        zoneId: b.address.zoneId,
        address: b.address,
        head: b.head,
        members: b.members,
        createHeadLogin: true,
      });
      await audit(req, { action: 'family.create', entity: 'family', entityId: family.id, summary: `Created family ${family.membershipNo ?? family.id} (${b.head.name})`, after: { ...b, membershipNo: family.membershipNo } }, tx);
      return family;
    });
    const f = await prisma.family.findUniqueOrThrow({ where: { id: out.id }, include: adminInclude });
    return reply.status(201).send({ data: adminFamily(f) });
  });

  app.post('/admin/import', { preHandler: editStaff, config: { rateLimit: { max: 20, timeWindow: '1 hour' } } }, async (req) => {
    if (!req.isMultipart()) throw httpError(400, 'NOT_MULTIPART', 'Upload the CSV file as multipart/form-data.');
    const part = await req.file();
    if (!part) throw httpError(400, 'NO_FILE', 'Please choose a CSV file.');
    const buf = await part.toBuffer();
    let records: Record<string, string>[];
    try {
      records = parseCsv(buf, { columns: (h: string[]) => h.map((x) => x.trim()), skip_empty_lines: true, bom: true, trim: true, relax_column_count: true }) as Record<string, string>[];
    } catch (e) {
      throw httpError(400, 'INVALID_CSV', `Could not read the CSV: ${(e as Error).message}`);
    }
    if (!records.length) throw httpError(400, 'INVALID_CSV', 'The CSV has no data rows.');
    if (records.length > MAX_IMPORT_ROWS) throw httpError(400, 'INVALID_CSV', `Too many rows (maximum ${MAX_IMPORT_ROWS}).`);
    const cols = Object.keys(records[0]!);
    const missing = ['membershipNo', 'name'].filter((c) => !cols.includes(c));
    if (missing.length) throw httpError(400, 'INVALID_CSV', `Missing column(s): ${missing.join(', ')}. Expected: ${IMPORT_COLUMNS.join(', ')}`);

    const rows: ImportRow[] = records.map((r, i) => ({
      line: i + 2,
      membershipNo: (r.membershipNo ?? '').trim().toUpperCase(),
      headName: (r.headName ?? '').trim(),
      relation: (r.relation ?? '').trim(),
      name: (r.name ?? '').trim(),
      dob: r.dob ?? '', anniversary: r.anniversary ?? '', mobile: r.mobile ?? '', email: r.email ?? '', zone: r.zone ?? '', address: r.address ?? '', area: r.area ?? '',
    }));
    const zones = await prisma.zone.findMany();
    const results: RowResult[] = [];
    const groups = new Map<string, ImportRow[]>();
    for (const r of rows) {
      const res = (status: RowResult['status'], message: string) => results.push({ line: r.line, membershipNo: r.membershipNo, name: r.name, status, message });
      if (!r.name) { res('error', 'Name is required'); continue; }
      if (!/^MSB-\d{4,6}$/.test(r.membershipNo)) { res('error', 'membershipNo must look like MSB-0001'); continue; }
      const g = groups.get(r.membershipNo) ?? [];
      g.push(r);
      groups.set(r.membershipNo, g);
    }

    const seenMobiles = new Set<string>();
    for (const [membershipNo, g] of groups) {
      const mark = (r: ImportRow, status: RowResult['status'], message: string) => results.push({ line: r.line, membershipNo, name: r.name, status, message });
      const failAll = (message: string) => g.forEach((r) => mark(r, 'error', message));
      try {
        const headRow = g.find((r) => r.relation.toUpperCase() === 'SELF') ?? g.find((r) => r.headName && r.headName.toLowerCase() === r.name.toLowerCase());
        const existing = await prisma.family.findUnique({ where: { membershipNo }, include: { persons: { where: { deletedAt: null } } } });
        if (!existing && !headRow) { failAll('Head of family not found: mark one row with relation SELF or make headName equal to a name'); continue; }
        const first = headRow ?? g[0]!;
        const zoneText = (first.zone || g.find((r) => r.zone)?.zone || '').toLowerCase();
        const zone = zoneText ? zones.find((z) => z.name.toLowerCase() === zoneText) ?? zones.find((z) => z.name.toLowerCase().includes(zoneText)) : undefined;
        if (zoneText && !zone && !existing) { failAll(`Unknown zone "${first.zone}"`); continue; }

        // validate + convert each row up-front
        const prepared: { row: ImportRow; data: { name: string; relation: Relation; dob: Date | null; anniversary: Date | null; mobile: string | null; email: string | null } }[] = [];
        let bad = false;
        for (const r of g) {
          try {
            const isHead = r === headRow;
            const rel = isHead ? 'SELF' : r.relation.toUpperCase().replace(/[\s-]+/g, '_') || 'OTHER';
            const relation = relationSchema.safeParse(rel);
            if (!relation.success) throw new Error(`Unknown relation "${r.relation}"`);
            if (relation.data === 'SELF' && !isHead) throw new Error('Only one SELF row is allowed per family');
            const mobile = r.mobile ? normalizeMobile(r.mobile) : null;
            if (mobile && !/^[6-9]\d{9}$/.test(mobile)) throw new Error(`Invalid mobile "${r.mobile}"`);
            const email = r.email.trim() ? r.email.trim().toLowerCase() : null;
            if (email && !z.string().email().safeParse(email).success) throw new Error(`Invalid email "${r.email}"`);
            prepared.push({ row: r, data: { name: r.name, relation: relation.data, dob: parseDate(r.dob), anniversary: parseDate(r.anniversary), mobile, email } });
          } catch (e) {
            mark(r, 'error', (e as Error).message);
            bad = true;
          }
        }
        if (bad) { g.filter((r) => !results.some((x) => x.line === r.line)).forEach((r) => mark(r, 'error', 'Skipped because another row of this family has an error')); continue; }

        const headMobile = prepared.find((p) => p.row === headRow)?.data.mobile;
        if (!existing && headMobile) {
          if (seenMobiles.has(headMobile) || (await prisma.user.findUnique({ where: { mobile: headMobile } }))) { failAll(`Head mobile ${headMobile} is already in use`); continue; }
        }
        await prisma.$transaction(async (tx) => {
          let familyId: number;
          if (existing) {
            familyId = existing.id;
          } else {
            const hp = prepared.find((p) => p.row === headRow)!;
            const { family } = await createFamilyTx(tx, {
              membershipNo,
              status: 'ACTIVE',
              zoneId: zone?.id ?? null,
              address: { addressLine: first.address || null, area: first.area || null },
              head: { name: hp.data.name, dob: hp.data.dob, anniversary: hp.data.anniversary, mobile: hp.data.mobile, email: hp.data.email },
              createHeadLogin: true,
            });
            familyId = family.id;
            await audit(req, { action: 'family.import', entity: 'family', entityId: family.id, summary: `Imported family ${membershipNo} (${hp.data.name})`, after: { membershipNo, head: hp.data.name } }, tx);
            mark(hp.row, 'created', `Created family ${membershipNo} with head`);
          }
          for (const p of prepared) {
            if (p.row === headRow && !existing) continue;
            if (existing && existing.persons.some((x) => x.name.toLowerCase() === p.data.name.toLowerCase())) { mark(p.row, 'skipped', 'Already in this family'); continue; }
            const created = await tx.person.create({ data: { familyId, isHead: false, ...p.data, relation: p.data.relation === 'SELF' ? 'OTHER' : p.data.relation } });
            await audit(req, { action: 'person.import', entity: 'person', entityId: created.id, summary: `Imported ${created.name} into ${membershipNo}`, after: personAudit(created) }, tx);
            mark(p.row, 'created', existing ? `Added to ${membershipNo}` : 'Created');
          }
        });
        if (headMobile) seenMobiles.add(headMobile);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Unexpected error';
        // drop any partial "created" marks from the rolled-back transaction
        for (let i = results.length - 1; i >= 0; i--) if (results[i]!.membershipNo === membershipNo) results.splice(i, 1);
        failAll(msg);
      }
    }
    results.sort((a, b) => a.line - b.line);
    const summary = {
      total: rows.length,
      created: results.filter((r) => r.status === 'created').length,
      skipped: results.filter((r) => r.status === 'skipped').length,
      errors: results.filter((r) => r.status === 'error').length,
    };
    await audit(req, { action: 'members.import', entity: 'family', summary: `CSV import: ${summary.created} created, ${summary.skipped} skipped, ${summary.errors} errors`, after: summary });
    return { data: { summary, results } };
  });

  // ---------- member-facing detail (declared last so static paths above win) ----------
  app.get('/:familyId', { preHandler: authenticate }, async (req) => {
    const id = idParam(req.params, 'familyId');
    const fam = await prisma.family.findUnique({
      where: { id },
      include: {
        zone: true,
        persons: { where: { deletedAt: null }, orderBy: [{ isHead: 'desc' }, { id: 'asc' }], include: { privacy: true } },
        businesses: { where: visibleBusiness, select: { id: true, name: true, category: { select: { nameEn: true, nameHi: true } } }, orderBy: { id: 'asc' } },
      },
    });
    const own = req.user.familyId === id;
    if (!fam || (fam.status !== 'ACTIVE' && !own && !req.user.perms.includes('members.view_private'))) throw httpError(404, 'NOT_FOUND', 'Family not found');
    return {
      data: {
        family: { id: fam.id, membershipNo: fam.membershipNo, zoneId: fam.zoneId, zone: fam.zone?.name ?? null, area: fam.area, status: fam.status, memberCount: fam.persons.length, isOwn: own },
        persons: fam.persons.map((p) => toPublicPerson({ ...p, family: fam }, req.user)),
        businesses: fam.businesses,
      },
    };
  });
};
export default routes;
