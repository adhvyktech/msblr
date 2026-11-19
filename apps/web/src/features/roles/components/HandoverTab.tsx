import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { Badge, Button, Card, ChipGroup, EmptyState, ErrorState, Select, Stepper, useToast } from '@/components/ui';
import { api } from '@/lib/api';
import { useT } from '@/lib/useT';
import { useStaff, type PickUser } from '../api';
import { UserPicker } from './UserPicker';

export function HandoverTab() {
  const { t, tc } = useT('roles');
  const toast = useToast();
  const qc = useQueryClient();
  const staff = useStaff();
  const [step, setStep] = useState(0);
  const [fromId, setFromId] = useState('');
  const [to, setTo] = useState<PickUser | null>(null);
  const [roleIds, setRoleIds] = useState<number[]>([]);
  const [done, setDone] = useState<{ moved: number; sessionsRevoked: number } | null>(null);

  const from = staff.data?.find((u) => String(u.userId) === fromId) ?? null;
  const roleOptions = from ? [...new Map(from.roles.map((r) => [r.roleId, r])).values()] : [];
  const selected = roleOptions.filter((r) => roleIds.includes(r.roleId));

  const reset = () => { setStep(0); setFromId(''); setTo(null); setRoleIds([]); setDone(null); };
  const go = useMutation({
    mutationFn: () => api.post<{ moved: number; sessionsRevoked: number }>('/api/roles/handover', { fromUserId: from!.userId, toUserId: to!.id, roleIds }),
    onSuccess: (r) => { setDone(r); toast.success(t('handover.success')); void qc.invalidateQueries({ queryKey: ['roles'] }); void qc.invalidateQueries({ queryKey: ['approvals'] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (staff.isError) return <ErrorState onRetry={() => void staff.refetch()} />;
  if (done) {
    return (
      <EmptyState
        icon={CheckCircle2} title={t('handover.doneTitle')}
        description={t('handover.doneBody', { moved: done.moved, name: to?.name ?? '', revoked: done.sessionsRevoked })}
        action={<Button onClick={reset}>{t('handover.another')}</Button>}
      />
    );
  }
  const steps = [t('handover.s1'), t('handover.s2'), t('handover.s3'), t('handover.s4')];
  const canNext = step === 0 ? !!from : step === 1 ? !!to : step === 2 ? roleIds.length > 0 : true;

  return (
    <div>
      <p className="mb-4 text-muted">{t('handover.intro')}</p>
      <Stepper steps={steps} current={step} className="mb-6" />
      <Card className="max-w-2xl">
        {step === 0 ? (
          <Select
            label={t('handover.from')} required value={fromId} placeholder={t('handover.chooseFrom')}
            onChange={(e) => { setFromId(e.target.value); setRoleIds([]); }}
            options={(staff.data ?? []).filter((u) => u.roles.length).map((u) => ({ value: u.userId, label: `${u.name} (${u.roles.map((r) => r.label).join(', ')})` }))}
          />
        ) : null}
        {step === 1 ? <UserPicker label={t('handover.to')} value={to} onChange={setTo} excludeId={from?.userId} /> : null}
        {step === 2 ? (
          <div>
            <p className="mb-2 text-sm font-semibold text-ink/80">{t('handover.rolesLabel', { name: from?.name ?? '' })}</p>
            <ChipGroup multiple label={t('handover.rolesLabel', { name: from?.name ?? '' })} value={roleIds} onChange={setRoleIds} options={roleOptions.map((r) => ({ value: r.roleId, label: r.label }))} />
            <button type="button" className="mt-3 text-sm font-semibold text-primary" onClick={() => setRoleIds(roleOptions.map((r) => r.roleId))}>{t('handover.all')}</button>
          </div>
        ) : null}
        {step === 3 ? (
          <div className="space-y-3">
            <h3 className="text-lg">{t('handover.confirmTitle')}</h3>
            <div className="flex flex-wrap items-center gap-3 text-base">
              <strong>{from?.name}</strong><ArrowRight size={18} aria-hidden /><strong>{to?.name}</strong>
            </div>
            <div className="flex flex-wrap gap-1.5">{selected.map((r) => <Badge key={r.roleId} tone="accent">{r.label}</Badge>)}</div>
            <p className="rounded-theme-sm bg-warning-soft p-3 text-sm">{t('handover.warn', { name: from?.name ?? '' })}</p>
          </div>
        ) : null}
        <div className="mt-6 flex flex-wrap justify-between gap-2">
          <Button variant="ghost" disabled={step === 0 || go.isPending} onClick={() => setStep(step - 1)}>{tc('actions.back')}</Button>
          {step < 3 ? (
            <Button disabled={!canNext} onClick={() => setStep(step + 1)}>{tc('actions.next')}</Button>
          ) : (
            <Button loading={go.isPending} onClick={() => go.mutate()}>{t('handover.confirm')}</Button>
          )}
        </div>
      </Card>
    </div>
  );
}
