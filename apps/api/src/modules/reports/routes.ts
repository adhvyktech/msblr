import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { requirePerm } from '../../lib/auth';
import { parse } from '../../lib/parse';
import { httpError } from '../../lib/errors';
import { audit } from '../../lib/audit';
import { dayKey } from '../dashboard/util';
import { FORMATS, sendTable, type ReportColumn, type ReportRow, type ReportTotals } from './export';

export const REPORT_TYPES = ['members', 'subscriptions', 'receipts', 'registrations', 'businesses', 'events', 'ads', 'usage', 'monthly-changes'] as const;
type ReportType = (typeof REPORT_TYPES)[number];

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'Use a date like 2026-11-30');
const querySchema = z.object({
  from: date.optional(),
  to: date.optional(),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use a month like 2026-10').optional(),
  format: z.enum(FORMATS).default('json'),
});

interface Report {
  title: string;
  columns: ReportColumn[];
  rows: ReportRow[];
  totals?: ReportTotals;
}
interface Range { from?: Date; to?: Date }

const IST = (d: string) => new Date(`${d.slice(0, 10)}T00:00:00+05:30`);
const range = (from?: string, to?: string): Range => ({ from: from ? IST(from) : undefined, to: to ? new Date(IST(to).getTime() + 86400_000) : undefined });
const between = (r: Range) => (r.from || r.to ? { ...(r.from ? { gte: r.from } : {}), ...(r.to ? { lt: r.to } : {}) } : undefined);
const monthKey = (d: Date) => dayKey(d).slice(0, 7);
const iso = (d?: Date | null) => (d ? dayKey(d) : '');
const num = (c: Omit<ReportColumn, 'num'>): ReportColumn => ({ ...c, num: true });

const builders: Record<ReportType, (r: Range, month?: string) => Promise<Report>> = {
  async members(r) {
    const families = await prisma.family.findMany({
      where: { createdAt: between(r) },
      orderBy: { membershipNo: 'asc' },
      include: { zone: true, persons: { where: { deletedAt: null }, select: { name: true, isHead: true, mobile: true } } },
    });
    const rows = families.map((f) => {
      const head = f.persons.find((p) => p.isHead);
      return {
        membershipNo: f.membershipNo ?? '',
        head: head?.name ?? '',
        mobile: head?.mobile ?? '',
        zone: f.zone?.name ?? '',
        area: f.area ?? '',
        persons: f.persons.length,
        status: f.status,
        subscription: f.subscriptionStatus,
        validUntil: iso(f.subscriptionValidUntil),
      };
    });
    return {
      title: 'Members',
      columns: [
        { key: 'membershipNo', header: 'Membership no' }, { key: 'head', header: 'Head of family' }, { key: 'mobile', header: 'Mobile' },
        { key: 'zone', header: 'Zone' }, { key: 'area', header: 'Area' }, num({ key: 'persons', header: 'Members' }),
        { key: 'status', header: 'Status' }, { key: 'subscription', header: 'Subscription' }, { key: 'validUntil', header: 'Valid until' },
      ],
      rows,
      totals: { membershipNo: 'Total families', persons: rows.reduce((a, x) => a + x.persons, 0) },
    };
  },

  async subscriptions() {
    const [zones, groups] = await Promise.all([
      prisma.zone.findMany({ orderBy: { sort: 'asc' } }),
      prisma.family.groupBy({ by: ['zoneId', 'subscriptionStatus'], where: { status: 'ACTIVE' }, _count: true }),
    ]);
    const names = new Map<number | null, string>(zones.map((z) => [z.id, z.name]));
    names.set(null, 'No zone');
    const acc = new Map<number | null, { zone: string; active: number; due: number; expired: number; total: number }>();
    for (const z of zones) acc.set(z.id, { zone: z.name, active: 0, due: 0, expired: 0, total: 0 });
    for (const g of groups) {
      const row = acc.get(g.zoneId) ?? { zone: names.get(g.zoneId) ?? 'No zone', active: 0, due: 0, expired: 0, total: 0 };
      row[g.subscriptionStatus.toLowerCase() as 'active' | 'due' | 'expired'] += g._count;
      row.total += g._count;
      acc.set(g.zoneId, row);
    }
    const rows = [...acc.values()];
    const sum = (k: 'active' | 'due' | 'expired' | 'total') => rows.reduce((a, x) => a + x[k], 0);
    return {
      title: 'Subscriptions by zone',
      columns: [{ key: 'zone', header: 'Zone' }, num({ key: 'active', header: 'Active' }), num({ key: 'due', header: 'Due' }), num({ key: 'expired', header: 'Expired' }), num({ key: 'total', header: 'Total' })],
      rows,
      totals: { zone: 'Total', active: sum('active'), due: sum('due'), expired: sum('expired'), total: sum('total') },
    };
  },

  async receipts(r) {
    const receipts = await prisma.receipt.findMany({ where: { issuedAt: between(r) }, orderBy: { issuedAt: 'asc' } });
    const acc = new Map<string, { period: string; purpose: string; count: number; amount: number }>();
    for (const x of receipts) {
      const k = `${monthKey(x.issuedAt)}|${x.purpose}`;
      const row = acc.get(k) ?? { period: monthKey(x.issuedAt), purpose: x.purpose, count: 0, amount: 0 };
      row.count++;
      row.amount += Number(x.amount);
      acc.set(k, row);
    }
    const rows = [...acc.values()].sort((a, b) => a.period.localeCompare(b.period) || a.purpose.localeCompare(b.purpose));
    return {
      title: 'Receipts',
      columns: [{ key: 'period', header: 'Period' }, { key: 'purpose', header: 'Purpose' }, num({ key: 'count', header: 'Receipts' }), num({ key: 'amount', header: 'Amount (INR)' })],
      rows,
      totals: { period: 'Total', count: rows.reduce((a, x) => a + x.count, 0), amount: rows.reduce((a, x) => a + x.amount, 0) },
    };
  },

  async registrations(r) {
    const regs = await prisma.registration.findMany({ where: { submittedAt: between(r) }, select: { submittedAt: true, status: true } });
    const acc = new Map<string, { month: string; pending: number; approved: number; rejected: number; total: number }>();
    for (const x of regs) {
      const m = monthKey(x.submittedAt);
      const row = acc.get(m) ?? { month: m, pending: 0, approved: 0, rejected: 0, total: 0 };
      row[x.status.toLowerCase() as 'pending' | 'approved' | 'rejected']++;
      row.total++;
      acc.set(m, row);
    }
    const rows = [...acc.values()].sort((a, b) => a.month.localeCompare(b.month));
    const sum = (k: 'pending' | 'approved' | 'rejected' | 'total') => rows.reduce((a, x) => a + x[k], 0);
    return {
      title: 'Registrations',
      columns: [{ key: 'month', header: 'Month' }, num({ key: 'pending', header: 'Pending' }), num({ key: 'approved', header: 'Approved' }), num({ key: 'rejected', header: 'Rejected' }), num({ key: 'total', header: 'Total' })],
      rows,
      totals: { month: 'Total', pending: sum('pending'), approved: sum('approved'), rejected: sum('rejected'), total: sum('total') },
    };
  },

  async businesses(r) {
    const list = await prisma.business.findMany({ where: { deletedAt: null, createdAt: between(r) }, select: { status: true, category: { select: { nameEn: true } } } });
    const acc = new Map<string, { category: string; approved: number; pending: number; hidden: number; rejected: number; total: number }>();
    for (const b of list) {
      const c = b.category?.nameEn ?? 'Uncategorised';
      const row = acc.get(c) ?? { category: c, approved: 0, pending: 0, hidden: 0, rejected: 0, total: 0 };
      row[b.status.toLowerCase() as 'approved' | 'pending' | 'hidden' | 'rejected']++;
      row.total++;
      acc.set(c, row);
    }
    const rows = [...acc.values()].sort((a, b) => a.category.localeCompare(b.category));
    const sum = (k: 'approved' | 'pending' | 'hidden' | 'rejected' | 'total') => rows.reduce((a, x) => a + x[k], 0);
    return {
      title: 'Businesses by category',
      columns: [
        { key: 'category', header: 'Category' }, num({ key: 'approved', header: 'Approved' }), num({ key: 'pending', header: 'Pending' }),
        num({ key: 'hidden', header: 'Hidden' }), num({ key: 'rejected', header: 'Rejected' }), num({ key: 'total', header: 'Total' }),
      ],
      rows,
      totals: { category: 'Total', approved: sum('approved'), pending: sum('pending'), hidden: sum('hidden'), rejected: sum('rejected'), total: sum('total') },
    };
  },

  async events(r) {
    const evs = await prisma.event.findMany({ where: { startsAt: between(r) }, select: { kind: true, zone: { select: { name: true } } } });
    const acc = new Map<string, { kind: string; zone: string; count: number }>();
    for (const e of evs) {
      const zone = e.zone?.name ?? 'All zones';
      const k = `${e.kind}|${zone}`;
      const row = acc.get(k) ?? { kind: e.kind, zone, count: 0 };
      row.count++;
      acc.set(k, row);
    }
    const rows = [...acc.values()].sort((a, b) => a.kind.localeCompare(b.kind) || a.zone.localeCompare(b.zone));
    return {
      title: 'Events by kind and zone',
      columns: [{ key: 'kind', header: 'Kind' }, { key: 'zone', header: 'Zone' }, num({ key: 'count', header: 'Events' })],
      rows,
      totals: { kind: 'Total', count: rows.reduce((a, x) => a + x.count, 0) },
    };
  },

  async ads(r) {
    const ads = await prisma.ad.findMany({
      orderBy: { id: 'asc' },
      include: {
        request: { include: { advertiser: true, placement: true, plan: true } },
        stats: { where: r.from || r.to ? { date: between(r) } : undefined },
      },
    });
    const rows = ads.map((a) => {
      const s = a.stats.reduce((acc, x) => ({ imp: acc.imp + x.impressions, clk: acc.clk + x.clicksCall + x.clicksWhatsapp + x.clicksWeb }), { imp: 0, clk: 0 });
      return {
        ad: a.title ?? `Ad #${a.id}`,
        advertiser: a.request.advertiser.name,
        placement: a.request.placement.name,
        status: a.request.status,
        impressions: s.imp,
        clicks: s.clk,
        ctr: s.imp ? Math.round((s.clk / s.imp) * 1000) / 10 : 0,
        spend: a.request.plan ? Number(a.request.plan.price) : 0,
      };
    });
    return {
      title: 'Advertisements',
      columns: [
        { key: 'ad', header: 'Ad' }, { key: 'advertiser', header: 'Advertiser' }, { key: 'placement', header: 'Placement' }, { key: 'status', header: 'Status' },
        num({ key: 'impressions', header: 'Impressions' }), num({ key: 'clicks', header: 'Clicks' }), num({ key: 'ctr', header: 'CTR %' }), num({ key: 'spend', header: 'Plan price (INR)' }),
      ],
      rows,
      totals: { ad: 'Total', impressions: rows.reduce((a, x) => a + x.impressions, 0), clicks: rows.reduce((a, x) => a + x.clicks, 0), spend: rows.reduce((a, x) => a + x.spend, 0) },
    };
  },

  async usage(r) {
    const from = r.from ?? new Date(Date.now() - 30 * 86400_000);
    const logs = await prisma.auditLog.findMany({
      where: { action: 'auth.login', at: { gte: from, ...(r.to ? { lt: r.to } : {}) } },
      select: { at: true, actorUserId: true },
    });
    const acc = new Map<string, { date: string; logins: number; users: Set<number> }>();
    const all = new Set<number>();
    for (const l of logs) {
      const d = dayKey(l.at);
      const row = acc.get(d) ?? { date: d, logins: 0, users: new Set<number>() };
      row.logins++;
      if (l.actorUserId) {
        row.users.add(l.actorUserId);
        all.add(l.actorUserId);
      }
      acc.set(d, row);
    }
    const rows = [...acc.values()].sort((a, b) => a.date.localeCompare(b.date)).map((x) => ({ date: x.date, logins: x.logins, activeUsers: x.users.size }));
    return {
      title: 'App usage',
      columns: [{ key: 'date', header: 'Date' }, num({ key: 'logins', header: 'Logins' }), num({ key: 'activeUsers', header: 'Active users' })],
      rows,
      totals: { date: 'Total', logins: rows.reduce((a, x) => a + x.logins, 0), activeUsers: all.size },
    };
  },

  async 'monthly-changes'(_r, month) {
    const m = month ?? monthKey(new Date());
    const [y, mo] = m.split('-').map(Number) as [number, number];
    const start = new Date(`${m}-01T00:00:00+05:30`);
    const end = new Date(`${mo === 12 ? y + 1 : y}-${String(mo === 12 ? 1 : mo + 1).padStart(2, '0')}-01T00:00:00+05:30`);
    const groups = await prisma.auditLog.groupBy({ by: ['actorName', 'actorRole', 'action'], where: { at: { gte: start, lt: end } }, _count: true });
    const rows = groups
      .map((g) => ({ actor: g.actorName ?? 'System', role: g.actorRole ?? '', action: g.action, count: g._count }))
      .sort((a, b) => a.actor.localeCompare(b.actor) || b.count - a.count);
    return {
      title: `Monthly changes ${m}`,
      columns: [{ key: 'actor', header: 'Who' }, { key: 'role', header: 'Role' }, { key: 'action', header: 'Action' }, num({ key: 'count', header: 'Times' })],
      rows,
      totals: { actor: 'Total', count: rows.reduce((a, x) => a + x.count, 0) },
    };
  },
};

const routes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requirePerm('reports.view'));

  app.get('/types', async () => ({ data: REPORT_TYPES }));

  app.get('/:type', async (req, reply) => {
    const { type } = req.params as { type: string };
    if (!(REPORT_TYPES as readonly string[]).includes(type)) throw httpError(404, 'NOT_FOUND', 'Unknown report');
    const q = parse(querySchema, req.query);
    const rep = await builders[type as ReportType](range(q.from, q.to), q.month);
    if (q.format === 'json') return { data: { type, title: rep.title, columns: rep.columns, rows: rep.rows, totals: rep.totals ?? {} } };
    await audit(req, { action: 'report.export', entity: 'report', entityId: type, summary: `Exported ${rep.title} report (${q.format})` });
    return sendTable(reply, q.format, {
      filename: `${type}-${new Date().toISOString().slice(0, 10)}`,
      title: rep.title,
      subtitle: [q.from && `From ${q.from}`, q.to && `To ${q.to}`, q.month && `Month ${q.month}`].filter(Boolean).join('  ') || 'All time',
      columns: rep.columns,
      rows: rep.rows,
      totals: rep.totals,
    });
  });
};
export default routes;
