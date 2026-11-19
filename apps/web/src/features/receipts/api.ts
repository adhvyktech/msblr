import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { api, type Paged } from '@/lib/api';

export interface ReceiptItem {
  id: number; serialNo: string; fy: string; memberName: string; membershipNo: string | null; familyId: number | null; amount: number;
  purpose: string; utr: string | null; issuedAt: string; legacy: boolean; paymentId: number | null; hasPdf: boolean; pdfUrl: string;
}
export interface RegisterFilters { q: string; fy: string; from: string; to: string; min: string; max: string; purpose: string; legacy: string }
export const emptyFilters: RegisterFilters = { q: '', fy: '', from: '', to: '', min: '', max: '', purpose: '', legacy: '' };

export const filterParams = (f: RegisterFilters) => ({
  q: f.q || undefined, fy: f.fy || undefined, from: f.from || undefined, to: f.to || undefined,
  min: f.min || undefined, max: f.max || undefined, purpose: f.purpose || undefined, legacy: f.legacy || undefined,
});

export const useReceipt = (id: number) => useQuery({ queryKey: ['receipts', 'one', id], queryFn: () => api.get<ReceiptItem>(`/api/receipts/${id}`) });
export const useRegister = (f: RegisterFilters, page: number) =>
  useQuery({
    queryKey: ['receipts', 'register', f, page],
    queryFn: () => api.list<ReceiptItem>('/api/receipts', { ...filterParams(f), page, pageSize: 20 }) as Promise<Paged<ReceiptItem> & { totalAmount: number }>,
    placeholderData: keepPreviousData,
  });

export interface ImportResult { row: number; serialNo: string; status: 'imported' | 'skipped' | 'error'; message: string }
export interface ImportSummary { imported: number; skipped: number; errors: number; total: number; results: ImportResult[] }
export function useImport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (csv: string) => api.post<ImportSummary>('/api/receipts/import', { csv }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['receipts'] }); },
  });
}
