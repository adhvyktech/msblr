import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { Button, Card, EmptyState, ErrorState, PageHeader, RadioCards, Skeleton, Stepper, Textarea, useToast } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/useT';
import { formatList, rupees, sizeLabel, type AdRequestRow, type Placement } from '../shared';

export default function AdNew() {
  const { t } = useT('ads');
  const toast = useToast();
  const nav = useNavigate();
  const qc = useQueryClient();
  const { me } = useAuth();
  const [step, setStep] = useState(0);
  const [placementId, setPlacementId] = useState<number | null>(null);
  const [planId, setPlanId] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const q = useQuery({ queryKey: ['ads', 'placements'], queryFn: () => api.get<Placement[]>('/api/ads/placements') });
  const placement = q.data?.find((p) => p.id === placementId) ?? null;
  const plan = placement?.plans?.find((p) => p.id === planId) ?? null;

  const create = useMutation({
    mutationFn: () => api.post<AdRequestRow>('/api/ads/requests', { placementId, planId, notes: notes.trim() || undefined }),
    onSuccess: (r) => { void qc.invalidateQueries({ queryKey: ['ads', 'mine'] }); toast.success(t('new.created')); nav(`/advertise/requests/${r.id}`); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!me?.user.advertiserId) {
    return <div className="mx-auto max-w-xl"><EmptyState title={t('new.needAccountTitle')} description={t('new.needAccountBody')} action={<Link to="/advertise"><Button>{t('new.goAdvertise')}</Button></Link>} /></div>;
  }
  const steps = [t('new.stepPlacement'), t('new.stepPlan'), t('new.stepReview')];
  const canNext = step === 0 ? !!placement : step === 1 ? !!plan : true;

  return (
    <div className="mx-auto max-w-2xl pb-24">
      <PageHeader title={t('new.title')} back={<Link to="/advertise" className="mb-2 inline-flex min-h-[44px] items-center gap-1.5 text-sm font-semibold text-primary"><ArrowLeft size={16} aria-hidden />{t('landing.title')}</Link>} />
      <Stepper steps={steps} current={step} className="mb-5" />

      {q.isLoading ? <Skeleton className="h-64 w-full" /> : q.isError ? <ErrorState onRetry={() => void q.refetch()} /> : !q.data?.length ? <EmptyState /> : (
        <>
          {step === 0 ? (
            <RadioCards
              name="placement" label={t('new.choosePlacement')} columns={1} value={placementId}
              onChange={(v) => { setPlacementId(v); setPlanId(null); }}
              options={q.data.map((p) => ({
                value: p.id, label: p.name,
                description: `${sizeLabel(p)} · ${formatList(p.formats)}${p.videoMaxS ? ` · ${t('landing.videoUpTo', { s: p.videoMaxS })}` : ''}`,
              }))}
            />
          ) : null}

          {step === 1 && placement ? (
            <div>
              <p className="mb-3 text-sm text-muted">{placement.name} · {sizeLabel(placement)}</p>
              <RadioCards
                name="plan" label={t('new.choosePlan')} columns={2} value={planId} onChange={setPlanId}
                options={(placement.plans ?? []).map((pl) => ({ value: pl.id, label: t(`period.${pl.period}`), description: `${rupees(pl.price)} · ${t('new.months', { count: pl.months ?? 1 })}` }))}
              />
              {!placement.plans?.length ? <p className="mt-3 text-sm text-danger">{t('new.noPlans')}</p> : null}
              <div className="mt-5">
                <Textarea label={t('new.notes')} placeholder={t('new.notesPh')} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} rows={3} />
              </div>
            </div>
          ) : null}

          {step === 2 && placement && plan ? (
            <Card className="space-y-3">
              <h2 className="text-lg">{t('new.review')}</h2>
              <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-2 text-[15px]">
                <dt className="text-muted">{t('new.placement')}</dt><dd className="font-semibold">{placement.name}</dd>
                <dt className="text-muted">{t('new.size')}</dt><dd>{sizeLabel(placement)} · {formatList(placement.formats)}</dd>
                <dt className="text-muted">{t('new.plan')}</dt><dd>{t(`period.${plan.period}`)}</dd>
                <dt className="text-muted">{t('new.rate')}</dt><dd className="font-semibold">{rupees(plan.price)}</dd>
                {notes.trim() ? (<><dt className="text-muted">{t('new.notesShort')}</dt><dd>{notes}</dd></>) : null}
              </dl>
              <p className="rounded-theme-sm bg-accent-soft p-3 text-sm">{t('new.afterSubmit')}</p>
            </Card>
          ) : null}
        </>
      )}

      <div className="fixed inset-x-0 bottom-16 z-20 border-t border-line bg-surface px-4 py-3 lg:static lg:mt-6 lg:border-0 lg:bg-transparent lg:p-0">
        <div className="mx-auto flex max-w-2xl gap-3">
          {step > 0 ? <Button variant="outline" onClick={() => setStep(step - 1)}>{t('new.back')}</Button> : null}
          {step < 2
            ? <Button className="flex-1" disabled={!canNext} onClick={() => setStep(step + 1)}>{step === 0 ? t('new.nextPlan') : t('new.nextReview')}</Button>
            : <Button className="flex-1" loading={create.isPending} disabled={!placement || !plan} onClick={() => create.mutate()}>{t('new.submit')}</Button>}
        </div>
      </div>
    </div>
  );
}
