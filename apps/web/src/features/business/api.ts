import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useInvalidatingMutation } from '@/features/home/mutate';

export type BusinessStatus = 'PENDING' | 'APPROVED' | 'HIDDEN' | 'REJECTED';
export interface Category { id: number; nameEn: string; nameHi: string | null; sort: number; count: number }
export interface Business {
  id: number; familyId: number; name: string; description: string | null; category: { id: number; nameEn: string; nameHi: string | null } | null; categoryId: number | null;
  addressLine: string | null; area: string | null; phone: string | null; whatsapp: string | null; website: string | null; mapsUrl: string | null;
  logoFileId: number | null; logoUrl: string | null; photoFileIds: number[]; photoUrls: string[]; status: BusinessStatus;
  owner: { personId: number | null; name: string | null; membershipNo: string | null; photoUrl: string | null };
  createdAt: string; updatedAt: string; remarks?: string | null;
}

export const catName = (c: { nameEn: string; nameHi: string | null } | null | undefined, lang: 'en' | 'hi') => (c ? (lang === 'hi' && c.nameHi ? c.nameHi : c.nameEn) : '');
export const directionsUrl = (b: Pick<Business, 'mapsUrl' | 'name' | 'addressLine' | 'area'>) =>
  b.mapsUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([b.name, b.addressLine, b.area, 'Bengaluru'].filter(Boolean).join(', '))}`;

export const useCategories = () => useQuery({ queryKey: ['business', 'categories'], queryFn: () => api.get<Category[]>('/api/business/categories'), staleTime: 5 * 60_000 });
export const useAreas = () => useQuery({ queryKey: ['business', 'areas'], queryFn: () => api.get<string[]>('/api/business/areas'), staleTime: 5 * 60_000 });
export const useBusinesses = (p: { q?: string; categoryId?: number | ''; area?: string; page?: number }) =>
  useQuery({
    queryKey: ['business', 'list', p],
    queryFn: () => api.list<Business>('/api/business', { q: p.q, categoryId: p.categoryId || undefined, area: p.area, page: p.page ?? 1, pageSize: 12 }),
    placeholderData: keepPreviousData,
  });
export const useBusiness = (id?: string) => useQuery({ queryKey: ['business', 'one', id], queryFn: () => api.get<Business>(`/api/business/${id}`), enabled: !!id });
export const useMyBusinesses = () => useQuery({ queryKey: ['business', 'mine'], queryFn: () => api.get<Business[]>('/api/business/mine') });

export interface BusinessInput {
  name?: string; categoryId?: number | null; description?: string | null; addressLine?: string | null; area?: string | null;
  phone?: string | null; whatsapp?: string | null; website?: string | null; mapsUrl?: string | null; logoFileId?: number | null; photoFileIds?: number[];
}
export const useSaveBusiness = (msg: string) =>
  useInvalidatingMutation((v: { id?: number; data: BusinessInput }) => (v.id ? api.patch(`/api/business/${v.id}`, v.data) : api.post('/api/business', v.data)), [['business']], msg);
export const useDeleteBusiness = (msg: string) => useInvalidatingMutation((id: number) => api.delete(`/api/business/${id}`), [['business']], msg);

export const useAdminBusinesses = (p: { status?: BusinessStatus | ''; q?: string; page?: number }) =>
  useQuery({
    queryKey: ['business', 'admin', p],
    queryFn: () => api.list<Business>('/api/business/admin', { status: p.status || undefined, q: p.q, page: p.page ?? 1, pageSize: 20 }) as Promise<{ data: Business[]; total: number; page: number; pageSize: number; pending: number }>,
    placeholderData: keepPreviousData,
  });
export const useDecideBusiness = (msg: string) =>
  useInvalidatingMutation((v: { id: number; action: 'approve' | 'reject' | 'hide'; remarks?: string }) => api.post(`/api/business/admin/${v.id}/${v.action}`, v.action === 'reject' ? { remarks: v.remarks } : {}), [['business']], msg);
export const useSaveCategory = (msg: string) =>
  useInvalidatingMutation((v: { id?: number; data: { nameEn: string; nameHi?: string | null } }) => (v.id ? api.patch(`/api/business/admin/categories/${v.id}`, v.data) : api.post('/api/business/admin/categories', v.data)), [['business']], msg);
export const useDeleteCategory = (msg: string) => useInvalidatingMutation((id: number) => api.delete(`/api/business/admin/categories/${id}`), [['business']], msg);
