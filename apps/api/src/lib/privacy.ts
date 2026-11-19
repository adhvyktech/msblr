import type { AuthUser } from './auth';
import { fileUrl } from './files';

export const PRIVACY_FIELDS = ['mobile', 'whatsapp', 'email', 'address', 'photo', 'dob', 'anniversary', 'business'] as const;
export type PrivacyField = (typeof PRIVACY_FIELDS)[number];
export const PRIVACY_DEFAULTS: Record<PrivacyField, boolean> = {
  mobile: true,
  whatsapp: true,
  photo: true,
  business: true,
  email: false,
  address: false,
  dob: false,
  anniversary: false,
};

export interface PersonLike {
  id: number;
  familyId: number;
  isHead: boolean;
  name: string;
  relation?: string | null;
  gender?: string | null;
  dob?: Date | null;
  anniversary?: Date | null;
  mobile?: string | null;
  email?: string | null;
  education?: string | null;
  occupation?: string | null;
  bloodGroup?: string | null;
  photoFileId?: number | null;
  wishesOptOut?: boolean;
  privacy?: { field: string; visible: boolean }[];
  family?: {
    addressLine?: string | null;
    area?: string | null;
    city?: string | null;
    pincode?: string | null;
    membershipNo?: string | null;
    zone?: { name: string } | null;
  } | null;
}
export type Viewer = Pick<AuthUser, 'familyId' | 'perms'> | null | undefined;

const day = (d?: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/** Effective visibility for a person's privacy rows merged with defaults. */
export function effectivePrivacy(rows?: { field: string; visible: boolean }[]): Record<PrivacyField, boolean> {
  const m = { ...PRIVACY_DEFAULTS };
  for (const r of rows ?? []) if (r.field in m) m[r.field as PrivacyField] = r.visible;
  return m;
}

/**
 * All member-facing person data goes through here. Hidden fields are nulled and listed in `hidden`
 * so the UI can show a lock. Own family + staff with members.view_private see everything (hidden = []).
 * Include `privacy` rows and (for address/membershipNo/zone) `family` (+ family.zone) on the person.
 */
export function toPublicPerson(p: PersonLike, viewer: Viewer) {
  const full = !!viewer && (viewer.familyId === p.familyId || viewer.perms.includes('members.view_private'));
  const vis = effectivePrivacy(p.privacy);
  const hidden: string[] = [];
  const show = (f: PrivacyField) => {
    const ok = full || vis[f];
    if (!ok) hidden.push(f);
    return ok;
  };
  const f = p.family;
  const addr = f ? [f.addressLine, f.area, f.city, f.pincode].filter(Boolean).join(', ') : null;
  return {
    id: p.id,
    familyId: p.familyId,
    name: p.name,
    isHead: p.isHead,
    relation: p.relation ?? null,
    gender: p.gender ?? null,
    education: p.education ?? null,
    occupation: p.occupation ?? null,
    membershipNo: f?.membershipNo ?? null,
    zone: f?.zone?.name ?? null,
    area: f?.area ?? null,
    mobile: show('mobile') ? p.mobile ?? null : null,
    whatsapp: show('whatsapp') ? p.mobile ?? null : null,
    email: show('email') ? p.email ?? null : null,
    address: f ? (show('address') ? addr : null) : null,
    photoUrl: show('photo') && p.photoFileId ? fileUrl(p.photoFileId) : null,
    dob: show('dob') ? day(p.dob) : null,
    anniversary: show('anniversary') ? day(p.anniversary) : null,
    bloodGroup: full ? p.bloodGroup ?? null : null,
    businessVisible: show('business'),
    hidden: [...new Set(hidden)],
  };
}
