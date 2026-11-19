import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useInvalidatingMutation } from '@/features/home/mutate';

export interface TrustAttachment { id: number; label: string; fileId: number | null; isLink: boolean; href: string | null; url: string | null }
export interface Trust { id: number; name: string; description: string | null; sort: number; attachments: TrustAttachment[] }

export const useTrusts = () => useQuery({ queryKey: ['trusts'], queryFn: () => api.get<Trust[]>('/api/trusts') });
export const useSaveTrust = (msg: string) =>
  useInvalidatingMutation((v: { id?: number; data: { name?: string; description?: string | null } }) => (v.id ? api.patch<Trust>(`/api/trusts/${v.id}`, v.data) : api.post<Trust>('/api/trusts', v.data)), [['trusts']], msg);
export const useDeleteTrust = (msg: string) => useInvalidatingMutation((id: number) => api.delete(`/api/trusts/${id}`), [['trusts']], msg);
export const useReorderTrusts = () => useInvalidatingMutation((ids: number[]) => api.put('/api/trusts/order', { ids }), [['trusts']]);
export const useAddAttachment = (msg: string) =>
  useInvalidatingMutation((v: { id: number; label: string; fileId?: number; url?: string }) => api.post<Trust>(`/api/trusts/${v.id}/attachments`, { label: v.label, fileId: v.fileId, url: v.url }), [['trusts']], msg);
export const useRemoveAttachment = (msg: string) =>
  useInvalidatingMutation((v: { id: number; attId: number }) => api.delete<Trust>(`/api/trusts/${v.id}/attachments/${v.attId}`), [['trusts']], msg);
