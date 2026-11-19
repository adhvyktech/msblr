import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useInvalidatingMutation } from '@/features/home/mutate';

export interface Contact { id: number; section: string; name: string; phone: string; details: string | null; sort: number }
export interface ContactGroup { section: string; items: Contact[] }

export const useContacts = () => useQuery({ queryKey: ['contacts'], queryFn: () => api.get<ContactGroup[]>('/api/contacts') });
export type ContactInput = { section?: string; name?: string; phone?: string; details?: string | null };
export const useSaveContact = (msg: string) =>
  useInvalidatingMutation((v: { id?: number; data: ContactInput }) => (v.id ? api.patch(`/api/contacts/${v.id}`, v.data) : api.post('/api/contacts', v.data)), [['contacts']], msg);
export const useDeleteContact = (msg: string) => useInvalidatingMutation((id: number) => api.delete(`/api/contacts/${id}`), [['contacts']], msg);
export const useReorderContacts = () => useInvalidatingMutation((ids: number[]) => api.put('/api/contacts/order', { ids }), [['contacts']]);
export const telHref = (p: string) => `tel:${p.replace(/[^\d+]/g, '')}`;
