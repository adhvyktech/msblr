import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Paged } from '@/lib/api';
import type { PublicPerson } from '@/lib/auth';

export interface Zone { id: number; name: string }
export interface DirectoryFamily {
  id: number; membershipNo: string | null; zoneId: number | null; zone: string | null; area: string | null; memberCount: number;
  head: PublicPerson | null; businesses: { id: number; name: string }[];
}
export interface FamilyDetail {
  family: { id: number; membershipNo: string | null; zoneId: number | null; zone: string | null; area: string | null; status: string; memberCount: number; isOwn: boolean };
  persons: PublicPerson[];
  businesses: { id: number; name: string; category: { nameEn: string; nameHi: string | null } | null }[];
}
export interface DirectoryParams { q?: string; zoneId?: string; area?: string; hasBusiness?: boolean; page?: number; pageSize?: number }

export const useZones = () => useQuery({ queryKey: ['members', 'zones'], queryFn: () => api.get<Zone[]>('/api/members/zones'), staleTime: 10 * 60_000 });
export const useDirectory = (p: DirectoryParams) =>
  useQuery({
    queryKey: ['members', 'directory', p],
    queryFn: () => api.list<DirectoryFamily>('/api/members', { q: p.q, zoneId: p.zoneId, area: p.area, hasBusiness: p.hasBusiness ? 'true' : undefined, page: p.page, pageSize: p.pageSize }),
    placeholderData: (prev) => prev,
  });
export const useFamilyDetail = (id: number) =>
  useQuery({ queryKey: ['members', 'detail', id], queryFn: () => api.get<FamilyDetail>(`/api/members/${id}`), enabled: Number.isInteger(id) && id > 0 });

// ---------- staff ----------
export interface AdminPerson {
  id: number; familyId: number; isHead: boolean; name: string; relation: string; gender: string | null; dob: string | null; anniversary: string | null;
  mobile: string | null; email: string | null; education: string | null; occupation: string | null; bloodGroup: string | null;
  photoUrl: string | null; wishesOptOut: boolean; loginStatus: 'ACTIVE' | 'REQUESTED' | 'NONE'; activationRemarks: string | null;
}
export interface AdminFamily {
  id: number; membershipNo: string | null; zoneId: number | null; zone: string | null; addressLine: string | null; area: string | null; city: string;
  pincode: string | null; status: string; subscriptionStatus: string; subscriptionValidUntil: string | null; createdAt: string;
  persons: AdminPerson[]; head: string | null; headMobile: string | null; memberCount: number;
}
export interface AdminFilters { q?: string; status?: string; subscriptionStatus?: string; zoneId?: string; page?: number; pageSize?: number }

export const useAdminFamilies = (f: AdminFilters) =>
  useQuery({ queryKey: ['members', 'admin', f], queryFn: () => api.list<AdminFamily>('/api/members/admin', { ...f }), placeholderData: (prev) => prev });
export const useAdminFamily = (id: number) =>
  useQuery({ queryKey: ['members', 'admin-one', id], queryFn: () => api.get<AdminFamily>(`/api/members/admin/${id}`), enabled: id > 0 });

export function useMembersMutations() {
  const qc = useQueryClient();
  const done = () => qc.invalidateQueries({ queryKey: ['members'] });
  return {
    patchFamily: useMutation({ mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) => api.patch<AdminFamily>(`/api/members/admin/${id}`, body), onSuccess: done }),
    patchPerson: useMutation({ mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) => api.patch(`/api/members/admin/persons/${id}`, body), onSuccess: done }),
    createFamily: useMutation({ mutationFn: (body: Record<string, unknown>) => api.post<AdminFamily>('/api/members/admin/families', body), onSuccess: done }),
    withdrawLogin: useMutation({ mutationFn: (personId: number) => api.delete(`/api/family/admin/persons/${personId}/login`), onSuccess: () => { void done(); void qc.invalidateQueries({ queryKey: ['family'] }); } }),
  };
}

export interface ImportResult {
  summary: { total: number; created: number; skipped: number; errors: number };
  results: { line: number; membershipNo: string; name: string; status: 'created' | 'skipped' | 'error'; message: string }[];
}
export const importCsv = (file: File) => {
  const fd = new FormData();
  fd.append('file', file);
  return api.post<ImportResult>('/api/members/admin/import', fd);
};

export const RELATIONS = ['SPOUSE', 'SON', 'DAUGHTER', 'DAUGHTER_IN_LAW', 'SON_IN_LAW', 'FATHER', 'MOTHER', 'BROTHER', 'SISTER', 'GRANDSON', 'GRANDDAUGHTER', 'OTHER'] as const;
export type Paging<T> = Paged<T>;
