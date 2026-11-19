import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, Tag } from 'lucide-react';
import { Button, ErrorState, PageHeader, Pagination, Table, Tabs, type Column } from '@/components/ui';
import { api, type Paged } from '@/lib/api';
import { fmtDate } from '@/lib/format';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/useT';
import { AdStatusBadge, rupees, type AdRequestRow } from '../shared';

type Res = Paged<AdRequestRow> & { counts?: Record<string, number> };
const TABS = ['CONTENT_SUBMITTED', 'REQUESTED', 'RETURNED', 'APPROVED', 'LIVE', 'PAUSED', 'EXPIRED', 'ALL'] as const;

export default function AdsQueue() {
  const { t } = useT('ads');
  const nav = useNavigate();
  const { can } = useAuth();
  const [tab, setTab] = useState<(typeof TABS)[number]>('CONTENT_SUBMITTED');
  const [page, setPage] = useState(1);
  const q = useQuery({
    queryKey: ['ads', 'admin', 'list', tab, page],
    queryFn: () => api.list<AdRequestRow>('/api/ads/admin/requests', { status: tab === 'ALL' ? undefined : tab, page, pageSize: 20 }) as Promise<Res>,
  });
  const counts = q.data?.counts ?? {};
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  const cols: Column<AdRequestRow>[] = [
    { key: 'adv', header: t('admin.advertiser'), render: (r) => <div><p className="font-semibold">{r.advertiser?.name}</p><p className="text-xs text-muted">{r.advertiser?.contactPerson}</p></div> },
    { key: 'pl', header: t('admin.placement'), render: (r) => r.placement.name },
    { key: 'plan', header: t('admin.plan'), hideOnMobile: true, render: (r) => (r.plan ? `${t(`period.${r.plan.period}`)} · ${rupees(r.plan.price)}` : '—') },
    { key: 'pay', header: t('admin.payment'), hideOnMobile: true, render: (r) => t(`payStatus.${r.paymentStatus}`) },
    { key: 'status', header: t('admin.status'), render: (r) => <AdStatusBadge status={r.status} /> },
    { key: 'upd', header: t('admin.updated'), hideOnMobile: true, render: (r) => fmtDate(r.updatedAt) },
  ];

  return (
    <div>
      <PageHeader
        title={t('admin.title')} subtitle={t('admin.subtitle')}
        actions={<>
          {can('ads.manage') ? <Link to="/admin/ads/plans"><Button variant="outline" icon={Tag}>{t('admin.plansBtn')}</Button></Link> : null}
          {can('ads.manage') ? <Link to="/admin/ads/analytics"><Button variant="outline" icon={BarChart3}>{t('admin.analyticsBtn')}</Button></Link> : null}
        </>}
      />
      <Tabs
        label={t('admin.title')} value={tab} onChange={(v) => { setTab(v as typeof tab); setPage(1); }} className="mb-4"
        items={TABS.map((s) => ({ id: s, label: s === 'ALL' ? t('admin.all') : t(`status.${s}`), count: s === 'ALL' ? total : counts[s] ?? 0 }))}
      />
      {q.isError ? <ErrorState onRetry={() => void q.refetch()} /> : (
        <>
          <Table columns={cols} rows={q.data?.data ?? []} rowKey={(r) => r.id} loading={q.isLoading} onRowClick={(r) => nav(`/admin/ads/${r.id}`)} emptyText={t('admin.empty')} caption={t('admin.title')} />
          <Pagination className="mt-3" page={page} pageSize={20} total={q.data?.total ?? 0} onPage={setPage} />
        </>
      )}
    </div>
  );
}
