import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { Plus } from 'lucide-react';
import { Badge, Button, Card, EmptyState, ErrorState, PageHeader, Skeleton } from '@/components/ui';
import { api, type Paged } from '@/lib/api';
import { fmtDate, fmtNumber } from '@/lib/format';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/useT';
import { AdStatusBadge, rupees, type AdRequestRow } from '../shared';

interface StatsRes { days: { date: string; impressions: number; viewers: number; clicks: number }[]; totals: { impressions: number; viewers: number; clicks: number } }

/** Impressions per week for the last 8 weeks, drawn with plain CSS bars. */
function WeeklyBars({ requestId }: { requestId: number }) {
  const { t } = useT('ads');
  const from = useMemo(() => dayjs().startOf('week').subtract(7, 'week').format('YYYY-MM-DD'), []);
  const q = useQuery({ queryKey: ['ads', 'stats', requestId, from], queryFn: () => api.get<StatsRes>(`/api/ads/requests/${requestId}/stats`, { params: { from } }) });
  const weeks = useMemo(() => {
    const out: { label: string; value: number }[] = [];
    for (let i = 0; i < 8; i++) out.push({ label: dayjs(from).add(i, 'week').format('D MMM'), value: 0 });
    for (const d of q.data?.days ?? []) {
      const idx = Math.floor(dayjs(d.date).diff(dayjs(from), 'day') / 7);
      if (idx >= 0 && idx < 8) out[idx]!.value += d.impressions;
    }
    return out;
  }, [q.data, from]);
  const max = Math.max(1, ...weeks.map((w) => w.value));
  if (q.isLoading) return <Skeleton className="h-24 w-full" />;
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{t('mine.weekly')}</p>
      <div className="flex h-24 items-end gap-1.5" role="img" aria-label={t('mine.weekly')}>
        {weeks.map((w) => (
          <div key={w.label} className="flex h-full flex-1 flex-col justify-end" title={`${w.label}: ${fmtNumber(w.value)}`}>
            <div className="w-full rounded-t bg-accent" style={{ height: `${Math.max(w.value ? 6 : 2, Math.round((w.value / max) * 100))}%` }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-1.5 text-[10px] text-muted">{weeks.map((w) => <span key={w.label} className="flex-1 truncate text-center">{w.label}</span>)}</div>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-theme-sm bg-accent-soft p-3 text-center">
      <p className="font-head text-2xl leading-none">{fmtNumber(value)}</p>
      <p className="mt-1 text-xs text-muted">{label}</p>
    </div>
  );
}

export default function AdMine() {
  const { t } = useT('ads');
  const { me } = useAuth();
  const q = useQuery({
    queryKey: ['ads', 'mine'], enabled: !!me?.user.advertiserId,
    queryFn: () => api.list<AdRequestRow>('/api/ads/requests/mine', { pageSize: 50 }),
  });
  const newBtn = <Link to="/advertise/new"><Button icon={Plus}>{t('landing.newRequest')}</Button></Link>;

  if (!me?.user.advertiserId) {
    return <div className="mx-auto max-w-xl"><EmptyState title={t('new.needAccountTitle')} description={t('new.needAccountBody')} action={<Link to="/advertise"><Button>{t('new.goAdvertise')}</Button></Link>} /></div>;
  }
  const rows = (q.data as Paged<AdRequestRow> | undefined)?.data ?? [];
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t('mine.title')} subtitle={t('mine.subtitle')} actions={newBtn} />
      {q.isLoading ? <div className="space-y-3"><Skeleton className="h-48 w-full" /><Skeleton className="h-48 w-full" /></div> : q.isError ? <ErrorState onRetry={() => void q.refetch()} /> : !rows.length ? (
        <EmptyState title={t('mine.emptyTitle')} description={t('mine.emptyBody')} action={newBtn} />
      ) : (
        <div className="space-y-4">
          {rows.map((r) => {
            const hasStats = !!r.ad && ['LIVE', 'PAUSED', 'EXPIRED', 'APPROVED'].includes(r.status);
            const editable = ['REQUESTED', 'RETURNED', 'CONTENT_SUBMITTED'].includes(r.status);
            return (
              <Card key={r.id} className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="text-lg">{r.ad?.title || r.placement.name}</h2>
                    <p className="text-sm text-muted">{r.placement.name}{r.plan ? ` · ${t(`period.${r.plan.period}`)} · ${rupees(r.plan.price)}` : ''}</p>
                  </div>
                  <AdStatusBadge status={r.status} />
                </div>
                {r.remarks && (r.status === 'RETURNED' || r.status === 'REJECTED') ? (
                  <p className="rounded-theme-sm bg-warning-soft p-3 text-sm"><b>{t('mine.remarks')}:</b> {r.remarks}</p>
                ) : null}
                <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
                  {r.ad?.startsAt ? <span>{fmtDate(r.ad.startsAt)} – {fmtDate(r.ad.endsAt)}</span> : <span>{t('mine.requestedOn', { date: fmtDate(r.createdAt) })}</span>}
                  <Badge tone={r.paymentStatus === 'APPROVED' ? 'success' : r.paymentStatus === 'PENDING' ? 'warning' : r.paymentStatus === 'REJECTED' ? 'danger' : 'neutral'}>{t(`payStatus.${r.paymentStatus}`)}</Badge>
                </div>
                {hasStats ? (
                  <>
                    <div className="grid grid-cols-3 gap-2">
                      <Tile label={t('mine.impressions')} value={r.stats.impressions} />
                      <Tile label={t('mine.viewers')} value={r.stats.uniqueViewers} />
                      <Tile label={t('mine.clicks')} value={r.stats.clicks} />
                    </div>
                    <WeeklyBars requestId={r.id} />
                  </>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Link to={`/advertise/requests/${r.id}`}><Button size="sm" variant={editable ? 'primary' : 'outline'}>{editable ? (r.status === 'RETURNED' ? t('mine.fix') : t('mine.upload')) : t('mine.details')}</Button></Link>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
