import { prisma } from '../../lib/prisma';
import type { AuthUser } from '../../lib/auth';

export type ApprovalType = 'registrations' | 'logins' | 'businesses' | 'ads' | 'payments';

const anyPerm = (u: AuthUser, ...p: string[]) => p.some((x) => u.perms.includes(x));

/** Which approval types the caller may see. */
export function visibleTypes(u: AuthUser): ApprovalType[] {
  const out: ApprovalType[] = [];
  if (anyPerm(u, 'registrations.approve')) out.push('registrations');
  if (anyPerm(u, 'logins.approve')) out.push('logins');
  if (anyPerm(u, 'businesses.approve')) out.push('businesses');
  if (anyPerm(u, 'ads.approve', 'ads.manage')) out.push('ads');
  if (anyPerm(u, 'payments.verify')) out.push('payments');
  return out;
}

export const LINKS: Record<ApprovalType, string> = {
  registrations: '/admin/registrations',
  logins: '/admin/logins',
  businesses: '/admin/businesses',
  ads: '/admin/ads',
  payments: '/admin/payments',
};

export async function pendingCounts(u: AuthUser) {
  const types = visibleTypes(u);
  const has = (t: ApprovalType) => types.includes(t);
  const [registrations, logins, businesses, ads, payments] = await Promise.all([
    has('registrations') ? prisma.registration.count({ where: { status: 'PENDING' } }) : 0,
    has('logins') ? prisma.loginActivationRequest.count({ where: { status: 'PENDING' } }) : 0,
    has('businesses') ? prisma.business.count({ where: { status: 'PENDING', deletedAt: null } }) : 0,
    has('ads') ? prisma.adRequest.count({ where: { status: 'CONTENT_SUBMITTED' } }) : 0,
    has('payments') ? prisma.payment.count({ where: { status: 'PENDING' } }) : 0,
  ]);
  const counts: Partial<Record<ApprovalType, number>> = {};
  if (has('registrations')) counts.registrations = registrations;
  if (has('logins')) counts.logins = logins;
  if (has('businesses')) counts.businesses = businesses;
  if (has('ads')) counts.ads = ads;
  if (has('payments')) counts.payments = payments;
  const total = Object.values(counts).reduce((a, b) => a + (b ?? 0), 0);
  return { ...counts, total };
}

export interface WaitingItem {
  type: ApprovalType;
  id: number;
  who: string;
  detail: string | null;
  submittedAt: Date;
  path: string;
}

/** Latest pending items across the types the caller may see (newest first). */
export async function waitingList(u: AuthUser, limit = 10): Promise<WaitingItem[]> {
  const types = visibleTypes(u);
  const has = (t: ApprovalType) => types.includes(t);
  const headName = (persons: { name: string }[]) => persons[0]?.name ?? '-';
  const headInclude = { persons: { where: { isHead: true, deletedAt: null }, take: 1 } } as const;
  const [regs, logins, biz, ads, pays] = await Promise.all([
    has('registrations')
      ? prisma.registration.findMany({
          where: { status: 'PENDING' }, orderBy: { submittedAt: 'desc' }, take: limit,
          include: { family: { include: { ...headInclude, zone: true } } },
        })
      : [],
    has('logins')
      ? prisma.loginActivationRequest.findMany({
          where: { status: 'PENDING' }, orderBy: { createdAt: 'desc' }, take: limit,
          include: { person: { include: { family: true } } },
        })
      : [],
    has('businesses')
      ? prisma.business.findMany({ where: { status: 'PENDING', deletedAt: null }, orderBy: { createdAt: 'desc' }, take: limit, include: { person: true } })
      : [],
    has('ads')
      ? prisma.adRequest.findMany({ where: { status: 'CONTENT_SUBMITTED' }, orderBy: { updatedAt: 'desc' }, take: limit, include: { advertiser: true, placement: true } })
      : [],
    has('payments')
      ? prisma.payment.findMany({
          where: { status: 'PENDING' }, orderBy: { createdAt: 'desc' }, take: limit,
          include: { family: { include: headInclude }, adRequest: { include: { advertiser: true } } },
        })
      : [],
  ]);
  const items: WaitingItem[] = [
    ...regs.map((r) => ({ type: 'registrations' as const, id: r.id, who: headName(r.family.persons), detail: r.family.zone?.name ?? null, submittedAt: r.submittedAt, path: LINKS.registrations })),
    ...logins.map((l) => ({ type: 'logins' as const, id: l.id, who: l.person.name, detail: l.person.family.membershipNo, submittedAt: l.createdAt, path: LINKS.logins })),
    ...biz.map((b) => ({ type: 'businesses' as const, id: b.id, who: b.name, detail: b.person?.name ?? null, submittedAt: b.createdAt, path: LINKS.businesses })),
    ...ads.map((a) => ({ type: 'ads' as const, id: a.id, who: a.advertiser.name, detail: a.placement.name, submittedAt: a.updatedAt, path: LINKS.ads })),
    ...pays.map((p) => ({
      type: 'payments' as const, id: p.id,
      who: p.family ? headName(p.family.persons) : p.adRequest?.advertiser.name ?? '-',
      detail: `Rs ${Number(p.amount)}`, submittedAt: p.createdAt, path: LINKS.payments,
    })),
  ];
  return items.sort((a, b) => b.submittedAt.getTime() - a.submittedAt.getTime()).slice(0, limit);
}
