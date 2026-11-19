import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { api, type Paged } from '@/lib/api';

export type PayStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type PayKind = 'SUBSCRIPTION' | 'DONATION' | 'AD';
export type SubStatus = 'ACTIVE' | 'DUE' | 'EXPIRED';

export interface HistoryItem {
  id: string; paymentId: number | null; kind: string; label: string; amount: number; date: string; status: PayStatus;
  remarks: string | null; receiptId: number | null; serialNo: string | null; legacy: boolean;
}
export interface SubscriptionMine {
  family: { id: number; membershipNo: string | null; headName: string | null };
  status: SubStatus; validUntil: string | null; amount: number; fy: string; periodLabel: string; dueDate: string;
  coveredThisYear: boolean; hasPending: boolean; canPay: boolean; history: HistoryItem[];
}
export interface UpiInfo { id: string; payeeName: string; qrUrl: string | null; amount: number; note: string; deepLink: string }

export interface PaymentItem {
  id: number; kind: PayKind; amount: number; utr: string; paidOn: string; purpose: string | null; periodLabel: string | null;
  status: PayStatus; remarks: string | null; createdAt: string; verifiedAt: string | null; screenshotUrl: string | null;
  payerName: string | null; payerMobile: string | null; membershipNo: string | null; zone: string | null;
  family: { id: number; membershipNo: string | null; headName: string | null; subscriptionStatus: SubStatus; subscriptionValidUntil: string | null } | null;
  ad: { requestId: number; advertiser: string; placement: string } | null;
  receipt: { id: number; serialNo: string; issuedAt: string } | null;
  expectedAmount?: number | null;
}
export interface PaymentList extends Paged<PaymentItem> { counts: Record<PayStatus, number> }

export interface FamilySub { id: number; membershipNo: string | null; zone: string | null; headName: string | null; headMobile: string | null; status: SubStatus; validUntil: string | null }
export interface SubSummary { ACTIVE: number; DUE: number; EXPIRED: number; total: number; pendingPayments: number; amount: number }

export const useSubscription = () => useQuery({ queryKey: ['subscription', 'mine'], queryFn: () => api.get<SubscriptionMine>('/api/subscriptions/mine') });
export const useUpi = () => useQuery({ queryKey: ['subscription', 'upi'], queryFn: () => api.get<UpiInfo>('/api/subscriptions/upi'), staleTime: 5 * 60_000 });
export const useMyPayments = (page: number) =>
  useQuery({ queryKey: ['payments', 'mine', page], queryFn: () => api.list<PaymentItem>('/api/payments/mine', { page, pageSize: 10 }), placeholderData: keepPreviousData });

export interface SubmitBody { kind: 'SUBSCRIPTION' | 'DONATION'; amount: number; utr: string; paidOn: string; purpose?: string; screenshotFileId: number }
export function useSubmitPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: SubmitBody) => api.post<PaymentItem>('/api/payments', b),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['subscription'] }); void qc.invalidateQueries({ queryKey: ['payments'] }); },
  });
}

// ----- admin -----
export interface DeskFilters { status: PayStatus; kind: string; q: string; page: number }
export const useDeskList = (f: DeskFilters) =>
  useQuery({
    queryKey: ['payments', 'desk', f],
    queryFn: () => api.list<PaymentItem>('/api/payments', { status: f.status, kind: f.kind || undefined, q: f.q || undefined, page: f.page, pageSize: 15 }) as Promise<PaymentList>,
    placeholderData: keepPreviousData,
  });
export const usePaymentDetail = (id: number | null) =>
  useQuery({ queryKey: ['payments', 'detail', id], queryFn: () => api.get<PaymentItem>(`/api/payments/${id}`), enabled: id !== null });

export function useDecide() {
  const qc = useQueryClient();
  const done = () => { void qc.invalidateQueries({ queryKey: ['payments'] }); void qc.invalidateQueries({ queryKey: ['subscriptions-admin'] }); void qc.invalidateQueries({ queryKey: ['receipts'] }); };
  return {
    approve: useMutation({ mutationFn: (v: { id: number; remarks?: string }) => api.post<PaymentItem>(`/api/payments/${v.id}/approve`, { remarks: v.remarks || undefined }), onSuccess: done }),
    reject: useMutation({ mutationFn: (v: { id: number; remarks: string }) => api.post<PaymentItem>(`/api/payments/${v.id}/reject`, { remarks: v.remarks }), onSuccess: done }),
  };
}

export const useSubSummary = () => useQuery({ queryKey: ['subscriptions-admin', 'summary'], queryFn: () => api.get<SubSummary>('/api/subscriptions/admin/summary') });
export const useSubFamilies = (p: { status: string; q: string; page: number }) =>
  useQuery({
    queryKey: ['subscriptions-admin', 'families', p],
    queryFn: () => api.list<FamilySub>('/api/subscriptions/admin/families', { status: p.status || undefined, q: p.q || undefined, page: p.page, pageSize: 20 }),
    placeholderData: keepPreviousData,
  });
export function useOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { familyId: number; status?: SubStatus; validUntil?: string | null; reason: string }) => {
      const { familyId, ...body } = v;
      return api.patch(`/api/subscriptions/admin/${familyId}`, body);
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['subscriptions-admin'] }); void qc.invalidateQueries({ queryKey: ['subscription'] }); },
  });
}
