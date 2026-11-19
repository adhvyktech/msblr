import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type LoginStatus = 'ACTIVE' | 'REQUESTED' | 'NONE';
export type PrivacyMap = Record<'mobile' | 'whatsapp' | 'email' | 'address' | 'photo' | 'dob' | 'anniversary' | 'business', boolean>;
export interface FamilyPerson {
  id: number; familyId: number; isHead: boolean; name: string; relation: string; gender: string | null; dob: string | null; anniversary: string | null;
  mobile: string | null; email: string | null; education: string | null; occupation: string | null; bloodGroup: string | null;
  photoFileId: number | null; photoUrl: string | null; wishesOptOut: boolean; privacy: PrivacyMap;
  loginStatus: LoginStatus; activationRequestId: number | null; activationRemarks: string | null;
}
export interface MyFamily {
  family: { id: number; membershipNo: string | null; zone: string | null; status: string; memberCount: number };
  persons: FamilyPerson[];
  canEdit: boolean;
  myPersonId: number | null;
}
export interface PersonPayload {
  name?: string; relation?: string; gender?: string | null; dob?: string | null; anniversary?: string | null; mobile?: string | null;
  email?: string | null; education?: string | null; occupation?: string | null; photoFileId?: number | null;
}

export const useMyFamily = () => useQuery({ queryKey: ['family', 'mine'], queryFn: () => api.get<MyFamily>('/api/family/mine') });

export function useFamilyMutations() {
  const qc = useQueryClient();
  const done = () => Promise.all([qc.invalidateQueries({ queryKey: ['family'] }), qc.invalidateQueries({ queryKey: ['members'] })]);
  return {
    add: useMutation({ mutationFn: (b: PersonPayload) => api.post('/api/family/persons', b), onSuccess: done }),
    update: useMutation({ mutationFn: ({ id, body }: { id: number; body: PersonPayload }) => api.patch(`/api/family/persons/${id}`, body), onSuccess: done }),
    remove: useMutation({ mutationFn: (id: number) => api.delete(`/api/family/persons/${id}`), onSuccess: done }),
    requestLogin: useMutation({ mutationFn: (id: number) => api.post(`/api/family/persons/${id}/activation`), onSuccess: done }),
    withdrawLogin: useMutation({ mutationFn: (id: number) => api.delete(`/api/family/persons/${id}/login`), onSuccess: done }),
  };
}

// ---------- staff: login requests ----------
export interface LoginRequest {
  id: number; status: 'PENDING' | 'APPROVED' | 'REJECTED'; remarks: string | null; createdAt: string; decidedAt: string | null;
  person: { id: number; name: string; relation: string; mobile: string | null };
  family: { id: number; membershipNo: string | null; zone: string | null; headName: string | null };
  requestedBy: string | null;
}
export const useLoginRequests = (status: string, page: number) =>
  useQuery({ queryKey: ['family', 'activations', status, page], queryFn: () => api.list<LoginRequest>('/api/family/activations', { status, page, pageSize: 20 }), placeholderData: (p) => p });
export function useLoginDecision() {
  const qc = useQueryClient();
  const done = () => qc.invalidateQueries({ queryKey: ['family'] });
  return {
    approve: useMutation({ mutationFn: (id: number) => api.post(`/api/family/activations/${id}/approve`), onSuccess: done }),
    reject: useMutation({ mutationFn: ({ id, remarks }: { id: number; remarks: string }) => api.post(`/api/family/activations/${id}/reject`, { remarks }), onSuccess: done }),
    withdraw: useMutation({ mutationFn: (personId: number) => api.delete(`/api/family/admin/persons/${personId}/login`), onSuccess: done }),
  };
}
