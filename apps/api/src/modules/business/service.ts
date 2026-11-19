import type { Prisma } from '@prisma/client';
import { fileUrl } from '../../lib/files';
import { toPublicPerson, type Viewer } from '../../lib/privacy';

const ownerPerson = {
  select: {
    id: true, familyId: true, isHead: true, name: true, photoFileId: true, privacy: true,
    family: { select: { membershipNo: true, zone: { select: { name: true } }, area: true } },
  },
} as const;

export const businessInclude = {
  category: true,
  person: ownerPerson,
  family: {
    select: {
      id: true, membershipNo: true, area: true,
      persons: { where: { isHead: true, deletedAt: null }, take: 1, ...ownerPerson },
    },
  },
} satisfies Prisma.BusinessInclude;
export type BusinessRow = Prisma.BusinessGetPayload<{ include: typeof businessInclude }>;

export function serializeBusiness(b: BusinessRow, viewer: Viewer, extra: Record<string, unknown> = {}) {
  const owner = b.person ?? b.family.persons[0] ?? null;
  const pub = owner ? toPublicPerson(owner, viewer) : null;
  return {
    id: b.id,
    familyId: b.familyId,
    name: b.name,
    description: b.description,
    category: b.category ? { id: b.category.id, nameEn: b.category.nameEn, nameHi: b.category.nameHi } : null,
    categoryId: b.categoryId,
    addressLine: b.addressLine,
    area: b.area,
    phone: b.phone,
    whatsapp: b.whatsapp,
    website: b.website,
    mapsUrl: b.mapsUrl,
    logoFileId: b.logoFileId,
    logoUrl: b.logoFileId ? fileUrl(b.logoFileId) : null,
    photoFileIds: b.photoFileIds,
    photoUrls: b.photoFileIds.map(fileUrl),
    status: b.status,
    owner: {
      personId: pub?.id ?? null,
      name: pub?.name ?? null,
      membershipNo: b.family.membershipNo ?? pub?.membershipNo ?? null,
      photoUrl: pub?.photoUrl ?? null,
    },
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
    ...extra,
  };
}
