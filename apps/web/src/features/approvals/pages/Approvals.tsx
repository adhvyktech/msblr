import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
import { Badge, Card, EmptyState, ErrorState, PageHeader, Skeleton, Table, Tabs, type Column } from '@/components/ui';
import { api } from '@/lib/api';
import { useT } from '@/lib/useT';
import { fmtDateTime } from '@/lib/format';

type Type = 'registrations' | 'logins' | 'businesses' | 'ads' | 'payments';
const ORDER: Type[] = ['registrations', 'logins', 'businesses', 'ads', 'payments'];
const PATH: Record<Type, string> = {
  registrations: '/admin/registrations', logins: '/admin/logins', businesses: '/admin/businesses', ads: '/admin/ads', payments: '/admin/payments',
};
interface Counts extends Partial<Record<Type, number>> { total: number }
interface Item { type: Type; id: number; who: string; detail: string | null; submittedAt: string; path: string }

export default function Approvals() {
  const { t } = useT('approvals');
  const counts = useQuery({ queryKey: ['approvals', 'counts'], queryFn: () => api.get<Counts>('/api/approvals/counts'), refetchInterval: 60_000 });
  const latest = useQuery({ queryKey: ['approvals', 'latest'], queryFn: () => api.get<Item[]>('/api/approvals/latest', { params: { limit: 50 } }) });
  const visible = ORDER.filter((k) => counts.data && counts.data[k] !== undefined);
  const [tab, setTab] = useState<Type | ''>('');
  useEffect(() => { if (!tab && visible.length) setTab(visible[0]!); }, [tab, visible.length]); // eslint-disable-line react-hooks/exhaustive-deps

  if (counts.isError) return <ErrorState onRetry={() => void counts.refetch()} />;
  if (counts.isLoading) return (<div><PageHeader title={t('title')} /><Skeleton className="h-12" /><Skeleton className="mt-4 h-48" /></div>);
  if (!visible.length) return (<div><PageHeader title={t('title')} /><EmptyState title={t('noAccessTitle')} description={t('noAccessBody')} /></div>);

  const current = (tab || visible[0]!) as Type;
  const items = (latest.data ?? []).filter((i) => i.type === current);
  const n = counts.data?.[current] ?? 0;
  const cols: Column<Item>[] = [
    { key: 'who', header: t('who'), render: (r) => <span className="font-semibold">{r.who}</span> },
    { key: 'detail', header: t('detail'), hideOnMobile: true, render: (r) => r.detail ?? '—' },
    { key: 'submittedAt', header: t('submitted'), render: (r) => <span className="whitespace-nowrap text-muted">{fmtDateTime(r.submittedAt)}</span> },
    {
      key: 'go', header: <span className="sr-only">{t('review')}</span>, align: 'right',
      render: (r) => <Link to={r.path} className="inline-flex min-h-[36px] items-center rounded-theme-sm border-[1.5px] border-primary px-3 text-sm font-semibold text-primary hover:bg-primary/10">{t('review')}</Link>,
    },
  ];

  return (
    <div>
      <PageHeader title={t('title')} subtitle={t('subtitle', { count: counts.data?.total ?? 0 })} />
      <Tabs
        label={t('title')} value={current} onChange={(v) => setTab(v as Type)}
        items={visible.map((k) => ({ id: k, label: t(`tabs.${k}`), count: counts.data?.[k] ?? 0 }))}
      />
      <Card className="mt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg">{t(`tabs.${current}`)} <Badge tone={n ? 'warning' : 'success'}>{n ? t('pendingCount', { count: n }) : t('none')}</Badge></h2>
            <p className="mt-1 text-sm text-muted">{t(`hint.${current}`)}</p>
          </div>
          <Link to={PATH[current]} className="inline-flex min-h-[44px] items-center gap-2 rounded-theme-sm bg-primary px-5 font-semibold text-on-primary hover:bg-primary-2">
            {t('open')} <ArrowRight size={18} aria-hidden />
          </Link>
        </div>
      </Card>
      <h3 className="mb-3 mt-6 text-base">{t('latest')}</h3>
      {latest.isError ? <ErrorState onRetry={() => void latest.refetch()} /> : (
        <Table columns={cols} rows={items} rowKey={(r) => r.id} loading={latest.isLoading} emptyText={t('empty')} caption={t('latest')} />
      )}
    </div>
  );
}
