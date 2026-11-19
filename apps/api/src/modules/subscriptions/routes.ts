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
import { subscriptionLabel } from '../receipts/service';

const readSubscription = async () => {
  const s = await getSetting<{ amount?: number }>('subscription', {});
  return Number(s.amount) > 0 ? Number(s.amount) : 0;
};

const overrideSchema = z.object({
  status: z.enum(['ACTIVE', 'DUE', 'EXPIRED']).optional(),
  validUntil: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must look like 2027-03-31'), z.null()]).optional(),
  reason: z.string({ required_error: 'Please give a reason for this change.' }).trim().min(3, 'Please give a reason for this change.').max(300),
}).refine((b) => b.status !== undefined || b.validUntil !== undefined, { message: 'Nothing to change.' });

const listSchema = z.object({
  status: z.enum(['ACTIVE', 'DUE', 'EXPIRED']).optional(),
  q: z.string().trim().max(100).optional(),
});

const routes: FastifyPluginAsync = async (app) => {
  // Family subscription status + payment history
  app.get('/mine', { preHandler: authenticate }, async (req) => {
    const u = req.user;
    if (!u.familyId) throw httpError(404, 'NO_FAMILY', 'Subscriptions apply to member families only.');
    const fam = await prisma.family.findUniqueOrThrow({
      where: { id: u.familyId },
      select: { id: true, membershipNo: true, subscriptionStatus: true, subscriptionValidUntil: true, persons: { where: { isHead: true, deletedAt: null }, select: { name: true }, take: 1 } },
    });
    const [amount, payments, legacy] = await Promise.all([
      readSubscription(),
      prisma.payment.findMany({ where: { familyId: fam.id }, include: { receipt: { select: { id: true, serialNo: true } } }, orderBy: { createdAt: 'desc' }, take: 50 }),
      prisma.receipt.findMany({ where: { familyId: fam.id, legacy: true }, orderBy: { issuedAt: 'desc' }, take: 50 }),
    ]);
    const fy = fyOf(new Date());
    const history = [
      ...payments.map((p) => ({
        id: `p${p.id}`, paymentId: p.id, kind: p.kind, label: p.purpose ?? p.kind, amount: Number(p.amount), date: p.paidOn, status: p.status as string,
        remarks: p.remarks, receiptId: p.receipt?.id ?? null, serialNo: p.receipt?.serialNo ?? null, legacy: false,
      })),
      ...legacy.map((r) => ({
        id: `r${r.id}`, paymentId: null as number | null, kind: 'SUBSCRIPTION', label: r.purpose, amount: Number(r.amount), date: r.issuedAt, status: 'APPROVED',
        remarks: null as string | null, receiptId: r.id as number | null, serialNo: r.serialNo as string | null, legacy: true,
      })),
    ].sort((a, b) => b.date.getTime() - a.date.getTime());
    const covered = !!fam.subscriptionValidUntil && fam.subscriptionValidUntil >= fyEnd(fy);
    return {
      data: {
        family: { id: fam.id, membershipNo: fam.membershipNo, headName: fam.persons[0]?.name ?? null },
        status: fam.subscriptionStatus,
        validUntil: fam.subscriptionValidUntil,
        amount,
        fy,
        periodLabel: subscriptionLabel(fy),
        dueDate: fyEnd(fy),
        coveredThisYear: covered,
        hasPending: payments.some((p) => p.status === 'PENDING' && p.kind === 'SUBSCRIPTION'),
        canPay: u.isHead,
        history,
      },
    };
  });

  // UPI details + deep link
  app.get('/upi', { preHandler: authenticate }, async (req) => {
    const { amount: qAmount } = parse(z.object({ amount: z.coerce.number().positive().max(10_000_000).optional() }), req.query);
    const upi = await getSetting<{ id?: string; payeeName?: string; qrFileId?: number | null }>('upi', {});
    if (!upi.id) throw httpError(404, 'UPI_NOT_CONFIGURED', 'UPI details are not set up yet. Please contact the Sabha office.');
    const amount = qAmount ?? (await readSubscription());
    const u = req.user;
    const fam = u.familyId ? await prisma.family.findUnique({ where: { id: u.familyId }, select: { membershipNo: true } }) : null;
    const tn = fam?.membershipNo ?? (u.advertiserId ? `MSB-AD${u.advertiserId}` : 'MSB');
    const payee = upi.payeeName ?? 'Maheshwari Sabha Bengaluru';
    const q = [`pa=${encodeURIComponent(upi.id)}`, `pn=${encodeURIComponent(payee)}`, ...(amount ? [`am=${amount.toFixed(2)}`] : []), 'cu=INR', `tn=${encodeURIComponent(tn)}`].join('&');
    return {
      data: {
        id: upi.id,
        payeeName: payee,
        qrUrl: upi.qrFileId ? fileUrl(upi.qrFileId) : null,
        amount,
        note: tn,
        deepLink: `upi://pay?${q}`,
      },
    };
  });

  // ---------- staff ----------
  const staff = requirePerm('payments.verify');

  app.get('/admin/summary', { preHandler: staff }, async () => {
    const g = await prisma.family.groupBy({ by: ['subscriptionStatus'], where: { status: 'ACTIVE' }, _count: { _all: true } });
    const out = { ACTIVE: 0, DUE: 0, EXPIRED: 0 };
    for (const r of g) out[r.subscriptionStatus] = r._count._all;
    const pending = await prisma.payment.count({ where: { kind: 'SUBSCRIPTION', status: 'PENDING' } });
    return { data: { ...out, total: out.ACTIVE + out.DUE + out.EXPIRED, pendingPayments: pending, amount: await readSubscription() } };
  });

  app.get('/admin/families', { preHandler: staff }, async (req) => {
    const q = parse(listSchema, req.query);
    const pg = paginate(req.query);
    const where: Prisma.FamilyWhereInput = {
      status: 'ACTIVE',
      ...(q.status ? { subscriptionStatus: q.status } : {}),
      ...(q.q ? { OR: [{ membershipNo: { contains: q.q, mode: 'insensitive' } }, { persons: { some: { deletedAt: null, name: { contains: q.q, mode: 'insensitive' } } } }] } : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.family.findMany({
        where, skip: pg.skip, take: pg.take,
        orderBy: [{ subscriptionValidUntil: { sort: 'asc', nulls: 'first' } }, { id: 'asc' }],
        select: { id: true, membershipNo: true, subscriptionStatus: true, subscriptionValidUntil: true, zone: { select: { name: true } }, persons: { where: { isHead: true, deletedAt: null }, select: { name: true, mobile: true }, take: 1 } },
      }),
      prisma.family.count({ where }),
    ]);
    return pg.result(rows.map((f) => ({
      id: f.id, membershipNo: f.membershipNo, zone: f.zone?.name ?? null, headName: f.persons[0]?.name ?? null, headMobile: f.persons[0]?.mobile ?? null,
      status: f.subscriptionStatus, validUntil: f.subscriptionValidUntil,
    })), total);
  });

  app.patch('/admin/:familyId', { preHandler: staff }, async (req) => {
    const familyId = Number((req.params as { familyId: string }).familyId);
    if (!Number.isInteger(familyId) || familyId <= 0) throw httpError(404, 'NOT_FOUND', 'Family not found');
    const body = parse(overrideSchema, req.body);
    const before = await prisma.family.findUnique({ where: { id: familyId }, select: { subscriptionStatus: true, subscriptionValidUntil: true } });
    if (!before) throw httpError(404, 'NOT_FOUND', 'Family not found');
    const data: Prisma.FamilyUpdateInput = {};
    if (body.status) data.subscriptionStatus = body.status;
    if (body.validUntil !== undefined) data.subscriptionValidUntil = body.validUntil ? new Date(`${body.validUntil}T23:59:59`) : null;
    const after = await prisma.$transaction(async (tx) => {
      const f = await tx.family.update({ where: { id: familyId }, data, select: { id: true, subscriptionStatus: true, subscriptionValidUntil: true } });
      await audit(req, {
        action: 'subscription.override', entity: 'family', entityId: familyId,
        summary: `Subscription changed manually: ${body.reason}`,
        before, after: { subscriptionStatus: f.subscriptionStatus, subscriptionValidUntil: f.subscriptionValidUntil },
      }, tx);
      return f;
    });
    return { data: { id: after.id, status: after.subscriptionStatus, validUntil: after.subscriptionValidUntil } };
  });
};
export default routes;
