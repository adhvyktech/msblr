import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, ErrorState, Skeleton, useToast } from '@/components/ui';
import { api } from '@/lib/api';
import { useT } from '@/lib/useT';
import { useRoles } from '../api';

export function PermissionsTab() {
  const { t, tc } = useT('roles');
  const toast = useToast();
  const qc = useQueryClient();
  const q = useRoles();
  const [draft, setDraft] = useState<Record<number, string[]>>({});
  useEffect(() => {
    if (q.data) setDraft(Object.fromEntries(q.data.roles.filter((r) => r.isStaff).map((r) => [r.id, r.permissions])));
  }, [q.data]);

  const save = useMutation({
    mutationFn: async () => {
      const changed = (q.data?.roles ?? []).filter((r) => r.isStaff && JSON.stringify([...(draft[r.id] ?? [])].sort()) !== JSON.stringify([...r.permissions].sort()));
      for (const r of changed) await api.put(`/api/roles/roles/${r.id}/permissions`, { perms: draft[r.id] });
      return changed.length;
    },
    onSuccess: (n) => { toast.success(t('perms.saved', { count: n })); void qc.invalidateQueries({ queryKey: ['roles'] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (q.isError) return <ErrorState onRetry={() => void q.refetch()} />;
  if (q.isLoading || !q.data) return <Skeleton className="h-96" />;
  const roles = q.data.roles.filter((r) => r.isStaff);
  const dirty = roles.some((r) => JSON.stringify([...(draft[r.id] ?? [])].sort()) !== JSON.stringify([...r.permissions].sort()));
  const toggle = (id: number, perm: string) =>
    setDraft((d) => ({ ...d, [id]: d[id]?.includes(perm) ? d[id]!.filter((p) => p !== perm) : [...(d[id] ?? []), perm] }));

  return (
    <div>
      <p className="mb-4 text-muted">{t('perms.intro')}</p>
      <div className="overflow-x-auto rounded-theme border border-line bg-surface">
        <table className="w-full min-w-[640px] border-collapse text-left text-[15px]">
          <caption className="sr-only">{t('tabs.roles')}</caption>
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 border-b border-line bg-bg px-3 py-3 text-xs font-semibold uppercase tracking-wide text-muted">{t('perms.permission')}</th>
              {roles.map((r) => (
                <th key={r.id} scope="col" className="border-b border-line bg-bg px-3 py-3 text-center text-xs font-semibold uppercase tracking-wide text-muted">
                  {r.label}<div className="font-normal normal-case">{t('perms.users', { count: r.userCount })}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {q.data.allPermissions.map((perm) => (
              <tr key={perm} className="border-b border-line last:border-0">
                <th scope="row" className="sticky left-0 bg-surface px-3 py-2 text-left font-normal">
                  <div className="font-semibold">{t(`perm.${perm}`, { defaultValue: perm })}</div>
                  <div className="text-xs text-muted">{perm}</div>
                </th>
                {roles.map((r) => {
                  const locked = r.name === 'super_admin' && perm === 'roles.manage';
                  const on = draft[r.id]?.includes(perm) ?? false;
                  return (
                    <td key={r.id} className="px-3 py-1 text-center">
                      <label className="inline-grid min-h-[44px] min-w-[44px] cursor-pointer place-items-center">
                        <input
                          type="checkbox" checked={on} disabled={locked} onChange={() => toggle(r.id, perm)}
                          aria-label={`${r.label}: ${t(`perm.${perm}`, { defaultValue: perm })}`}
                          className="h-5 w-5 cursor-pointer accent-[var(--primary)] disabled:cursor-not-allowed"
                        />
                      </label>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button loading={save.isPending} disabled={!dirty} onClick={() => save.mutate()}>{tc('actions.save')}</Button>
        <Button variant="ghost" disabled={!dirty || save.isPending} onClick={() => q.data && setDraft(Object.fromEntries(roles.map((r) => [r.id, r.permissions])))}>{t('perms.reset')}</Button>
        <p className="text-sm text-muted">{t('perms.lockNote')}</p>
      </div>
    </div>
  );
}
