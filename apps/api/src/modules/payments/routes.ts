import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { Prisma, prisma } from '../../lib/prisma';
import { httpError } from '../../lib/errors';
import { parse } from '../../lib/parse';
import { paginate } from '../../lib/pagination';
import { audit } from '../../lib/audit';
import { authenticate, requirePerm } from '../../lib/auth';
import { fileUrl } from '../../lib/files';
import { fyEnd, fyOf } from '../../lib/fy';
import { getSetting } from '../../lib/settings';
import { notify } from '../../lib/push';
import { ensureReceiptPdf, inr, subscriptionLabel } from '../receipts/service';

// ---------- schemas ----------
const dateInput = z.string().trim().min(1, 'Please enter the payment date.').transform((s, ctx) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  let d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0) : new Date(s);
  // a date-only value for today is stored at noon; don't let that look like the future
  if (m && d.getTime() > Date.now() && d.toDateString() === new Date().toDateString()) d = new Date();
  if (Number.isNaN(d.getTime())) {
    ctx.addIssue({ code: 'custom', message: 'Please enter a valid payment date.' });
    return z.NEVER;
  }
  return d;
});

const createSchema = z.object({
  kind: z.enum(['SUBSCRIPTION', 'DONATION', 'AD']),
  amount: z.coerce.number({ invalid_type_error: 'Please enter the amount.' }).positive('Amount must be more than zero.').max(10_000_000, 'Amount is too large.')
    .refine((n) => Math.round(n * 100) / 100 === n, 'Amount can have at most 2 decimal places.'),
  utr: z.string({ required_error: 'Please enter the UTR / transaction ID.' }).trim().toUpperCase()
    .regex(/^[A-Z0-9]{12,22}$/, 'UTR must be 12 to 22 letters or digits (no spaces or symbols).'),
  paidOn: dateInput,
  purpose: z.string().trim().max(200).optional(),
  screenshotFileId: z.coerce.number({ invalid_type_error: 'Please upload the payment screenshot.', required_error: 'Please upload the payment screenshot.' }).int().positive('Please upload the payment screenshot.'),
  adRequestId: z.coerce.number().int().positive().optional(),
});

const listQuery = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
  kind: z.enum(['SUBSCRIPTION', 'DONATION', 'AD']).optional(),
  q: z.string().trim().max(100).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
const rejectSchema = z.object({ remarks: z.string({ required_error: 'Please give a reason for rejecting.' }).trim().min(3, 'Please give a reason for rejecting.').max(500) });
const approveSchema = z.object({ remarks: z.string().trim().max(500).optional() });

const parseId = (v: unknown) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw httpError(404, 'NOT_FOUND', 'Payment not found');
  return n;
};
const dayStart = (s: string) => new Date(`${s}T00:00:00`);
const dayEnd = (s: string) => new Date(`${s}T23:59:59.999`);

// ---------- shaping ----------
const include = {
  family: { select: { id: true, membershipNo: true, subscriptionStatus: true, subscriptionValidUntil: true, zone: { select: { name: true } }, persons: { where: { isHead: true, deletedAt: null }, select: { name: true }, take: 1 } } },
  adRequest: { select: { id: true, advertiser: { select: { id: true, name: true } }, placement: { select: { name: true } } } },
  receipt: { select: { id: true, serialNo: true, issuedAt: true } },
} satisfies Prisma.PaymentInclude;
type PaymentRow = Prisma.PaymentGetPayload<{ include: typeof include }>;

function shape(p: PaymentRow, payers: Map<number, { name: string; mobile: string }>) {
  const payer = p.payerUserId ? payers.get(p.payerUserId) : undefined;
  const headName = p.family?.persons[0]?.name ?? null;
  return {
    id: p.id,
    kind: p.kind,
    amount: Number(p.amount),
    utr: p.utr,
    paidOn: p.paidOn,
    purpose: p.purpose,
    periodLabel: p.periodLabel,
    status: p.status,
    remarks: p.remarks,
    createdAt: p.createdAt,
    verifiedAt: p.verifiedAt,
    screenshotUrl: p.screenshotFileId ? fileUrl(p.screenshotFileId) : null,
    payerName: p.adRequest?.advertiser.name ?? headName ?? payer?.name ?? null,
    payerMobile: payer?.mobile ?? null,
    membershipNo: p.family?.membershipNo ?? null,
    zone: p.family?.zone?.name ?? null,
    family: p.family ? { id: p.family.id, membershipNo: p.family.membershipNo, headName, subscriptionStatus: p.family.subscriptionStatus, subscriptionValidUntil: p.family.subscriptionValidUntil } : null,
    ad: p.adRequest ? { requestId: p.adRequest.id, advertiser: p.adRequest.advertiser.name, placement: p.adRequest.placement.name } : null,
    receipt: p.receipt ? { id: p.receipt.id, serialNo: p.receipt.serialNo, issuedAt: p.receipt.issuedAt } : null,
  };
}
async function payerMap(rows: PaymentRow[]) {
  const ids = [...new Set(rows.map((r) => r.payerUserId).filter((x): x is number => !!x))];
  const users = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, displayName: true, mobile: true, person: { select: { name: true } } } }) : [];
  return new Map(users.map((u) => [u.id, { name: u.displayName ?? u.person?.name ?? u.mobile, mobile: u.mobile }]));
}

/** Users to notify about a payment: the payer, or (if unknown) the family head. */
async function recipients(p: { payerUserId: number | null; familyId: number | null }): Promise<number[]> {
  if (p.payerUserId) return [p.payerUserId];
  if (!p.familyId) return [];
  const u = await prisma.user.findFirst({ where: { person: { familyId: p.familyId, isHead: true } }, select: { id: true } });
  return u ? [u.id] : [];
}

// ---------- routes ----------
const routes: FastifyPluginAsync = async (app) => {
  // Create a payment (proof submission)
  app.post('/', { preHandler: authenticate }, async (req, reply) => {
    const u = req.user;
    const body = parse(createSchema, req.body);
    const canFamily = u.isHead && !!u.familyId;
    const canAdvertiser = !!u.advertiserId;
    if (body.kind === 'AD') {
      if (!canAdvertiser) throw httpError(403, 'FORBIDDEN', 'Only advertisers can pay for advertisements.');
      if (!body.adRequestId) throw httpError(400, 'VALIDATION_ERROR', 'Please choose the advertisement this payment is for.');
      const ar = await prisma.adRequest.findUnique({ where: { id: body.adRequestId }, select: { advertiserId: true } });
      if (!ar || ar.advertiserId !== u.advertiserId) throw httpError(403, 'FORBIDDEN', 'This advertisement request does not belong to you.');
    } else {
      if (!canFamily) throw httpError(403, 'FORBIDDEN', 'Only the head of the family can submit a payment.');
      if (body.adRequestId) throw httpError(400, 'VALIDATION_ERROR', 'An advertisement can only be linked to an ad payment.');
    }
    // Screenshot: must be the caller's own payment_proof upload
    const file = await prisma.file.findUnique({ where: { id: body.screenshotFileId } });
    if (!file || file.kind !== 'payment_proof') throw httpError(400, 'INVALID_SCREENSHOT', 'Please upload the payment screenshot again.');
    if (file.ownerUserId !== u.id) throw httpError(403, 'FORBIDDEN', 'You can only attach a screenshot you uploaded yourself.');
    // Date must not be in the future
    if (body.paidOn.getTime() > Date.now() + 5 * 60_000) throw httpError(400, 'VALIDATION_ERROR', 'The payment date cannot be in the future.');
    // Friendly duplicate message
    const dup = await prisma.payment.findUnique({ where: { utr: body.utr }, select: { id: true } });
    if (dup) throw httpError(409, 'UTR_EXISTS', 'This UTR has already been submitted. Please check the transaction ID, or contact the Sabha office if you think this is a mistake.');

    const fy = fyOf(body.paidOn);
    const defaultPurpose = body.kind === 'SUBSCRIPTION' ? subscriptionLabel(fy) : body.kind === 'DONATION' ? 'Donation' : 'Advertisement';
    const purpose = body.kind === 'SUBSCRIPTION' ? subscriptionLabel(fy) : body.purpose || defaultPurpose;
    try {
      const created = await prisma.$transaction(async (tx) => {
        const p = await tx.payment.create({
          data: {
            kind: body.kind,
            familyId: body.kind === 'AD' ? null : u.familyId,
            adRequestId: body.kind === 'AD' ? body.adRequestId : null,
            payerUserId: u.id,
            amount: body.amount,
            utr: body.utr,
            paidOn: body.paidOn,
            purpose,
            periodLabel: body.kind === 'SUBSCRIPTION' ? fy : null,
            screenshotFileId: file.id,
            status: 'PENDING',
          },
          include,
        });
        await audit(req, { action: 'payment.create', entity: 'payment', entityId: p.id, summary: `${body.kind} payment of Rs. ${inr(body.amount)} submitted (UTR ${body.utr})`, after: { kind: body.kind, amount: body.amount, utr: body.utr } }, tx);
        return p;
      });
      reply.code(201);
      return { data: shape(created, await payerMap([created])) };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw httpError(409, 'UTR_EXISTS', 'This UTR has already been submitted. Please check the transaction ID, or contact the Sabha office if you think this is a mistake.');
      }
      throw e;
    }
  });

  // Own payments (family payments for family members; payer's own for advertisers)
  app.get('/mine', { preHandler: authenticate }, async (req) => {
    const u = req.user;
    const or: Prisma.PaymentWhereInput[] = [{ payerUserId: u.id }];
    if (u.familyId) or.push({ familyId: u.familyId });
    if (u.advertiserId) or.push({ adRequest: { advertiserId: u.advertiserId } });
    const pg = paginate(req.query);
    const where: Prisma.PaymentWhereInput = { OR: or };
    const [rows, total] = await Promise.all([
      prisma.payment.findMany({ where, include, orderBy: { createdAt: 'desc' }, skip: pg.skip, take: pg.take }),
      prisma.payment.count({ where }),
    ]);
    const payers = await payerMap(rows);
    return pg.result(rows.map((r) => shape(r, payers)), total);
  });

  // ---------- staff ----------
  const staff = requirePerm('payments.verify');

  app.get('/', { preHandler: staff }, async (req) => {
    const q = parse(listQuery, req.query);
    const pg = paginate(req.query);
    const and: Prisma.PaymentWhereInput[] = [];
    if (q.kind) and.push({ kind: q.kind });
    if (q.from || q.to) and.push({ paidOn: { ...(q.from ? { gte: dayStart(q.from) } : {}), ...(q.to ? { lte: dayEnd(q.to) } : {}) } });
    if (q.q) {
      and.push({
        OR: [
          { utr: { contains: q.q, mode: 'insensitive' } },
          { family: { membershipNo: { contains: q.q, mode: 'insensitive' } } },
          { family: { persons: { some: { deletedAt: null, name: { contains: q.q, mode: 'insensitive' } } } } },
          { adRequest: { advertiser: { name: { contains: q.q, mode: 'insensitive' } } } },
        ],
      });
    }
    const where: Prisma.PaymentWhereInput = { AND: [...and, ...(q.status ? [{ status: q.status }] : [])] };
    const [rows, total, grouped] = await Promise.all([
      prisma.payment.findMany({ where, include, orderBy: [{ createdAt: q.status === 'PENDING' ? 'asc' : 'desc' }], skip: pg.skip, take: pg.take }),
      prisma.payment.count({ where }),
      prisma.payment.groupBy({ by: ['status'], where: { AND: and }, _count: { _all: true } }),
    ]);
    const counts = { PENDING: 0, APPROVED: 0, REJECTED: 0 };
    for (const g of grouped) counts[g.status] = g._count._all;
    const payers = await payerMap(rows);
    return { ...pg.result(rows.map((r) => shape(r, payers)), total), counts };
  });

  app.get('/:id', { preHandler: staff }, async (req) => {
    const id = parseId((req.params as { id: string }).id);
    const p = await prisma.payment.findUnique({ where: { id }, include });
    if (!p) throw httpError(404, 'NOT_FOUND', 'Payment not found');
    const amount = await getSetting<{ amount?: number }>('subscription', {});
    return { data: { ...shape(p, await payerMap([p])), expectedAmount: p.kind === 'SUBSCRIPTION' ? (amount.amount ?? null) : null, utrUnique: true } };
  });

  app.post('/:id/approve', { preHandler: staff }, async (req) => {
    const id = parseId((req.params as { id: string }).id);
    const body = parse(approveSchema, req.body ?? {});
    const prefix = String((await getSetting<string>('receiptPrefix', 'R')) || 'R');

    const result = await prisma.$transaction(async (tx) => {
      // Lock the payment row so the same payment cannot be approved twice
      const locked = await tx.$queryRaw<{ id: number; status: string }[]>`SELECT id, status::text AS status FROM "Payment" WHERE id = ${id} FOR UPDATE`;
      if (!locked.length) throw httpError(404, 'NOT_FOUND', 'Payment not found');
      if (locked[0]!.status !== 'PENDING') throw httpError(409, 'ALREADY_DECIDED', `This payment has already been ${locked[0]!.status.toLowerCase()}.`);
      const p = await tx.payment.findUniqueOrThrow({ where: { id }, include });

      // Gap-free serial: row-lock the counter for the FY of the payment date
      const fy = fyOf(p.paidOn);
      await tx.$executeRaw`INSERT INTO "ReceiptCounter" (fy, "lastNo") VALUES (${fy}, 0) ON CONFLICT (fy) DO NOTHING`;
      const cur = await tx.$queryRaw<{ lastNo: number }[]>`SELECT "lastNo" FROM "ReceiptCounter" WHERE fy = ${fy} FOR UPDATE`;
      const next = (cur[0]?.lastNo ?? 0) + 1;
      await tx.receiptCounter.update({ where: { fy }, data: { lastNo: next } });
      const serialNo = `${prefix}/${fy}/${String(next).padStart(4, '0')}`;

      const memberName = p.adRequest?.advertiser.name ?? p.family?.persons[0]?.name ?? 'Member';
      const purpose = p.purpose ?? (p.kind === 'SUBSCRIPTION' ? subscriptionLabel(fy) : p.kind === 'DONATION' ? 'Donation' : 'Advertisement');
      const now = new Date();
      const receipt = await tx.receipt.create({
        data: { paymentId: p.id, serialNo, fy, familyId: p.familyId, memberName, amount: p.amount, purpose, utr: p.utr, issuedAt: now },
      });
      const updated = await tx.payment.update({
        where: { id: p.id },
        data: { status: 'APPROVED', verifiedBy: req.user.id, verifiedAt: now, remarks: body.remarks || null },
        include,
      });

      let subscription: { from: Date | null; to: Date } | null = null;
      if (p.kind === 'SUBSCRIPTION' && p.familyId) {
        const fam = await tx.family.findUniqueOrThrow({ where: { id: p.familyId }, select: { subscriptionValidUntil: true } });
        let until = fyEnd(fy);
        if (fam.subscriptionValidUntil && fam.subscriptionValidUntil >= until) {
          // already covered for this FY: extend by one more year from the current end
          const curEnd = fyEnd(fyOf(fam.subscriptionValidUntil));
          until = new Date(curEnd.getFullYear() + 1, 2, 31, 23, 59, 59);
        }
        await tx.family.update({ where: { id: p.familyId }, data: { subscriptionStatus: 'ACTIVE', subscriptionValidUntil: until } });
        subscription = { from: fam.subscriptionValidUntil, to: until };
      }
      if (p.kind === 'AD' && p.adRequestId) {
        const ar = await tx.adRequest.findUniqueOrThrow({ where: { id: p.adRequestId }, select: { notes: true } });
        const flag = `[PAID ${serialNo} Rs. ${inr(Number(p.amount))} on ${now.toISOString().slice(0, 10)}]`;
        await tx.adRequest.update({ where: { id: p.adRequestId }, data: { notes: ar.notes ? `${ar.notes}\n${flag}` : flag } });
      }
      await audit(req, {
        action: 'payment.approve', entity: 'payment', entityId: p.id,
        summary: `Approved payment of Rs. ${inr(Number(p.amount))}, receipt ${serialNo}`,
        before: { status: 'PENDING' }, after: { status: 'APPROVED', receipt: serialNo, subscription },
      }, tx);
      return { payment: updated, receipt };
    }, { timeout: 20_000, maxWait: 20_000 });

    // After commit: PDF + notification (failures here must not undo the approval)
    try { await ensureReceiptPdf(result.receipt.id); } catch (e) { req.log.error(e, 'receipt pdf generation failed'); }
    try {
      const to = await recipients(result.payment);
      await notify(to, {
        title: 'Payment approved',
        titleHi: 'भुगतान स्वीकृत',
        body: `Your payment of Rs. ${inr(Number(result.payment.amount))} has been approved. Receipt ${result.receipt.serialNo} is ready to download.`,
        bodyHi: `आपका Rs. ${inr(Number(result.payment.amount))} का भुगतान स्वीकृत हो गया है। रसीद ${result.receipt.serialNo} डाउनलोड के लिए तैयार है।`,
        kind: 'payment',
        data: { receiptId: String(result.receipt.id), paymentId: String(result.payment.id) },
        sentBy: req.user.id,
      });
    } catch (e) { req.log.error(e, 'payment approval notification failed'); }

    const full = await prisma.payment.findUniqueOrThrow({ where: { id }, include });
    return { data: { ...shape(full, await payerMap([full])), receiptId: result.receipt.id } };
  });

  app.post('/:id/reject', { preHandler: staff }, async (req) => {
    const id = parseId((req.params as { id: string }).id);
    const { remarks } = parse(rejectSchema, req.body ?? {});
    const updated = await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ status: string }[]>`SELECT status::text AS status FROM "Payment" WHERE id = ${id} FOR UPDATE`;
      if (!locked.length) throw httpError(404, 'NOT_FOUND', 'Payment not found');
      if (locked[0]!.status !== 'PENDING') throw httpError(409, 'ALREADY_DECIDED', `This payment has already been ${locked[0]!.status.toLowerCase()}.`);
      const p = await tx.payment.update({ where: { id }, data: { status: 'REJECTED', verifiedBy: req.user.id, verifiedAt: new Date(), remarks }, include });
      await audit(req, { action: 'payment.reject', entity: 'payment', entityId: id, summary: `Rejected payment (UTR ${p.utr}): ${remarks}`, before: { status: 'PENDING' }, after: { status: 'REJECTED', remarks } }, tx);
      return p;
    });
    try {
      await notify(await recipients(updated), {
        title: 'Payment not approved',
        titleHi: 'भुगतान स्वीकृत नहीं हुआ',
        body: `Your payment (UTR ${updated.utr}) could not be approved. Reason: ${remarks}`,
        bodyHi: `आपका भुगतान (UTR ${updated.utr}) स्वीकृत नहीं हो सका। कारण: ${remarks}`,
        kind: 'payment',
        data: { paymentId: String(updated.id) },
        sentBy: req.user.id,
      });
    } catch (e) { req.log.error(e, 'payment rejection notification failed'); }
    return { data: shape(updated, await payerMap([updated])) };
  });
};
export default routes;
