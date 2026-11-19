import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/components/ui';
import { useT } from '@/lib/useT';

export interface Bilingual { en: string; hi: string }
export interface SettingsData {
  theme: 'a' | 'b' | 'c';
  upi: { id: string; payeeName: string; qrFileId: number | null };
  subscription: { amount: number; yearMode: 'FY' };
  trustedDeviceDays: number;
  businessApprovalRequired: boolean;
  contentStaleDays: number;
  wishTemplates: { birthday: Bilingual; anniversary: Bilingual };
  receiptPrefix: string;
  sabha: { name: string; nameHi: string; address: string; phone: string; email: string };
}
export interface Zone { id: number; name: string; sort: number; families: number; events: number; staff: number }

export const useSettings = () => useQuery({ queryKey: ['settings', 'all'], queryFn: () => api.get<SettingsData>('/api/settings') });
export const useZoneList = () => useQuery({ queryKey: ['settings', 'zones'], queryFn: () => api.get<Zone[]>('/api/settings/zones') });

/** Field-level error message from a 400 response (details[].path). */
export function fieldError(e: unknown, path?: string): string | undefined {
  if (!(e instanceof ApiError) || e.code !== 'VALIDATION_ERROR') return undefined;
  const d = (e.details as { path: string; message: string }[] | undefined) ?? [];
  if (!path) return d[0]?.message ?? e.message;
  return d.find((x) => x.path === path || x.path.endsWith(`.${path}`))?.message;
}

export function useSaveSetting<K extends keyof SettingsData>(key: K) {
  const qc = useQueryClient();
  const toast = useToast();
  const { t } = useT('settings');
  return useMutation({
    mutationFn: (value: SettingsData[K]) => api.put(`/api/settings/${key}`, { value }),
    onSuccess: () => {
      toast.success(t('saved'));
      void qc.invalidateQueries({ queryKey: ['settings', 'all'] });
      void qc.invalidateQueries({ queryKey: ['public-config'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
