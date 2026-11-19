import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { AdminPerson } from '@/features/members/api';

export const requestOtp = (mobile: string) => api.post<{ sent: boolean; resendAfterSec: number }>('/api/registrations/verify-mobile/request', { mobile });
export const confirmOtp = (mobile: string, code: string, purpose: 'register' | 'status') =>
  api.post<{ otpToken: string }>('/api/registrations/verify-mobile/confirm', { mobile, code, purpose });
export const submitRegistration = (body: unknown) => api.post<{ id: number; status: string }>('/api/registrations', body);
export interface RegStatus {
  id: number; status: 'PENDING' | 'APPROVED' | 'REJECTED'; submittedAt: string; decidedAt: string | null; remarks: string | null;
  headName: string | null; memberCount: number; membershipNo: string | null;
}
export const fetchStatus = (mobile: string, otpToken: string) => api.get<RegStatus>('/api/registrations/status', { params: { mobile, otpToken } });

export interface Registration {
  id: number; status: 'PENDING' | 'APPROVED' | 'REJECTED'; submittedAt: string; decidedAt: string | null; remarks: string | null; headName: string | null;
  family: { id: number; membershipNo: string | null; zone: string | null; addressLine: string | null; area: string | null; city: string; pincode: string | null; persons: AdminPerson[] };
  documents: { fileId: number; url: string; label: string | null; mime: string; originalName: string | null; size: number }[];
}
export interface RegList { data: Registration[]; total: number; page: number; pageSize: number; counts: Record<string, number> }

export const useRegistrations = (status: string, page: number) =>
  useQuery({
    queryKey: ['registrations', status, page],
    queryFn: () => api.list<Registration>('/api/registrations', { status, page, pageSize: 20 }) as unknown as Promise<RegList>,
    placeholderData: (p) => p,
  });

export function useRegistrationDecision() {
  const qc = useQueryClient();
  const done = () => Promise.all([qc.invalidateQueries({ queryKey: ['registrations'] }), qc.invalidateQueries({ queryKey: ['members'] })]);
  return {
    approve: useMutation({ mutationFn: (id: number) => api.post<{ membershipNo: string }>(`/api/registrations/${id}/approve`), onSuccess: done }),
    reject: useMutation({ mutationFn: ({ id, remarks }: { id: number; remarks: string }) => api.post(`/api/registrations/${id}/reject`, { remarks }), onSuccess: done }),
  };
}
