import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { ArrowLeft, Eye, IndianRupee, MousePointerClick, Users } from 'lucide-react';
import { Card, DateInput, ErrorState, PageHeader, StatCard, Table, type Column } from '@/components/ui';
import { api } from '@/lib/api';
import { fmtDate, fmtNumber } from '@/lib/format';
import { useT } from '@/lib/useT';
import { AdStatusBadge, rupees } from '../shared';

interface Row {
  adId: number; requestId: number; title: string | null; advertiser: string; placement: string; status: string; startsAt: string | null; endsAt: string | null;
  impressions: number; viewers: number; clicksCall: number; clicksWhatsapp: number; clicksWeb: number; clicks: number; ctr: number; spend: number;
}
interface Res { rows: Row[]; totals: { impressions: number; viewers: number; clicks: number; spend: number }; from: string; to: string }

export default function AdAnalytics() {
  const { t } = useT('ads');
  const [from, setFrom] = useState(dayjs().subtract(29, 'day').format('YYYY-MM-DD'));
  const [to, setTo] = useState(dayjs().format('YYYY-MM-DD'));
  const valid = !!from && !!to && from <= to;
  const q = useQuery({ queryKey: ['ads', 'analytics', from, to], enabled: valid, queryFn: () => api.get<Res>('/api/ads/admin/analytics', { params: { from, to } }) });
  const cols: Column<Row>[] = [
    { key: 'ad', header: t('analytics.ad'), render: (r) => <div><p className="font-semibold">{r.title ?? '—'}</p><p className="text-xs text-muted">{r.advertiser} · {r.placement}</p></div> },
    { key: 'status', header: t('admin.status'), render: (r) => <AdStatusBadge status={r.status} /> },
    { key: 'dates', header: t('analytics.runs'), hideOnMobile: true, render: (r) => `${fmtDate(r.startsAt)} – ${fmtDate(r.endsAt)}` },
    { key: 'imp', header: t('mine.impressions'), align: 'right', render: (r) => fmtNumber(r.impressions) },
    { key: 'vw', header: t('mine.viewers'), align: 'right', hideOnMobile: true, render: (r) => fmtNumber(r.viewers) },
    { key: 'cl', header: t('mine.clicks'), align: 'right', render: (r) => <span title={`${r.clicksCall} / ${r.clicksWhatsapp} / ${r.clicksWeb}`}>{fmtNumber(r.clicks)}</span> },
    { key: 'ctr', header: t('analytics.ctr'), align: 'right', hideOnMobile: true, render: (r) => `${r.ctr}%` },
    { key: 'spend', header: t('analytics.spend'), align: 'right', render: (r) => rupees(r.spend) },
  ];
  return (
    <div>
      <PageHeader
        title={t('analytics.title')} subtitle={t('analytics.subtitle')}
        back={<Link to="/admin/ads" className="mb-2 inline-flex min-h-[44px] items-center gap-1.5 text-sm font-semibold text-primary"><ArrowLeft size={16} aria-hidden />{t('admin.title')}</Link>}
      />
      <Card className="mb-5 grid gap-4 sm:max-w-lg sm:grid-cols-2">
        <DateInput label={t('analytics.from')} value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        <DateInput label={t('analytics.to')} value={to} min={from} max={dayjs().format('YYYY-MM-DD')} onChange={(e) => setTo(e.target.value)} error={valid ? undefined : t('analytics.rangeError')} />
      </Card>
      {q.isError ? <ErrorState onRetry={() => void q.refetch()} /> : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard icon={Eye} label={t('mine.impressions')} value={fmtNumber(q.data?.totals.impressions ?? 0)} />
            <StatCard icon={Users} label={t('mine.viewers')} value={fmtNumber(q.data?.totals.viewers ?? 0)} hint={t('analytics.viewersHint')} />
            <StatCard icon={MousePointerClick} label={t('mine.clicks')} value={fmtNumber(q.data?.totals.clicks ?? 0)} />
            <StatCard icon={IndianRupee} label={t('analytics.spend')} value={rupees(q.data?.totals.spend ?? 0)} hint={t('analytics.spendHint')} />
          </div>
          <Table columns={cols} rows={q.data?.rows ?? []} rowKey={(r) => r.adId} loading={q.isLoading} emptyText={t('analytics.empty')} caption={t('analytics.title')} />
        </>
      )}
    </div>
  );
}
