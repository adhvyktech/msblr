import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useToast } from '@/components/ui';
import { useTranslation } from 'react-i18next';
import { ApiError } from '@/lib/api';

/**
 * Mutation that invalidates the given query keys (and the home payload, which aggregates most content),
 * toasts a success message if given, and surfaces API errors as toasts.
 */
export function useInvalidatingMutation<V, R = unknown>(fn: (v: V) => Promise<R>, keys: QueryKey[], success?: string) {
  const qc = useQueryClient();
  const toast = useToast();
  const { t } = useTranslation('common');
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      for (const k of [...keys, ['home']]) void qc.invalidateQueries({ queryKey: k });
      if (success) toast.success(success);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : t('toast.error')),
  });
}

export const errMsg = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);
