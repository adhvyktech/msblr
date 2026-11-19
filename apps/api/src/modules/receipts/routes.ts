import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { Prisma, prisma } from '../../lib/prisma';
import { httpError } from '../../lib/errors';
import { parse } from '../../lib/parse';
import { paginate } from '../../lib/pagination';
import { audit } from '../../lib/audit';
import { authenticate, hasPerm, requirePerm } from '../../lib/auth';
import { readStored } from '../../lib/files';
import { fyOf } from '../../lib/fy';
import { toCsv, toXlsx, type Column } from '../../lib/excel';
import { ensureReceiptPdf, ownsReceipt } from './service';
import { parseCsv } from './csv';

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const filterSchema = z.object({
  q: z.string().trim().max(100).optional(),
  fy: z.string().regex(/^\d{2}-\d{2}$/, 'FY must look like 26-27').optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  min: z.coerce.number().min(0).optional(),
  max: z.coerce.number().min(0).optional(),
  purpose: z.string().trim().max(100).optional(),
  legacy: z.enum(['true', 'false']).optional(),
});
type Filters = z.infer<typeof filterSchema>;

async function whereFor(f: Filters): Promise<Prisma.ReceiptWhereInput> {
  const and: Prisma.ReceiptWhereInput[] = [];
  if (f.q) {
    const fams = await prisma.family.findMany({ where: { membershipNo: { contains: f.q, mode: 'insensitive' } }, select: { id: true }, take: 200 });
    and.push({
      OR: [
        { memberName: { contains: f.q, mode: 'insensitive' } },
        { serialNo: { contains: f.q, mode: 'insensitive' } },
        { utr: { contains: f.q, mode: 'insensitive' } },
        ...(fams.length ? [{ familyId: { in: fams.map((x) => x.id) } }] : []),
      ],
    });
  }
  if (f.fy) and.push({ fy: f.fy });
  if (f.from || f.to) and.push({ issuedAt: { ...(f.from ? { gte: new Date(`${f.from}T00:00:00`) } : {}), ...(f.to ? { lte: new Date(`${f.to}T23:59:59.999`) } : {}) } });
  if (f.min !== undefined || f.max !== undefined) and.push({ amount: { ...(f.min !== undefined ? { gte: f.min } : {}), ...(f.max !== undefined ? { lte: f.max } : {}) } });
  if (f.purpose) and.push({ purpose: { contains: f.purpose, mode: 'insensitive' } });
  if (f.legacy) and.push({ legacy: f.legacy === 'true' });
  return and.length ? { AND: and } : {};
}

type Row = Prisma.ReceiptGetPayload<object>;
async function shapeRows(rows: Row[]) {
  const famIds = [...new Set(rows.map((r) => r.familyId).filter((x): x is number => !!x))];
  const fams = famIds.length ? await prisma.family.findMany({ where: { id: { in: famIds } }, select: { id: true, membershipNo: true } }) : [];
  const m = new Map(fams.map((f) => [f.id, f.membershipNo]));
  return rows.map((r) => ({
    id: r.id,
    serialNo: r.serialNo,
    fy: r.fy,
    memberName: r.memberName,
    membershipNo: r.familyId ? m.get(r.familyId) ?? null : null,
    familyId: r.familyId,
    amount: Number(r.amount),
    purpose: r.purpose,
    utr: r.utr,
    issuedAt: r.issuedAt,
    legacy: r.legacy,
    paymentId: r.paymentId,
    hasPdf: !!r.pdfFileId,
    pdfUrl: `/api/receipts/${r.id}/pdf`,
  }));
}

const parseId = (v: unknown) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw httpError(404, 'NOT_FOUND', 'Receipt not found');
  return n;
};

// ---------- CSV import ----------
const importSchema = z.object({ csv: z.string().min(1, 'Please choose a CSV file.').max(1_900_000, 'This CSV is too large. Please split it into smaller files.') });
const HEADERS = ['serialno', 'date', 'membername', 'membershipno', 'amount', 'purpose', 'utr'] as const;

function parseDate(s: string): Date | null {
  const t = s.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  let y: number, mo: number, d: number;
  if (m) { y = +m[1]!; mo = +m[2]!; d = +m[3]!; }
  else if ((m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t))) { d = +m[1]!; mo = +m[2]!; y = +m[3]!; }
  else return null;
  const dt = new Date(y, mo - 1, d, 12, 0, 0);
  return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d ? dt : null;
}

interface ImportResult { row: number; serialNo: string; status: 'imported' | 'skipped' | 'error'; message: string }

const routes: FastifyPluginAsync = async (app) => {
  app.get('/mine', { preHandler: authenticate }, async (req) => {
    const u = req.user;
    const or: Prisma.ReceiptWhereInput[] = [];
    if (u.familyId) or.push({ familyId: u.familyId });
    or.push({ payment: { payerUserId: u.id } });
    if (u.advertiserId) or.push({ payment: { adRequest: { advertiserId: u.advertiserId } } });
    const pg = paginate(req.query);
    const where: Prisma.ReceiptWhereInput = { OR: or };
    const [rows, total] = await Promise.all([
      prisma.receipt.findMany({ where, orderBy: { issuedAt: 'desc' }, skip: pg.skip, take: pg.take }),
      prisma.receipt.count({ where }),
    ]);
    return pg.result(await shapeRows(rows), total);
  });

  // ---------- staff register ----------
  app.get('/', { preHandler: requirePerm('receipts.view') }, async (req) => {
    const f = parse(filterSchema, req.query);
    const pg = paginate(req.query);
    const where = await whereFor(f);
    const [rows, total, sum] = await Promise.all([
      prisma.receipt.findMany({ where, orderBy: [{ issuedAt: 'desc' }, { id: 'desc' }], skip: pg.skip, take: pg.take }),
      prisma.receipt.count({ where }),
      prisma.receipt.aggregate({ where, _sum: { amount: true } }),
    ]);
    return { ...pg.result(await shapeRows(rows), total), totalAmount: Number(sum._sum.amount ?? 0) };
  });

  app.get('/export', { preHandler: requirePerm('receipts.export') }, async (req, reply) => {
    const f = parse(filterSchema, req.query);
    const { format } = parse(z.object({ format: z.enum(['xlsx', 'csv']).default('xlsx') }), req.query);
    const rows = await shapeRows(await prisma.receipt.findMany({ where: await whereFor(f), orderBy: [{ issuedAt: 'asc' }, { id: 'asc' }], take: 20000 }));
    type R = (typeof rows)[number] & { source: string; date: string };
    const data: R[] = rows.map((r) => ({ ...r, source: r.legacy ? 'Imported (legacy)' : 'Online', date: r.issuedAt.toISOString().slice(0, 10) }));
    const cols: Column<R>[] = [
      { header: 'Receipt No', key: 'serialNo', width: 18 },
      { header: 'Date', key: 'date', width: 12 },
      { header: 'FY', key: 'fy', width: 8 },
      { header: 'Member', key: 'memberName', width: 28 },
      { header: 'Membership No', key: 'membershipNo', width: 15 },
      { header: 'Purpose', key: 'purpose', width: 26 },
      { header: 'Amount (INR)', key: 'amount', width: 14 },
      { header: 'UTR', key: 'utr', width: 22 },
      { header: 'Source', key: 'source', width: 18 },
    ];
    await audit(req, { action: 'receipt.export', entity: 'receipt', summary: `Exported ${data.length} receipts as ${format}`, after: { filters: f, format, count: data.length } });
    const stamp = new Date().toISOString().slice(0, 10);
    if (format === 'csv') {
      return reply.header('Content-Type', 'text/csv; charset=utf-8').header('Content-Disposition', `attachment; filename="receipts-${stamp}.csv"`).send(toCsv(data, cols));
    }
    return reply.header('Content-Type', XLSX).header('Content-Disposition', `attachment; filename="receipts-${stamp}.xlsx"`).send(await toXlsx(data, cols, 'Receipts'));
  });

  app.post('/import', { preHandler: requirePerm('receipts.export') }, async (req) => {
    const { csv } = parse(importSchema, req.body);
    const table = parseCsv(csv);
    if (!table.length) throw httpError(400, 'EMPTY_CSV', 'The CSV file is empty.');
    const head = table[0]!.map((h) => h.trim().toLowerCase().replace(/[\s_-]/g, ''));
    const idx = Object.fromEntries(HEADERS.map((h) => [h, head.indexOf(h)])) as Record<(typeof HEADERS)[number], number>;
    const missing = (['serialno', 'date', 'membername', 'amount', 'purpose'] as const).filter((h) => idx[h] < 0);
    if (missing.length) throw httpError(400, 'BAD_HEADER', `Missing column(s): ${missing.join(', ')}. Expected: serialNo, date, memberName, membershipNo, amount, purpose, utr.`);
    const body = table.slice(1).filter((r) => r.some((c) => c.trim()));
    if (body.length > 5000) throw httpError(400, 'TOO_MANY_ROWS', 'Please import at most 5,000 rows at a time.');

    const results: ImportResult[] = [];
    const seen = new Set<string>();
    for (const [i, r] of body.entries()) {
      const rowNo = i + 2;
      const cell = (k: (typeof HEADERS)[number]) => (idx[k] >= 0 ? (r[idx[k]] ?? '').trim() : '');
      const serialNo = cell('serialno');
      const done = (status: ImportResult['status'], message: string) => results.push({ row: rowNo, serialNo, status, message });
      try {
        const memberName = cell('membername');
        const amount = Number(cell('amount').replace(/[,₹\s]|Rs\.?/gi, ''));
        const date = parseDate(cell('date'));
        const purpose = cell('purpose');
        if (!serialNo) { done('error', 'Receipt number is missing.'); continue; }
        if (serialNo.length > 40) { done('error', 'Receipt number is too long.'); continue; }
        if (!date) { done('error', 'Date must be YYYY-MM-DD or DD/MM/YYYY.'); continue; }
        if (!memberName) { done('error', 'Member name is missing.'); continue; }
        if (!Number.isFinite(amount) || amount <= 0) { done('error', 'Amount must be a number above zero.'); continue; }
        if (!purpose) { done('error', 'Purpose is missing.'); continue; }
        if (seen.has(serialNo) || (await prisma.receipt.findUnique({ where: { serialNo }, select: { id: true } }))) { seen.add(serialNo); done('skipped', 'Receipt number already exists.'); continue; }
        seen.add(serialNo);
        const membershipNo = cell('membershipno');
        const fam = membershipNo ? await prisma.family.findUnique({ where: { membershipNo }, select: { id: true } }) : null;
        const m = /^.+\/(\d{2}-\d{2})\/(\d+)$/.exec(serialNo);
        const fy = m ? m[1]! : fyOf(date);
        await prisma.$transaction(async (tx) => {
          await tx.receipt.create({
            data: { serialNo, fy, familyId: fam?.id ?? null, memberName, amount, purpose, utr: cell('utr') || null, issuedAt: date, legacy: true },
          });
          if (m) {
            // numbering for new receipts continues after the highest imported number of that FY
            const n = Number(m[2]);
            await tx.$executeRaw`INSERT INTO "ReceiptCounter" (fy, "lastNo") VALUES (${fy}, ${n}) ON CONFLICT (fy) DO UPDATE SET "lastNo" = GREATEST("ReceiptCounter"."lastNo", EXCLUDED."lastNo")`;
          }
        });
        done('imported', membershipNo && !fam ? 'Imported (membership number not found, not linked to a family).' : 'Imported.');
      } catch (e) {
        req.log.error(e, 'receipt import row failed'); done('error', 'Could not import this row.');
      }
    }
    const summary = {
      imported: results.filter((x) => x.status === 'imported').length,
      skipped: results.filter((x) => x.status === 'skipped').length,
      errors: results.filter((x) => x.status === 'error').length,
    };
    await audit(req, { action: 'receipt.import', entity: 'receipt', summary: `Legacy import: ${summary.imported} imported, ${summary.skipped} skipped, ${summary.errors} errors`, after: summary });
    return { data: { ...summary, total: results.length, results } };
  });

  // ---------- single receipt ----------
  async function loadAuthorised(req: Parameters<typeof authenticate>[0]) {
    const id = parseId((req.params as { id: string }).id);
    const rc = await prisma.receipt.findUnique({ where: { id } });
    if (!rc) throw httpError(404, 'NOT_FOUND', 'Receipt not found');
    const ok = hasPerm(req.user, 'receipts.view') || (await ownsReceipt(rc, req.user));
    if (!ok) throw httpError(403, 'FORBIDDEN', 'You do not have access to this receipt.');
    return rc;
  }

  app.get('/:id', { preHandler: authenticate }, async (req) => {
    const rc = await loadAuthorised(req);
    const [row] = await shapeRows([rc]);
    return { data: row };
  });

  app.get('/:id/pdf', { preHandler: authenticate }, async (req, reply) => {
    const rc = await loadAuthorised(req);
    const file = await ensureReceiptPdf(rc.id);
    if (!file) throw httpError(404, 'NOT_FOUND', 'Receipt not found');
    const buf = await readStored(file);
    return reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `attachment; filename="${rc.serialNo.replace(/[^\w-]+/g, '-')}.pdf"`)
      .header('Cache-Control', 'private, max-age=60')
      .send(buf);
  });
};
export default routes;
