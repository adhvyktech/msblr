import { z } from 'zod';
import { Relation, type Prisma } from '@prisma/client';
import { mobileSchema } from '@msblr/shared';
import { prisma, type Tx } from '../../lib/prisma';
import { fileUrl } from '../../lib/files';
import { effectivePrivacy } from '../../lib/privacy';
import { httpError } from '../../lib/errors';

// ---------- zod helpers ----------
const blankToNull = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v);
export const str = (max: number) => z.preprocess(blankToNull, z.string().trim().max(max).nullable().optional());
const date = z.preprocess(
  blankToNull,
  z.coerce.date().refine((d) => d.getTime() <= Date.now() + 366 * 86400_000, 'Date cannot be in the future').nullable().optional(),
);
const mobileOpt = z.preprocess(blankToNull, mobileSchema.nullable().optional());
const emailOpt = z.preprocess(blankToNull, z.string().trim().toLowerCase().email('Enter a valid email address').max(150).nullable().optional());
const fileIdOpt = z.preprocess(blankToNull, z.coerce.number().int().positive().nullable().optional());

export const relationSchema = z.nativeEnum(Relation);
export const genderSchema = z.enum(['MALE', 'FEMALE', 'OTHER']);
export const personFieldShape = {
  gender: z.preprocess(blankToNull, genderSchema.nullable().optional()),
  dob: date,
  anniversary: date,
  mobile: mobileOpt,
  email: emailOpt,
  education: str(100),
  occupation: str(100),
  bloodGroup: str(5),
  photoFileId: fileIdOpt,
};
export const personName = z.string().trim().min(2, 'Enter the full name').max(100);
export const memberCreateSchema = z.object({
  name: personName,
  relation: relationSchema.refine((r) => r !== 'SELF', 'Choose how this person is related to the head'),
  ...personFieldShape,
});
export const memberPatchSchema = z.object({ name: personName, relation: relationSchema, ...personFieldShape }).partial();
export const addressSchema = z.object({
  addressLine: z.string().trim().min(3, 'Enter the address').max(250),
  area: z.string().trim().min(2, 'Enter the area').max(100),
  pincode: z.string().trim().regex(/^\d{6}$/, 'Enter a 6-digit pincode'),
  zoneId: z.coerce.number().int().positive(),
  city: str(60),
});
export const headCreateSchema = z.object({ name: personName, ...personFieldShape });

// ---------- membership numbers ----------
/** Next `MSB-####` = max numeric suffix + 1. Serialised with an advisory lock; call inside a transaction. */
export async function nextMembershipNo(tx: Tx): Promise<string> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(740011)`;
  const rows = await tx.$queryRaw<{ n: number | null }[]>`
    SELECT MAX(CAST(SUBSTRING("membershipNo" FROM '^MSB-([0-9]+)$') AS INTEGER)) AS n FROM "Family" WHERE "membershipNo" ~ '^MSB-[0-9]+$'`;
  const n = (rows[0]?.n ?? 0) + 1;
  return `MSB-${String(n).padStart(4, '0')}`;
}

// ---------- misc ----------
export const dayStr = (d?: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

export async function usersWithPerm(perm: string): Promise<number[]> {
  const rows = await prisma.user.findMany({
    where: { status: 'ACTIVE', roles: { some: { role: { permissions: { some: { perm } } } } } },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

export async function roleId(name: string): Promise<number> {
  const r = await prisma.role.findUnique({ where: { name } });
  if (!r) throw httpError(500, 'ROLE_MISSING', `Role ${name} is not configured`);
  return r.id;
}

/** Photos of members shown in the directory must be readable by any logged-in member. */
export async function publishPhoto(tx: Tx, fileId?: number | null) {
  if (fileId) await tx.file.updateMany({ where: { id: fileId, kind: 'photo', visibility: 'PRIVATE' }, data: { visibility: 'MEMBERS' } });
}

/** Ensures an uploaded file may be attached by this actor. Anonymous (registration) uploads have no owner. */
export async function assertAttachable(fileId: number, kinds: string[], ownerUserId: number | null) {
  const f = await prisma.file.findUnique({ where: { id: fileId } });
  if (!f || !kinds.includes(f.kind) || f.ownerUserId !== ownerUserId) {
    throw httpError(400, 'INVALID_FILE', 'One of the uploaded files is invalid. Please upload it again.');
  }
}

// ---------- serialisation of persons for staff / own family ----------
export const personInclude = {
  user: { select: { id: true, status: true, mobile: true } },
  activationReqs: { orderBy: { id: 'desc' }, take: 5, select: { id: true, status: true, remarks: true } },
  privacy: true,
} satisfies Prisma.PersonInclude;
export type PersonWithState = Prisma.PersonGetPayload<{ include: typeof personInclude }>;

export type LoginStatus = 'ACTIVE' | 'REQUESTED' | 'NONE';
export function loginState(p: PersonWithState): { loginStatus: LoginStatus; activationRequestId: number | null; activationRemarks: string | null } {
  if (p.user?.status === 'ACTIVE') return { loginStatus: 'ACTIVE', activationRequestId: null, activationRemarks: null };
  const pending = p.activationReqs.find((r) => r.status === 'PENDING');
  if (pending) return { loginStatus: 'REQUESTED', activationRequestId: pending.id, activationRemarks: null };
  const last = p.activationReqs[0];
  return { loginStatus: 'NONE', activationRequestId: null, activationRemarks: last?.status === 'REJECTED' ? last.remarks : null };
}

/** Raw (unfiltered) person for staff and for the person's own family. */
export function rawPerson(p: PersonWithState) {
  return {
    id: p.id,
    familyId: p.familyId,
    isHead: p.isHead,
    name: p.name,
    relation: p.relation,
    gender: p.gender,
    dob: dayStr(p.dob),
    anniversary: dayStr(p.anniversary),
    mobile: p.mobile,
    email: p.email,
    education: p.education,
    occupation: p.occupation,
    bloodGroup: p.bloodGroup,
    photoFileId: p.photoFileId,
    photoUrl: p.photoFileId ? fileUrl(p.photoFileId) : null,
    wishesOptOut: p.wishesOptOut,
    privacy: effectivePrivacy(p.privacy),
    ...loginState(p),
  };
}

export const familySummary = (f: {
  id: number; membershipNo: string | null; zoneId: number | null; zone?: { name: string } | null; addressLine: string | null; area: string | null;
  city: string; pincode: string | null; status: string; subscriptionStatus: string; subscriptionValidUntil: Date | null; createdAt: Date;
}) => ({
  id: f.id,
  membershipNo: f.membershipNo,
  zoneId: f.zoneId,
  zone: f.zone?.name ?? null,
  addressLine: f.addressLine,
  area: f.area,
  city: f.city,
  pincode: f.pincode,
  status: f.status,
  subscriptionStatus: f.subscriptionStatus,
  subscriptionValidUntil: f.subscriptionValidUntil,
  createdAt: f.createdAt,
});

/** Snapshot used in audit before/after. */
export const personAudit = (p: {
  name: string; relation: string; gender: string | null; dob: Date | null; anniversary: Date | null; mobile: string | null;
  email: string | null; education: string | null; occupation: string | null; bloodGroup: string | null; photoFileId: number | null;
}) => ({
  name: p.name, relation: p.relation, gender: p.gender, dob: dayStr(p.dob), anniversary: dayStr(p.anniversary), mobile: p.mobile, email: p.email,
  education: p.education, occupation: p.occupation, bloodGroup: p.bloodGroup, photoFileId: p.photoFileId,
});

/** Strip undefined so Prisma leaves untouched columns alone. */
export const defined = <T extends Record<string, unknown>>(o: T): Partial<T> =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;

type Gender = 'MALE' | 'FEMALE' | 'OTHER';
interface PersonInput {
  name: string; gender?: Gender | null; dob?: Date | null; anniversary?: Date | null; mobile?: string | null; email?: string | null;
  education?: string | null; occupation?: string | null; bloodGroup?: string | null; photoFileId?: number | null;
}
export interface NewFamilyInput {
  membershipNo?: string | null;
  status: 'ACTIVE' | 'PENDING' | 'INACTIVE';
  zoneId: number | null;
  address: { addressLine?: string | null; area?: string | null; pincode?: string | null; city?: string | null };
  head: PersonInput;
  members?: (PersonInput & { relation: Relation })[];
  createHeadLogin?: boolean;
}
/** Creates a family with its head (and optional members) inside a transaction; optionally creates the head's login. */
export async function createFamilyTx(tx: Tx, input: NewFamilyInput) {
  let membershipNo = input.membershipNo ?? null;
  if (!membershipNo && input.status === 'ACTIVE') membershipNo = await nextMembershipNo(tx);
  if (membershipNo && (await tx.family.findUnique({ where: { membershipNo } }))) {
    throw httpError(409, 'DUPLICATE_MEMBERSHIP', `Membership number ${membershipNo} already exists.`);
  }
  const family = await tx.family.create({
    data: {
      membershipNo,
      status: input.status,
      zoneId: input.zoneId,
      addressLine: input.address.addressLine ?? null,
      area: input.address.area ?? null,
      pincode: input.address.pincode ?? null,
      ...(input.address.city ? { city: input.address.city } : {}),
    },
  });
  const head = await tx.person.create({ data: { familyId: family.id, isHead: true, relation: 'SELF', ...input.head } });
  for (const m of input.members ?? []) await tx.person.create({ data: { familyId: family.id, isHead: false, ...m } });
  let headUserId: number | null = null;
  if (input.createHeadLogin && head.mobile && input.status === 'ACTIVE') {
    const exists = await tx.user.findUnique({ where: { mobile: head.mobile } });
    if (!exists) {
      const u = await tx.user.create({
        data: { mobile: head.mobile, personId: head.id, displayName: head.name, roles: { create: { roleId: await roleId('head') } } },
      });
      headUserId = u.id;
    }
  }
  return { family, head, headUserId };
}
