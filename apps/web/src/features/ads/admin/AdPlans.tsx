import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { Badge, Button, Card, EmptyState, ErrorState, Input, Modal, PageHeader, Skeleton, Toggle, useToast } from '@/components/ui';
import { api } from '@/lib/api';
import { useT } from '@/lib/useT';
import { PERIODS, formatList, sizeLabel, type Period, type Placement } from '../shared';

function PlanRow({ placement, period }: { placement: Placement; period: Period }) {
  const { t } = useT('ads');
  const toast = useToast();
  const qc = useQueryClient();
  const plan = placement.plans?.find((p) => p.period === period);
  const [price, setPrice] = useState(plan ? String(plan.price) : '');
  const [active, setActive] = useState(plan?.active ?? true);
  const dirty = (plan ? String(plan.price) : '') !== price || (plan?.active ?? true) !== active;
  const save = useMutation({
    mutationFn: () => api.put('/api/ads/admin/plans', { placementId: placement.id, period, price: Number(price), active }),
    onSuccess: () => { toast.success(t('plans.saved')); void qc.invalidateQueries({ queryKey: ['ads', 'placements-all'] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const bad = price === '' || Number(price) < 0 || Number.isNaN(Number(price));
  return (
    <div className="grid grid-cols-[1fr_auto] items-end gap-3 sm:grid-cols-[120px_1fr_auto_auto]">
      <p className="col-span-2 font-semibold sm:col-span-1 sm:pb-3">{t(`period.${period}`)}</p>
      <Input aria-label={`${t(`period.${period}`)} ${t('plans.price')}`} type="number" inputMode="decimal" min={0} value={price} onChange={(e) => setPrice(e.target.value)} placeholder={t('plans.price')} />
      <Toggle checked={active} onChange={setActive} label={<span className="text-sm">{t('plans.active')}</span>} />
      <Button size="sm" disabled={!dirty || bad} loading={save.isPending} onClick={() => save.mutate()}>{t('plans.save')}</Button>
    </div>
  );
}

function SizeModal({ p, onClose }: { p: Placement; onClose: () => void }) {
  const { t } = useT('ads');
  const toast = useToast();
  const qc = useQueryClient();
  const [f, setF] = useState({ width: String(p.width), height: String(p.height), maxKb: String(p.maxKb), videoMaxS: p.videoMaxS ? String(p.videoMaxS) : '' });
  const save = useMutation({
    mutationFn: () => api.patch(`/api/ads/admin/placements/${p.id}`, { width: Number(f.width), height: Number(f.height), maxKb: Number(f.maxKb), videoMaxS: f.videoMaxS ? Number(f.videoMaxS) : null }),
    onSuccess: () => { toast.success(t('plans.saved')); void qc.invalidateQueries({ queryKey: ['ads'] }); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));
  return (
    <Modal open onClose={onClose} title={`${t('plans.sizes')} · ${p.name}`} footer={<><Button variant="ghost" onClick={onClose}>{t('review.cancel')}</Button><Button loading={save.isPending} onClick={() => save.mutate()}>{t('plans.save')}</Button></>}>
      <div className="grid grid-cols-2 gap-4">
        <Input label={t('plans.width')} type="number" value={f.width} onChange={set('width')} min={50} />
        <Input label={t('plans.height')} type="number" value={f.height} onChange={set('height')} min={50} />
        <Input label={t('plans.maxKb')} type="number" value={f.maxKb} onChange={set('maxKb')} min={20} />
        {p.formats.includes('mp4') ? <Input label={t('plans.videoS')} type="number" value={f.videoMaxS} onChange={set('videoMaxS')} min={1} /> : null}
      </div>
    </Modal>
  );
}

function PlacementCard({ p }: { p: Placement }) {
  const { t } = useT('ads');
  const toast = useToast();
  const qc = useQueryClient();
  const [edit, setEdit] = useState(false);
  const toggle = useMutation({
    mutationFn: (active: boolean) => api.patch(`/api/ads/admin/placements/${p.id}`, { active }),
    onSuccess: () => { toast.success(t('plans.saved')); void qc.invalidateQueries({ queryKey: ['ads'] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg">{p.name}</h2>
          <p className="text-sm text-muted">{p.code} · {sizeLabel(p)} · {formatList(p.formats)} · {p.maxKb} KB{p.videoMaxS ? ` · ${p.videoMaxS}s` : ''}</p>
        </div>
        <div className="flex items-center gap-3">
          {!p.active ? <Badge tone="danger">{t('plans.inactive')}</Badge> : null}
          <Button size="sm" variant="outline" onClick={() => setEdit(true)}>{t('plans.sizes')}</Button>
          <Toggle checked={p.active} onChange={(v) => toggle.mutate(v)} label={<span className="text-sm">{t('plans.placementActive')}</span>} disabled={toggle.isPending} />
        </div>
      </div>
      <div className="space-y-3">{PERIODS.map((per) => <PlanRow key={per + (p.plans?.find((x) => x.period === per)?.price ?? '')} placement={p} period={per} />)}</div>
      {edit ? <SizeModal p={p} onClose={() => setEdit(false)} /> : null}
    </Card>
  );
}

export default function AdPlans() {
  const { t } = useT('ads');
  const q = useQuery({ queryKey: ['ads', 'placements-all'], queryFn: () => api.get<Placement[]>('/api/ads/placements', { params: { all: 1 } }) });
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={t('plans.title')} subtitle={t('plans.subtitle')}
        back={<Link to="/admin/ads" className="mb-2 inline-flex min-h-[44px] items-center gap-1.5 text-sm font-semibold text-primary"><ArrowLeft size={16} aria-hidden />{t('admin.title')}</Link>}
      />
      {q.isLoading ? <div className="space-y-3"><Skeleton className="h-56 w-full" /><Skeleton className="h-56 w-full" /></div> : q.isError ? <ErrorState onRetry={() => void q.refetch()} /> : !q.data?.length ? <EmptyState /> : (
        <div className="space-y-4">{q.data.map((p) => <PlacementCard key={p.id} p={p} />)}</div>
      )}
    </div>
  );
}
