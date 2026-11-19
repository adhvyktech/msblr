import { Link } from 'react-router-dom';
import { AlertTriangle, BadgeIndianRupee, ClipboardCheck, Megaphone, Smartphone, Users } from 'lucide-react';
import { Badge, Card, EmptyState, ErrorState, PageHeader, Section, Skeleton, StatCard, Table, type Column } from '@/components/ui';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/useT';
import { useAuth } from '@/lib/auth';
import { fmtDate, fmtDateTime, fmtINR, fmtNumber } from '@/lib/format';
import { useDashboard, type DashboardData, type WaitingItem } from '../api';

const linkBtn = 'inline-flex min-h-[36px] items-center justify-center rounded-theme-sm border-[1.5px] border-primary px-3 text-sm font-semibold text-primary hover:bg-primary/10';

function LoginsChart({ days }: { days: NonNullable<DashboardData['loginsByDay']> }) {
  const { t } = useT('admin-dashboard');
  const max = Math.max(1, ...days.map((d) => d.total));
  const total = days.reduce((a, d) => a + d.total, 0);
  return (
    <Card>
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg">{t('logins.title')}</h2>
        <span className="text-sm text-muted">{t('logins.total', { count: total })}</span>
      </div>
      <div className="mb-3 flex gap-4 text-xs text-muted">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-primary" aria-hidden />{t('logins.web')}</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-accent" aria-hidden />{t('logins.app')}</span>
      </div>
      <div role="img" aria-label={t('logins.aria', { count: total })} className="flex h-40 items-end gap-[3px] border-b border-line">
        {days.map((d) => (
          <div key={d.date} className="flex h-full min-w-0 flex-1 flex-col justify-end" title={`${fmtDate(d.date)}: ${d.total}`}>
            <div className="flex w-full flex-col justify-end overflow-hidden rounded-t-sm" style={{ height: `${(d.total / max) * 100}%`, minHeight: d.total ? 3 : 0 }}>
              <div className="bg-accent" style={{ flexGrow: d.app }} />
              <div className="bg-primary" style={{ flexGrow: d.web }} />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-xs text-muted">
        <span>{fmtDate(days[0]?.date, 'D MMM')}</span>
        <span>{fmtDate(days[days.length - 1]?.date, 'D MMM')}</span>
      </div>
    </Card>
  );
}

function Health({ s }: { s: NonNullable<DashboardData['subscriptions']> }) {
  const { t } = useT('admin-dashboard');
  const tiles = [
    { k: 'active', v: s.active, cls: 'bg-success-soft text-success' },
    { k: 'due', v: s.due, cls: 'bg-warning-soft text-warning' },
    { k: 'expired', v: s.expired, cls: 'bg-danger-soft text-danger' },
  ];
  return (
    <div className="grid grid-cols-3 gap-3">
      {tiles.map((x) => (
        <div key={x.k} className={cn('rounded-theme-sm p-3 text-center sm:p-4', x.cls)}>
          <div className="font-head text-2xl sm:text-3xl" style={{ fontWeight: 'var(--hw)' }}>{fmtNumber(x.v)}</div>
          <div className="mt-0.5 text-xs font-semibold sm:text-sm">{t(`subs.${x.k}`)}</div>
        </div>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const { t, tc } = useT('admin-dashboard');
  const { can } = useAuth();
  const q = useDashboard();

  if (q.isLoading) {
    return (
      <div>
        <PageHeader title={t('title')} />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-36" />)}</div>
        <Skeleton className="mt-6 h-64" />
      </div>
    );
  }
  if (q.isError || !q.data) return <ErrorState onRetry={() => void q.refetch()} />;
  const d = q.data;
  const pend = d.kpis.pendingApprovals;
  const pendingParts = (['registrations', 'logins', 'businesses', 'ads'] as const).filter((k) => pend[k] !== null);
  const pendingTotal = pendingParts.reduce((a, k) => a + (pend[k] ?? 0), 0);

  const cols: Column<WaitingItem>[] = [
    { key: 'type', header: t('waiting.type'), render: (r) => <Badge tone="accent">{t(`types.${r.type}`)}</Badge> },
    {
      key: 'who', header: t('waiting.who'),
      render: (r) => (<div className="min-w-0"><div className="truncate font-semibold">{r.who}</div>{r.detail ? <div className="truncate text-xs text-muted">{r.detail}</div> : null}</div>),
    },
    { key: 'submittedAt', header: t('waiting.submitted'), hideOnMobile: true, render: (r) => <span className="whitespace-nowrap text-muted">{fmtDateTime(r.submittedAt)}</span> },
    { key: 'go', header: <span className="sr-only">{t('waiting.review')}</span>, align: 'right', render: (r) => <Link to={r.path} className={linkBtn} aria-label={`${t('waiting.review')}: ${r.who}`}>{t('waiting.review')}</Link> },
  ];

  const ca = d.contentAlert;
  return (
    <div>
      <PageHeader title={t('title')} subtitle={fmtDate(new Date(), 'dddd, D MMMM YYYY')} />

      {ca?.stale && can('highlights.post', 'events.post') ? (
        <div role="status" className="mb-5 flex flex-wrap items-center gap-3 rounded-theme border border-warning/40 bg-warning-soft p-4">
          <AlertTriangle className="shrink-0 text-warning" size={22} aria-hidden />
          <p className="min-w-0 flex-1 text-[15px]">
            {ca.daysSince === null ? t('alert.never') : t('alert.stale', { days: ca.daysSince, limit: ca.staleDays })}
          </p>
          <Link to="/admin/highlights" className="inline-flex min-h-[44px] items-center rounded-theme-sm bg-primary px-4 font-semibold text-on-primary hover:bg-primary-2">{t('alert.post')}</Link>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <StatCard icon={Users} label={t('kpi.families')} value={fmtNumber(d.kpis.activeFamilies.count)} hint={t('kpi.newMonth', { count: d.kpis.activeFamilies.newThisMonth })} tone="accent-soft" />
        {pendingParts.length ? (
          <StatCard
            icon={ClipboardCheck} to="/admin/approvals" label={t('kpi.pending')} value={fmtNumber(pendingTotal)}
            hint={pendingParts.map((k) => `${pend[k]} ${t(`short.${k}`)}`).join(' · ')}
          />
        ) : null}
        {d.kpis.paymentsToVerify ? (
          <StatCard icon={BadgeIndianRupee} to="/admin/payments" label={t('kpi.payments')} value={fmtNumber(d.kpis.paymentsToVerify.count)} hint={fmtINR(d.kpis.paymentsToVerify.amount)} />
        ) : null}
        {d.kpis.liveAds ? (
          <StatCard icon={Megaphone} to="/admin/ads" label={t('kpi.ads')} value={fmtNumber(d.kpis.liveAds.count)} hint={t('kpi.expiring', { count: d.kpis.liveAds.expiringIn7d })} />
        ) : null}
        {d.kpis.appUsersThisWeek ? (
          <StatCard icon={Smartphone} label={t('kpi.users')} value={fmtNumber(d.kpis.appUsersThisWeek.count)} hint={t('kpi.usersPct', { percent: d.kpis.appUsersThisWeek.percent })} />
        ) : null}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Section title={t('waiting.title')} action={pendingParts.length || d.kpis.paymentsToVerify ? <Link to="/admin/approvals">{tc('actions.seeAll')}</Link> : undefined} className="mb-0">
            {d.waiting.length ? (
              <Table columns={cols} rows={d.waiting} rowKey={(r) => `${r.type}-${r.id}`} caption={t('waiting.title')} />
            ) : (
              <EmptyState title={t('waiting.emptyTitle')} description={t('waiting.emptyBody')} />
            )}
          </Section>
        </div>
        <div className="space-y-6">
          {d.subscriptions ? (
            <Section title={t('subs.title')} className="mb-0"><Health s={d.subscriptions} /></Section>
          ) : null}
          {d.contentAlert && !d.contentAlert.stale ? (
            <Card tone="accent-soft">
              <p className="text-sm font-semibold">{t('alert.okTitle')}</p>
              <p className="mt-1 text-sm text-muted">{t('alert.ok', { days: d.contentAlert.daysSince ?? 0 })}</p>
              <Link to="/admin/highlights" className={cn(linkBtn, 'mt-3')}>{t('alert.post')}</Link>
            </Card>
          ) : null}
        </div>
      </div>

      {d.loginsByDay ? <div className="mt-6"><LoginsChart days={d.loginsByDay} /></div> : null}
    </div>
  );
}
