import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { BarChart3, Eye, Megaphone, MousePointerClick, Users } from 'lucide-react';
import { Button, Card, EmptyState, ErrorState, PageHeader, Section, Skeleton, Table, useToast, type Column } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/useT';
import { PERIODS, formatList, rupees, sizeLabel, type Placement } from '../shared';

export default function Advertise() {
  const { t } = useT('ads');
  const toast = useToast();
  const nav = useNavigate();
  const { me, isHead, reloadMe } = useAuth();
  const isAdvertiser = !!me?.user.advertiserId;
  const [busy, setBusy] = useState(false);
  const q = useQuery({ queryKey: ['ads', 'placements'], queryFn: () => api.get<Placement[]>('/api/ads/placements') });
  const enable = useMutation({
    mutationFn: () => api.post('/api/advertisers/me/enable', {}),
    onSuccess: async () => { setBusy(true); await reloadMe(); toast.success(t('landing.enabled')); nav('/advertise/new'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const cols: Column<Placement>[] = [
    { key: 'name', header: t('landing.colPlacement'), render: (p) => <div><p className="font-semibold">{p.name}</p><p className="text-xs text-muted">{p.platform === 'WEB' ? t('landing.web') : p.platform === 'APP' ? t('landing.app') : t('landing.both')}</p></div> },
    { key: 'size', header: t('landing.colSize'), render: (p) => <div><p>{sizeLabel(p)}</p><p className="text-xs text-muted">{formatList(p.formats)} · {t('landing.upTo', { kb: p.maxKb })}{p.videoMaxS ? ` · ${t('landing.videoUpTo', { s: p.videoMaxS })}` : ''}</p></div> },
    ...PERIODS.map((per): Column<Placement> => ({
      key: per, header: t(`period.${per}`), align: 'right', hideOnMobile: per === 'HALF_YEARLY' || per === 'YEARLY',
      render: (p) => { const x = p.plans?.find((pl) => pl.period === per); return x ? rupees(x.price) : '—'; },
    })),
  ];

  const benefits = [
    { icon: Users, k: 'b1' }, { icon: Eye, k: 'b2' }, { icon: MousePointerClick, k: 'b3' }, { icon: BarChart3, k: 'b4' },
  ];

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={t('landing.title')} subtitle={t('landing.subtitle')} />

      <Card tone="accent-soft" className="mb-6 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-surface text-primary"><Megaphone size={24} aria-hidden /></span>
          <div>
            <h2 className="text-lg">{isAdvertiser ? t('landing.ctaReadyTitle') : t('landing.ctaTitle')}</h2>
            <p className="text-sm text-muted">{isAdvertiser ? t('landing.ctaReadyBody') : isHead ? t('landing.ctaHeadBody') : t('landing.ctaOtherBody')}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {isAdvertiser ? (
            <>
              <Link to="/advertise/new"><Button>{t('landing.newRequest')}</Button></Link>
              <Link to="/advertise/mine"><Button variant="outline">{t('landing.myAds')}</Button></Link>
            </>
          ) : isHead ? (
            <Button onClick={() => enable.mutate()} loading={enable.isPending || busy}>{t('landing.enableCta')}</Button>
          ) : (
            <Link to="/advertise/signup"><Button variant="outline">{t('landing.signupCta')}</Button></Link>
          )}
        </div>
      </Card>

      <Section title={t('landing.whyTitle')}>
        <div className="grid gap-3 sm:grid-cols-2">
          {benefits.map(({ icon: Icon, k }) => (
            <Card key={k} className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent-soft text-accent"><Icon size={20} aria-hidden /></span>
              <div><h3 className="text-base">{t(`landing.${k}t`)}</h3><p className="text-sm text-muted">{t(`landing.${k}b`)}</p></div>
            </Card>
          ))}
        </div>
      </Section>

      <Section title={t('landing.placementsTitle')}>
        <p className="mb-3 text-sm text-muted">{t('landing.placementsHint')}</p>
        {q.isLoading ? <Skeleton className="h-56 w-full" /> : q.isError ? <ErrorState onRetry={() => void q.refetch()} /> : !q.data?.length ? <EmptyState /> : (
          <Table columns={cols} rows={q.data} rowKey={(p) => p.id} caption={t('landing.placementsTitle')} />
        )}
      </Section>

      <Section title={t('landing.howTitle')}>
        <ol className="grid gap-3 sm:grid-cols-4">
          {[1, 2, 3, 4].map((n) => (
            <li key={n} className="rounded-theme border border-line bg-surface p-4">
              <span className="mb-2 grid h-8 w-8 place-items-center rounded-full bg-primary text-sm font-bold text-on-primary">{n}</span>
              <p className="font-semibold">{t(`landing.s${n}t`)}</p>
              <p className="text-sm text-muted">{t(`landing.s${n}b`)}</p>
            </li>
          ))}
        </ol>
      </Section>
    </div>
  );
}
